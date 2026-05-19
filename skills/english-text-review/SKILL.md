---
name: english-text-fix
description: Build an HTML page that highlights errors in an English text. Use whenever the user pastes English text and asks to find/highlight/check errors.
---

# English text review

When the user pastes English text and asks to review or highlight errors, produce an HTML page (not an inline markdown reply) that shows:

1. The original text with every error wrapped in `<mark>`, numbered, and **showing the correction on hover**.
2. A numbered list of fixes — for each: the bad fragment, the good fragment, and a short reason that explains *why*, not just *what*.
3. A cleaned-up version of the whole text at the bottom, ready to copy.

Use the bundled script `scripts/build_review.py` to render the HTML. Your job is the linguistic content; the script handles the template, CSS, and hover behavior consistently.

## How to run it

1. Build a JSON payload (see schema below).
2. Run the script — it prints the output path AND opens the file in the default browser automatically. Default location is `~/Downloads/`. (Set env var `ENGLISH_REVIEW_NO_OPEN=1` to suppress auto-open.)

```bash
python3 scripts/build_review.py /tmp/review.json
# or pipe:
cat /tmp/review.json | python3 scripts/build_review.py -
```

If the user explicitly asks for a different folder, set `output_path` in the JSON (absolute path).

## JSON schema

```json
{
  "title": "Text errors & fixes",
  "marked_text": "Hey. <mark data-num=\"1\" data-fix=\"The first step for me is\">First step for me is</mark> to gather <mark data-num=\"2\" data-fix=\"requirements\">requierements</mark>...",
  "fixes": [
    {
      "bad": "First step for me is",
      "good": "The first step for me is",
      "reason": "Singular countable noun needs an article. Without 'the' it reads like a header, not a sentence."
    },
    {
      "bad": "requierements",
      "good": "requirements",
      "reason": "Spelling: <code>requi-re-ments</code>, not <code>requi-er-ements</code>."
    }
  ],
  "cleaned": "Hey. I'm looking for a job right now. The first step is to gather requirements...",
  "output_path": "/Users/olgalipina/Downloads/text-errors.html"
}
```

### Building `marked_text`

This is the original text with errors wrapped in `<mark>`. Keep all other characters byte-identical (whitespace, line breaks, punctuation) so the user can compare against the source.

```
<mark data-num="N" data-fix="THE CORRECT VERSION">the bad fragment</mark>
```

- `data-num` — 1-indexed, matches the position in the `fixes` array. The number is rendered as a small superscript automatically.
- `data-fix` — the correct version, **shown verbatim as the hover tooltip**. Keep it short (the corrected fragment, not a full explanation). Long explanations go into `fixes[].reason`.
- The text inside `<mark>...</mark>` is what you're flagging. Pick spans that make sense as a single hover unit — usually a word or short phrase. Don't wrap a whole sentence if only one word is wrong.

If the same error repeats (e.g. lowercase `i` for the pronoun appearing 4 times), it's fine to wrap *one* representative occurrence and note "appears N times" in the reason — the page would otherwise be noisy.

Newlines and other whitespace inside `marked_text` are preserved (the container uses `white-space: pre-wrap`). Don't add `<br>` tags.

### Writing `fixes[].reason`

The reason is what makes this useful versus a spellchecker. Aim for:

- **The why, briefly.** "Compound adjectives modifying a noun get hyphenated" beats "use hyphens".
- **Mention the rule by name where it's natural** — "uncountable noun", "compound adjective", "restrictive vs non-restrictive clause", etc. The user is a non-native speaker building intuition; rule names help them recognize the pattern next time.
- **Inline formatting allowed:** `<code>...</code>`, `<strong>...</strong>`, `<em>...</em>`. Everything else is escaped.
- Keep it to 1–3 sentences. If multiple things are wrong in one span (e.g. article + spelling + plural), list them as "(1) ..., (2) ..., (3) ...".

### What to flag

Cover all of:

- **Spelling & grammar:** typos, articles, agreement, tense, prepositions.
- **Idiom & word choice:** terms that are technically valid but not what a native would say in context (e.g. `table data` → `tabular data`, `automatization` → `automation`).
- **Register & style:** texting shorthand in formal context (`u` → `you`), lowercase `i`, compound adjectives without hyphens, brand-name capitalization (`langraph` → `LangGraph`).
- **Punctuation:** missing commas, hyphens, ampersand vs `n` (`RnD` → `R&D`).

Don't flag stylistic preferences that aren't actually wrong (e.g. Oxford comma when the user didn't use it consistently). Stick to things a careful editor would mark.

### `cleaned`

A version of the text with every fix applied, written in the same register and structure as the original (don't rewrite the user's voice — just fix the errors). Plain text, no HTML.

## Workflow

1. Read the text the user pasted.
2. Draft the corrections list mentally or as a scratch list.
3. Write the JSON payload to a temp file (e.g. `/tmp/review.json`).
4. Run `python3 <skill-dir>/scripts/build_review.py /tmp/review.json` — it writes the file and opens it in the browser automatically. Don't call `open` separately.
5. Tell the user the output path. Don't paste the whole HTML back into chat.

If the user asks to tweak the output (different file name, different scope of errors, etc.), regenerate the JSON and rerun — the page is fast to rebuild.
