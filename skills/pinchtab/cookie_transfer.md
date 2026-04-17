# Cookie Transfer: Chrome -> Pinchtab

When a site blocks login via Pinchtab (e.g. invisible hCaptcha detecting CDP automation),
transfer cookies from the user's regular Chrome where they are already logged in.

## Prerequisites

```bash
pip3 install pycookiecheat
```

`pycookiecheat` reads Chrome's encrypted cookie SQLite DB on macOS,
decrypting via Keychain (`Chrome Safe Storage`).

## Steps

### 1. Extract cookies from Chrome

```python
from pycookiecheat import chrome_cookies
cookies = chrome_cookies("https://TARGET_SITE.com")
# Returns dict: {"cookie_name": "cookie_value", ...}
```

### 2. Navigate Pinchtab to the target site first

```bash
curl -s --max-time 30 -X POST http://localhost:9867/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://TARGET_SITE.com"}'
```

### 3. Set cookies one-by-one via `/cookies` endpoint

Setting all cookies at once can cause Pinchtab to hang.
Set them one at a time, focusing on auth-relevant cookies.

```python
import json, subprocess
from pycookiecheat import chrome_cookies

cookies = chrome_cookies("https://TARGET_SITE.com")

# Pick auth-relevant cookie names for the site
auth_keys = ["session", "sessionId", "auth_token", ...]  # site-specific

for name in auth_keys:
    if name not in cookies:
        continue
    payload = json.dumps({
        "url": "https://TARGET_SITE.com",
        "cookies": [{"name": name, "value": cookies[name], "domain": ".TARGET_SITE.com"}]
    })
    subprocess.run(
        ["curl", "-s", "--max-time", "10", "-X", "POST",
         "http://localhost:9867/cookies", "-H", "Content-Type: application/json",
         "-d", payload],
        capture_output=True, text=True, timeout=15
    )
```

### 4. Reload and verify

```bash
# Navigate to an authenticated page
curl -s --max-time 30 -X POST http://localhost:9867/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://TARGET_SITE.com/account"}'

# Check if logged in
curl -s --max-time 10 "http://localhost:9867/snapshot?format=compact&filter=interactive&maxTokens=2000"
```

## Gotchas

- **Set cookies one at a time** — bulk POST to `/cookies` can hang Pinchtab.
- **Navigate to the domain first** — cookies need a matching page context.
- **httpOnly cookies** work fine via `/cookies` endpoint (unlike `document.cookie`).
- **Chrome must not be running** when `pycookiecheat` reads the DB (it copies the file, so usually works, but locked DB can cause issues).
- **Cookies expire** — if the session is old, the user may need to re-login in Chrome first.
- **hCaptcha `size=invisible`** is the typical trigger for this flow — it evaluates behavior in the background and blocks CDP-driven browsers silently, showing "Please enter the correct CAPTCHA code" without any visible challenge widget.
