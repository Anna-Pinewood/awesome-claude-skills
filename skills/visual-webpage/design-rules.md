# Design & Visual Rules

## Style Direction

The user provides the visual direction each time — palette, mood, contrast, reference images. Always follow their style instructions exactly. If no style is specified, use the default below.

## Default Style (when nothing specified)

- Dark background (#0a0a0a or similar deep dark)
- Light text with high contrast
- Accent color for highlights and interactive elements
- Serif headings (e.g. Playfair Display), monospace for code, clean sans-serif for body
- Generous whitespace between elements
- Subtle grain or texture on backgrounds (optional)

## Layout

- Full-viewport sections with CSS scroll-snap (`scroll-snap-type: y mandatory`)
- Each slide fills exactly one viewport height
- Content centered vertically and horizontally within each slide
- Maximum content width ~900px for readability, interactive components can go wider
- Navigation dots or progress indicator on the side (subtle)

## Animations

- Use Framer Motion for all animations
- Scroll-triggered: elements animate in as they enter the viewport
- Preferred entrance animations: fade-up, scale-in, blur-to-sharp
- Code blocks: line-by-line reveal with slight delay between lines
- Diagrams: elements appear sequentially to build up the picture
- Keep animations fast (200-400ms) — they should aid understanding, not slow it down
- No decorative animations that don't serve comprehension

## Interactive Components

- Treemaps: click to drill-down, hover for info tooltips
- Code blocks: hoverable annotations, clickable to expand
- Diagrams: hoverable nodes with descriptions
- Use cursor changes and subtle hover effects to signal interactivity
- All interactive elements should have clear visual affordances

## Typography

- Heading hierarchy: large → medium → small, with clear visual distinction
- Code: monospace font (JetBrains Mono, Fira Code, or similar)
- Body text: 18-20px for readability on screen
- Line height: 1.6 for body, 1.2 for headings

## Color Usage

- Background: primary dark or light base (per user direction)
- Text: high contrast against background
- Accents: used sparingly for key concepts, interactive elements, highlights
- Code syntax: use theme-appropriate syntax highlighting colors
- Diagrams: use color to encode meaning (categories, states, relationships)

## Responsive

- Optimize for desktop (this is a learning tool, not a mobile app)
- Minimum supported width: 1024px
- Interactive components should be usable with mouse hover and click
