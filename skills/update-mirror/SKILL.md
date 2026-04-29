---
name: update-mirror
description: Update the Mirror (second brain) in Obsidian after a conversation or on demand. Proposes a compact plan, waits for confirmation, then executes.
user-invocable: true
---

# /update-mirror — Update Mirror in Obsidian

## How

1. Read `0-claude-mirror/mirror-rules.md` and `0-claude-mirror/map.md`
2. Read any existing Mirror files that would be affected
3. Quickly search vault for meaningful connections
4. **Propose a compact plan** (see format below), wait for confirmation
5. Execute, update `map.md`, output one-line summary per changed file

## Plan format

Compact but informative. The user needs enough signal to know what's changing — not a full draft, not a one-liner either.

### Per-file entries

- **List files only** with `CREATE` or `UPDATE` + path.
- **UPDATE: 2–4 short sentences** describing the delta — what exactly is changing.
- **CREATE: 2–3 sentences** describing what the note will contain — context + main sections / decisions, enough to know the scope is right.
- No full note drafts in the plan.

### Links

- Single block at the end: `Links: [[a]], [[b]], [[c]]`.
- A short qualifier per link is fine when non-obvious: `[[old-note]] (predecessor)`, `[[salary-review-2026]] (open channel with Nikita)`. One phrase max per link, no paragraphs.
- Include both Mirror and vault links here. Skip trivial/universal ones (e.g. `about-me`).

### Rules of the plan itself

- **No meta-commentary.** Skip "I considered X but...", "what I searched for but didn't include", etc.
- **No preamble.** Jump straight to the plan.
- **One closing question max** (e.g. naming).

### Example of the target length

```
## Plan

**UPDATE** `projects/X/foo.md`
- Set status to `superseded`, update the `updated` date.
- Add Outcome section: summary of how it ended, why it's final.
- Add pointer to [[bar]] as successor.

**CREATE** `projects/X/bar.md`
Successor project note for the decision to pursue Y instead of Z. Will contain: context (why Z was abandoned), plan (two conversations — one with A, one with B), timeline (4–6 weeks), open questions (priority trade-off between P and Q).

**UPDATE** `projects/personal/mood.md`
- Append log entry for today: reframe from catastrophic to realistic, what helped (grounded reality-check, not validation).

**UPDATE** `map.md`
- Move foo → Completed. Add bar under 2gis Active.

Links: [[foo]] (predecessor), [[salary-review-2026]] (open channel with Nikita), [[emotional-wellbeing]] (silence pattern), [[Заявление о недовольстве темпом работы]] (2025 predecessor, same problem)

Confirm? (Name for new note: `bar.md` ok?)
```

That's the ceiling. Tight CREATE descriptions beat bulleted ones for short notes.

## Content rules (when executing)

- Note bodies should stay tight too. Don't pad with context the user already has.
- Follow all structural rules from `mirror-rules.md`.

## Access

Obsidian MCP tools (`mcp__obsidian__vault`, `mcp__obsidian__view`). Load via `ToolSearch` with `+obsidian` if not available.

Vault path for direct file access (fallback when MCP is down):
`/Users/olgalipina/Yandex.Disk.localized/obsidian-vault/cloud-base/`
