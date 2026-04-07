---
name: visual-webpage
description: Create interactive visual explainer webpages from articles, docs, or concepts. Generates a self-contained Vite + React + TypeScript project with scroll-driven slides, animations, and interactive components. Use when user wants to visually unpack a topic as a scrollable one-pager.
user-invocable: true
argument-hint: <article URL or topic> [--plan for controlled mode]
---

# Visual Webpage — Interactive Visual Explainer Generator

Create scroll-driven, interactive single-page sites that visually break down articles, docs, or concepts into engaging slide-by-slide experiences.

## Invocation

```
/visual-webpage <article URL or topic description>
/visual-webpage --plan <article URL or topic description>
```

## Modes

### Quick mode (default)
1. Fetch and analyze the source material
2. Extract key concepts, structure, and narrative arc
3. Design slides and pick appropriate visual components
4. Generate slides into the project (copy template, write slides, adjust theme)
5. Run `npm install && npm run dev` and open in browser

### Controlled mode (`--plan`)

A collaborative process — the user shapes the narrative, the agent builds it.

**Step 1 — Research & clarify.**
Fetch and deeply analyze the source material. Then ask the user a small set of focused questions (3-5 max):
- What's the key message you want to land?
- Any parts you want to emphasize or skip?
- Audience — who is this for?
- Any specific visual ideas or metaphors you have in mind?
- Anything else that matters to you about how this story is told?

Don't overwhelm with questions. The goal is to understand the user's vision and priorities before planning.

**Step 2 — Propose slide plan.**
Based on the research and user's answers, present a concise slide plan as a table:

| # | Slide title | Core idea | Visual / animation / interaction |
|---|---|---|---|
| 1 | ... | ... | ... |
| 2 | ... | ... | ... |

Keep it compact — one line per slide, enough detail to evaluate but not a wall of text. The user may accept, reject, reorder, merge, or completely rethink slides. This is a starting point, not a contract.

**Step 3 — Build slide by slide.**
After the plan is agreed upon, go through slides one at a time:
- Generate the slide code
- Show it in the browser (dev server should be running)
- Get user feedback before moving to the next slide
- The user may ask to change, redo, or skip any slide

**Step 4 — Polish.**
After all slides are done, do a full scroll-through and fix any rough transitions or inconsistencies.

## Tech Stack

- **Vite + React + TypeScript** — fast dev server, hot reload
- **Framer Motion** — scroll-triggered animations, transitions, gesture handlers. This is the primary animation engine — use it freely and creatively. Not limited to preset components; any custom animation is welcome
- **CSS Modules or Tailwind** — styling (user may specify preference)
- Code highlighting: `prism-react-renderer` or `shiki`
- No SSR needed — this is a local visual tool

## Template — MUST USE

There is a ready-made project template bundled with this skill. Find it relative to this SKILL.md file at `./template/`.

**YOU MUST copy this template as the project base. Do NOT create package.json, vite.config.ts, tsconfig.json, index.html, App.tsx, theme.css, or any component files from scratch. They already exist in the template.**

To find the template path: this SKILL.md file is at a known location — the `template/` directory is a sibling next to it. Use `dirname` of this skill's path or locate it via `~/.claude/skills/visual-webpage/template/`.

### What's in the template (DO NOT recreate these)
- `package.json` — all dependencies pre-configured (React, Framer Motion, prism-react-renderer)
- `vite.config.ts`, `tsconfig.json`, `index.html` — project config, ready to go
- `src/App.tsx` — scroll-snap container, just add slide imports here
- `src/styles/theme.css` — CSS variables for palette, typography, animation timing
- `src/components/` — reusable visual building blocks (see below)
- `src/slides/` — **empty, this is the ONLY place you generate new files**

### Workflow
1. `cp -r ~/.claude/skills/visual-webpage/template/ ./{folder-name}/`
2. `cd {folder-name} && npm install`
3. Edit `src/styles/theme.css` — adjust CSS variables for the user's palette/style
4. Generate slide files in `src/slides/` — this is where all the new content goes
5. Edit `src/App.tsx` — add imports for the generated slides
6. `npm run dev`

**Steps 3-5 are the ONLY files you should modify. Everything else comes from the template as-is.**

### Base components (already in template, just import and use)

- **SlideContainer** — full-viewport scroll-snap wrapper with entrance animation
- **HeroSlide** — title slide (heading + subtitle + optional background)
- **CodeBlock** — syntax-highlighted code with line-by-line reveal and hover annotations
- **AnimatedList** — items appear sequentially on scroll
- **KeyPoint** — highlighted callout / key insight / quote
- **ComparisonBlock** — two options side by side (before/after, this vs that)

These are starting blocks, not limits. For any slide, you can also:
- Create new one-off components directly in the slide file
- Use Framer Motion freely for custom animations (parallax, morphing, staggered reveals, anything)
- Combine and compose existing components in unexpected ways
- Build interactive elements from scratch (SVG animations, canvas, drag interactions)

## Output location

By default, the project is created in the **current working directory**. Choose a short, descriptive folder name that reflects the topic and ends with `-visual` — e.g. `eval-patterns-visual`, `rust-ownership-visual`, `oauth-flow-visual`. If the user specifies a different path or name, use that instead.

**Git repos:** If the current directory is inside a git repository, automatically add the generated folder to `.gitignore`. Skip this only if the user explicitly says to track it in git.

## Design & Visual Rules

Read: `skills/visual-webpage/design-rules.md`

The user provides the visual direction at invocation time — palette, contrast, mood, or even reference images. If nothing is specified, use a sensible dark theme default. Always follow the user's style instructions exactly.

## Information Extraction Rules

Read: `skills/visual-webpage/extraction-rules.md`

The goal is to transform dense text into visual, interactive understanding. Not a 1:1 copy of the article — a re-interpretation optimized for visual learning.

## Key Principles

1. **Self-contained** — every project includes all dependencies in `package.json`, no global installs
2. **Visual-first** — text is secondary to diagrams, animations, and interactive elements
3. **One concept per slide** — each full-viewport section communicates one idea
4. **Progressive disclosure** — start simple, add complexity as user scrolls
5. **Interactive where possible** — clickable treemaps, hoverable tooltips, expandable code blocks
6. **No boilerplate noise** — clean code, minimal config, only what's needed
