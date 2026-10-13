# Codex Aquarium · 泊

[中文](README.md) · English

I've been tinkering with aquariums lately. Waiting for an agent to finish gets boring, so I turned those sessions into a little fish tank. The agent works; I get to slack off and watch fish. Works for me.

The fish still move a bit stiffly. Eventually, I'd like to get closer to the aquarium in Animal Crossing.

**Local aquarium: [http://127.0.0.1:43187/](http://127.0.0.1:43187/)**

After automatic startup is configured on macOS, opening Codex starts the aquarium silently, usually within 5 seconds. No chat prompt is needed, and no page opens automatically. Use the address printed by the installer.

![Live aquarium: feathery plants, a low foreground carpet and fish from active sessions](docs/screenshots/aquarium-live.png)

Each active session gets a fish; concurrent tools and subagents become smaller followers. When work ends, the fish hides; resume that session and the same fish returns. There are ten fish styles, including cardinal tetras, tiger barbs and zebra danios. No active sessions means an empty tank.

Drag to look around, scroll to zoom and click a fish to see its session. You can adjust the light and current, pause the fish, or enter native fullscreen.

![Opening the aquarium from Codex, at 4× speed](docs/videos/demo-4x.webp)

4× speed, about 23 seconds · [Higher-resolution WebM video](docs/videos/demo-4x.webm)

## Get a tank

You'll need Codex Desktop with plugin and Hooks support, the Codex CLI, Node.js 22.12+ and a browser with WebGL 2. Verified on macOS; other desktop platforms still need testing.

### Let Codex install it

Copy this into a local Codex session:

```text
Please install or update Codex Aquarium: https://github.com/kinglisky/codex-aquarium
Check Node.js 22.12+, the Codex CLI, Bash, curl and tar, and confirm codex plugin add --help works.
If Node.js is missing or too old, direct me to https://nodejs.org/. Do not install system software automatically.
Download in a temporary directory. After a successful download, read the script, then run bash aquarium-install.sh:
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh
Keep SHA-256 verification and use codex plugin list --json to confirm codex-aquarium@codex-aquarium-local is installed.
Run node server/cli.mjs status from the installation directory and check /api/health at the actual address.
On macOS, also confirm automatic startup was configured successfully.
Open the aquarium in my existing default browser. Report the version, installation directory and address without displaying stop credentials.
Remind me to restart Codex, enable Aquarium and personally review and trust Hooks. Do not confirm trust for me.
After trust is confirmed, verify real session fish and concurrent tool and subagent followers.
Fish should hide when idle and return with the same appearance when the session resumes.
Report failures, including automatic startup failures. Do not substitute demo fish for real verification.
```

### Or run one command

Paste into a macOS / Linux terminal:

```bash
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh && bash aquarium-install.sh
```

This installs a prebuilt plugin from GitHub raw files and checks SHA-256; no local build is needed. If Node.js is missing or too old, the script asks you to install it and exits. Use the same prompt or command to update older versions. Version 0.1.5 adds macOS automatic startup while preserving runtime data and Hooks trust records.

Keep the installation directory, normally `~/.codex/aquarium-install/codex-aquarium`, or under your custom `CODEX_HOME`. If automatic startup configuration fails, run `node server/autostart.mjs enable` from that directory to retry. If GitHub reports an API rate limit, try again later; keep SHA-256 verification enabled.

## Connect your sessions

Restart Codex → **Customize → Plugins → Codex Aquarium · 会话鱼缸** → enable Aquarium → click the Hooks gear to review and trust the hooks.

![Plugin settings: enable Aquarium and use the Hooks gear to review trust](docs/screenshots/plugin-configuration.png)

Open the local link above and give the agent some work. You can also use `$aquarium` to open the page; on Linux, use it to start the service first.

On macOS, if you stop the aquarium manually, it stays stopped until you fully quit and reopen Codex. An empty tank usually means no sessions are active. Check that Hooks are trusted, then continue a session and trigger a tool call.

Local sessions only. No API key, no saved chat content, no history scanning and no uploaded runtime data.

<details>
<summary>Stopping and uninstalling</summary>

To stop only the aquarium, run `node server/cli.mjs stop` from the installation directory. Before uninstalling, disable automatic startup and stop the service, then remove the plugin:

```bash
aquarium_root="${CODEX_HOME:-$HOME/.codex}/aquarium-install/codex-aquarium"
node "$aquarium_root/server/autostart.mjs" disable
node "$aquarium_root/server/cli.mjs" stop
codex plugin remove codex-aquarium@codex-aquarium-local
codex plugin marketplace remove codex-aquarium-local
```

You can then delete the installation directory. Runtime data is not removed automatically.

</details>

[Changelog](CHANGELOG.md) · [MIT](LICENSE)
