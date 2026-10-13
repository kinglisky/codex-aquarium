# Codex Aquarium · 泊

[中文](README.md) · English

I've been tinkering with aquariums lately. Waiting for an agent to finish can get boring, so I thought: why not turn those sessions into a little fish tank? The agent works; I get to watch fish. Works for me.

The fish still move a bit stiffly. Eventually, I'd like to get closer to the aquarium in Animal Crossing.

**Local aquarium: [http://127.0.0.1:43187/](http://127.0.0.1:43187/)**

On macOS, installation enables silent startup when you open the Codex app. The link is usually ready within 5 seconds, without a chat prompt or automatically opening a page. If the installer prints a different address, use that one.

![The live aquarium, with layered feathery plants, a low foreground carpet and session fish](docs/screenshots/aquarium-live.png)

## Watch it swim

![Opening the aquarium from Codex, at 4× speed](docs/videos/demo-4x.webp)

This recording shows the plugin in use, sped up 4× to about 23 seconds. The WebP animation loops here and is around 1.5 MiB. There's also a [higher-resolution WebM video](docs/videos/demo-4x.webm), around 3 MiB.

Each active Codex session gets a fish. It stays while the agent is thinking, working or waiting for permission. Concurrent tools and subagents become smaller fish swimming behind it, and leave when their work finishes.

Once all activity in a session ends, its fish disappears. Pick up that same session later and the same fish returns, with the same species and appearance. The tank follows actual activity; it doesn't count every chat sitting in the sidebar.

There are ten fish styles so far: neon tetra, guppy, swallowtail betta, red swordtail, blue-fin rainbowfish, golden longfin, black-tailed tetra, cardinal tetra, tiger barb and zebra danio. Feathery plants rise to different heights in the background, with a low grass carpet in front. The fish, plants, water and glass are all rendered in real time with Three.js.

Drag to look around, scroll to zoom, or click a fish to see its session. You can adjust the light and current, pause the fish, or use the fullscreen button. Fullscreen uses the browser's native fullscreen mode; press Esc or click the button again to return.

<details>
<summary>A closer look at the planted tank</summary>

![A live side view showing glass edges, reflections and plants at different depths](docs/screenshots/aquarium-glass.png)

These screenshots come from the running local page, with fish connected to real sessions. Session names were hidden for the captures; the plants and glass were rendered live too.

</details>

## Want a tank of your own?

You'll need Codex Desktop with plugin and Hooks support, plus Bash, `curl`, `tar`, the `codex` CLI and Node.js 22.12 or newer. Your browser needs WebGL 2. I've verified installation on macOS; real Codex Desktop installation on Linux and Windows hasn't been verified yet.

Choose either method below. Both use a prebuilt package, so you don't need to compile it yourself.

### Let Codex install it

Copy this prompt into a local Codex session. The agent can install and check the plugin, while reviewing and trusting its Hooks remains your step.

```text
Please install or update Codex Aquarium and verify that it works.
Official repository: https://github.com/kinglisky/codex-aquarium

First check Bash, curl, tar, the Codex CLI and Node.js 22.12+, and confirm codex plugin add --help works.
If Node.js is missing or too old, ask me to install it from https://nodejs.org/ before continuing.
Do not install system software automatically; tell me about any other missing dependencies too.

Download the official installer into a temporary directory:
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh
After a successful download, read the script, then run bash aquarium-install.sh.
Keep the script's SHA-256 check and do not change trust records.

Run codex plugin list --json to confirm codex-aquarium@codex-aquarium-local is installed.
From the installation directory printed by the installer, run node server/cli.mjs status.
If needed, start it with node server/cli.mjs start.
On macOS, confirm the installer reports successful automatic startup configuration. Report a failure accurately.
Check /api/health at the actual service address, and open the aquarium in my existing default browser.
Tell me the version, installation directory and address without displaying stop credentials.

Remind me to restart Codex, enable the Aquarium skill, and review and trust Hooks in the plugin's Hooks settings.
I must complete that step myself.
Then continue a real session and trigger a tool call to check the main fish and followers.
The fish should hide once all activity ends; resuming the same session should restore the original fish.
Do not substitute demo fish for real verification. Explain any installation or verification failure.
```

### Or run one command yourself

Paste this into a macOS / Linux terminal:

```bash
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh && bash aquarium-install.sh
```

This reads [install.sh](install.sh) through GitHub's official raw API and runs it only after a successful download. The script downloads the prebuilt plugin from the repository's `distribution` branch, checks SHA-256 and starts the aquarium. It doesn't use GitHub Release assets.

If Node.js is missing or older than 22.12, the script stops and points you to [nodejs.org](https://nodejs.org/). Install it, then run the command again.

The installation source lives at `~/.codex/aquarium-install/codex-aquarium`, or under your custom `CODEX_HOME`. Keep that directory for updates.

### Installed? Connect your sessions

Restart Codex Desktop, then open **Customize → Plugins → Codex Aquarium · 会话鱼缸**. Enable the Aquarium skill and use the gear next to Hooks to review and trust the plugin's hooks. The installer never confirms trust for you; Codex may ask for another review when hooks change.

![Plugin settings: enable Aquarium, review Hooks with the gear and use the example prompt to open the tank](docs/screenshots/plugin-configuration.png)

The lower red arrow points to the Hooks settings. After automatic startup is configured on macOS, visit the local aquarium link directly; no chat prompt is needed. The example prompt, “Try now,” and `$aquarium` can still open the page. Give the agent some work, and the first fish should swim in.

The background startup monitor runs after login and checks for the Codex main process every 5 seconds, without reading conversations. It starts the service once per app launch. If you stop the aquarium manually, it stays stopped until the next Codex app launch. Automatic app startup is not yet configured on Linux; use the example prompt to start the service there.

## An empty tank can be normal

Check whether any session is actually working. Chats that existed before installation need another turn or tool call to trigger a new event; switching tabs alone won't make fish appear. You can also try the clearly labeled demo school, then switch back to live mode.

If the agent is working but no fish appear, check that Aquarium is enabled and Hooks are trusted. Old states are also hidden after the service restarts; continuing the session brings them back. Only local events are connected for now. Remote and cloud sessions aren't supported, and hosted tools such as WebSearch may not emit observable Hooks events.

If you're still seeing an older page after updating, refresh the browser and confirm the installation succeeded and the local service restarted. For fullscreen, follow the page's suggestion to open the tank in a browser that supports it.

If a download fails, check that the terminal can reach `api.github.com`. API rate limits may require trying again later. Report raw 404 errors or repeated SHA-256 mismatches to the maintainer; keep the integrity check enabled.

## A few other things

There is no API key to configure. The collector keeps status metadata such as session IDs, call IDs, event types, tool names, agent types and timestamps. It doesn't save prompts, responses, tool arguments, tool output or authentication data, scan chat history, or upload runtime data. The service listens only on the local loopback address. Installation accesses GitHub to download files from the official repository.

To update, use the same Codex prompt or curl command again. A successful installation restarts the service and keeps your runtime data and Hooks trust records.

<details>
<summary>A little more about session states</summary>

Thinking, working and permission-waiting sessions appear in the tank. A main fish stays while its subagents are still busy, even after the parent finishes responding. It hides when all activity ends. Interruptions and session endings clear the relevant activity; resuming the same session restores its species and appearance from the session ID.

After a service restart or 30 minutes without events, the state becomes stale and is hidden until a new active event arrives. Saved state is removed after 24 hours without events. Tool fish belong to the main session; the plugin doesn't distinguish which subagent owns each tool call.

Runtime data lives at `${CODEX_HOME:-~/.codex}/codex-aquarium`. If you set `AQUARIUM_DATA_DIR`, the Hooks and service must use the same directory. Stop credentials stay on this computer.

</details>

<details>
<summary>Ready to retire the tank?</summary>

Disable automatic startup and stop the service before removing the plugin:

```bash
aquarium_root="${CODEX_HOME:-$HOME/.codex}/aquarium-install/codex-aquarium"
node "$aquarium_root/server/autostart.mjs" disable
node "$aquarium_root/server/cli.mjs" stop
codex plugin remove codex-aquarium@codex-aquarium-local
codex plugin marketplace remove codex-aquarium-local
```

You can delete the installation source directory when you no longer need it. Separately stored runtime data isn't automatically removed on uninstall.

</details>

<details>
<summary>Working on the code and publishing a version</summary>

Use the pnpm version declared by the project:

```bash
git clone https://github.com/kinglisky/codex-aquarium.git
cd codex-aquarium
pnpm install --frozen-lockfile
pnpm package
```

`pnpm package` runs tests and the production build, then produces the prebuilt package, installation scripts and `SHA256SUMS`. Use `pnpm dev` for frontend previews and `pnpm check` for checks. After building, manage the local service with `node server/cli.mjs start`, `status` and `stop`.

To release a version, update the version in `package.json`, `.codex-plugin/plugin.json` and `install.sh`, along with [CHANGELOG.md](CHANGELOG.md). Run `pnpm package` and `pnpm publish:distribution`, then push the source and its matching `v<version>` tag. Publishing requires an authenticated GitHub CLI with repository write access. Each version has its own directory; a published version cannot be overwritten.

For the plugin format and Hooks, see the [plugin packaging guide](https://developers.openai.com/plugins/build/plugins) and [Hooks trust documentation](https://learn.chatgpt.com/docs/hooks).

</details>

[MIT](LICENSE)
