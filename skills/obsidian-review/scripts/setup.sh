#!/bin/bash
# Разовая инициализация shadow-git для obsidian-review.
# Создаёт архив вне волта, настраивает трекинг только *.md, делает первый коммит
# и печатает блок хуков для ~/.claude/settings.json.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

if [ -e "$OBSREVIEW_GIT_DIR" ]; then
	echo "Уже инициализировано: $OBSREVIEW_GIT_DIR" >&2
	exit 1
fi
[ -d "$OBSREVIEW_VAULT" ] || {
	echo "Волт не найден: $OBSREVIEW_VAULT" >&2
	exit 1
}

git init -q --bare "$OBSREVIEW_GIT_DIR"
obsreview_git config core.bare false
obsreview_git config core.worktree "$OBSREVIEW_VAULT"
obsreview_git config user.name "obsidian-review"
obsreview_git config user.email "obsidian-review@localhost"
obsreview_git config commit.gpgsign false

# Трекаем только .md; служебные папки Obsidian и корзину не видим вовсе.
cat >"$OBSREVIEW_GIT_DIR/info/exclude" <<'EOF'
*
!*/
!*.md
.obsidian/
.trash/
EOF

obsreview_git add -A
obsreview_git commit -q --allow-empty -m "initial baseline $(date '+%Y-%m-%d %H:%M:%S')"

n="$(obsreview_git ls-files | wc -l | tr -d ' ')"
echo "Готово: $OBSREVIEW_GIT_DIR (в базлайне $n md-файлов)"
echo
echo "Добавь в ~/.claude/settings.json (секция hooks):"
cat <<EOF
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__obsidian__edit|mcp__obsidian__vault|Edit|Write",
        "hooks": [
          {"type": "command", "command": "$SCRIPT_DIR/ensure-baseline.sh", "timeout": 30}
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {"type": "command", "command": "$SCRIPT_DIR/push-review.sh", "timeout": 60}
        ]
      }
    ]
  }
}
EOF
