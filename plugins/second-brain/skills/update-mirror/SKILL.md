---
name: update-mirror
description: Update the Mirror (second brain) in Obsidian after a conversation or on demand. Proposes a compact plan, waits for confirmation, then executes.
user-invocable: true
---

# /update-mirror — Update Mirror in Obsidian

## How

1. Read `0-claude-mirror/mirror-rules.md` and `0-claude-mirror/map.md`.
2. Read any existing Mirror files that would be affected.
3. **Research before creating new pages.** Search the vault for the topic — there is very likely an existing project / note / page that already covers it. Add to or link from the existing page. Create a new page only if there is a need to open new topic / new angle of an existing topic.
4. Search the vault for meaningful connections — both Mirror pages and Knowledge Pages (if talking about technical topics).
5. **Propose a compact plan** (see format below), wait for confirmation.
6. Execute. Update `map.md`. Update `projects-bucket.md` if the change introduces a new page or a new link relevant to a bucket entry. Output a one-line summary per changed file.

## What goes into Mirror

- **Only what the user actually said.** Small generalizations of her observations are fine — but never record Claude's own suggestions or ideas that the user did not explicitly confirm. If unsure whether something falls under "user said" — ask, don't write.
- **Always add links.** Every new or updated Mirror page must connect to:
  - adjacent / related projects in Mirror (`[[wiki-links]]`),
  - relevant Knowledge Pages in the vault.

  A Mirror page without links is broken — search the vault before writing. It is usually 3-5 links per page.

## Plan format

Compact but informative. The user needs enough signal to know what's changing — not a full draft.

### Per-file entries

- **List files only** with `CREATE` or `UPDATE` + path.
- **UPDATE: 2–3 lines** describing the delta — what exactly is changing per page.
- **CREATE: 2–3 lines** describing what the note will contain — context + main sections / decisions, enough to know the scope is right.
- No full note drafts in the plan.

### Links

- Single block at the end: `Links: [[a]], [[b]], [[c]]`.
- A short qualifier per link is fine when non-obvious: `[[old-note]] (predecessor)`, `[[salary-review-2026]] (open channel with Nikita)`. One phrase max per link, no paragraphs.
- Include both Mirror and vault links here. Skip trivial / universal ones (e.g. `about-me`).

### Bucket update

If the change introduces a new page or a new link that belongs next to an entry in `projects-bucket.md` — include the bucket update in the plan as a separate `UPDATE projects-bucket.md` entry, with one line on which bucket entry receives the new link.

Example: created `lamp-soirees.md` → add `[[lamp-soirees]]` next to the corresponding focus / near entry in bucket.

## Content rules (when executing)

- Note bodies stay tight. Don't pad with context the user already has.
- Follow all structural rules from `mirror-rules.md` (single-grasp opener, naming, dates, frontmatter, link minima, etc.).

## Mirror page format

### Single grasp в начале

Каждая project-страница (и при желании note) начинается с **одного-двух предложений без заголовка** — single grasp. За 30 секунд читатель должен понять, о чём проект и где остановились. Только после этого идут заголовки и развёрнутый контекст.

Пример:

```markdown
---
created: 2026-04-07
type: project
status: active
---

# Psychotherapy

Терапия с 6 апреля 2026 по социальной тревоге, онлайн. Сейчас assessment phase: терапевт собирает картину, домашка по тестам и наблюдениям к следующей сессии.

## Context
...
```

### Wiki-links

Связи между страницами — через `[[wiki-links]]`. Содержат **только filename без директории**: `[[boyfriend-dependency]]`, не `[[notes/boyfriend-dependency]]`.

Резолв ссылок в реальный путь — два способа, в зависимости от контекста:

- **Ссылка встречена внутри страницы.** Использовать `graph.forwardlinks` с `sourcePath` этой страницы — возвращает все её исходящие ссылки уже с резолвленными путями, без поиска. Это основной способ навигации при чтении.
- **Ссылка изолирована** (произнесена пользователем, взята из внешнего источника, или нужно найти страницу по имени). Тогда `vault.search file:<name>` или `vault.list` — короткий поиск по filename.

Угадывать путь по интуиции — нельзя в любом случае.

Каждая Mirror-страница должна быть встроена в граф: минимум **1 ссылка** в теле. Для `type: note` эта ссылка обязана указывать на существующий проект. Висящих в вакууме страниц быть не должно — они теряются. Чем больше осмысленных связей, тем лучше, но 1 — обязательный минимум.

### Где искать связи

- **Внутри Mirror:** `[[wiki-links]]` в теле, секция `## Mirror links` в project root, `map.md` как индекс.
- **Вне Mirror:** `## Vault links` в project root — ссылки на Knowledge Pages. `## External resources` в project root — связанные источники вне vault (Granola folders, Linear-проекты, репозитории, Slack-каналы, дашборды).

### External resources

Project root объявляет внешние источники с конкретными командами/инструментами, как туда попасть. Когда тема разговора задевает проект, Клод смотрит сюда и идёт по командам.

Пример внутри `projects/personal/psychotherapy.md`:

```markdown
## External resources

- **Granola folder `Психотерапия`** — транскрипты сессий с психологом.
  Команды: `mcp__granola__list_meeting_folders` → найти folder с title `Психотерапия` →
  `mcp__granola__list_meetings` с этим `folder_id` → `mcp__granola__get_meeting_transcript`.
```

Принцип: в правилах — **механизм** (что такое External resources, когда смотреть). В project root — **данные** (имена, ID, конкретные команды). Никакого хардкода специфики проекта в общих правилах.

### Опциональные секции project root

Жёсткого темплейта нет. Что часто встречается:

- **Context** — что это, зачем.
- **Decisions** — принятые решения с обоснованием и датами принятия.
- **Plan** — что собираемся делать.
- **Progress** — этапы и движение, достижения, заметки. Часто встречается, многие проекты ведут именно так.
- **Mirror links / Vault links / External resources** — связи (см. выше).

Mandatory ничего нет, кроме single grasp в самом верху.

### map.md updates

**Каждый создаваемый или переименуемый файл отражается в `map.md`** в рамках того же апдейта — одна строка с описанием и `[[wiki-link]]`. Без этого страница теряется и harness ругается.

## Правила письма

### Даты

Даты в тексте — `<DD-MM-YYYY>`: угловые скобки, день-месяц-год. Greppable, не триггерит wiki-link парсер.

Существующие даты в старых форматах будут смигрированы отдельным проходом.

### Frontmatter

Обязательные поля для всех заметок: `created`, `type`, `last_modified`.

`last_modified` Obsidian добавляет автоматически при редактировании через UI. Через MCP авто-добавление **не гарантировано** — Клод обязан проставлять/обновлять это поле программно при каждом create/edit. Поля `updated` в Mirror больше нет.

По типам:
- **`type: project`:** опционально `status: active | paused | completed`, `last-worked-on: <DD-MM-YYYY>`.
- **`type: note`:** `last_modified` обязательно. Привязка к проекту — через `[[wiki-link]]` в теле (минимум 1 на существующий проект).
- **`type: context`, `type: troubleshooting`:** правила TBD.

### Размер

Ориентир — **~2000 слов** на страницу. Не жёсткий лимит; превышение — сигнал «пора резать на sub-notes», не ошибка. Project root может быть длиннее, если он работает как мини-индекс со ссылками.

### Стиль

Писать естественно, без искусственных лимитов длины строки. Не дублировать заголовки в одной странице. Предпочитать короткое и конкретное многословному и общему.

## Access

Obsidian MCP tools (`mcp__obsidian__vault`, `mcp__obsidian__view`, `mcp__obsidian__graph`). Load via `ToolSearch` with `+obsidian` if not available.

Vault path for direct file access (fallback when MCP is down):
`/Users/olgalipina/Yandex.Disk.localized/obsidian-vault/cloud-base/`
