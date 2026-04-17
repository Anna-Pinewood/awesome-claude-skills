# Mattermost (mm.2gis.one) — Save thread to file

**Auth:** SSO. User must be logged in (headed mode required, session persists in profile).

**URL pattern:** `https://mm.2gis.one/<team>/pl/<POST_ID>`

**Output:** `.txt` file with thread link, date, and all messages.

## Approach: REST API via browser session

The right-side thread panel (`#rhsContainer`) uses virtual scrolling and often fails to render all messages for long threads (30+ replies). Instead, use the **Mattermost REST API** directly from the browser via `fetch()` — the browser's session cookies handle auth automatically.

This approach is:
- **Reliable** — always returns all messages, even for 80+ reply threads
- **Fast** — one API call instead of clicking, waiting, scrolling
- **Cheap** — zero snapshot tokens

## Steps

```bash
# 1. Open any Mattermost page in browser (need an active session).
#    If no MM tab is open, navigate to the thread link first.
curl -s -X POST http://localhost:9867/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://mm.2gis.one/<team>/pl/<POST_ID>", "newTab": true}'
# Save tabId from response

# 2. Fetch the full thread via REST API
curl -s -X POST http://localhost:9867/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "fetch(\"/api/v4/posts/<POST_ID>/thread\").then(r => r.json()).then(d => { window._threadData = d; return Object.keys(d.posts).length + \" posts\" })", "tabId": "<TAB_ID>"}'
# Returns a promise — wait ~2 sec, then check:
# (after 2 sec)
curl -s -X POST http://localhost:9867/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "window._threadData ? Object.keys(window._threadData.posts).length + \" posts\" : \"not yet\"", "tabId": "<TAB_ID>"}'

# 3. Collect unique user IDs from the thread
curl -s -X POST http://localhost:9867/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "var d = window._threadData; var uids = {}; d.order.forEach(function(id) { uids[d.posts[id].user_id] = 1; }); JSON.stringify(Object.keys(uids))", "tabId": "<TAB_ID>"}'

# 4. Resolve user IDs to names (one call per user)
#    Build the list from step 3, then:
curl -s -X POST http://localhost:9867/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "var ids = [\"<uid1>\",\"<uid2>\",...]; Promise.all(ids.map(function(id){ return fetch(\"/api/v4/users/\"+id).then(function(r){return r.json()}); })).then(function(users){ window._users = {}; users.forEach(function(u){ window._users[u.id] = (u.first_name || \"\") + \" \" + (u.last_name || \"\"); }); return JSON.stringify(window._users); })", "tabId": "<TAB_ID>"}'
# Wait ~2 sec, then read window._users

# 5. Extract all messages with author names and timestamps
curl -s -X POST http://localhost:9867/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"expression": "var u = window._users; var d = window._threadData; var result = d.order.map(function(id) { var p = d.posts[id]; return {author: u[p.user_id] || p.user_id, time: p.create_at, msg: p.message}; }); JSON.stringify(result)", "tabId": "<TAB_ID>"}'
```

### Batch processing multiple threads

When extracting several threads, reuse the same tab and `window._users` cache:
- Store each thread in `window._threadData1`, `window._threadData2`, etc.
- After resolving users for the first thread, check for new user IDs in subsequent threads and only resolve the new ones.

## Output format

The saved `.txt` file must start with the thread link and date, then list all messages chronologically:

```
Тред: https://mm.2gis.one/<team>/pl/<POST_ID>
Дата: YYYY-MM-DD

---

Автор Фамилия [YYYY-MM-DD HH:MM]:
Текст сообщения...

---

Другой Автор [YYYY-MM-DD HH:MM]:
Ответ...
```

### Determining the date

The API returns `create_at` as a Unix timestamp in milliseconds. Convert to Moscow time (UTC+3):
- Thread date = date of the first message (earliest `create_at`)
- Each message gets a `[YYYY-MM-DD HH:MM]` timestamp after the author name
- Sort messages by `create_at` ascending (the `order` array from API may not be chronological)

## API response structure

```json
{
  "order": ["post_id_1", "post_id_2", ...],
  "posts": {
    "post_id_1": {
      "id": "post_id_1",
      "user_id": "abc123",
      "message": "text content with markdown",
      "create_at": 1771238988043
    }
  }
}
```

- `order` — array of post IDs (may not be sorted chronologically — always sort by `create_at`)
- `posts` — map of post ID → post object
- `user_id` — resolve via `/api/v4/users/<user_id>` → `{first_name, last_name}`
- `message` — markdown text, may contain @mentions, links, code blocks, tables
- `create_at` — Unix timestamp in milliseconds

## Token cost

This recipe uses `/evaluate` (JS `fetch()`) instead of snapshots — **zero snapshot tokens**. Total: 1 navigate + ~4 evaluate calls (thread API + user resolution + extraction).

## Fallback: UI approach (for short threads only)

For threads with <10 replies, the UI approach still works:

1. Find post: `document.getElementById("post_<POST_ID>")`
2. Click `.ReplyButton` inside the post → opens `#rhsContainer` panel on the right
3. Extract from `#rhsContainer`: each `.post` contains `.user-popover` (author), `.post__time` (time), `.post__body` (text via `.innerText`)

**Do NOT use this for long threads** — the panel uses virtual scrolling and won't render all messages.
