# Codex Aquarium · 泊

中文 · [English](README.en.md)

最近开始倒腾鱼缸，平时等待 agent 输出结果时很无聊，想着将 agent 会话映射成可视化的鱼缸。agent 工作，我摸鱼，刚好～

目前游鱼的效果还是偏生硬，后续考虑还原一波动森水族馆的效果。

**本地鱼缸：[http://127.0.0.1:43187/](http://127.0.0.1:43187/)**

macOS 自动启动配置成功后，打开 Codex，鱼缸通常 5 秒内在后台静默启动，无需发消息，也不会自动打开页面。地址以安装器输出为准。

![真实会话鱼群与水草的本地渲染截图](docs/screenshots/aquarium-live.png)

一段活跃会话，一只鱼；并发工具和子 agent，是跟随的小鱼。工作结束后隐藏，继续同一会话还是原来那只。打开会话、切换标签或聚焦输入框不算活跃。缸里有宝莲灯、虎皮、斑马等十种鱼，没有活跃会话时就是空缸。

拖动换角度，滚轮缩放，点鱼查看会话；也能调灯光、水流，暂停游动或进入全屏。

![打开实时鱼缸的 4 倍速演示](docs/videos/demo-4x.webp)

4 倍速演示，约 23 秒 · [高清 WebM 视频](docs/videos/demo-4x.webm)

## 养一缸

需要支持插件与 Hooks 的 Codex 桌面端、Codex CLI、Node.js 22.12+ 和支持 WebGL 2 的浏览器。macOS 已实测，其他桌面平台待验证。

### 让 agent 安装

复制给本机 Codex：

```text
请帮我安装或更新 Codex Aquarium：https://github.com/kinglisky/codex-aquarium
检查 Node.js 22.12+、Codex CLI、Bash、curl 和 tar，确认 codex plugin add --help 可用。
Node.js 缺失或版本过低时，提示我从 https://nodejs.org/ 安装，不自动安装系统软件。
在临时目录下载；下载成功后先阅读脚本，再执行 bash aquarium-install.sh：
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh
保留 SHA-256 校验，用 codex plugin list --json 确认 codex-aquarium@codex-aquarium-local 已安装。
在安装目录执行 node server/cli.mjs status，检查实际地址的 /api/health；macOS 还要确认自动启动配置成功。
用现有默认浏览器打开鱼缸，告诉我版本、安装目录和地址，不输出停止凭据。
提醒我重启 Codex、开启 Aquarium 技能，并亲自审阅和信任 Hooks，不替我确认。
信任后验证真实会话的主鱼与并发工具、子 agent 跟随鱼；空闲时隐藏，继续同一会话恢复原来的鱼。
失败请说明原因，自动启动的验证结果单独说明，不用演示鱼群代替验证。
```

### 或者 curl 安装

在 macOS / Linux 终端执行：

```bash
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh && bash aquarium-install.sh
```

从 GitHub raw 文件安装预构建包并校验 SHA-256，无需本地编译。Node.js 缺失或版本过低时会提示安装并退出。旧版本也用上面的指引或命令升级，v0.1.5 起会配置 macOS 自动启动，保留运行数据和 Hooks 信任记录。

安装目录默认是 `~/.codex/aquarium-install/codex-aquarium`，设置 `CODEX_HOME` 时使用对应目录，请保留它。若提示自动启动配置失败，在安装目录执行 `node server/autostart.mjs enable` 重试；下载遇到 GitHub API 限流时稍后再试，不跳过 SHA-256 校验。

## 接上会话

重启 Codex →「自定义 → 插件 → Codex Aquarium · 会话鱼缸」→ 开启 Aquarium 技能 → 点「钩子」齿轮，审阅并信任 Hooks。

![插件配置：技能开关与钩子设置入口](docs/screenshots/plugin-configuration.png)

然后打开上方本地链接，让 agent 开始工作。也可以用 `$aquarium` 打开页面；Linux 需要先用它启动服务。

macOS 上手动停止鱼缸后，本次 Codex 运行期间会保持停止，完全退出并重新打开 Codex 才会再次自动启动。空鱼缸通常表示没有活跃会话；确认 Hooks 已信任，再继续会话并触发一次工具调用。

只接本机会话，无需 API Key，不保存聊天内容，不扫描历史，也不上传运行数据。

<details>
<summary>停止与卸载</summary>

仅停止鱼缸，在安装目录执行 `node server/cli.mjs stop`。卸载时先关闭后台启动项并停止服务，再移除插件：

```bash
aquarium_root="${CODEX_HOME:-$HOME/.codex}/aquarium-install/codex-aquarium"
node "$aquarium_root/server/autostart.mjs" disable
node "$aquarium_root/server/cli.mjs" stop
codex plugin remove codex-aquarium@codex-aquarium-local
codex plugin marketplace remove codex-aquarium-local
```

之后可以删除安装目录；运行数据不会自动删除。

</details>

[更新记录](CHANGELOG.md) · [MIT](LICENSE)
