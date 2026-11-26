# TDLVV 任务便签

多团队共享的桌面待办工具（Electron）。常驻菜单栏 / 系统托盘，空闲时自动收成一条小横条贴在屏幕上，需要时展开写任务；支持截止时间、提醒、成员角色与任务附件，团队之间通过一台“房主”机器同步。

Windows 与 macOS 两套工程分别放在 `pc/` 和 `mac/` 下，`src` 与 `test` 代码完全一致，平台差异只在各自的 `package.json` 打包配置里。

## 下载安装包

见右侧 **Releases** 页的 `v0.6.3`：

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| Windows | `TDLVV-Setup-v0.6.3.exe` | 安装包（NSIS，x64），可自选安装目录 |
| Windows | `TDLVV-win-x64.zip` | 免安装绿色版，解压后运行 `win-unpacked/TDLVV.exe` |
| macOS | `TDLVV-mac-arm64.dmg` | 安装包（Apple Silicon） |
| macOS | `TDLVV-mac-arm64.zip` | 应用压缩包，解压出 `TDLVV.app` 直接用 |

> 安装包体积（78MB / 110MB / 138MB / 132MB）超过 GitHub 仓库单文件 100MB 的硬限制，所以二进制放在 Releases 附件里，不进库。

## 目录结构

```
TDLVV/
├─ pc/               Windows 版工程
│  ├─ src/           主进程 + 渲染进程代码
│  ├─ test/          Node 测试
│  ├─ build/         图标（icon.ico 程序/安装包，icon.png 托盘）
│  └─ package.json
└─ mac/              macOS 版工程
   ├─ src/
   ├─ test/
   ├─ build/         图标（icon-mac-1024.png 应用图标，icon.png 托盘）
   └─ package.json
```

## 本地跑起来（免打包）

```powershell
# Windows
cd pc
npm install
npm start
```

```bash
# macOS
cd mac
npm install
npx electron .
```

首次启动会显示主窗口；起过名字之后再启动只留后台进程 + 托盘图标，点托盘菜单「打开便签」回到界面。

## 打包

```powershell
# Windows 安装包
cd pc
npm run dist:win          # 产物 dist\TDLVV-Setup-v<version>.exe
```

```bash
# macOS（Apple Silicon）
cd mac
npx electron-builder --mac --arm64    # 产物 dist/TDLVV-mac-arm64.dmg + .zip
```

macOS 打包需要 `bin/cloudflared-mac-arm64`、`bin/cloudflared-mac-x64`（内网穿透用的 cloudflared 二进制）。这两个各约 40MB，未入库，从 Cloudflare 官方下载后放进 `mac/bin/` 同名即可。

## 测试

```bash
cd pc
node test/sync.test.js
node test/features.test.js
node test/files-copy.test.js
node test/filepaths.test.js
node test/persist.test.js
node test/transfer.test.js
```

## 技术栈

- Electron 33
- 原生 HTML/CSS/JS 渲染层，无框架
- 数据存本地 JSON（Windows: `%APPDATA%\TDLVV`，macOS: `~/Library/Application Support/TDLVV`）
- 团队同步：房主机器起 HTTP 服务，成员通过局域网或 cloudflared 隧道访问

## 许可证

MIT
