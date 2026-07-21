#!/bin/bash
# PreToolUse-хук: перед первой пишущей операцией задачи в волте снимает
# базлайн-коммит («фото до») и ставит маркер задачи. Все последующие вызовы
# в той же задаче выходят мгновенно по маркеру.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

# Быстрый выход до разбора JSON: маркер уже стоит — фото снято.
[ -f "$OBSREVIEW_MARKER" ] && exit 0

input="$(cat)"
tool_name="$(jq -r '.tool_name // empty' <<<"$input")"

case "$tool_name" in
mcp__obsidian__edit)
	# Все действия edit — пишущие, путь всегда внутри волта.
	;;
mcp__obsidian__vault)
	action="$(jq -r '.tool_input.action // empty' <<<"$input")"
	case "$action" in
	create | update | delete | move | rename | copy | split | combine | concatenate) ;;
	*) exit 0 ;; # read/list/search/fragments — не пишут
	esac
	;;
Edit | Write)
	file_path="$(jq -r '.tool_input.file_path // empty' <<<"$input")"
	case "$file_path" in
	"$OBSREVIEW_VAULT"/*) ;;
	*) exit 0 ;;
	esac
	;;
Bash)
	# Эвристика: команда упоминает волт (полный путь или имя папки) → возможно,
	# пишет в него. Ложное срабатывание безвредно (лишний снапшот + пустой push);
	# пропуск означает лишь «правки без ревью». Кейс «cd в волт, потом относительные
	# пути» ловится на самом cd. Читать волт bash'ем тоже засчитывается — не страшно.
	cmd="$(jq -r '.tool_input.command // empty' <<<"$input")"
	if ! grep -qF "$OBSREVIEW_VAULT" <<<"$cmd" &&
		! grep -qF "$(basename "$OBSREVIEW_VAULT")" <<<"$cmd"; then
		exit 0
	fi
	;;
*) exit 0 ;;
esac

[ -d "$OBSREVIEW_GIT_DIR" ] || exit 0 # setup.sh ещё не запускали — молча пропускаем

# Лок на mkdir (атомарен): параллельные вызовы хука не должны коммитить дважды.
if ! mkdir "$OBSREVIEW_LOCK" 2>/dev/null; then
	# Кто-то уже снимает фото; ждём его до 15 с, чтобы правка не попала в базлайн.
	for _ in $(seq 1 150); do
		[ -f "$OBSREVIEW_MARKER" ] && exit 0
		sleep 0.1
	done
	exit 0
fi
trap 'rmdir "$OBSREVIEW_LOCK" 2>/dev/null' EXIT

[ -f "$OBSREVIEW_MARKER" ] && exit 0

obsreview_git add -A
if ! obsreview_git diff --cached --quiet 2>/dev/null; then
	obsreview_git commit -q -m "baseline $(date '+%Y-%m-%d %H:%M:%S')"
fi
touch "$OBSREVIEW_MARKER"
exit 0
