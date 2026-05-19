#!/usr/bin/env python3
"""
Прочитать последние N сообщений из канала или ЛС.

Использование:
  python3 mm_read.py <url> [--limit N] [--mode root|all]

URL:
  https://mm.2gis.one/<team>/channels/<channel-name>     — публичный/закрытый канал
  https://mm.2gis.one/<team>/messages/@<username>        — личка
  https://mm.2gis.one/<team>/messages/<group-name>       — групповая ЛС

По умолчанию:
  --limit  10
  --mode   root  для канала (только корневые посты, без ответов в тредах)
           all   для ЛС    (всё подряд; в ЛС треды бывают редко)

Флаг `--mode root` → корневые посты, треды НЕ разворачиваются (но видно reply_count).
Флаг `--mode all`  → корневые + раскрытые треды под ними, в хронологическом порядке.

Вывод: текст. Без эмодзи и без JSON. По возрастанию времени (старое сверху).
"""
import argparse
import sys

from _mm_api import (
    api_get,
    fmt_time_msk,
    me,
    name_of,
    parse_mm_url,
    resolve_channel,
    resolve_users,
)


def _fetch(channel_id, mode, limit):
    """Возвращает список post-ов в хронологическом порядке."""
    # last N root-постов в канале — одинаково для root и all
    roots_data = api_get(
        f"/channels/{channel_id}/posts?per_page={limit}&collapsedThreads=true"
    )
    roots = list(roots_data['posts'].values())
    roots.sort(key=lambda p: p['create_at'])

    if mode == 'root':
        return roots, []

    # mode == 'all': подтянуть ответы в тредах
    replies = []
    for r in roots:
        if r.get('reply_count', 0) > 0:
            thr = api_get(f"/posts/{r['id']}/thread")
            for tp in thr.get('posts', {}).values():
                if tp['id'] != r['id']:
                    replies.append(tp)
    return roots, replies


def _channel_label(parsed, ch):
    t = ch['type']
    if t == 'D':
        un = parsed.get('username', '')
        return f"DM @{un}" if un else f"DM ({ch['name']})"
    if t == 'G':
        return f"Group DM «{ch.get('display_name', '')}»"
    kind = 'private' if t == 'P' else 'open'
    return f"#{ch.get('display_name') or ch['name']} ({kind})"


def _print_post(p, users, indent=0):
    pad = '    ' * indent
    author = name_of(users.get(p['user_id'], {}))
    ts = fmt_time_msk(p['create_at'])
    rc = p.get('reply_count', 0)
    is_reply = bool(p.get('root_id'))
    head = f"{pad}[{ts}] {author}"
    if not is_reply and rc:
        head += f"  (тред: {rc} ответов)"
    print(head + ":")
    msg = (p.get('message') or '').rstrip()
    if not msg:
        print(f"{pad}    (пустое сообщение / возможно, только вложения)")
    else:
        for line in msg.split('\n'):
            print(f"{pad}    {line}")
    fids = p.get('file_ids') or []
    if fids:
        print(f"{pad}    [вложений: {len(fids)}]")
    print()


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument('url', help='URL канала или ЛС в Mattermost')
    ap.add_argument('--limit', '-n', type=int, default=10,
                    help='Сколько корневых сообщений тянуть (по умолчанию 10).')
    ap.add_argument('--mode', choices=['root', 'all'], default=None,
                    help="root = только верхний уровень, all = с ответами в тредах. "
                         "По умолчанию: root для канала, all для ЛС.")
    args = ap.parse_args()

    parsed = parse_mm_url(args.url)
    if parsed['type'] == 'permalink':
        sys.exit('permalink URL — используй mm_fetch.py для одного поста')

    ch = resolve_channel(parsed)
    is_dm = ch['type'] in ('D', 'G')
    mode = args.mode or ('all' if is_dm else 'root')

    roots, replies = _fetch(ch['id'], mode, args.limit)

    # резолвим всех авторов одним запросом
    uids = {p['user_id'] for p in roots} | {p['user_id'] for p in replies}
    users = resolve_users(uids)

    label = _channel_label(parsed, ch)
    total = len(roots) + len(replies)
    print(f"{label}  •  mode={mode}  •  показано: {len(roots)} корневых"
          + (f" + {len(replies)} ответов в тредах = {total} сообщений" if replies else "")
          + " (по возрастанию времени)")
    print('---')
    print()

    if mode == 'root':
        for r in roots:
            _print_post(r, users, indent=0)
        return

    # mode == 'all': группируем ответы под их корнями, корни в хронологии,
    # внутри тредов — тоже в хронологии. Это сильно понятнее, чем «всё в одной ленте».
    by_root = {}
    for rep in replies:
        by_root.setdefault(rep['root_id'], []).append(rep)
    for r in roots:
        _print_post(r, users, indent=0)
        thread_replies = sorted(by_root.get(r['id'], []), key=lambda p: p['create_at'])
        for rep in thread_replies:
            _print_post(rep, users, indent=1)


if __name__ == '__main__':
    main()
