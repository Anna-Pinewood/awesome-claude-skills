#!/bin/bash
# Собирает плагин и кладёт три его файла в волт.
# Запускать после каждого изменения кода плагина.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

PLUGIN_SRC="$SCRIPT_DIR/../plugin"
PLUGIN_DST="$OBSREVIEW_VAULT/.obsidian/plugins/obsidian-review"

(cd "$PLUGIN_SRC" && bun run build >/dev/null)
mkdir -p "$PLUGIN_DST"
cp "$PLUGIN_SRC/main.js" "$PLUGIN_SRC/manifest.json" "$PLUGIN_SRC/styles.css" "$PLUGIN_DST/"
echo "Установлено в $PLUGIN_DST"
echo "Если Obsidian открыт — перезагрузи плагин (или Obsidian целиком)."
