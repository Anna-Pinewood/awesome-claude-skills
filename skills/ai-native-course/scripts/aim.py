#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Тонкая CLI-обёртка над AIM LMS Public API v1 для курса AI-Native (ain3).

Только stdlib — можно запускать через `uv run <skill>/scripts/aim.py ...`.
Токен берётся из env AIM_LMS_TOKEN, иначе из файла .env рядом со скиллом.

Команды:
  list [query]        список сессий (query — фильтр по подстроке title/type/speaker)
  show <id>           детали одной сессии
  transcript <id>     транскрипт сессии (markdown)
  chat <id>           чат сессии (markdown)
  material <id>       summary + transcript + chat одним куском (для домашки)
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://learn.aimindset.org/api/v1"
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_token() -> str:
    tok = os.environ.get("AIM_LMS_TOKEN")
    if tok:
        return tok.strip()
    env_path = os.path.join(SKILL_DIR, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("AIM_LMS_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(
        "Нет токена. Положи его в "
        f"{env_path} как AIM_LMS_TOKEN=... или задай переменную окружения AIM_LMS_TOKEN."
    )


def api_get(path: str, token: str, params: dict | None = None, tries: int = 3) -> dict:
    url = f"{BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            try:
                err = json.loads(body).get("error", body)
            except Exception:
                err = body
            if e.code == 429 and attempt < tries - 1:
                wait = int(e.headers.get("Retry-After", "5"))
                time.sleep(wait)
                continue
            return {"_http_error": e.code, "error": err}
        except urllib.error.URLError as e:
            if attempt < tries - 1:
                time.sleep(3)
                continue
            return {"_http_error": 0, "error": str(e.reason)}
    return {"_http_error": 0, "error": "unreachable"}


def get_sessions(token: str) -> list[dict]:
    # Фильтр ?lab= для этого токена возвращает 403, поэтому берём всё:
    # токен и так заскоуплен ровно на сессии одного курса.
    data = api_get("/sessions", token, {"limit": 500})
    if "_http_error" in data:
        sys.exit(f"Ошибка {data['_http_error']}: {data['error']}")
    return data.get("sessions", [])


def cmd_list(token: str, query: str | None) -> None:
    sessions = get_sessions(token)
    sessions.sort(key=lambda s: (s.get("date") or "", s.get("id") or ""))
    if query:
        q = query.lower()
        sessions = [
            s
            for s in sessions
            if q
            in (
                s.get("id", "")
                + s.get("title", "")
                + s.get("type", "")
                + s.get("speaker", "")
                + s.get("summary", "")
            ).lower()
        ]
    if not query:
        print(f"# {len(sessions)} сессий\n")
    for s in sessions:
        print(f"{s['id']}")
        print(f"    {s.get('date','—')} · {s.get('type','—')} · {s.get('speaker','—')}")
        print(f"    {s.get('title','')}")
    if query and not sessions:
        print(f"Ничего не найдено по «{query}».")


def cmd_show(token: str, sid: str) -> None:
    data = api_get(f"/sessions/{sid}", token)
    if "_http_error" in data:
        sys.exit(f"Ошибка {data['_http_error']}: {data['error']}")
    print(f"# {data.get('title','')}\n")
    for k in ("id", "lab_id", "date", "type", "speaker"):
        if data.get(k):
            print(f"{k}: {data[k]}")
    if data.get("summary"):
        print(f"\n{data['summary']}")


def _fetch_text(token: str, sid: str, kind: str) -> str | None:
    """kind: 'transcript' | 'chat'. Возвращает markdown или None если нет."""
    data = api_get(f"/sessions/{sid}/{kind}", token)
    if "_http_error" in data:
        code = data["_http_error"]
        if code == 404:
            return None
        sys.exit(f"Ошибка {code} ({kind}): {data['error']}")
    return data.get(f"{kind}_md")


def cmd_transcript(token: str, sid: str) -> None:
    md = _fetch_text(token, sid, "transcript")
    if md is None:
        sys.exit(f"Транскрипт для «{sid}» ещё не выложен (материал наполняется по ходу курса).")
    print(md)


def cmd_chat(token: str, sid: str) -> None:
    md = _fetch_text(token, sid, "chat")
    if md is None:
        sys.exit(f"Чат для «{sid}» ещё не выложен.")
    print(md)


def cmd_material(token: str, sid: str) -> None:
    """Всё по сессии в одном потоке — удобно скармливать для разбора/домашки."""
    meta = api_get(f"/sessions/{sid}", token)
    if "_http_error" in meta:
        sys.exit(f"Ошибка {meta['_http_error']}: {meta['error']}")
    print(f"# {meta.get('title','')}")
    print(f"_{meta.get('date','')} · {meta.get('type','')} · {meta.get('speaker','')}_\n")
    if meta.get("summary"):
        print("## Summary\n")
        print(meta["summary"] + "\n")
    tr = _fetch_text(token, sid, "transcript")
    print("## Транскрипт\n")
    print((tr + "\n") if tr else "_(ещё не выложен)_\n")
    ch = _fetch_text(token, sid, "chat")
    print("## Чат\n")
    print((ch + "\n") if ch else "_(ещё не выложен)_\n")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(0)
    token = load_token()
    cmd, rest = args[0], args[1:]
    if cmd == "list":
        cmd_list(token, rest[0] if rest else None)
    elif cmd in ("show", "transcript", "chat", "material"):
        if not rest:
            sys.exit(f"Нужен id сессии: aim.py {cmd} <id>")
        {"show": cmd_show, "transcript": cmd_transcript, "chat": cmd_chat, "material": cmd_material}[cmd](
            token, rest[0]
        )
    else:
        sys.exit(f"Неизвестная команда «{cmd}». См. `aim.py` без аргументов.")


if __name__ == "__main__":
    main()
