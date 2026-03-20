---
name: second-brain
description: >
  A "Mirror" system — a meta-context layer in Obsidian that acts as a second brain for Claude.
  Stores project state, decisions, patterns, personal context, and feedback across conversations.
  Requires Obsidian MCP server.
user-invocable: false
metadata:
  openclaw:
    requires:
      mcp: ["obsidian"]
---

# Mirror — second brain in Obsidian

## What is Mirror

Mirror is a meta-context layer in an Obsidian vault, stored in a dedicated folder (e.g. `0-claude-mirror/`). It stores everything that usually stays "in the user's head": project state, decisions and their reasoning, patterns, personal context, feedback.

Mirror notes are written PRIMARILY for Claude. The user may read them, but that's secondary. What matters most is that Claude can reconstruct the full picture: what's happening, why, what decisions were made, how things connect.

Mirror does NOT duplicate Knowledge Pages — it links to them.

**Mirror is a living, evolving structure.** If you see that a new category of notes is needed, that some organizational pattern isn't working, that connections are missing, or that the structure should change — propose it. Always propose improvements. Mirror should grow and adapt to how it's actually used, not stay rigid.

## Setup

### 1. Add to CLAUDE.md

Add a snippet like this to your `CLAUDE.md` (global or project-level):

```markdown
## Mirror — second brain in Obsidian

There is a "Mirror" system in the user's Obsidian vault — a meta-context layer
that acts as a second brain. It stores project state, decisions, patterns,
personal context, and feedback.

**Location:** Obsidian vault → `0-claude-mirror/`
**Rules:** `0-claude-mirror/mirror-rules.md` — read this file to understand
how Mirror works before interacting with it.
**Index:** `0-claude-mirror/map.md` — start here to see what context is available.

At the start of most conversations, check Mirror for relevant context.
Use the Obsidian MCP tools (`mcp__obsidian__vault`, `mcp__obsidian__view`,
`mcp__obsidian__graph`) to read and write to the vault.
```

### 2. Create the folder structure in Obsidian

```
0-claude-mirror/
├── mirror-rules.md         # Copy the Rules section below into this file
├── map.md                  # Index of everything in Mirror
├── projects/               # Projects: root notes + sub-notes
│   ├── work/               # Work projects
│   ├── auto/               # Automations and tools
│   └── personal/           # Travel, life, hobbies, personal growth
├── context/                # Persistent context about the user
├── feedback/               # User corrections and learned behaviors
└── troubleshooting/        # What to do when things break
```

### 3. Require an Obsidian MCP server

Mirror uses Obsidian MCP tools (`mcp__obsidian__vault`, `mcp__obsidian__view`, etc.) to read and write. Make sure you have an Obsidian MCP server configured.

## Rules

### Projects — the primary unit

Everything is a project. "Product agent at work", "apartment search", "dealing with social anxiety", "reading book X" — all projects.

#### Project root note template

```markdown
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
status: active | paused | completed
last-worked-on: YYYY-MM-DD
type: project
---

# Project name

## Context
What this is, why it exists, where it came from.

## Current state
What's happening right now. Updated on every change.

## Decisions
- [date] Decided X because Y. Alternative Z rejected due to W.
- [date] ...

## Mirror links
[[other-project]] — how it's connected

## Vault links
[[Knowledge Page]] — relevant knowledge

## Handoff
Everything needed to pick up this project from scratch. Key files, context, current blocker. Kept up to date at all times.
```

#### Project sub-notes

Large projects can have sub-notes. A sub-note links back to the project root. Sub-notes cover specific epics, sub-projects, or large chunks of context that don't fit in the root note.

#### Links between projects

Projects link to each other via `[[links]]` in the "Mirror links" section and in `map.md`. A work project may spawn a personal automation that's reusable in other contexts — these connections are important to capture.

### Note size and granularity

**Signs a note should be split:**
- It's longer than ~150 lines (exception: project root notes can go up to ~250)
- It covers multiple distinct sub-topics that could stand alone
- You find yourself wanting to link to a specific section, not the whole note

**Signs notes should be merged or content added inline:**
- A sub-note is under ~20 lines and doesn't link to anything else
- Two notes always get read together — they're really one thing
- A "decision" or "update" is only meaningful in the context of its project

**Rule of thumb:** a Mirror note should be the size of a good handoff — enough to fully understand one coherent topic without chasing five other files.

### Context — persistent user context

Notes about the user that aren't tied to a specific project: tech preferences, location, communication style, goals, interests.

### Feedback — user corrections

Corrections from the user that Claude must remember. Each entry: what happened → what was wrong → how to do it correctly.

### Troubleshooting — what to do when things break

Operational fixes: what to do when MCP servers crash, known bugs and workarounds, environment-specific issues.

### File naming

Latin, lowercase, hyphen-separated. Claude should understand the content from the filename alone.

✅ `product-agent-2gis.md`, `danang-apartment-search.md`, `feedback-too-many-links.md`
❌ `project-1.md`, `notes.md`, `important.md`

### Language

English is the primary language for Mirror. Exceptions: quotes from the user, proper names, terms that don't translate well.

### map.md

Index file. Claude loads it first. Contains all Mirror notes with one-line descriptions + links between them.

### When to read Mirror

**Almost always.** At the start of every non-trivial conversation:

1. Load `map.md`
2. Determine which files are relevant to the current conversation
3. Read them
4. If details are needed — follow `[[links]]` into Knowledge Pages

If the user mentions a topic that might have context — check Mirror before asking.

### When and how to write to Mirror

#### Principle: plan first, then write

Never write to Mirror silently. Always:

1. Propose a plan: what to update/create, where, why, what links to add
2. Wait for confirmation (or correction)
3. Execute
4. Update `map.md`
5. Output a list of updated files

#### What to record

| What | Where | Example |
|------|-------|---------|
| New project or status change | `projects/` + `map.md` | Started a new work epic |
| Decision made | Project root note, "Decisions" section | Chose beam search |
| Link between projects | Both project notes + `map.md` | Work automation useful in personal project |
| User correction | `feedback/` | "Don't add more than 5 links" |
| User context | `context/` | Moved to a new city |
| Observed pattern | `context/` or relevant project | Communication pattern |
| Operational fix | `troubleshooting/` | MCP server crashes and how to reconnect |

#### Facts and knowledge → Knowledge Pages

If reusable knowledge comes up in conversation — propose writing it to Knowledge Pages. **Always confirm with the user** before writing.

#### Proactive suggestions

If you notice:
- A pattern across projects that deserves its own note — propose it
- A structural improvement to Mirror — propose it
- Missing connections between existing notes — propose adding them
- A feedback entry that should exist based on a correction — propose it

Always propose. Never silently restructure.

## /update-mirror skill

Create a companion skill at `.claude/skills/update-mirror/SKILL.md` to invoke Mirror updates on demand:

```markdown
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
5. Propose an update plan to the user (what to create/update/link and why)
6. Wait for confirmation
7. Execute, update map.md
8. Output list of updated files

## Access

Obsidian MCP tools (`mcp__obsidian__vault`, `mcp__obsidian__view`).
Load via `ToolSearch` with query `+obsidian` if not yet available.
```
