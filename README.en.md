# Codex Aquarium

[中文](README.md) · English

**Your agent works. You watch fish.**

Turn active Codex sessions into fish in a 3D aquarium. Bring an Animal Crossing companion and watch the fish while your agent works.

![Current gallery: a visitor in a floral dress and Isabelle watch fish among plants and reefs](docs/screenshots/museum-gallery.jpg)

*Rendered locally with the current version, using demo fish.*

- **Live schools**: an active session is a large fish; tools and subagents are smaller followers. Fish leave when idle, and the same fish returns when the session resumes.
- **Free swimming**: 80 Animal Crossing fish models roam and avoid obstacles, independently of the visitor. Live sessions use medium or large species; demo mode includes all species.
- **Animal companions**: choose a girl or boy and one of 482 companions. Run sideways along the glass or stop to watch.
- **Six scenery presets**: the complete garden, tall plants, coral reefs, rocks, a grass carpet or a bare tank. Plants sway in the current.

<details>
<summary>See the tall plant meadow</summary>

![Current tall plant meadow: layered green plants and swimming fish](docs/screenshots/museum-meadow.jpg)

</details>

## Install

Requires Node.js 22.12+, Codex Desktop with plugin and Hooks support, the Codex CLI, Bash, curl, tar and a WebGL 2 browser. Verified on macOS; Linux still needs testing.

### Install from a Codex plugin source

Add the GitHub source:

```bash
codex plugin marketplace add kinglisky/codex-aquarium --ref marketplace
```

Restart Codex, select the **Codex Aquarium** source on the Plugins page and install the aquarium. Run its **Setup** skill once, or ask Codex to "Complete the initial setup for Codex Aquarium", then personally review and trust Hooks. The marketplace package includes the built interface and models; no compilation is needed.

Refresh the source, then update the plugin in Codex:

```bash
codex plugin marketplace upgrade codex-aquarium-local
```

If you installed with the script below, you can keep using it to update. To switch to the GitHub source, first run `codex plugin marketplace remove codex-aquarium-local`, then add the source above.

### Ask your agent

Copy this into a local Codex session:

```text
Install or update Codex Aquarium: https://github.com/kinglisky/codex-aquarium
Check Node.js 22.12+, the Codex CLI, Bash, curl, tar and codex plugin add --help.
If Node.js is missing or too old, direct me to https://nodejs.org/.
Download this script in a temporary directory, read it, then run bash aquarium-install.sh:
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh
Keep SHA-256 verification and confirm codex-aquarium@codex-aquarium-local is installed.
From the installation directory, use the same Node.js executable as the installer to check server/cli.mjs status and /api/health at the actual address. On macOS, also check automatic startup.
Remind me to restart Codex, enable Aquarium and personally review and trust Hooks. Do not confirm trust for me.
After trust is confirmed, verify real task fish and concurrent tool and subagent followers. Do not substitute demo fish.
Open the aquarium in my existing default browser. Report the version from the plugin manifest, the installation directory and the address. Do not display stop credentials.
```

### Install with curl

```bash
curl -fL -H 'Accept: application/vnd.github.raw+json' 'https://api.github.com/repos/kinglisky/codex-aquarium/contents/install.sh?ref=master' -o aquarium-install.sh && bash aquarium-install.sh
```

Installs a prebuilt package from GitHub raw files with SHA-256 verification. No local build is needed. The script exits with installation guidance if a suitable Node.js is missing. Use the same prompt or command to update. Keep the installation directory: `~/.codex/aquarium-install/codex-aquarium` by default, or under your custom `CODEX_HOME`.

## Watch the fish

1. Restart Codex. Under **Customize → Plugins → Codex Aquarium**, enable Aquarium and use the Hooks gear to review and trust the hooks yourself.
2. After initial setup on macOS, opening Codex starts the service silently within about 5 seconds, without opening a page. On other systems, a trusted session-start Hook starts it; you can also use `$aquarium`.
3. Open the **[local aquarium](http://127.0.0.1:43187/)**; use the address printed by the installer. Give your agent a task and fish swim in. No active tasks means no fish; focusing the input does not count as activity.

**Language**: the interface starts in your browser's language and supports Chinese and English. Use the menu in the top right to switch; your choice is saved.

**Controls**: A / D or Left/Right arrow keys to run sideways, drag to look around, scroll to zoom, and click a fish to see its session. The handbook lets you choose characters, scenery and demo mode. In native fullscreen, move the pointer or press Tab to reveal controls.

<details>
<summary>Settings screenshot and troubleshooting</summary>

![Plugin settings: Aquarium skill toggle and Hooks gear; the screenshot shows an earlier display name](docs/screenshots/plugin-configuration.png)

- **Page will not open**: start with `$aquarium`. If macOS automatic startup failed, run `node server/autostart.mjs enable` from the installation directory.
- **Task running, but no fish**: check Hooks trust and their Node.js path. Confirm `/api/state` updates `lastEventAt` during tool calls. An open page alone does not confirm session events are connected.
- **Stop manually**: run `node server/cli.mjs stop` from the installation directory. On macOS, it stays stopped until you fully quit and reopen Codex.
- **Node.js moved**: reinstall the plugin, then review and trust the updated hooks.
- **GitHub API rate limit**: retry once your quota resets; keep SHA-256 verification enabled.

</details>

Local sessions only. No API key, saved chat content, history scanning or uploaded runtime data.

Code is [MIT licensed](LICENSE). Animal Crossing models and textures belong to Nintendo and their respective owners; see the [asset notice](public/models/acnh/NOTICE.md).
