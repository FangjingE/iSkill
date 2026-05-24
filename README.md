# 技能成长台

一个基于本地 Python + SQLite 的个人技能管理应用，前端页面和数据接口由同一个本地服务提供。

## 功能

- 首页展示人物档案与技能卡片
- 支持添加、删除技能
- 点击技能后进入详情页，查看技能雷达图
- 统一使用“技能”概念，不再区分“分支技能”
- 任意技能都可以拥有多个子技能，子技能也可以继续拥有子技能
- 叶子技能支持直接调节得分
- 父技能得分会按子技能权重自动加权汇总
- 每个技能支持添加、删除子技能
- 每个子技能支持修改权重、上限和名称
- 每个技能都能自定义数值上限
- 所有数据自动保存在本地 SQLite 数据库
- 兼容旧版浏览器 `localStorage` 数据，首次启动新服务时会自动迁移

## 使用方式

在当前目录运行本地服务：

```bash
bash scripts/serve.sh
```

然后访问 `http://127.0.0.1:8080`

默认会在 `data/iskills.db` 保存数据。

## 开机自启动

现在推荐固定通过本地服务启动，因为页面和 SQLite API 绑定在同一个地址下。

### WSL 内自动启动本地服务

仓库已经提供：

- `scripts/serve.sh`：启动 Python + SQLite 本地服务
- `systemd/iskills.service`：系统级 `systemd` 服务模板

你的 `/etc/wsl.conf` 需要启用 `systemd`：

```ini
[boot]
systemd=true
```

然后执行：

```bash
sudo cp /home/fanglaozu/projects/iSkills/systemd/iskills.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now iskills.service
sudo systemctl status iskills.service
```

服务启动后访问：

```text
http://127.0.0.1:8080
```

数据库默认位于：

```text
/home/fanglaozu/projects/iSkills/data/iskills.db
```

### 让 Windows 开机时顺带拉起 WSL

仅配置 `systemd` 还不够，WSL 发行版本身也要在 Windows 登录后被唤醒。最简单的方式是把下面这个命令做成一个 Windows 启动项：

```text
wsl.exe -d Ubuntu --cd /home/fanglaozu/projects/iSkills true
```

这样 Windows 登录后会启动对应的 WSL 发行版，`systemd` 再把 `iskills.service` 自动拉起来。

### 查看和停止服务

```bash
sudo systemctl status iskills.service
sudo systemctl restart iskills.service
sudo systemctl stop iskills.service
journalctl -u iskills.service -n 50
```

## 文件结构

- `index.html`：页面结构
- `styles.css`：界面样式
- `app.js`：递归技能树、权重计算、雷达图渲染与 API 持久化
- `server.py`：本地 Python 服务与 SQLite API
- `data/iskills.db`：本地 SQLite 数据库文件
- `scripts/serve.sh`：本地服务启动脚本
- `systemd/iskills.service`：WSL `systemd` 系统服务模板
