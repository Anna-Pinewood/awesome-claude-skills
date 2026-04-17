---
name: handoff
description: Write or update a handoff document that captures the current state of work so the next agent (or the user after a break) can continue smoothly.
user-invocable: true
---

# /handoff — Write a handoff document

The user has been working on a task — possibly for a long time. They want to capture the state: what was done, where we stopped, what's important not to lose. This document will be the entry point when they (or another agent) return — maybe in an hour, maybe in a month when nothing is remembered.

Your job: look at the current chat and project, recall the goal, assess progress, and produce a good snapshot. The document should allow smooth continuation: both for a new agent with clean context, and for the user after a break when everything is forgotten and it's hard to start.

## Step 0: Determine where to write

If a handoff file (status.md, HANDOFF.md, etc.) was already mentioned or read in this conversation — write there. No questions needed.

If no file is apparent — ask the user briefly: "Where to write the handoff? Options: `HANDOFF.md` in project root, or `tasks/<task>/status.md` in a task folder." Then create it.

---

## Sections

1. If the target file already exists — read it first for previous context
3. Check for accompanying docs we worked on in this chat (specs, plans, etc.)
4. Create or update the document with these sections:

   - **Single Grasp** *(always first)*: A short block that lets you remember what's happening in 30 seconds. Written for the situation: "a week has passed, I don't remember anything, I'm procrastinating, it's hard to start." Format: 3–5 sentences, casual language, no bureaucracy. Must answer: (1) what we're doing and why, (2) where exactly we stopped, (3) what's the one next step to sit down and continue right now. Goal: remove the entry barrier.
   - **Context**: Global context — why all this exists, who's the stakeholder, what problem we're solving. This section rarely changes. If already written and nothing fundamental changed — leave as-is or tweak minimally.
   - **Goal**: What specifically we're doing in this task (unlike Context — this is the concrete technical goal)
   - **Working files**: List of files worked on in this chat. If the main context is captured in the files themselves (spec, plan, etc.) — DON'T duplicate their content. Just list the path and briefly what was done/changed.
   - **Progress narrative**: Concisely but in detail — what we did, what building blocks were built, what stages we went through, and where we are right now. This is a narrative, not a fact list. As the doc grows, older steps can be grouped/collapsed, but keep recent steps detailed.
   - **What worked**: Only specific successful decisions and approaches worth reusing. Not history — an extract: "did X, turned out to be the right call because Y."
   - **What didn't work**: Only specific mistakes and dead ends to avoid repeating. Same format: "tried X, didn't work because Y." Don't duplicate "What worked" section.
   - **Important details and notes**: Custom details easy to lose on context switch. Examples: environment access/restrictions, working commands and snippets, infrastructure quirks, config nuances, ad-hoc user remarks not captured elsewhere. This section grows over time — that's normal.
   - **Next steps**: Clear action items for continuing work

5. **Update guiding documents** if they exist. NOT all edited files — only documents with "guiding context": task plans, feature descriptions, changelogs, etc. These direct the work and should reflect the current state. If more than 3 such docs found — ask the user which to update.

## Important

- Keep the document compact (in appropriate sections) and useful — don't bloat it
- If context is already captured in working files, reference them instead of copying content
- If there is already handoff with a different structure — adapt to it, don't break the existing format
- Write the handoff, then tell the user the file path so they can start a new chat with it
