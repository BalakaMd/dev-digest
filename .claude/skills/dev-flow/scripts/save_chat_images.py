#!/usr/bin/env python3
"""Save images the user pasted into the chat to files, so subagents can read them.

Subagents never see images pasted into the conversation. Claude Code keeps them, base64-encoded,
in the session transcript (<config dir>/projects/<project>/<session id>.jsonl). This script reads
the current session's transcript and writes those images to a folder.

Only images in user messages are taken; screenshots returned by tools (Read, browser) are not.

Usage:
  save_chat_images.py --out inbox            # images of the latest user message that has any
  save_chat_images.py --out inbox --all      # every image pasted in this session
  save_chat_images.py --list                 # show pasted images, write nothing

Files are named chat-<YYYYMMDD-HHMMSS>-<n>.<ext>. Existing files are never overwritten, and an
image whose bytes already exist anywhere under --out is skipped as a duplicate.
Exit codes: 0 ok (also when there is nothing to save), 2 transcript not found.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
from pathlib import Path

EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}


def find_transcript(session_id: str) -> Path | None:
    config_dir = Path(os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude"))
    matches = sorted(
        (config_dir / "projects").glob(f"*/{session_id}.jsonl"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return matches[0] if matches else None


def read_pasted_images(transcript: Path) -> list[dict]:
    """Return image blocks from user messages, grouped by message, in transcript order."""
    images: list[dict] = []
    message_no = 0
    with transcript.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("type") != "user":
                continue
            content = (entry.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            blocks = [b for b in content if isinstance(b, dict) and b.get("type") == "image"]
            if not blocks:
                continue
            message_no += 1
            text = " ".join(
                b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"
            )
            for block in blocks:
                source = block.get("source") or {}
                if source.get("type") != "base64" or not source.get("data"):
                    continue
                data = base64.b64decode(source["data"])
                images.append(
                    {
                        "message": message_no,
                        "timestamp": entry.get("timestamp", ""),
                        "media_type": source.get("media_type", "image/png"),
                        "data": data,
                        "sha": hashlib.sha256(data).hexdigest(),
                        "text": " ".join(text.split())[:80],
                    }
                )
    return images


def existing_hashes(folder: Path) -> dict[str, Path]:
    hashes: dict[str, Path] = {}
    if not folder.exists():
        return hashes
    for path in folder.rglob("*"):
        if path.is_file() and path.suffix.lower().lstrip(".") in {"png", "jpg", "jpeg", "gif", "webp"}:
            hashes[hashlib.sha256(path.read_bytes()).hexdigest()] = path
    return hashes


def free_name(folder: Path, stem: str, ext: str) -> Path:
    candidate = folder / f"{stem}.{ext}"
    n = 2
    while candidate.exists():
        candidate = folder / f"{stem}-{n}.{ext}"
        n += 1
    return candidate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, help="folder to save into (created if missing)")
    parser.add_argument("--all", action="store_true", help="save images from every user message")
    parser.add_argument("--list", action="store_true", help="list pasted images and exit")
    parser.add_argument("--session", default=os.environ.get("CLAUDE_CODE_SESSION_ID"), help="session id")
    parser.add_argument("--transcript", type=Path, help="transcript path (overrides --session)")
    args = parser.parse_args()

    transcript = args.transcript or (find_transcript(args.session) if args.session else None)
    if not transcript or not transcript.exists():
        print("transcript not found: pass --session or --transcript", file=sys.stderr)
        return 2

    images = read_pasted_images(transcript)
    if not images:
        print("no pasted images in this session")
        return 0

    if args.list:
        for i, img in enumerate(images, 1):
            print(
                f"#{i} message {img['message']} {img['timestamp']} {img['media_type']} "
                f"{len(img['data']) // 1024} KB — {img['text'] or '(no text)'}"
            )
        return 0

    if not args.out:
        parser.error("--out is required unless --list is given")

    if not args.all:
        last = images[-1]["message"]
        images = [img for img in images if img["message"] == last]

    args.out.mkdir(parents=True, exist_ok=True)
    seen = existing_hashes(args.out)
    for n, img in enumerate(images, 1):
        if img["sha"] in seen:
            print(f"skipped (duplicate of {seen[img['sha']]})")
            continue
        stamp = img["timestamp"][:19].replace("-", "").replace(":", "").replace("T", "-") or "unknown"
        path = free_name(args.out, f"chat-{stamp}-{n}", EXTENSIONS.get(img["media_type"], "png"))
        path.write_bytes(img["data"])
        seen[img["sha"]] = path
        print(f"saved {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
