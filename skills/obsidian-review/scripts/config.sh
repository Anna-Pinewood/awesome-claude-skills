# Общий конфиг obsidian-review. Все значения переопределяются env-переменными
# (это используется smoke-тестом, который работает на одноразовом волте).

OBSREVIEW_VAULT="${OBSREVIEW_VAULT:-/Users/olgalipina/Yandex.Disk.localized/obsidian-vault/cloud-base}"
OBSREVIEW_GIT_DIR="${OBSREVIEW_GIT_DIR:-$HOME/.claude-obsidian-review.git}"
OBSREVIEW_PORT="${OBSREVIEW_PORT:-3002}"
OBSREVIEW_MARKER="$OBSREVIEW_GIT_DIR/task-active"
OBSREVIEW_LOCK="$OBSREVIEW_GIT_DIR/task-active.lock"

# Токен плагин генерирует сам; скрипты читают его из data.json плагина,
# чтобы не копировать руками. До первого запуска плагина токена нет — это ок.
obsreview_token() {
	jq -r '.token // empty' \
		"$OBSREVIEW_VAULT/.obsidian/plugins/obsidian-review/data.json" 2>/dev/null
}

obsreview_git() {
	git --git-dir="$OBSREVIEW_GIT_DIR" --work-tree="$OBSREVIEW_VAULT" "$@"
}
