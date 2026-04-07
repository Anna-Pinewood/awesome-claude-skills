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
4. Generate the complete project
5. Run `npm install && npm run dev` and open in browser

### Controlled mode (`--plan`)
1. Fetch and analyze the source material
2. Propose a slide-by-slide outline (title, content summary, visual component type for each)
3. Wait for user approval/edits on the outline
4. After agreement — generate the project
5. Run `npm install && npm run dev` and open in browser

## Tech Stack

- **Vite + React + TypeScript** — fast dev server, hot reload
- **Framer Motion** — scroll-triggered animations, transitions
- **CSS Modules or Tailwind** — styling (user may specify preference)
- Code highlighting: `prism-react-renderer` or `shiki`
- No SSR needed — this is a local visual tool

## Project Structure

Each project is fully self-contained in a single folder:

```
~/visual-explainers/{topic-slug}/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── global.css
│   ├── components/          # visual building blocks
│   │   ├── SlideContainer.tsx   # full-viewport scroll-snap wrapper
│   │   ├── CodeBlock.tsx        # syntax-highlighted code with line animations
│   │   ├── Treemap.tsx          # interactive treemap with drill-down
│   │   ├── FlowDiagram.tsx      # animated flow/architecture diagrams
│   │   ├── AnimatedList.tsx     # items that appear on scroll
│   │   ├── ComparisonTable.tsx  # side-by-side comparisons
│   │   ├── KeyPoint.tsx         # highlighted callout / key insight
│   │   └── ...                  # new components as needed
│   └── slides/
│       ├── 01-intro.tsx
│       ├── 02-{section}.tsx
│       └── ...
```

## Output location

Projects are saved to `~/visual-explainers/{topic-slug}/`. Each invocation creates a new folder.

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
