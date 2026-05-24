# 技能成长台

一个零依赖的个人技能管理前端，直接用浏览器打开 `index.html` 就能使用。

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
- 所有数据自动保存在浏览器本地 `localStorage`
- 兼容旧版“技能 + 分支”数据，会自动迁移为技能树结构

## 使用方式

1. 直接双击打开 [index.html](./index.html)
2. 或在当前目录运行本地静态服务，例如：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080`

也可以直接使用仓库内脚本启动：

```bash
bash scripts/serve.sh
```

## 开机自启动

这个项目是纯静态前端，所以有两种常见做法：

### 方案一：开机后直接打开页面（最简单）

适合只想“开机自动看到页面”，不要求固定 `http://localhost` 地址。

如果你在 Windows 上使用 WSL2，可以把一个浏览器快捷方式放进“启动”文件夹，让它登录后自动打开这个页面。

1. 先确认项目可正常打开：
   - 直接打开 `index.html`
   - 或访问静态服务地址
2. 按 `Win + R`，输入：

```text
shell:startup
```

3. 在打开的启动文件夹里，新建一个快捷方式。
4. 如果你想直接打开本地文件，可把目标写成浏览器加页面路径，例如：

```text
msedge.exe "\\wsl$\Ubuntu\home\fanglaozu\projects\iSkills\index.html"
```

如果你的 WSL 发行版名称不是 `Ubuntu`，把上面的发行版名称改成你自己的。

### 方案二：WSL 内自动启动本地服务（更稳）

适合希望固定用 `http://127.0.0.1:8080` 访问。

仓库已经提供：

- `scripts/serve.sh`：启动静态服务
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
- `app.js`：递归技能树、权重计算、雷达图渲染与本地存储
- `scripts/serve.sh`：本地静态服务启动脚本
- `systemd/iskills.service`：WSL `systemd` 系统服务模板
