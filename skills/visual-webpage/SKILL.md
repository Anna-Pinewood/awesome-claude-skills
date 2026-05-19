---
name: visual-webpage
description: Use when the user wants a visual HTML breakdown of a topic, article, code, or existing artifact — turns dense input into one scrollable HTML file with a side TOC.
user-invocable: true
argument-hint: <topic, URL, file, or artifact> [+ any style/mode instructions]
---

# visual-webpage — single-file HTML explainer

## Goal

Take what the user gives (article, doc, concept, code, existing artifact) and produce **one HTML file** that breaks it down visually — cards, diagrams, code with annotations, quotes, interactive bits where they help comprehension.

The user describes mode and style each time. Two common shapes:

- **Deep dive** — full breakdown of a topic, with original quotes, interactive visualizations, multiple sections.
- **Pitch deck** — take an existing artifact and distill its essence into a short, scannable HTML.


## Output

- **One self-contained HTML file.** All CSS inline in `<style>`, all SVG inline. Opens with a double-click. Works offline. No external libraries (no mermaid / d3 / chart.js / Tailwind CDN — none).
- Default filename: `<source-basename>.visual.html` next to the source. If the user gave a path, put it there.

## Required structure

- **Sticky TOC on the left side.** Toggleable — collapses to icons or hides entirely. Clicking an item scrolls to that section. This is non-negotiable. **The active section must be visually highlighted** (contrasting background / bold / left accent bar) so the reader can tell at a glance which section they're on. Update the highlight on scroll via `IntersectionObserver` on the section elements — no external libraries.
- **Visual section breaks.** Each section has a clear boundary — background shift, divider, generous spacing. Ideally a section ≈ one viewport, but content may stretch when it has to.
- **One accent color**, readable typography. system-ui body works; serif/display font for headings is fine.
- **Source quotes visually distinct** when used.

## Style references — required before writing HTML

Look at these files in `/Users/olgalipina/Documents/awesome-claude-skills/html-style/`:

- `09-slide-deck.html` — dense slide-like sections, typography, key-takeaway treatment.
- `13-flowchart-diagram.html` — inline-SVG diagrams (nodes, arrows, annotations). Use for any flow / architecture.
- `14-research-feature-explainer.html` — long scroll document with sections, quotes, cards. Closest match for most deep dives.
- `10-svg-illustrations.html` — SVG illustration patterns inside an explainer.

**Copy:** palette, typography, spacing, density, card / quote / divider / sticky-nav patterns, SVG arrow style.
**Don't copy:** content, wording, topic.

If a block's visual is not obvious, pick the closest analog in the references. Don't invent a new style.

**Style override.** If the user specifies their own style (e.g. "accent color pink", "dark mode", "brutalist"), follow that — don't copy the references' palette/typography. In that case use the references **only** for element patterns: how a card is structured, how an SVG arrow is drawn, how a sticky TOC sits — not for the overall look.

## Workflow

1. **Read the source fully.** Don't extract yet — get the shape first.
2. **Confirm mode and angle** with the user if not stated (deep dive vs pitch deck, what to emphasize, what style hints).
3. **Plan sections.** Aim for 7–12. Each section earns its place. No filler. If the user later asks to add more, add them — the cap is a default, not a wall.
4. **Pick a visual anchor per section** only if it aids comprehension: card grid, quote block, two-column compare, inline-SVG diagram, annotated code block, key callout. A plain paragraph is fine when that's enough.
5. **Write the HTML.** Single file, inline CSS, inline SVG, sticky toggleable TOC.
6. **Open html.** + return path to the file + anything skipped or reconstructed.

## Self-check before handing off

- [ ] One self-contained file, no external deps, opens offline.
- [ ] Sticky TOC on the left, toggleable, clicks scroll, **active section highlighted on scroll** (verify by scrolling the file).
- [ ] Clear visual break between sections.
- [ ] Visual style matches one of the references, not invented.
- [ ] If quotes are used: visually distinct and sourced.
