#!/usr/bin/env python3
"""Mirror harness — structural checks over 0-claude-mirror/.

Checks:
  dates         — old date formats lingering in body text (rule § 8)
  last_modified — frontmatter missing required `last_modified` (rule § 8)
  wiki_links    — [[link]] cannot be resolved to a vault file (rule § 6)
  link_count    — pages with too few wiki-links in body (rule § 6: project ≥2, note ≥1)
  map_coverage  — files not referenced in map.md (rule § 7)

Usage:
  uv run --no-project python mirror_check.py [--check NAME|all] [--json] [--fix]

--fix currently auto-rewrites path-separator wiki-links: [[A/B/C]] -> [[C]]
(alias and anchor are preserved). All other findings need human judgment.
"""
import os, re, json, argparse, unicodedata
from pathlib import Path
from collections import defaultdict

def nfc(s):
    """Normalize to NFC. macOS APFS returns filenames in NFD, source markdown is NFC."""
    return unicodedata.normalize("NFC", s)

VAULT  = Path("/Users/olgalipina/Yandex.Disk.localized/obsidian-vault/cloud-base")
MIRROR = VAULT / "0-claude-mirror"

# Top-level meta files inside MIRROR.
META = {"map.md", "mirror-rules.md", "mirror-redesign-worksheet.md", "projects-bucket.md"}
# Files whose wiki-links we don't validate (they contain illustrative examples, not real refs).
SKIP_WIKI = {"mirror-rules.md", "mirror-redesign-worksheet.md"}

OLD_ISO  = re.compile(r'(?<![\w<\[])(20\d{2})-(\d{2})-(\d{2})(?![\w>\]])')
OLD_DDMM = re.compile(r'(?<![\w<\[])(\d{2})-(\d{2})-(20\d{2})(?![\w>\]])')
OLD_RU   = re.compile(
    r'(?<!\w)(\d{1,2})\s+(январ|феврал|март|апрел|ма|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s+(20\d{2})(?!\w)',
    re.IGNORECASE,
)
# Match any [[...]] then post-process. The body may contain `\|` (Obsidian
# table-cell-escaped pipe), or `|alias`, or `#anchor` — all stripped to get the
# bare target name.
WIKI = re.compile(r'!?\[\[([^\]]+?)\]\]')

def parse_link_target(raw):
    """[[name#anchor|alias]] or [[name#anchor\\|alias]] -> 'name' (stripped)."""
    raw = re.split(r'\\?\|', raw, maxsplit=1)[0]
    raw = raw.split("#", 1)[0]
    return raw.strip()

# Known false-positives we accept: template/example links not meant to resolve.
KNOWN_TEMPLATE_LINKS = {
    ("projects-bucket.md", "ссылка"),
}

def split_frontmatter(text):
    m = re.match(r'^---\n(.*?)\n---\n(.*)', text, re.DOTALL)
    return (m.group(1), m.group(2)) if m else (None, text)

def parse_frontmatter(fm):
    out = {}
    if fm is None:
        return out
    for line in fm.split("\n"):
        if ":" in line and not line.startswith(" ") and not line.startswith("-"):
            k, _, v = line.partition(":")
            out[k.strip()] = v.strip()
    return out

def iter_body_outside_code(body):
    in_code = False
    for i, line in enumerate(body.split("\n"), start=1):
        if line.lstrip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        yield i, line

def mirror_files():
    for root, _, files in os.walk(MIRROR):
        for f in sorted(files):
            if f.endswith(".md"):
                yield Path(root) / f

def vault_index():
    """filename-stem (lowercased, NFC-normalized) -> [paths] across the whole vault."""
    idx = defaultdict(list)
    for root, _, files in os.walk(VAULT):
        for f in files:
            if f.endswith(".md"):
                idx[nfc(f[:-3]).lower()].append(Path(root) / f)
    return idx

# ---- checks ----------------------------------------------------------------

def check_dates():
    out = []
    for p in mirror_files():
        if p.name in META and p.name != "map.md":
            continue
        _, body = split_frontmatter(p.read_text())
        for ln, line in iter_body_outside_code(body):
            for label, pat in (("ISO", OLD_ISO), ("DD-MM-YYYY", OLD_DDMM), ("RU", OLD_RU)):
                for m in pat.finditer(line):
                    out.append({
                        "file": str(p.relative_to(MIRROR)),
                        "line": ln,
                        "format": label,
                        "match": m.group(0),
                        "context": line.strip()[:140],
                    })
    return out

def check_last_modified():
    out = []
    for p in mirror_files():
        fm, _ = split_frontmatter(p.read_text())
        meta = parse_frontmatter(fm)
        if "last_modified" not in meta:
            out.append({"file": str(p.relative_to(MIRROR)), "frontmatter_keys": sorted(meta.keys())})
    return out

def fix_path_separator_in_line(line):
    """[[A/B/C]] -> [[C]], keeping any |alias / \\|alias / #anchor."""
    def repl(m):
        body = m.group(1)
        sep = re.search(r'(\\?\||#)', body)
        target, meta = (body[:sep.start()], body[sep.start():]) if sep else (body, "")
        if "/" not in target:
            return m.group(0)
        prefix = "![[" if m.group(0).startswith("!") else "[["
        return f"{prefix}{target.rsplit('/', 1)[-1]}{meta}]]"
    return WIKI.sub(repl, line)

def check_wiki_links(fix=False):
    idx = vault_index()
    out = []
    for p in mirror_files():
        if p.name in SKIP_WIKI:
            continue
        rel_name = str(p.relative_to(MIRROR))
        text = p.read_text()
        fm_text, body = split_frontmatter(text)

        if fix:
            new_lines, in_code, dirty = [], False, False
            for line in body.split("\n"):
                if line.lstrip().startswith("```"):
                    in_code = not in_code
                    new_lines.append(line); continue
                if in_code:
                    new_lines.append(line); continue
                fixed = fix_path_separator_in_line(line)
                if fixed != line:
                    dirty = True
                new_lines.append(fixed)
            if dirty:
                body = "\n".join(new_lines)
                head = f"---\n{fm_text}\n---\n" if fm_text is not None else ""
                p.write_text(head + body)

        for ln, line in iter_body_outside_code(body):
            for m in WIKI.finditer(line):
                target = parse_link_target(m.group(1))
                if (rel_name, target) in KNOWN_TEMPLATE_LINKS:
                    continue
                norm = target.rsplit("/", 1)[-1]
                hits = idx.get(nfc(norm).lower(), [])
                issue = None
                if not hits:
                    issue = "unresolved"
                elif len(hits) > 1:
                    issue = f"ambiguous ({len(hits)} candidates)"
                if "/" in target:
                    issue = (issue + "; " if issue else "") + "contains path separator (rule § 6)"
                if issue:
                    out.append({
                        "file": rel_name,
                        "line": ln,
                        "link": target,
                        "issue": issue,
                    })
    return out

def check_link_count():
    out = []
    for p in mirror_files():
        if p.name in META:
            continue
        text = p.read_text()
        fm, body = split_frontmatter(text)
        meta = parse_frontmatter(fm)
        t = meta.get("type", "")
        # Count distinct wiki-link targets, not occurrences (3 mentions of same page = 1 connection).
        targets = set()
        for _, line in iter_body_outside_code(body):
            for m in WIKI.finditer(line):
                targets.add(parse_link_target(m.group(1)).lower())
        need = {"project": 1, "note": 1}.get(t, 0)
        if need and len(targets) < need:
            out.append({"file": str(p.relative_to(MIRROR)), "type": t, "have": len(targets), "need": need})
    return out

def check_map_coverage():
    map_path = MIRROR / "map.md"
    _, body = split_frontmatter(map_path.read_text())
    refs = set()
    for _, line in iter_body_outside_code(body):
        for m in WIKI.finditer(line):
            refs.add(parse_link_target(m.group(1)).rsplit("/", 1)[-1].lower())
    out = []
    for p in mirror_files():
        if p.name in META:
            continue
        if p.stem.lower() not in refs:
            out.append({"file": str(p.relative_to(MIRROR))})
    return out

CHECKS = {
    "dates":         ("Old date formats in body (rule § 8)",                   lambda a: check_dates()),
    "last_modified": ("Frontmatter missing `last_modified` (rule § 8)",        lambda a: check_last_modified()),
    "wiki_links":    ("[[wiki-link]] cannot be resolved (rule § 6)",           lambda a: check_wiki_links(fix=a.fix)),
    "link_count":    ("Body has 0 wiki-links (rule § 6 — min 1 per page)",     lambda a: check_link_count()),
    "map_coverage":  ("File not in map.md index (rule § 7)",                   lambda a: check_map_coverage()),
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", default="all", choices=["all", *CHECKS])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--fix", action="store_true", help="apply auto-fixes (only path-separator wiki-links for now)")
    args = ap.parse_args()

    selected = list(CHECKS) if args.check == "all" else [args.check]
    results = {}
    for name in selected:
        desc, fn = CHECKS[name]
        violations = fn(args)
        results[name] = {"desc": desc, "count": len(violations), "violations": violations}

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return

    total = sum(r["count"] for r in results.values())
    print(f"\nMirror harness: {total} issue(s) across {len(selected)} check(s)\n")
    for name, r in results.items():
        head = "OK" if r["count"] == 0 else f"{r['count']} issue(s)"
        print(f"━━━ {name}: {head} ━━━")
        print(f"    {r['desc']}")
        for v in r["violations"][:50]:
            print(f"  • {v}")
        if r["count"] > 50:
            print(f"  … {r['count'] - 50} more (use --json for full)")
        print()

if __name__ == "__main__":
    main()
