# Information Extraction Rules

## Goal

Transform dense text (articles, documentation, technical concepts) into a visual, interactive narrative optimized for visual learning. This is NOT a 1:1 copy — it's a re-interpretation.

## Extraction Process

### 1. Read and understand the source
- Fetch the article/doc (via WebFetch or user-provided text)
- Identify the core thesis and key takeaways
- Map the logical structure: what depends on what, what's sequential, what's parallel

### 2. Identify the narrative arc
- What's the hook? (why should someone care)
- What's the progression? (simple → complex, problem → solution, before → after)
- What's the payoff? (key insight, "aha" moment)

### 3. Break into slides
- One concept per slide — if it takes more than 2-3 sentences to explain, split it
- Aim for 5-15 slides depending on topic complexity
- Each slide should stand on its own but flow naturally from the previous one

### 4. Choose visual representation for each slide
Match content type to the best visual component:

| Content type | Visual component |
|---|---|
| Architecture / structure | Treemap, FlowDiagram |
| Step-by-step process | Timeline, AnimatedList |
| Code explanation | CodeBlock with annotations |
| Comparison | ComparisonTable, side-by-side |
| Key insight / quote | KeyPoint callout |
| Data / metrics | Charts, animated numbers |
| Hierarchy / taxonomy | Treemap with drill-down |
| Before/After | Split-screen transition |
| Concept relationships | Node graph, FlowDiagram |

### 5. Write concise slide text
- Headlines: punchy, 3-7 words
- Body: 1-3 short sentences max per slide
- Let the visual do the heavy lifting — text supports, not replaces
- Use the original article's terminology but simplify the explanation

## What to include
- Core concepts and how they connect
- Key code snippets (shortened, annotated — not full dumps)
- Architecture and structure visualizations
- Surprising or non-obvious insights
- Concrete examples over abstract descriptions

## What to skip
- Boilerplate introductions ("In this article we'll...")
- Repetitive examples (pick the best one)
- Setup/installation instructions (unless that's the topic)
- Tangential details that don't serve the main narrative
- Author bio, meta-content, social links
