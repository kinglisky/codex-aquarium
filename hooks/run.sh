#!/bin/sh

# GUI applications do not always inherit the terminal's Node.js PATH.
# Do not load shell profiles or write anything to the user's configuration.
PLUGIN_ROOT=${PLUGIN_ROOT:-$(CDPATH= cd -- "${0%/*}/.." 2>/dev/null && pwd)}
if [ -z "$PLUGIN_ROOT" ]; then
  printf '{}\n'
  exit 0
fi

for runtime in \
  "${AQUARIUM_NODE:-}" \
  "$(command -v node 2>/dev/null)" \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  /usr/bin/node \
  "$HOME/.volta/bin/node" \
  "$HOME/.local/share/fnm/node-versions/"*/installation/bin/node \
  "$HOME/.nvm/versions/node/"*/bin/node \
  "$HOME/.cache/codex-runtimes/"*/dependencies/node/bin/node
do
  [ -x "$runtime" ] || continue
  "$runtime" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || major === 22 && minor >= 12 ? 0 : 1)' >/dev/null 2>&1 || continue
  exec "$runtime" "$PLUGIN_ROOT/hooks/observe.mjs"
done

# Hooks remain observational even if Node.js is unavailable.
printf '{}\n'
