---
name: setup
description: 完成 Codex Aquarium 首次安装配置，检查运行环境、启用自动启动并打开鱼缸。Set up Codex Aquarium after installation, enable automatic startup and open the aquarium.
---

按用户的语言回复，支持中文和英文。插件根目录是本文件所在目录的上两级；所有命令使用解析后的绝对路径。

1. 找到可运行的 Node.js 22.12+，后续使用同一个解释器的绝对路径。若缺失，提示从 https://nodejs.org/ 安装，完成后再运行此技能。
2. 使用该解释器执行 `<插件根目录>/server/autostart.mjs enable`。macOS 会配置随 Codex 静默启动；其他系统继续下一步，由已信任的 SessionStart Hook 启动服务。
3. 执行 `<插件根目录>/server/cli.mjs start`，检查返回地址的 `/api/health`，再用用户默认浏览器打开鱼缸。优先复用已有标签页；没有浏览器工具时提供链接。
4. 提醒用户在 Codex 插件设置中亲自审阅、信任 Hooks，然后重启 Codex。不要修改信任记录或代替用户确认。

没有活跃任务时空缸是正常状态。信任后用真实任务验证会话和子 Agent 鱼群，不用演示冒充真实状态。不读取历史会话、不输出停止凭据。

如果本机自动启动配置失败，保留已安装的插件并说明原因。后续可用 Aquarium 技能手动打开或重新运行此配置。
