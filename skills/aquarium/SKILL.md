---
name: aquarium
description: 打开、启动、停止或检查 Codex Aquarium，查看会话、工具和子 Agent 鱼群。Open, start, stop or check the live Codex aquarium for sessions, tools and subagents.
---

按用户的语言回复，支持中文和英文。鱼缸界面跟随浏览器语言，也可在右上角切换并记住选择。

插件根目录是此文件所在目录的上两级。用解析后的绝对路径运行以下命令，不假定用户当前工作目录是插件目录：

- 打开鱼缸：`node "<插件根目录>/server/cli.mjs" start`。
- 检查状态：`node "<插件根目录>/server/cli.mjs" status`。
- 停止本地服务：`node "<插件根目录>/server/cli.mjs" stop`。

启动成功后，使用命令返回的 URL 打开用户默认浏览器已有的鱼缸标签页；没有浏览器工具时提供可点击链接。默认地址是 `http://127.0.0.1:43187`。

实时数据来自插件原生 hooks。空鱼缸表示当前没有活跃会话，或尚未收到已信任 hooks 的会话事件，不能用演示鱼冒充真实会话。用户希望预览时，可让其使用页面明确标注的演示模式。

若 hooks 尚未被信任，说明 Codex 要求用户检查并信任当前 hook 定义；不要修改信任记录或绕过信任检查。安装后从新会话触发一次工具调用，再观察实时鱼群。

本插件不保留提示词、回答、工具参数或认证信息。不要为了填充鱼缸而扫描会话日志。安装与能力边界见插件根目录的 `README.md`（中文）或 `README.en.md`（英文）。
