#!/bin/bash
# Smoke-тест git-механики на одноразовом волте. Без Obsidian: вместо плагина —
# мини-HTTP-сервер, который принимает POST /review и пишет пакет в файл.
# Запуск: ./smoke-test.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

TMP="$(mktemp -d)"
export OBSREVIEW_VAULT="$TMP/vault"
export OBSREVIEW_GIT_DIR="$TMP/shadow.git"
export OBSREVIEW_PORT=39217
SERVER_PID=""
cleanup() {
	[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
	rm -rf "$TMP"
}
trap cleanup EXIT

fail() {
	echo "FAIL: $1" >&2
	exit 1
}
ok() { echo "ok: $1"; }

pretooluse_input() {
	jq -n --arg fp "$1" '{tool_name: "Write", tool_input: {file_path: $fp}}'
}
commits() { git --git-dir="$OBSREVIEW_GIT_DIR" rev-list --count HEAD; }

# --- подготовка волта
mkdir -p "$OBSREVIEW_VAULT/notes" "$OBSREVIEW_VAULT/.obsidian/plugins/obsidian-review"
echo '{"token": "smoke-token"}' >"$OBSREVIEW_VAULT/.obsidian/plugins/obsidian-review/data.json"
printf 'первая строка\nвторая строка\n' >"$OBSREVIEW_VAULT/notes/a.md"
printf 'текст\n' >"$OBSREVIEW_VAULT/b.md"
printf 'вложение' >"$OBSREVIEW_VAULT/pic.png"

"$SCRIPT_DIR/setup.sh" >/dev/null
[ "$(commits)" = 1 ] || fail "setup: ожидался 1 коммит"
git --git-dir="$OBSREVIEW_GIT_DIR" ls-files | grep -q 'pic.png' && fail "setup: png попал в трекинг"
git --git-dir="$OBSREVIEW_GIT_DIR" ls-files | grep -q '.obsidian' && fail "setup: .obsidian попал в трекинг"
ok "setup: только md в базлайне"

# --- сценарий 1: первая правка снимает фото (вместе с ручными правками)
printf 'ручная правка юзера\n' >>"$OBSREVIEW_VAULT/b.md" # "ручная" правка до задачи
# PreToolUse срабатывает ДО применения правки агентом:
pretooluse_input "$OBSREVIEW_VAULT/notes/a.md" | "$SCRIPT_DIR/ensure-baseline.sh"
printf 'первая строка\nВТОРАЯ строка агентом\n' >"$OBSREVIEW_VAULT/notes/a.md"
[ -f "$OBSREVIEW_GIT_DIR/task-active" ] || fail "s1: маркер не создан"
[ "$(commits)" = 2 ] || fail "s1: ожидались 2 коммита"
git --git-dir="$OBSREVIEW_GIT_DIR" show HEAD:b.md | grep -q 'ручная' || fail "s1: ручная правка не в базлайне"
git --git-dir="$OBSREVIEW_GIT_DIR" show HEAD:notes/a.md | grep -q 'ВТОРАЯ' && fail "s1: правка агента попала в базлайн"
ok "s1: фото до + маркер"

# --- сценарий 2: последующие правки фото не двигают
pretooluse_input "$OBSREVIEW_VAULT/notes/a.md" | "$SCRIPT_DIR/ensure-baseline.sh"
printf 'ещё правка агента\n' >>"$OBSREVIEW_VAULT/notes/a.md"
pretooluse_input "$OBSREVIEW_VAULT/notes/a.md" | "$SCRIPT_DIR/ensure-baseline.sh"
[ "$(commits)" = 2 ] || fail "s2: базлайн уехал"
ok "s2: повторный хук — no-op"

# --- сценарий 3: нерелевантные вызовы не трогают ничего
rm -f "$OBSREVIEW_GIT_DIR/task-active"
pretooluse_input "/tmp/чужой-файл.md" | "$SCRIPT_DIR/ensure-baseline.sh"
[ ! -f "$OBSREVIEW_GIT_DIR/task-active" ] || fail "s3: маркер от чужого пути"
jq -n '{tool_name: "mcp__obsidian__vault", tool_input: {action: "search"}}' |
	"$SCRIPT_DIR/ensure-baseline.sh"
[ ! -f "$OBSREVIEW_GIT_DIR/task-active" ] || fail "s3: маркер от read-действия"
touch "$OBSREVIEW_GIT_DIR/task-active"
ok "s3: фильтрация вызовов"

# --- сценарий 4: push при закрытом Obsidian — флаг жив, коммита нет
out="$("$SCRIPT_DIR/push-review.sh")"
[ "$(commits)" = 2 ] || fail "s4: закоммитил при неудачном push"
[ -f "$OBSREVIEW_GIT_DIR/task-active" ] || fail "s4: маркер удалён при неудаче"
grep -q systemMessage <<<"$out" || fail "s4: нет сообщения пользователю"
ok "s4: неудачный push ничего не фиксирует"

# --- сценарий 5: успешный push — пакет корректен, новый базлайн, маркер снят
uv run python -c "
from http.server import HTTPServer, BaseHTTPRequestHandler
import sys
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        assert self.path == '/review'
        assert self.headers['Authorization'] == 'Bearer smoke-token', self.headers['Authorization']
        body = self.rfile.read(int(self.headers['Content-Length']))
        open('$TMP/received.json', 'wb').write(body)
        self.send_response(200); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', $OBSREVIEW_PORT), H).serve_forever()
" &
SERVER_PID=$!
sleep 1

printf 'новый файл агента\n' >"$OBSREVIEW_VAULT/notes/new.md"
"$SCRIPT_DIR/push-review.sh" >/dev/null
[ -f "$TMP/received.json" ] || fail "s5: сервер не получил пакет"
[ "$(commits)" = 3 ] || fail "s5: нет коммита после успешного push"
[ ! -f "$OBSREVIEW_GIT_DIR/task-active" ] || fail "s5: маркер не снят"

jq -e '.files | length == 2' "$TMP/received.json" >/dev/null || fail "s5: ожидались 2 файла в пакете"
jq -e '.files[] | select(.path == "notes/a.md") | .baseline | contains("вторая строка")' \
	"$TMP/received.json" >/dev/null || fail "s5: в базлайне a.md нет старого текста"
jq -e '.files[] | select(.path == "notes/new.md") | .baseline == ""' \
	"$TMP/received.json" >/dev/null || fail "s5: у нового файла базлайн не пуст"
ok "s5: успешный push — пакет, коммит, маркер"

# --- сценарий 6: удаление файла попадает в пакет как deleted
touch "$OBSREVIEW_GIT_DIR/task-active"
rm "$OBSREVIEW_VAULT/b.md"
"$SCRIPT_DIR/push-review.sh" >/dev/null
jq -e '.files[] | select(.path == "b.md") | .deleted == true' \
	"$TMP/received.json" >/dev/null || fail "s6: удаление не помечено deleted"
ok "s6: удаление файла"

echo
echo "SMOKE TEST PASSED"
