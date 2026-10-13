# Codex Aquarium · 泊

中文 · [English](README.en.md)

最近开始倒腾鱼缸，平时等待 agent 输出结果时很无聊，想着将 agent 会话映射成可视化的鱼缸。agent 工作，我摸鱼，刚好～

目前游鱼的效果还是偏生硬，后续考虑还原一波动森水族馆的效果。

**本地鱼缸：[http://127.0.0.1:43187/](http://127.0.0.1:43187/)**

macOS 安装后，打开 Codex 应用，鱼缸会在后台静默启动，通常 5 秒内就能访问上面的链接，无需在会话里发送启动指令，也不会自动打开页面。如果安装器给出了其他地址，用它输出的地址；还没安装的话，往下看就好。

![本地鱼缸截图：宝塔草、前景草甸与正在工作的会话鱼群](docs/screenshots/aquarium-live.png)

## 先看看它怎么游

![从 Codex 会话中打开实时鱼缸，4 倍速演示](docs/videos/demo-4x.webp)

这是实际使用时录的演示，加速了 4 倍，约 23 秒。上面的 WebP 动图会自动循环，约 1.5 MiB；想看得更清楚，可以[打开高清 WebM 视频](docs/videos/demo-4x.webm)（约 3 MiB）。

一段正在工作的 Codex 会话，对应一只鱼。agent 思考、调用工具、等你确认权限时，它就在缸里游；工具和子 agent 同时开工，就有小鱼跟在后面，组成一小群。

工作结束，鱼会离开。等你继续同一段会话，回来的还是原来那只，鱼型和外观都不会变。所以这里看的就是此刻谁在忙，没有活跃会话时，安静的空缸也很正常。

目前放了十种鱼：霓虹灯鱼、孔雀鱼、燕尾斗鱼、红剑尾、蓝鳍虹鱼、金色长鳍、黑尾大勾、宝莲灯、虎皮和斑马。背景是有高有低的宝塔草，前面铺了一层矮草，鱼、草、水面和玻璃都由 Three.js 实时渲染。

可以拖动换个角度、滚轮拉近，点鱼看看对应会话，也能调灯光和水流、暂停游动。想专心摸鱼就点全屏按钮，进入浏览器原生全屏；按 Esc 或再点一次回来。

<details>
<summary>换个角度看看玻璃和水草</summary>

![鱼缸侧面的实际渲染：玻璃厚边、反光和前后交错的水草](docs/screenshots/aquarium-glass.png)

这里的截图都来自本地运行的页面，鱼群来自真实会话。拍摄时隐藏了会话名称，水草和玻璃也是现场渲染的。

</details>

## 也想养一缸？

需要支持插件与 Hooks 的 Codex 桌面端，以及能在终端运行的 Node.js 22.12+、Codex CLI、Bash、curl 和 tar。浏览器需要支持 WebGL 2。目前在 macOS 上实测过，Linux 和 Windows 的 Codex 桌面安装还没完成验证。

下面两种方式选一个就行，用的是预构建包，不用自己编译。

### 让 Codex 帮你装

把下面这段复制给本机 Codex agent，让它完成环境检查、安装和验证。最后的 Hooks 信任，需要你自己点一下。

```text
请帮我安装或更新 Codex Aquarium，并验证它能正常运行。
官方仓库：https://github.com/kinglisky/codex-aquarium

先检查 Bash、curl、tar、Codex CLI 和 Node.js 22.12+，确认 codex plugin add --help 可用。
如果缺少 Node.js 或版本过低，请提示我从 https://nodejs.org/ 安装后再继续，不要自动安装系统软件；其他依赖缺失也请告诉我。

在临时目录下载官方安装脚本：
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh
下载成功后先阅读脚本，再执行 bash aquarium-install.sh；保留脚本的 SHA-256 校验，不改写信任记录。

用 codex plugin list --json 确认 codex-aquarium@codex-aquarium-local 已安装。
从安装器输出的安装目录运行 node server/cli.mjs status，必要时用 node server/cli.mjs start 启动。
macOS 安装器会配置随 Codex 应用自动启动；检查输出是否成功，失败时说明原因，不要声称已启用。
检查实际服务地址的 /api/health，用我现有的默认浏览器打开鱼缸，告诉我版本、安装目录和地址，不输出停止凭据。

提醒我重启 Codex、启用 Aquarium 技能，并到插件的“钩子”设置里审阅并信任 Hooks。这一步由我本人完成。
之后继续一个真实会话，触发工具调用，验证主鱼与跟随鱼；全部活动结束后鱼应隐藏，继续同一会话应恢复原来的鱼。
不要用演示鱼群代替真实验证；如果安装或验证失败，请说明具体原因。
```

### 自己跑一条命令

在 macOS / Linux 终端执行：

```bash
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh && bash aquarium-install.sh
```

脚本通过 GitHub 官方 raw API 下载仓库里的文件，从 `distribution` 分支取得预构建包，校验 SHA-256 后安装并启动鱼缸，不用访问 Release 附件。缺少 Node.js 或版本低于 22.12 时，会提示你去 [Node.js 官网](https://nodejs.org/) 安装，然后退出；装好后再跑一次即可。

安装源默认放在 `~/.codex/aquarium-install/codex-aquarium`（设置了 `CODEX_HOME` 就用对应目录），后续更新还会用到它，先留着就好。

### 装好了，再接上会话

重启 Codex，打开「自定义 → 插件 → Codex Aquarium · 会话鱼缸」，开启 Aquarium 技能。再点「钩子」右边的齿轮，审阅并信任 Hooks。安装器不会替你确认这一步，后续 Hooks 有变化时也可能需要重新审阅。

![插件设置：开启 Aquarium 技能，点钩子齿轮信任 Hooks，再使用示例提示词打开鱼缸](docs/screenshots/plugin-configuration.png)

下方红色箭头是钩子设置。macOS 配置自动启动成功后，直接访问上面的本地鱼缸链接即可，不用先给 agent 发消息。上方的示例提示词、`$aquarium` 和「立即试用」仍可用于打开页面。之后让 agent 干点活，第一只鱼就会游进来。

后台启动项随用户登录运行，每 5 秒检查一次 Codex 主进程，只在应用启动时尝试拉起鱼缸；不会读取聊天内容。手动停止鱼缸后，本次 Codex 运行期间会保持停止，下次重新打开 Codex 再启动。Linux 暂未配置应用自动启动，仍需用示例提示词启动服务。

## 打开了，怎么还没有鱼？

先看看有没有正在工作的会话。安装前就已经打开的聊天，需要继续发消息、触发工具调用，鱼缸才会收到新的事件；只切换标签页不会让鱼出现。也可以先打开页面里标注的「演示鱼群」看看效果，再切回实时模式。

如果 agent 明明在工作却没有鱼，检查 Aquarium 技能是否开启、Hooks 是否信任。服务重启后，旧状态也会暂时隐藏，继续对应会话就能恢复。这里目前只接本机事件，远程或云端会话还不支持，托管 WebSearch 等工具也不一定能被 Hooks 观察到。

更新后还是旧页面的话，刷新浏览器，并确认安装成功、本地服务已经重启。无法全屏时，按页面提示在支持全屏的浏览器中打开。

安装下载失败，检查终端能否访问 `api.github.com`；API 限流可以稍后重试。如果遇到 404 或反复出现 SHA-256 校验失败，请反馈给维护者，不要跳过校验。

## 再说几件小事

鱼缸在本机运行，只监听回环地址，不需要 API Key。它只记录会话 ID、工具名称、事件类型和时间等状态信息，不保存提示词、回答或工具输入输出，不扫描历史聊天，也不上传运行数据。安装时的联网请求用于下载官方仓库文件。

更新时，再把上面的指引发给 agent，或者重新跑一次 curl 命令就行。安装器会重启鱼缸服务，保留运行数据和 Hooks 信任记录。

<details>
<summary>会话状态再细一点</summary>

思考、工作和等待权限的会话都会显示。主会话结束后，如果子 agent 还在忙，主鱼会留着；所有活动结束进入空闲时才隐藏。中断或会话结束会清理对应活动，同一会话重新活跃后按会话 ID 恢复鱼型和外观。

服务重启或连续 30 分钟没有事件，状态会过期并隐藏；收到新的活跃事件后恢复，24 小时无事件后移除状态记录。工具鱼归属主会话，目前不区分每个工具具体属于哪一个子 agent。

运行数据默认放在 `${CODEX_HOME:-~/.codex}/codex-aquarium`。如果设置 `AQUARIUM_DATA_DIR`，Hooks 和服务需要使用同一目录；服务停止凭据只留在本机。

</details>

<details>
<summary>不养了，怎么卸载</summary>

先关闭后台启动项并停止服务，再移除插件：

```bash
aquarium_root="${CODEX_HOME:-$HOME/.codex}/aquarium-install/codex-aquarium"
node "$aquarium_root/server/autostart.mjs" disable
node "$aquarium_root/server/cli.mjs" stop
codex plugin remove codex-aquarium@codex-aquarium-local
codex plugin marketplace remove codex-aquarium-local
```

不用了可以自行删除安装源目录。独立保存的运行数据不会随插件卸载而删除。

</details>

<details>
<summary>想一起折腾：开发与发布</summary>

源码使用项目声明的 pnpm 版本：

```bash
git clone https://github.com/kinglisky/codex-aquarium.git
cd codex-aquarium
pnpm install --frozen-lockfile
pnpm package
```

`pnpm package` 会执行测试与生产构建，输出预构建包、安装脚本和 `SHA256SUMS`。开发预览用 `pnpm dev`，检查用 `pnpm check`；构建后可以用 `node server/cli.mjs start`、`status`、`stop` 管理本地服务。

发布新版本时，同步更新 `package.json`、`.codex-plugin/plugin.json`、`install.sh` 的版本和 [CHANGELOG.md](CHANGELOG.md)，再执行 `pnpm package`、`pnpm publish:distribution`，最后推送源码和对应的 `v<版本号>` 标签。发布需要已登录且有仓库写入权限的 GitHub CLI，每个版本对应独立目录，已发布的版本不能覆盖。

想了解插件格式和 Hooks，可以看看[插件打包说明](https://developers.openai.com/plugins/build/plugins)和 [Hooks 与信任](https://learn.chatgpt.com/docs/hooks)。

</details>

[MIT](LICENSE)
