---
name: update-mirror
description: Update the Mirror (second brain) in Obsidian after a conversation or on demand. Proposes what to create/update, waits for confirmation, then executes.
user-invocable: true
---

# /update-mirror — Update Mirror in Obsidian

Update Mirror based on the current conversation or a user-specified topic.

## How

1. Read `0-claude-mirror/mirror-rules.md` — follow all rules from there
2. Read `0-claude-mirror/map.md` — understand current state
3. Analyze the conversation: what should be captured?
4. Read any existing Mirror files that would be affected
5. **Search for connections** (see rules below)
6. Propose an update plan to the user (what to create/update/link and why)
7. Wait for confirmation
8. Execute, update map.md
9. Output list of updated files

## Connection search rules

When proposing a new or updated note, you MUST search for meaningful connections before presenting the plan:

1. **Search Knowledge Pages and Graph Nodes**, not just Mirror notes. Use vault search with relevant keywords for the topic.
2. **Don't list trivial or universal connections.** If a note connects to everything (e.g. `about-me`), it's not a meaningful connection — omit it.
3. **Show what you searched** when proposing. If you found no vault connections, say so explicitly — don't silently skip.
4. Connections should be **specific and informative**: explain *how* the notes relate, not just that they exist.

## Access

Obsidian MCP tools (`mcp__obsidian__vault`, `mcp__obsidian__view`).
Load via `ToolSearch` with query `+obsidian` if not yet available.

Vault path for direct file access:
`/Users/olgalipina/Yandex.Disk.localized/obsidian-vault/cloud-base/`
