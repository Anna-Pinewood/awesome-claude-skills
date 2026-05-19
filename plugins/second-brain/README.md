# second-brain

Skills for working with and formalizing my personal second brain (Obsidian Mirror) — current state, projects, vision, context.

## Skills

- **check-bucket** — audits `projects-bucket-new.md` against the current conversation, surfaces mismatches, reattaches lost wiki-links. Read-only by default; the only allowed write is moving a confirmed-completed item to "Recently completed" with explicit user approval.

## Layout

```
second-brain/
├── .claude-plugin/plugin.json
├── skills/
│   └── check-bucket/SKILL.md
├── scripts/                    (empty for now)
└── README.md
```

## Install (local dev)

This plugin lives in `~/Documents/awesome-claude-skills/plugins/second-brain/` and is symlinked into `~/.claude/plugins/second-brain`.

## Conventions

- Only what the user explicitly says/decides counts. Claude's own unaccepted suggestions are ignored when reasoning about state.
- Sphere tags in the bucket float intentionally — skills must not normalize them.
