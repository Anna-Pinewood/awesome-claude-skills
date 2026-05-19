---
name: check-bucket
description: Use after a long or substantive conversation (work, personal, anything significant), or after finishing/pausing/starting something. Audits projects-bucket.md against the current conversation.
---

# check-bucket

## What this skill does

1. Read `0-claude-mirror/projects-bucket.md` in full.
2. Compare bucket state against what the user actually said and decided in this conversation.
3. Surface mismatches and missing links. Discuss them naturally — don't force a template.
4. Make at most one type of write (see §3), only after explicit user approval.

## Whose words count

**Only what the user wrote.** Claude's suggestions, framings, or proposals that the user did NOT explicitly endorse must be ignored when judging bucket state.

Examples:
- Claude said "try working 1:1 with people on this fear" and the user did NOT confirm → DO NOT propose adding it to the bucket.
- User said "ok, going to try 1:1 conversations this week" → counts as a stated intention; can be proposed.
- User worked through a topic in detail and articulated a concrete next step → counts.

When in doubt, leave it out.

## What to look for

- **Topic the user worked through but it's not reflected in the bucket** → propose where it could go (В фокусе / Near / Пауза / Фон).
- **Focus item the user said is done / paused / dropped** → propose the transition.
- **Pause item whose blocker the user said is resolved** → propose return to focus or near.
- **Background practice the user said they stopped doing** → propose removing it.
- **Item in focus or near missing `Сделано:` or `Ближайшая цель:`** → ask whether to fill in.
- **Bullet missing its wiki-link when a matching page exists in the vault** → search the vault for a page whose title matches the project (e.g. "danang-ai-meetup", "calls-context-system") and propose attaching `[[link]]`.

Don't propose anything for topics only mentioned in passing.

## §3 — The single write action: complete a project/stage

If, and only if, the user has clearly said a project or stage is finished:

1. Identify the bullet to retire (in focus / near / pause).
2. Draft the Recently-completed entry as:
   `- [tag] [[link]] — что сделано (YYYY-MM-DD)`
3. Show the user both: the bullet being removed (verbatim) and the new bullet being added.
4. Wait for explicit "да" / "ок" / equivalent. Ambiguous reactions ≠ approval.
5. Only then:
   - delete the old bullet,
   - prepend the new bullet to the appropriate "Recently completed" location,
   - update `last_modified` in frontmatter to today,
   - report which file was changed.

## What this skill does NOT do

- Does not add items to any section silently.
- Does not rewrite or "tidy up" existing items.
- Does not normalize tags or sphere names — they float intentionally.
- Does not assume tags map to Vision spheres. Tags (e.g. `работа`, `агенты`, `умный контент`) and Vision sphere headings are independent axes; a tag may have no sphere counterpart and a sphere may have no matching tag.
- Does not touch the Vision / values blocks.
- Does not delete items silently anywhere.
- Does not change inline dates except the completion stamp.
- Does not act on Claude's own unaccepted suggestions.

## Tone

Talk normally. The goal is conversation, not a checklist. Walk through what's in the bucket vs what came up, point out gaps and offer links, ask what the user wants to do. No rigid sections, no headers in the response unless they help.
