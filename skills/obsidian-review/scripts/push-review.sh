#!/bin/bash
# Stop-хук: если задача правила волт (стоит маркер) — собирает дифф против
# базлайна, шлёт плагину и при успехе фиксирует новый базлайн. При неудаче
# (Obsidian закрыт) ничего не коммитит: правки продолжают копиться до
# первого успешного push.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

[ -f "$OBSREVIEW_MARKER" ] || exit 0

finish_ok() {
	if ! obsreview_git diff --cached --quiet 2>/dev/null; then
		obsreview_git commit -q -m "after task $(date '+%Y-%m-%d %H:%M:%S')"
	fi
	rm -f "$OBSREVIEW_MARKER"
	exit 0
}

obsreview_git add -A

payload="$(mktemp)"
objects="$(mktemp)"
difflist="$(mktemp)"
trap 'rm -f "$payload" "$objects" "$difflist"' EXIT

# Изменённые .md против базлайна. --no-renames: переезд = удаление + создание.
# NUL-разделённый вывод — через файл: в bash-переменной NUL не живёт.
obsreview_git diff --cached --no-renames --name-status -z HEAD -- '*.md' >"$difflist"
[ -s "$difflist" ] || finish_ok # правок в md нет — тихо закрываем задачу

while IFS= read -r -d '' status && IFS= read -r -d '' path; do
	case "$status" in
	A)
		jq -n --arg path "$path" '{path: $path, baseline: "", deleted: false}'
		;;
	D)
		jq -n --arg path "$path" '{path: $path, baseline: "", deleted: true}'
		;;
	*)
		obsreview_git show "HEAD:$path" |
			jq -Rs --arg path "$path" '{path: $path, baseline: ., deleted: false}'
		;;
	esac >>"$objects"
done <"$difflist"

jq -s '{files: .}' "$objects" >"$payload"

token="$(obsreview_token)"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 \
	-X POST "http://127.0.0.1:$OBSREVIEW_PORT/review" \
	-H "Authorization: Bearer $token" \
	-H "Content-Type: application/json" \
	--data-binary @"$payload" 2>/dev/null || echo 000)"

[ "$code" = "200" ] && finish_ok

n="$(jq '.files | length' "$payload")"
jq -n --arg msg "obsidian-review: Obsidian недоступен (HTTP $code) — ревью $n файл(ов) не показано. Правки применены; дифф будет доставлен после следующей задачи при открытом Obsidian." \
	'{systemMessage: $msg}'
exit 0
