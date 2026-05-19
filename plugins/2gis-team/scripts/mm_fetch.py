#!/usr/bin/env python3
"""
Достать сообщение по permalink-ссылке.

Использование:
  uv run --no-project python mm_fetch.py <permalink> [--mode message|thread]

Примеры:
  uv run --no-project python mm_fetch.py 'https://mm.2gis.one/2gis-rd/pl/xo9cw5...'
  uv run --no-project python mm_fetch.py 'https://mm.2gis.one/2gis-rd/pl/xo9cw5...' --mode thread

Режимы:
  message  — только этот пост (по умолчанию). Метаданные + тело.
  thread   — root + все ответы в хронологии. Если permalink на reply,
             автоматически поднимется к root и притянет весь тред.

Вывод: текст. Без JSON.
"""
import argparse
import sys

from _mm_api import api_get, fmt_time_msk, name_of, parse_mm_url, resolve_users


def _channel_label(ch):
    if ch['type'] == 'D':
        return 'DM'
    if ch['type'] == 'G':
        return f"Group DM «{ch.get('display_name', '')}»"
    kind = 'private' if ch['type'] == 'P' else 'open'
    return f"#{ch.get('display_name') or ch['name']} ({kind})"


def _print_post(post, users, indent=0):
    pad = '    ' * indent
    author = name_of(users.get(post['user_id'], {}))
    print(f"{pad}[{fmt_time_msk(post['create_at'])}] {author}:")
    body = (post.get('message') or '').rstrip()
    if not body:
        print(f"{pad}    (пустое сообщение / только вложения)")
    else:
        for line in body.split('\n'):
            print(f"{pad}    {line}")
    fids = post.get('file_ids') or []
    if fids:
        print(f"{pad}    [вложений: {len(fids)}]")
    print()


def _mode_message(post, ch, args):
    users = resolve_users([post['user_id']])
    author = name_of(users.get(post['user_id'], {}))
    is_reply = bool(post.get('root_id'))
    rc = post.get('reply_count', 0)
    if is_reply:
        type_label = f"reply (ответ на пост {post['root_id']})"
    elif rc:
        type_label = f"root, {rc} ответов в треде"
    else:
        type_label = 'root, без ответов'
    print(f"Source:  {args.url}")
    print(f"Author:  {author}")
    print(f"Time:    {fmt_time_msk(post['create_at'])}")
    print(f"Channel: {_channel_label(ch)}")
    print(f"Type:    {type_label}")
    print('---')
    body = (post.get('message') or '').rstrip()
    print(body if body else '(пустое сообщение / только вложения)')
    fids = post.get('file_ids') or []
    if fids:
        print(f"\n[вложений: {len(fids)}]")


def _mode_thread(post, ch, args):
    # если попали на reply — поднимаемся к root
    root_id = post.get('root_id') or post['id']
    thread = api_get(f"/posts/{root_id}/thread")
    posts = list(thread.get('posts', {}).values())
    posts.sort(key=lambda p: p['create_at'])
    root = next((p for p in posts if p['id'] == root_id), posts[0])
    replies = [p for p in posts if p['id'] != root['id']]

    uids = list({p['user_id'] for p in posts})
    users = resolve_users(uids)

    print(f"Source:  {args.url}")
    print(f"Channel: {_channel_label(ch)}")
    print(f"Thread:  root {root['id']}  •  {len(replies)} ответов")
    print('---')
    print()
    _print_post(root, users, indent=0)
    for r in replies:
        _print_post(r, users, indent=1)


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument('url', help='permalink Mattermost (.../pl/<post_id>)')
    ap.add_argument('--mode', choices=['message', 'thread'], default='message',
                    help='message = только этот пост (default); '
                         'thread = root + все ответы')
    args = ap.parse_args()

    parsed = parse_mm_url(args.url)
    if parsed['type'] != 'permalink':
        sys.exit('ожидался permalink (.../pl/<post_id>). Для канала/ЛС используй mm_read.py')

    post = api_get(f"/posts/{parsed['post_id']}")
    ch = api_get(f"/channels/{post['channel_id']}")

    if args.mode == 'message':
        _mode_message(post, ch, args)
    else:
        _mode_thread(post, ch, args)


if __name__ == '__main__':
    main()
