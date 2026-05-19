#!/usr/bin/env python3
"""Build a self-contained HTML review page from a corrections JSON.

Input JSON (passed as the first arg, or read from stdin if arg is "-"):

{
  "title":        "optional, defaults to 'English text review'",
  "marked_text": "<original text with each error wrapped in <mark data-num=N data-fix='correct version'>bad bit</mark>>",
  "fixes": [
    {"bad": "First step for me is",
     "good": "The first step for me is",
     "reason": "Singular countable noun needs an article."},
    ...
  ],
  "cleaned":      "optional cleaned-up version of the text",
  "output_path":  "optional absolute path; default is ~/Downloads/english-review-YYYY-MM-DD-HHMM.html"
}

The numbers in <mark data-num> should line up with the order of `fixes` (1-indexed).
Why a script and not inline HTML each time: the template, CSS, and hover behavior
stay consistent across invocations. Claude only writes the linguistic content.
"""

from __future__ import annotations

import datetime as _dt
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<style>
  :root {
    --bg: #fafaf7;
    --fg: #1c1c1c;
    --muted: #6b6b6b;
    --bad: #ffd9d9;
    --bad-border: #c4302b;
    --good: #d9f3df;
    --good-border: #1f7a3a;
    --card: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--fg);
    line-height: 1.6;
  }
  .wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px 80px;
  }
  h1 { font-size: 22px; margin: 0 0 8px; }
  h2 {
    font-size: 13px;
    margin: 28px 0 12px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .legend { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
  .text {
    background: var(--card);
    border: 1px solid #e5e5e0;
    border-radius: 8px;
    padding: 20px 24px;
    white-space: pre-wrap;
    font-size: 15px;
    overflow: visible;
  }
  mark {
    position: relative;
    background: var(--bad);
    border-bottom: 2px solid var(--bad-border);
    padding: 0 2px;
    border-radius: 2px;
    cursor: help;
  }
  /* Always-visible superscript number, generated from data-num. */
  mark[data-num]::after {
    content: attr(data-num);
    font-size: 10px;
    color: var(--bad-border);
    font-weight: 700;
    margin-left: 2px;
    vertical-align: super;
    line-height: 1;
  }
  /* Hover tooltip — shows the correction. Uses ::before so it coexists with the number badge.
     bottom: 100% places it above the mark; left: 0 keeps it readable for long fixes. */
  mark[data-fix]:hover::before,
  mark[data-fix]:focus::before {
    content: attr(data-fix);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    background: var(--good);
    border: 1px solid var(--good-border);
    color: var(--fg);
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    white-space: normal;
    min-width: max-content;
    max-width: 360px;
    pointer-events: none;
    font-weight: normal;
  }
  ol.fixes {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: fix;
  }
  ol.fixes li {
    counter-increment: fix;
    background: var(--card);
    border: 1px solid #e5e5e0;
    border-left: 3px solid var(--bad-border);
    border-radius: 6px;
    padding: 12px 16px 12px 48px;
    margin-bottom: 8px;
    position: relative;
    font-size: 14px;
  }
  ol.fixes li::before {
    content: counter(fix);
    position: absolute;
    left: 14px;
    top: 12px;
    font-weight: 700;
    color: var(--bad-border);
    font-size: 13px;
  }
  .bad {
    background: var(--bad);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
  }
  .good {
    background: var(--good);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 13px;
  }
  .arrow { color: var(--muted); margin: 0 6px; }
  .note { color: var(--muted); font-size: 13px; margin-top: 6px; display: block; }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    background: #f0f0eb;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
  }
  .cleaned-wrap { position: relative; }
  .copy-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    background: var(--card);
    border: 1px solid #d4d4cf;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    font-family: inherit;
    color: var(--fg);
    cursor: pointer;
    z-index: 2;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .copy-btn:hover { background: #f3f3ee; border-color: #b8b8b3; }
  .copy-btn.copied {
    background: var(--good);
    border-color: var(--good-border);
    color: var(--good-border);
  }
  .cleaned-wrap .text { padding-right: 80px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>__TITLE__</h1>
  <p class="legend">Hover any highlight to see the correction. Scroll down for the full explanation and a cleaned-up version.</p>

  <h2>Original text</h2>
  <div class="text">__MARKED_TEXT__</div>

  __FIXES_BLOCK__
  __CLEANED_BLOCK__
</div>
</body>
</html>
"""


def _render_fixes(fixes):
    if not fixes:
        return ""
    items = []
    for fix in fixes:
        bad = html.escape(fix.get("bad", ""))
        good = html.escape(fix.get("good", ""))
        reason = fix.get("reason", "")
        # Reason is allowed to contain inline <code>...</code> and <strong>...</strong>.
        # Everything else gets escaped to avoid HTML injection from Claude-supplied text.
        reason_safe = _safe_inline_html(reason)
        items.append(
            f'    <li>\n'
            f'      <span class="bad">{bad}</span><span class="arrow">→</span><span class="good">{good}</span>\n'
            f'      <span class="note">{reason_safe}</span>\n'
            f'    </li>'
        )
    return f'  <h2>Fixes</h2>\n  <ol class="fixes">\n' + "\n".join(items) + "\n  </ol>"


_INLINE_TAG_RE = re.compile(r"<(/?)(code|strong|em)>", re.IGNORECASE)


def _safe_inline_html(text: str) -> str:
    """Escape text but preserve <code>, <strong>, <em> tags (whitelist)."""
    escaped = html.escape(text)
    # Un-escape only our whitelisted tags.
    def _replace(match):
        slash, tag = match.group(1), match.group(2).lower()
        return f"<{slash}{tag}>"
    return _INLINE_TAG_RE.sub(_replace, escaped.replace("&lt;", "<").replace("&gt;", ">"))


def _render_cleaned(cleaned):
    if not cleaned:
        return ""
    escaped = html.escape(cleaned)
    return (
        f'  <h2>Cleaned-up version</h2>\n'
        f'  <div class="cleaned-wrap">\n'
        f'    <button type="button" class="copy-btn" data-target="cleaned-text">Copy</button>\n'
        f'    <div class="text" id="cleaned-text">{escaped}</div>\n'
        f'  </div>\n'
        f'  <script>\n'
        f'  document.querySelectorAll(".copy-btn").forEach(btn => {{\n'
        f'    btn.addEventListener("click", async () => {{\n'
        f'      const el = document.getElementById(btn.dataset.target);\n'
        f'      if (!el) return;\n'
        f'      const text = el.innerText;\n'
        f'      try {{\n'
        f'        await navigator.clipboard.writeText(text);\n'
        f'      }} catch (e) {{\n'
        f'        const ta = document.createElement("textarea");\n'
        f'        ta.value = text; document.body.appendChild(ta); ta.select();\n'
        f'        document.execCommand("copy"); document.body.removeChild(ta);\n'
        f'      }}\n'
        f'      const orig = btn.textContent;\n'
        f'      btn.textContent = "Copied!";\n'
        f'      btn.classList.add("copied");\n'
        f'      setTimeout(() => {{ btn.textContent = orig; btn.classList.remove("copied"); }}, 1500);\n'
        f'    }});\n'
        f'  }});\n'
        f'  </script>'
    )


def _default_output_path(title: str) -> Path:
    stamp = _dt.datetime.now().strftime("%Y-%m-%d-%H%M")
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "review"
    slug = slug[:40]
    return Path.home() / "Downloads" / f"english-review-{slug}-{stamp}.html"


def build(data: dict) -> Path:
    title = data.get("title") or "English text review"
    marked = data.get("marked_text") or ""
    if not marked:
        raise ValueError("Missing 'marked_text' in input JSON.")

    fixes = data.get("fixes") or []
    cleaned = data.get("cleaned") or ""
    out = Path(data["output_path"]).expanduser() if data.get("output_path") else _default_output_path(title)
    out.parent.mkdir(parents=True, exist_ok=True)

    html_doc = (
        TEMPLATE
        .replace("__TITLE__", html.escape(title))
        .replace("__MARKED_TEXT__", marked)  # trusted: Claude builds <mark> tags here
        .replace("__FIXES_BLOCK__", _render_fixes(fixes))
        .replace("__CLEANED_BLOCK__", _render_cleaned(cleaned))
    )
    out.write_text(html_doc, encoding="utf-8")
    return out


def main():
    if len(sys.argv) < 2:
        print("usage: build_review.py <input.json | ->", file=sys.stderr)
        sys.exit(2)
    arg = sys.argv[1]
    raw = sys.stdin.read() if arg == "-" else Path(arg).read_text(encoding="utf-8")
    data = json.loads(raw)
    out = build(data)
    print(str(out))
    _open_in_default_app(out)


def _open_in_default_app(path: Path) -> None:
    if os.environ.get("ENGLISH_REVIEW_NO_OPEN"):
        return
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(path)], check=False)
        elif sys.platform.startswith("linux"):
            subprocess.run(["xdg-open", str(path)], check=False)
        elif sys.platform == "win32":
            os.startfile(str(path))  # type: ignore[attr-defined]
    except Exception:
        pass


if __name__ == "__main__":
    main()
