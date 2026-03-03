#!/usr/bin/env python3
"""Local Whisper transcription script for Claude Code skill."""

import argparse
import json
import sys
import time


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with OpenAI Whisper locally")
    parser.add_argument("file", help="Path to audio file")
    parser.add_argument("--quality", action="store_true",
                        help="Use medium model for better accuracy (slower). Default is base (fast).")
    parser.add_argument("--language", default=None, help="Language code (e.g. ru, en). Auto-detect if omitted")
    parser.add_argument("--json", action="store_true", help="Output as JSON with segments and timestamps")
    args = parser.parse_args()

    try:
        import whisper
    except ImportError:
        print("ERROR: whisper not installed. Run: /opt/homebrew/bin/pip3.11 install openai-whisper", file=sys.stderr)
        sys.exit(1)

    model_name = "medium" if args.quality else "base"

    t0 = time.time()
    model = whisper.load_model(model_name, device="cpu")
    t_load = time.time() - t0

    t0 = time.time()
    result = model.transcribe(args.file, language=args.language, fp16=False)
    t_transcribe = time.time() - t0

    if args.json:
        output = {
            "text": result["text"],
            "language": result.get("language"),
            "segments": [
                {"start": s["start"], "end": s["end"], "text": s["text"]}
                for s in result.get("segments", [])
            ],
            "meta": {
                "model": model_name,
                "load_time": round(t_load, 1),
                "transcribe_time": round(t_transcribe, 1),
            }
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
    else:
        print(result["text"].strip())
        print(f"\n---\nModel: {model_name} | Load: {t_load:.1f}s | Transcribe: {t_transcribe:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
