"""Тонкий слой над Mattermost REST API + утилиты для разбора URL-ов.

Шаринговый модуль для всех `mm_*.py` скриптов плагина 2gis-team.

Источник секретов — `.env` файл. Путь:
  1. $MM_ENV_PATH, если задан;
  2. .env в корне плагина (рядом с папкой scripts/) — по умолчанию.

`.env` гитнорится на уровне репо awesome-claude-skills, чтобы токен
не попал в коммит.
"""
import datetime
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import zoneinfo
from pathlib import Path

HOST = 'https://mm.2gis.one'
BASE = HOST + '/api/v4'
MSK = zoneinfo.ZoneInfo('Europe/Moscow')

# scripts/_mm_api.py → корень плагина = parent.parent
DEFAULT_ENV_PATH = Path(__file__).resolve().parent.parent / '.env'

_env_cache = None


def _env_path():
    p = os.environ.get('MM_ENV_PATH')
    return Path(p) if p else DEFAULT_ENV_PATH


def env():
    global _env_cache
    if _env_cache is not None:
        return _env_cache
    path = _env_path()
    if not path.exists():
        raise SystemExit(
            f'Не найден .env по пути {path}. '
            f'Создай файл и положи туда MMAUTHTOKEN=... (см. cookie.md '
            f'в ~/Documents/auto-agents/mattermost-threads/operate-mm/).'
        )
    e = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        e[k.strip()] = v.strip().strip('"').strip("'")
    if 'MMAUTHTOKEN' not in e:
        raise SystemExit(
            f'MMAUTHTOKEN не найден в {path}. См. cookie.md.'
        )
    _env_cache = e
    return e


def _cookie_r():
    return f"MMAUTHTOKEN={env()['MMAUTHTOKEN']}"


def _cookie_w():
    return f"MMAUTHTOKEN={env()['MMAUTHTOKEN']}; MMCSRF={env().get('MMCSRF','')}"


def _request(method, path, body=None):
    url = BASE + path
    headers = {'Cookie': _cookie_r() if method == 'GET' else _cookie_w()}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
        headers['X-CSRF-Token'] = env().get('MMCSRF', '')
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        if e.code == 401 and 'session_expired' in body:
            raise SystemExit(
                'Mattermost: HTTP 401 session_expired. Кука протухла. '
                'Обнови MMAUTHTOKEN в .env (см. cookie.md в operate-mm/).'
            )
        raise SystemExit(f'Mattermost API error {e.code} on {method} {path}: {body[:300]}')


def api_get(path):
    return _request('GET', path)


def api_post(path, body):
    return _request('POST', path, body=body)


# ---- helpers --------------------------------------------------------------

def parse_mm_url(url):
    """Разобрать URL Mattermost. Возвращает dict с ключом `type`:
        - permalink: {type, team, post_id}
        - channel:   {type, team, channel_name}
        - dm:        {type, team, username}
        - group_dm:  {type, team, channel_name}
    """
    p = urllib.parse.urlparse(url)
    parts = [x for x in p.path.split('/') if x]
    if len(parts) < 3:
        raise ValueError(f'непонятный URL: {url}')
    team, kind = parts[0], parts[1]
    rest = parts[2:]
    if kind == 'pl':
        return {'type': 'permalink', 'team': team, 'post_id': rest[0]}
    if kind == 'channels':
        return {'type': 'channel', 'team': team, 'channel_name': rest[0]}
    if kind == 'messages':
        target = rest[0]
        if target.startswith('@'):
            return {'type': 'dm', 'team': team, 'username': target[1:]}
        return {'type': 'group_dm', 'team': team, 'channel_name': target}
    raise ValueError(f'неизвестный тип URL: /{kind}/ в {url}')


_me_cache = None


def me():
    global _me_cache
    if _me_cache is None:
        _me_cache = api_get('/users/me')
    return _me_cache


def resolve_channel(parsed):
    """По разобранному URL вернуть объект канала (с id, name, type, ...)."""
    t = parsed['type']
    if t == 'channel':
        team = api_get(f"/teams/name/{parsed['team']}")
        return api_get(f"/teams/{team['id']}/channels/name/{parsed['channel_name']}")
    if t == 'dm':
        other = api_get(f"/users/username/{parsed['username']}")
        return api_post('/channels/direct', [me()['id'], other['id']])
    if t == 'group_dm':
        return api_get(f"/channels/name/{parsed['channel_name']}")
    raise ValueError(f"resolve_channel: неподдерживаемый тип {t}")


def resolve_users(user_ids):
    """Bulk: list[user_id] -> {id: user_dict}."""
    user_ids = list({u for u in user_ids if u})
    if not user_ids:
        return {}
    users = api_post('/users/ids', user_ids)
    return {u['id']: u for u in users}


def name_of(user_dict):
    if not user_dict:
        return '?'
    full = (user_dict.get('first_name', '') + ' ' + user_dict.get('last_name', '')).strip()
    return full or user_dict.get('username', '?')


def fmt_time_msk(ms):
    if not ms:
        return '—'
    return datetime.datetime.fromtimestamp(ms / 1000, tz=MSK).strftime('%Y-%m-%d %H:%M')
