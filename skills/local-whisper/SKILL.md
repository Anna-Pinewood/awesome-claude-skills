---
name: local-whisper
description: >
  Transcribe audio files locally using OpenAI Whisper on Apple Silicon.
  Use when the user asks to transcribe, recognize speech, or convert audio/voice to text.
  Supports WAV, MP3, M4A, FLAC, OGG and other ffmpeg-compatible formats.
  Runs fully offline on CPU — no API keys needed.
user-invocable: true
argument-hint: <path-to-audio-file>
---

# Local Whisper — Audio Transcription

Transcribe audio files locally using OpenAI Whisper. Runs on CPU (Apple Silicon MPS turned out to be slower in benchmarks).

## Prerequisites

- Python 3.11 via Homebrew: `/opt/homebrew/bin/python3.11`
- ffmpeg: `brew install ffmpeg`
- openai-whisper: `/opt/homebrew/bin/pip3.11 install openai-whisper`

If any prerequisite is missing, install it before proceeding.

## Script location

```
~/Documents/awesome-claude-skills/skills/local-whisper/transcribe.py
```

## Usage

```bash
/opt/homebrew/bin/python3.11 ~/Documents/awesome-claude-skills/skills/local-whisper/transcribe.py <audio-file> [options]
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--quality` | Use medium model (better accuracy, ~5x slower) | off (base) |
| `--language` | Language code (ru, en, etc). Auto-detect if omitted | auto |
| `--json` | Output JSON with timestamps and segments | off |

### Two modes

| Mode | Model | Speed on M3 | When to use |
|------|-------|-------------|-------------|
| default | base (139 MB) | ~5s/min | Quick transcription, drafts, getting the gist |
| `--quality` | medium (1.5 GB) | ~25s/min | When accuracy matters — Russian, accents, noisy audio |

Medium is significantly better for Russian language — fewer hallucinations, coherent sentences.

## Examples

Fast transcription:
```bash
/opt/homebrew/bin/python3.11 ~/Documents/awesome-claude-skills/skills/local-whisper/transcribe.py ~/Downloads/recording.wav
```

High quality:
```bash
/opt/homebrew/bin/python3.11 ~/Documents/awesome-claude-skills/skills/local-whisper/transcribe.py ~/Downloads/recording.wav --quality
```

With language hint and JSON output:
```bash
/opt/homebrew/bin/python3.11 ~/Documents/awesome-claude-skills/skills/local-whisper/transcribe.py ~/Downloads/recording.wav --quality --language ru --json
```

## When invoked as a skill

1. Take the audio file path from the user's argument or message
2. Run the transcription script via Bash (add `--quality` if the user asks for better accuracy or the audio is in Russian)
3. Present the transcribed text to the user
4. If quality is poor, suggest re-running with `--quality`
