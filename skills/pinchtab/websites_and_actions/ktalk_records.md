# Ktalk (2gis.ktalk.ru) — Download transcription

**Auth:** SSO via `fs.2gis.com/adfs/oauth2`. First visit redirects to login page. User must enter credentials manually (headed mode required).

**URL pattern:** `https://2gis.ktalk.ru/recordings/<ID>#transcription`

## Steps

```bash
# 1. Navigate to recording
curl -s -X POST http://localhost:9867/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://2gis.ktalk.ru/recordings/<ID>#transcription", "timeout": 30}'

# 2. Check if redirected to login (snapshot interactive elements)
curl -s "http://localhost:9867/snapshot?format=compact&filter=interactive&maxTokens=2000"
# If you see: e0:textbox, e1:textbox, e2:button "Sign in" → ask user to log in, then re-navigate

# 3. After login — page title will be "Название встречи — Толк"
# Click TRANSCRIPTION tab (look for button labeled "TRANSCRIPTION")
curl -s -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "<TRANSCRIPTION_ref>"}'

# 4. Click "Download" button (top bar)
curl -s -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "<Download_ref>"}'

# 5. A dropdown appears with options: Recording, Protocol, Brief summary, Transcription
# Click "Transcription" in the dropdown
curl -s -X POST http://localhost:9867/action \
  -H 'Content-Type: application/json' \
  -d '{"kind": "click", "ref": "<Transcription_menu_ref>"}'

# 6. File downloads to ~/Downloads as:
#    "Транскрипция <название встречи>.txt"
```

## Typical ref layout after login

| Element | Role | Approximate position |
|---|---|---|
| Download | button | top bar, after "Copy link" |
| TRANSCRIPTION | button | tab row: PROTOCOL, SUMMARY, **TRANSCRIPTION** |

After clicking Download, dropdown items appear **above** the tab row:
- Recording
- Protocol
- Brief summary
- **Transcription** ← this one downloads the .txt

## Minimal token path (if refs are stable)

After login, one snapshot is enough to grab all needed refs:
```bash
curl -s "http://localhost:9867/snapshot?format=compact&filter=interactive&maxTokens=3000"
```
Look for buttons "Download" and "TRANSCRIPTION" in the output. After clicking Download, do one more snapshot to find "Transcription" in the dropdown menu.

Total: 2 snapshots + 3 clicks.
