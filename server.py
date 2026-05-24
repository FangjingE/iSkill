#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
import threading
from datetime import datetime, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = ROOT_DIR / "data" / "iskills.db"


class StateRepository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS app_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def load_state(self) -> tuple[dict | None, str | None]:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT payload, updated_at FROM app_state WHERE id = 1"
            ).fetchone()

        if not row:
            return None, None

        return json.loads(row["payload"]), row["updated_at"]

    def save_state(self, state: dict) -> str:
        payload = json.dumps(state, ensure_ascii=False)
        updated_at = datetime.now(timezone.utc).isoformat()

        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO app_state (id, payload, updated_at)
                VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE
                SET payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (payload, updated_at),
            )
            connection.commit()

        return updated_at


class ISkillsHandler(SimpleHTTPRequestHandler):
    server_version = "iSkillsLocal/1.0"

    def __init__(
        self,
        *args,
        directory: str,
        repository: StateRepository,
        **kwargs,
    ) -> None:
        self.repository = repository
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/state":
            self.handle_get_state()
            return

        if path == "/healthz":
            self.write_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "dbPath": str(self.repository.db_path),
                },
            )
            return

        if path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_PUT(self) -> None:
        if urlparse(self.path).path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")
            return

        self.handle_write_state()

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/state":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")
            return

        self.handle_write_state()

    def handle_get_state(self) -> None:
        try:
            state, updated_at = self.repository.load_state()
        except json.JSONDecodeError:
            self.write_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "ok": False,
                    "error": "Stored state is corrupted.",
                },
            )
            return

        self.write_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "state": state,
                "updatedAt": updated_at,
            },
        )

    def handle_write_state(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            parsed = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.write_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "ok": False,
                    "error": "Request body must be valid JSON.",
                },
            )
            return

        state = parsed.get("state", parsed)
        if not isinstance(state, dict):
            self.write_json(
                HTTPStatus.BAD_REQUEST,
                {
                    "ok": False,
                    "error": "State payload must be a JSON object.",
                },
            )
            return

        updated_at = self.repository.save_state(state)
        self.write_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "updatedAt": updated_at,
            },
        )

    def write_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve iSkills with a local SQLite API.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host, default: 127.0.0.1")
    parser.add_argument("--port", default=8080, type=int, help="Bind port, default: 8080")
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help=f"SQLite database path, default: {DEFAULT_DB_PATH}",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repository = StateRepository(Path(args.db_path).expanduser().resolve())
    handler = partial(
        ISkillsHandler,
        directory=str(ROOT_DIR),
        repository=repository,
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)

    print(
        f"iSkills server running at http://{args.host}:{args.port} "
        f"with SQLite {repository.db_path}"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
