#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = ["yt-dlp"]
# ///
"""
Download YouTube subtitles as plain text.

Usage:
    yt-subs.py <url> [--output=PATH] [--lang=LANG] [--raw]

Arguments:
    url         YouTube video URL

Options:
    --output=PATH  Save to file instead of stdout (default: stdout)
    --lang=LANG    Language codes, comma-separated (default: en,ru)
    --raw          Output raw VTT format instead of cleaned text

Examples:
    yt-subs.py https://youtu.be/NbGuDcRSXlQ
    yt-subs.py https://youtu.be/dEqIkdb7Om4 --lang=en,ru
    yt-subs.py "https://www.youtube.com/watch?v=..." --output=transcript.txt
    yt-subs.py "https://www.youtube.com/watch?v=..." --raw
"""

import os
import re
import sys
import tempfile
from pathlib import Path

import yt_dlp


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from URL."""
    patterns = [
        r"youtu\.be/([a-zA-Z0-9_-]{11})",
        r"youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})",
        r"youtube\.com/embed/([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def clean_vtt(content: str) -> str:
    """Convert VTT subtitles to plain readable text."""
    lines = []
    seen = set()

    for line in content.split("\n"):
        if (
            line.startswith("WEBVTT")
            or line.startswith("Kind:")
            or line.startswith("Language:")
        ):
            continue
        if "-->" in line:
            continue
        if not line.strip():
            continue
        if line.strip().startswith("["):
            continue

        clean = re.sub(r"<[^>]+>", "", line)
        clean = clean.strip()

        if not clean:
            continue

        if clean not in seen:
            seen.add(clean)
            lines.append(clean)

    return "\n".join(lines)


def expand_lang_with_orig(lang: str) -> str:
    """Expand language codes to include -orig variants for auto-generated captions."""
    langs = [code.strip() for code in lang.split(",")]
    expanded = []
    for code in langs:
        expanded.append(code)
        if not code.endswith("-orig"):
            expanded.append(f"{code}-orig")
    return ",".join(expanded)


def _get_cookies_opts() -> dict:
    """Cookie opts for yt-dlp (for age-restricted content). Empty dict if profile not found."""
    profile_path = os.path.expanduser("~/Library/Application Support/zen/Profiles")
    if os.path.exists(profile_path):
        return {"cookiesfrombrowser": ("firefox", profile_path, None, None)}
    return {}


class _CapturingLogger:
    """Swallows yt-dlp output; surfaces errors only when callers ask for them."""

    def __init__(self):
        self.errors: list[str] = []

    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        pass

    def error(self, msg):
        self.errors.append(msg)


def _base_opts(cookies: bool = False) -> dict:
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "logger": _CapturingLogger(),
    }
    if cookies:
        opts.update(_get_cookies_opts())
    return opts


def _extract_info(url: str, cookies: bool = False) -> dict | None:
    """Extract video info dict; returns None on error."""
    try:
        with yt_dlp.YoutubeDL(_base_opts(cookies=cookies)) as ydl:
            return ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError:
        return None


def get_video_metadata(url: str) -> tuple[str | None, str | None]:
    """Get video title and channel name."""
    info = _extract_info(url)
    if info is None and _get_cookies_opts():
        info = _extract_info(url, cookies=True)
    if info is None:
        return None, None
    return info.get("title"), info.get("channel")


def list_available_subtitles(url: str) -> list[str]:
    """Check what subtitles are available for this video."""
    info = _extract_info(url)
    if info is None:
        return []
    langs: set[str] = set()
    for key in ("subtitles", "automatic_captions"):
        d = info.get(key) or {}
        langs.update(d.keys())
    return sorted(langs)


def try_download_subtitles(
    url: str, expanded_lang: str, use_cookies: bool
) -> tuple[list[tuple[str, str]], str | None]:
    """Attempt to download subtitles. Returns (vtt_files, error_msg_or_None)."""
    langs = [code.strip() for code in expanded_lang.split(",") if code.strip()]
    with tempfile.TemporaryDirectory() as tmpdir:
        outtmpl = str(Path(tmpdir) / "subs.%(ext)s")
        opts = _base_opts(cookies=use_cookies)
        opts.update({
            "writeautomaticsub": True,
            "writesubtitles": True,
            "subtitleslangs": langs,
            "subtitlesformat": "vtt",
            "outtmpl": outtmpl,
            "ignoreerrors": True,
        })
        logger: _CapturingLogger = opts["logger"]

        error_msg: str | None = None
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except yt_dlp.utils.DownloadError as e:
            error_msg = str(e)

        if error_msg is None and logger.errors:
            error_msg = "\n".join(logger.errors)

        tmppath = Path(tmpdir)
        vtt_files = list(tmppath.glob("*.vtt"))
        contents = [(f.name, f.read_text()) for f in vtt_files]
        return contents, error_msg


def download_subtitles(
    url: str, lang: str, raw: bool
) -> tuple[str | None, str | None, str | None]:
    """Download subtitles via yt_dlp library. Returns (content, title, channel)."""
    video_id = extract_video_id(url)
    if not video_id:
        print("Error: Could not extract video ID from URL", file=sys.stderr)
        return None, None, None

    title, channel = get_video_metadata(url)
    expanded_lang = expand_lang_with_orig(lang)

    vtt_contents, error_msg = try_download_subtitles(
        url, expanded_lang, use_cookies=False
    )

    if not vtt_contents and _get_cookies_opts():
        print(
            "No subtitles without cookies, trying with cookies (age-restricted?)...",
            file=sys.stderr,
        )
        vtt_contents, error_msg = try_download_subtitles(
            url, expanded_lang, use_cookies=True
        )

    if not vtt_contents and error_msg:
        print(f"yt-dlp error: {error_msg}", file=sys.stderr)

    if not vtt_contents:
        available = list_available_subtitles(url)
        requested_langs = [code.strip() for code in lang.split(",")]

        if available:
            matching = [
                code for code in available
                if any(
                    code == req or code.startswith(req + "-") or req.startswith(code)
                    for req in requested_langs
                )
            ]

            print(f"\n{'=' * 60}", file=sys.stderr)
            print("SUBTITLE DOWNLOAD FAILED - DEBUG INFO", file=sys.stderr)
            print(f"{'=' * 60}", file=sys.stderr)
            print(f"Requested languages: {lang}", file=sys.stderr)
            print(f"Expanded to: {expanded_lang}", file=sys.stderr)
            print(
                f"Available subtitles: {', '.join(available[:20])}"
                + (f"... (+{len(available) - 20} more)" if len(available) > 20 else ""),
                file=sys.stderr,
            )

            if matching:
                print(f"Matching languages found: {', '.join(matching)}", file=sys.stderr)
                print("\nSubtitles ARE available but download failed!", file=sys.stderr)
                print("Possible causes:", file=sys.stderr)
                print("  1. yt-dlp version outdated (uv refreshes script deps automatically)", file=sys.stderr)
                print("  2. YouTube API changes", file=sys.stderr)
                print("  3. Network/rate limiting issues", file=sys.stderr)
            else:
                print(
                    f"\nNo matching languages. Try one of: {', '.join(available[:10])}",
                    file=sys.stderr,
                )
            print(f"{'=' * 60}\n", file=sys.stderr)
        else:
            print("No subtitles available for this video", file=sys.stderr)

        return None, title, channel

    _, content = vtt_contents[0]
    return (content if raw else clean_vtt(content)), title, channel


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if len(sys.argv) >= 2 else 1)

    url = sys.argv[1]
    lang = "en,ru"
    raw = False
    output_path = None

    for arg in sys.argv[2:]:
        if arg.startswith("--lang="):
            lang = arg.split("=", 1)[1]
        elif arg.startswith("--output="):
            output_path = arg.split("=", 1)[1]
        elif arg == "--raw":
            raw = True

    content, title, channel = download_subtitles(url, lang, raw)

    if content is None:
        sys.exit(1)

    header_lines = []
    if title:
        header_lines.append(f"Title: {title}")
    if channel:
        header_lines.append(f"Channel: {channel}")
    header = "\n".join(header_lines) + "\n\n" if header_lines else ""

    output = header + content

    if output_path:
        Path(output_path).write_text(output)
        print(f"Saved to: {output_path}")
    else:
        print(output)


if __name__ == "__main__":
    main()
