# Codex Aquarium · 泊

让工作，游起来。把 Codex 当前的会话、工具调用和子 agent，变成一缸实时游动的鱼。

![Codex Aquarium 实时渲染：自然宝塔草、前景草甸与会话鱼群](docs/screenshots/aquarium-live.png)

上图直接截自本地运行的 WebGL 页面，鱼群来自已连接的 Codex 会话及并发活动。截图采用沉浸模式隐藏会话名称，没有使用生成图片或预渲染背景。

## 鱼缸里有什么

- **一段会话，一只主鱼**：工作、等待、休息等状态会影响游动。
- **并发工作组成鱼群**：正在执行的工具和子 agent 是跟随的小鱼，完成后离开。
- **六种修长鱼型**：霓虹灯鱼、孔雀鱼、燕尾斗鱼、红剑尾、蓝鳍虹鱼和金色长鳍。
- **可交互的 3D 草缸**：拖动环绕、滚轮缩放、点击鱼查看会话；可调灯光、水流，也可暂停游动或进入沉浸模式。
- **本机运行**：无需 API Key，不上传会话信息，不扫描历史聊天。

![真实侧面渲染：玻璃厚边、视角反光和前后交错的水草](docs/screenshots/aquarium-glass.png)

两张截图均由正在运行的插件页面直接截取。玻璃、水面、水草与鱼均由 Three.js 实时渲染；宝塔草和前景草甸使用程序化三维几何。

## 安装条件

- 支持插件及生命周期 Hooks 的 **Codex 桌面端**。
- 命令行可用的 **Node.js 22.12+**、`codex` 和 `tar`。
- 浏览器支持 WebGL 2。

使用发行包无需安装 pnpm、克隆源码或自行编译。当前桌面实测平台是 macOS；Windows 和 Linux 尚未完成真实 Codex 桌面安装验证。

## 快速安装

从 [最新 Release](https://github.com/kinglisky/codex-aquarium/releases/latest) 下载 `install.mjs`，在下载目录执行：

```bash
node install.mjs
```

安装器自动下载最新版、校验 SHA-256、注册本地 marketplace、安装插件并启动鱼缸。固定版本使用 `node install.mjs --version v0.1.0`。

macOS / Linux 也可先用终端下载安装器，再运行：

```bash
curl -fL https://github.com/kinglisky/codex-aquarium/releases/latest/download/install.mjs -o aquarium-install.mjs
node aquarium-install.mjs
```

默认安装源位于 `~/.codex/aquarium-install/codex-aquarium`；设置 `CODEX_HOME` 时使用对应目录。请保留该目录，后续更新仍会使用它。

### 使用已下载的安装包

将同一 Release 的 `install.mjs`、`codex-aquarium.tgz` 和 `SHA256SUMS` 下载到同一个目录，然后运行：

```bash
node install.mjs --archive ./codex-aquarium.tgz
```

此方式不需要联网下载安装包。安装器仍会检查运行环境和 SHA-256。

### 信任并打开

1. 安装后重启 Codex 桌面端，让新插件加载。
2. 在 Codex 中审阅并信任插件的 Hooks。CLI 可通过 `/hooks` 打开审阅界面。
3. 在新建或继续的会话中输入 **“打开我的 Codex 实时鱼缸”**，也可使用 `$aquarium`。
4. 让 Codex 执行工具调用，观察主鱼与跟随鱼。

默认地址是 [http://127.0.0.1:43187](http://127.0.0.1:43187)。安装器不会替用户确认信任、修改信任记录或绕过审批。新增或改动 Hooks 后，Codex 可能再次要求审阅。

### 手动安装

也可以解压后使用 Codex CLI 安装：

```bash
tar -xzf codex-aquarium.tgz
codex plugin marketplace add "$PWD/codex-aquarium"
codex plugin add codex-aquarium@codex-aquarium-local
```

使用这种方式前，请先核对附件的 SHA-256。保留解压目录。若 Codex CLI 没有 `plugin add`，可在桌面端插件目录选择本地来源 **Codex Aquarium**，安装 **Codex Aquarium · 会话鱼缸**。

## 更新与卸载

更新时重新运行安装器即可。安装源会更新，成功安装后本地鱼缸服务会重新启动；用户运行数据与 Hooks 信任记录不会被安装器删除。

卸载前先在 Codex 中让 Aquarium 停止本地服务，再运行：

```bash
codex plugin remove codex-aquarium@codex-aquarium-local
codex plugin marketplace remove codex-aquarium-local
```

确认不再使用后，可自行删除安装源目录。运行数据保存在独立目录 `~/.codex/codex-aquarium`，卸载插件不会自动清除它。

## 实时状态边界

鱼缸展示的是**已触发插件事件的会话**，不是桌面侧栏所有打开的聊天。安装前已存在的会话需要继续运行并触发事件，才会进入鱼缸；切换标签页不会让鱼立刻消失。

会话开始时加入主鱼，发送消息时进入工作状态，停止响应时休息。工具和子 agent 按各自 ID 加入、退出鱼群；等待权限时显示等待，中断或会话结束时清理对应活动。

服务重启后，已有会话暂时标为「状态过期」，收到新事件后恢复。连续 30 分钟无事件也会标为过期，24 小时无事件后移除。权限事件缺少调用 ID 时，会等待同名并发工具全部结束，避免提前显示权限已解决。

本地 Shell、`apply_patch`、MCP 和多数本地函数工具可被 Hooks 观察；托管 `WebSearch` 等工具不保证触发。工具鱼归属主会话，不假定 Hooks 能提供每个工具的子 agent 归属。远程或云端编排尚不在本版本支持范围内。

页面提供明确标注的「演示鱼群」用于预览；它与真实会话数据分开，实时模式不会为了填满鱼缸而虚构会话。

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| 鱼缸没有鱼 | 确认插件已启用、Hooks 已信任，并在会话中触发一次工具调用。 |
| 安装后仍是旧页面 | 刷新浏览器；确认更新安装成功并已重启本地鱼缸服务。 |
| 服务重启后鱼显示过期 | 继续对应会话，收到新的真实事件后会恢复。 |
| `codex` 命令不存在 | 安装或配置 Codex CLI，再运行安装器；也可按手动安装说明使用桌面端插件目录。 |
| 下载 404 | 检查 Release 是否存在；私有仓库需登录 GitHub 下载附件后使用本地安装方式。 |
| SHA-256 校验失败 | 重新下载同一 Release 的安装包和 `SHA256SUMS`，不要混用不同版本。 |

## 开发与构建

源码构建使用项目声明的 pnpm 版本。

```bash
git clone https://github.com/kinglisky/codex-aquarium.git
cd codex-aquarium
pnpm install --frozen-lockfile
pnpm package
node scripts/install.mjs --archive ./artifacts/codex-aquarium.tgz
```

`pnpm package` 执行测试和生产构建，输出 `artifacts/codex-aquarium.tgz`、`artifacts/install.mjs`、`artifacts/SHA256SUMS`。发行包包含已构建界面、服务端、Hooks、skill、截图文档与许可证，不包含 `node_modules`。

```bash
pnpm dev                    # 前端开发预览
pnpm check                  # 测试与生产构建
node server/cli.mjs start    # 从源码目录启动已构建的鱼缸
node server/cli.mjs status
node server/cli.mjs stop
```

Git 仓库不包含 `dist`，不能把源码仓库直接当作免构建的远程 marketplace。请使用 Release 附件或先构建再注册本地 marketplace。

## 发布版本

同步修改 `package.json` 与 `.codex-plugin/plugin.json` 中的版本，更新 [CHANGELOG.md](CHANGELOG.md)，然后提交并推送对应标签：

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions 会检查标签与两个版本号一致，安装锁定依赖、测试、构建、打包，最后创建带三个附件的 GitHub Release。

含生命周期 Hooks 的插件目前适合 Codex 桌面端手动安装或 marketplace 分发，不能提交到官方公共插件目录。[官方打包说明](https://developers.openai.com/plugins/build/plugins) · [Hooks 与信任](https://learn.chatgpt.com/docs/hooks)

## 数据与隐私

采集器仅保留会话及调用 ID、事件类型、工具名称、agent 类型、时间等状态元数据。不保存提示词、回答、工具参数、工具输出或外部服务认证信息，不扫描历史会话，不向远程服务器发送运行数据。鱼缸服务只监听本机回环地址。

默认数据目录为 `${CODEX_HOME:-~/.codex}/codex-aquarium`。如设置 `AQUARIUM_DATA_DIR`，Hooks 和服务必须使用同一目录。服务的停止凭据仅保存在本机运行目录。

安装器联网仅用于下载指定 GitHub Release 的发行文件；选择 `--archive` 时不需要下载安装包。

## 许可证

[MIT](LICENSE)
