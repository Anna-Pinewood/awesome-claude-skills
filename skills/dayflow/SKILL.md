---
name: dayflow
description: Analyze user's day, productivity, projects and activities from DayFlow screen recorder. Use when user asks about their day, schedule, progress on projects, where time was spent, distractions, what they worked on yesterday, productivity patterns, or anything related to their daily activities and screen time.
user-invocable: true
argument-hint: [question about your day]
---

# DayFlow - Personal Activity Analyzer

You have access to the user's DayFlow database via the `sqlite-dayflow` MCP server. DayFlow is a macOS app that records the screen at 1fps and uses AI to generate activity summaries every 15 minutes.

**IMPORTANT:** Before executing any queries, you MUST load the MCP tools first:
- Use ToolSearch with query `+sqlite-dayflow` or `sqlite dayflow` to load the tools
- The main tool you need is `mcp__sqlite-dayflow__read_query` for SELECT queries
- NEVER use write/create/delete tools — this database is read-only for us

If the tools are named differently (e.g. `mcp__dayflow__read_query`), use whatever name ToolSearch returns.

## Database location

`~/Library/Application Support/Dayflow/chunks.sqlite`

## Schema

### timeline_cards (main table — activity summaries)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| batch_id | INTEGER | FK to analysis_batches |
| start | TEXT | Human-readable start time, e.g. "2:30 PM" |
| end | TEXT | Human-readable end time, e.g. "3:45 PM" |
| start_ts | INTEGER | Unix timestamp (seconds) of start |
| end_ts | INTEGER | Unix timestamp (seconds) of end |
| day | DATE | Date in format "YYYY-MM-DD" |
| title | TEXT | Short title of the activity (in Russian or English) |
| summary | TEXT | 1-3 sentence summary of what user did |
| category | TEXT | Activity category (see below) |
| subcategory | TEXT | Optional subcategory (see below) |
| detailed_summary | TEXT | Detailed minute-by-minute breakdown |
| metadata | TEXT | JSON with `appSites` and `distractions` (see below) |
| video_summary_url | TEXT | Path to timelapse video file |
| is_deleted | INTEGER | 0 = active, 1 = deleted. ALWAYS filter `WHERE is_deleted = 0` |

### observations (raw AI observations per screenshot batch)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| batch_id | INTEGER | FK to analysis_batches |
| start_ts | INTEGER | Unix timestamp |
| end_ts | INTEGER | Unix timestamp |
| observation | TEXT | What AI saw on screen — very detailed, includes app names, URLs, UI elements, text on screen |
| llm_model | TEXT | Which model generated this (e.g. "claude") |

### timeline_review_ratings (user's self-assessment)

| Column | Type | Description |
|--------|------|-------------|
| start_ts | INTEGER | Unix timestamp |
| end_ts | INTEGER | Unix timestamp |
| rating | TEXT | User's rating, e.g. "distracted", "focused", "productive" |

### journal_entries (daily journal — may be empty)

| Column | Type | Description |
|--------|------|-------------|
| day | TEXT | Date "YYYY-MM-DD" |
| intentions | TEXT | Morning intentions |
| goals | TEXT | Goals for the day |
| reflections | TEXT | Evening reflections |
| summary | TEXT | Day summary |

### analysis_batches (processing metadata — rarely needed)

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| batch_start_ts | INTEGER | Unix timestamp |
| batch_end_ts | INTEGER | Unix timestamp |
| status | TEXT | "completed", "pending", "failed" |

## Known categories

- `2GIS Works` — work tasks (meetings, code, Mattermost, Confluence, GitLab)
- `Agents & Blog` — personal AI/agent projects, Claude Code, blogging
- `Distraction` — entertainment, YouTube, series, social media
- `Planning, reflections, mindset` — calendar, planning, journaling

## Known subcategories

`Calendar`, `Communication`, `Development`, `Documentation`, `Entertainment`, `Research`, `Setup`

## metadata JSON structure

```json
{
  "appSites": {
    "primary": "mm.2gis.one",
    "secondary": "gitlab.2gis.ru"
  },
  "distractions": [
    {
      "id": "uuid",
      "title": "Distraction title",
      "summary": "What happened",
      "startTime": "2:30 PM",
      "endTime": "2:35 PM"
    }
  ]
}
```

Key apps/sites:
- `mm.2gis.one` — Mattermost (work chat)
- `2gis.ktalk.ru` / `2gis.talk.ru` — KTalk (work video calls)
- `gitlab.2gis.ru` — GitLab (work code)
- `calendar.google.com` — Google Calendar
- `claude.ai` — Claude web
- `telegram.org` — Telegram
- `youtube.com` — YouTube

## How to answer user questions

### "What did I do today/yesterday?"
```sql
SELECT start, end, title, summary, category
FROM timeline_cards
WHERE day = '2026-02-17' AND is_deleted = 0
ORDER BY start_ts ASC
```

### "How much time did I spend on X category?"
```sql
SELECT category, SUM(end_ts - start_ts) / 60 as minutes, COUNT(*) as sessions
FROM timeline_cards
WHERE day = '2026-02-17' AND is_deleted = 0
GROUP BY category
ORDER BY minutes DESC
```

### "What was I doing on project X?" (search by keyword in title/summary)
```sql
SELECT day, start, end, title, summary
FROM timeline_cards
WHERE is_deleted = 0
  AND (title LIKE '%товарн%' OR summary LIKE '%товарн%' OR detailed_summary LIKE '%товарн%')
ORDER BY start_ts DESC
```

### "Where did I stop yesterday on work?"
```sql
SELECT start, end, title, summary, detailed_summary
FROM timeline_cards
WHERE day = 'YYYY-MM-DD' AND category = '2GIS Works' AND is_deleted = 0
ORDER BY start_ts DESC
LIMIT 3
```

### "What distractions did I have?"
```sql
SELECT day, start, end, title, summary,
  json_extract(metadata, '$.distractions') as distractions
FROM timeline_cards
WHERE is_deleted = 0
  AND (category = 'Distraction' OR json_array_length(json_extract(metadata, '$.distractions')) > 0)
  AND day = 'YYYY-MM-DD'
ORDER BY start_ts ASC
```

### "What's my most productive time?"
```sql
SELECT
  CASE
    WHEN cast(strftime('%H', start_ts, 'unixepoch', 'localtime') as integer) BETWEEN 6 AND 11 THEN 'Morning (6-12)'
    WHEN cast(strftime('%H', start_ts, 'unixepoch', 'localtime') as integer) BETWEEN 12 AND 17 THEN 'Afternoon (12-18)'
    ELSE 'Evening (18+)'
  END as time_of_day,
  category,
  SUM(end_ts - start_ts) / 60 as minutes
FROM timeline_cards
WHERE is_deleted = 0
GROUP BY time_of_day, category
ORDER BY time_of_day, minutes DESC
```

### "What meetings did I have?"
Look for cards where `subcategory = 'Communication'` or where `detailed_summary` mentions KTalk, calls, meetings:
```sql
SELECT day, start, end, title, summary
FROM timeline_cards
WHERE is_deleted = 0
  AND (subcategory = 'Communication'
    OR title LIKE '%встреч%' OR title LIKE '%синк%' OR title LIKE '%sync%'
    OR summary LIKE '%звонк%' OR summary LIKE '%call%'
    OR json_extract(metadata, '$.appSites.primary') LIKE '%ktalk%')
ORDER BY start_ts DESC
```

### "Progress on X since date Y"
```sql
SELECT day, start, end, title, summary
FROM timeline_cards
WHERE is_deleted = 0
  AND day >= 'YYYY-MM-DD'
  AND (title LIKE '%keyword%' OR summary LIKE '%keyword%')
ORDER BY start_ts ASC
```

### Deeper details — use observations table
When the user needs very detailed info (what exactly was on screen, what code was open, what messages were visible):
```sql
SELECT datetime(start_ts, 'unixepoch', 'localtime') as time, observation
FROM observations
WHERE start_ts >= unixepoch('YYYY-MM-DD', 'localtime')
  AND start_ts < unixepoch('YYYY-MM-DD', '+1 day', 'localtime')
  AND observation LIKE '%keyword%'
ORDER BY start_ts ASC
```

## Important notes

1. **Always filter `is_deleted = 0`** on timeline_cards
2. **Dates are in "YYYY-MM-DD" format** in the `day` column
3. **Timestamps are Unix seconds** (not milliseconds)
4. **User speaks Russian** — titles and summaries are mostly in Russian, search with Russian keywords
5. **For keyword search** use `LIKE '%keyword%'` on title, summary, and detailed_summary
6. **Time zone**: the user is in Moscow time (UTC+3). Use `'localtime'` modifier in datetime functions
7. **Start with timeline_cards** for most questions. Only go to observations when you need screen-level detail
8. **Present results as a readable narrative**, not raw data. Summarize, highlight key activities, calculate totals
9. **When user asks about "work"** — filter by `category = '2GIS Works'`
10. **When user asks about personal projects** — filter by `category = 'Agents & Blog'`
11. **If user mentions a person** (e.g. "Sergey", "Seryozha") — search in summary/detailed_summary with Russian name forms
12. **Calculate time in minutes/hours** using `(end_ts - start_ts) / 60` for minutes
13. **The query examples above are templates, not the only options.** Use your knowledge of the schema to compose any SQL query that fits the user's question. Combine tables, use JOINs, aggregations, subqueries — whatever is needed
