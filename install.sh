#!/bin/bash
set -euo pipefail

VERSION='v0.3.0'
RAW_BASE="https://api.github.com/repos/kinglisky/codex-aquarium/contents/$VERSION"

fail() {
  printf '安装失败：%s\n' "$1" >&2
  exit 1
}

case "${1:-}" in
  --help) printf '用法：bash install.sh\n需要 Node.js 22.12+、curl、tar 和支持插件的 Codex CLI。\n'; exit 0 ;;
  '') ;;
  *) fail '不支持此参数，请使用 bash install.sh。' ;;
esac

NODE_HELP='请先安装或升级至 Node.js 22.12+（https://nodejs.org/），重新打开终端后重试。'
command -v node >/dev/null 2>&1 || fail "$NODE_HELP"
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);' \
  >/dev/null 2>&1 || fail "$NODE_HELP"

for tool in curl tar; do
  command -v "$tool" >/dev/null 2>&1 || fail "请先安装 $tool 后重试。"
done
command -v codex >/dev/null 2>&1 || fail '请先安装 Codex CLI，并确认终端可以运行 codex。'
codex plugin add --help >/dev/null 2>&1 || fail '当前 Codex CLI 不支持插件，请更新 Codex 后重试。'

DOWNLOAD_DIR=$(mktemp -d "${TMPDIR:-/tmp}/codex-aquarium-install.XXXXXX")
trap 'rm -rf "$DOWNLOAD_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '正在下载 Codex Aquarium %s…\n' "$VERSION"
download() {
  local file="$1"
  curl --fail --location --silent --show-error --connect-timeout 10 --max-time 180 --retry 2 \
    -H 'Accept: application/vnd.github.raw+json' -o "$DOWNLOAD_DIR/$file" \
    "$RAW_BASE/$file?ref=distribution" || fail "$file 下载失败，请检查网络后重试。"
}

verify() {
  node --input-type=module - "$DOWNLOAD_DIR" "$1" <<'NODE'
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const directory = process.argv[2];
const file = process.argv[3];
const lines = readFileSync(path.join(directory, 'SHA256SUMS'), 'utf8').split(/\r?\n/);
const entries = lines.map(line => line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i)).filter(entry => entry?.[2] === file);
const hash = createHash('sha256');
for await (const chunk of createReadStream(path.join(directory, file))) hash.update(chunk);
if (entries.length !== 1 || entries[0][1].toLowerCase() !== hash.digest('hex')) {
  console.error(`安装失败：${file} 的 SHA-256 校验失败，请重新下载安装脚本后重试。`);
  process.exit(1);
}
NODE
}

download SHA256SUMS
download install.mjs
verify install.mjs

node --input-type=module - "$DOWNLOAD_DIR" > "$DOWNLOAD_DIR/downloads" <<'NODE'
import { readFileSync } from 'node:fs';
import path from 'node:path';

const lines = readFileSync(path.join(process.argv[2], 'SHA256SUMS'), 'utf8').split(/\r?\n/).filter(Boolean);
const files = lines.map(line => line.match(/^[a-f0-9]{64}\s+\*?(.+)$/i)?.[1]);
const parts = files.filter(file => /^codex-aquarium\.tgz\.part-\d{3,}$/.test(file)).sort();
const allowed = /^(install\.(mjs|sh)|codex-aquarium\.tgz(?:\.part-\d{3,})?)$/;
const contiguous = parts.every((file, index) => file === `codex-aquarium.tgz.part-${String(index).padStart(3, '0')}`);
if (files.some(file => !allowed.test(file)) || new Set(files).size !== files.length || !files.includes('codex-aquarium.tgz') || !contiguous) {
  console.error('安装失败：SHA-256 校验清单格式无效，请重新下载安装脚本后重试。');
  process.exit(1);
}
process.stdout.write(`${(parts.length ? parts : ['codex-aquarium.tgz']).join('\n')}\n`);
NODE

while IFS= read -r file; do
  download "$file"
  verify "$file"
done < "$DOWNLOAD_DIR/downloads"

node --input-type=module - "$DOWNLOAD_DIR" <<'NODE'
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const directory = process.argv[2];
const files = readFileSync(path.join(directory, 'downloads'), 'utf8').trim().split('\n');
if (files[0] === 'codex-aquarium.tgz') process.exit(0);
for (const file of files) {
  await pipeline(createReadStream(path.join(directory, file)), createWriteStream(path.join(directory, 'codex-aquarium.tgz'), { flags: 'a' }));
}
NODE
verify codex-aquarium.tgz

node "$DOWNLOAD_DIR/install.mjs" --archive "$DOWNLOAD_DIR/codex-aquarium.tgz"
