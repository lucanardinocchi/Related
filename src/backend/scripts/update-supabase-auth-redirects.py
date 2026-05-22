#!/usr/bin/env python3
"""Merge Google integration auth callback URLs into the hosted Supabase uri_allow_list.

Requires a Supabase CLI access token at ~/.supabase/access-token (from `supabase login`).
Does not print secrets. Safe to re-run — idempotent merge.

Usage (from repo root):
  python3 src/backend/scripts/update-supabase-auth-redirects.py
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

PROJECT_REF = "yawclybcwwtrrnuyotdm"
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/config/auth"

# Wildcards — keep these; they cover most paths on each origin.
WILDCARDS = [
    "https://related-sooty.vercel.app/**",
    "https://related-sooty-*.vercel.app/**",
    "http://localhost:3000/**",
    "http://127.0.0.1:3000/**",
    "https://userelatedai.com/**",
    "https://www.userelatedai.com/**",
    "related://auth-callback",
]

# Explicit Gmail/Calendar connect callbacks (Supabase sometimes requires exact matches).
EXACT_SUFFIXES = [
    "/auth/callback?next=/settings&google_intent=gmail",
    "/auth/callback?next=%2Fsettings&google_intent=gmail",
    "/auth/callback?next=/settings&google_intent=calendar",
    "/auth/callback?next=%2Fsettings&google_intent=calendar",
    "/auth/callback?next=/context%3Fonboarding%3D1&google_intent=gmail",
    "/auth/callback?next=/context%3Fonboarding%3D1&google_intent=calendar",
]

EXACT_BASES = [
    "https://related-sooty.vercel.app",
    "https://userelatedai.com",
    "https://www.userelatedai.com",
]


def token() -> str:
    path = Path.home() / ".supabase" / "access-token"
    if not path.is_file():
        sys.exit("Missing ~/.supabase/access-token — run: supabase login")
    return path.read_text().strip()


def curl_json(method: str, url: str, body: dict | None = None) -> dict:
    cmd = ["curl", "-sS", "-X", method, url, "-H", f"Authorization: Bearer {token()}"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(result.stderr or "curl failed")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        sys.exit(f"Non-JSON response: {result.stdout[:300]}")


def main() -> None:
    config = curl_json("GET", API)
    existing = [u.strip() for u in (config.get("uri_allow_list") or "").split(",") if u.strip()]

    exact = [f"{base}{suffix}" for base in EXACT_BASES for suffix in EXACT_SUFFIXES]
    merged = list(dict.fromkeys(existing + WILDCARDS + exact))

    try:
        updated = curl_json("PATCH", API, {"uri_allow_list": ",".join(merged)})
    except SystemExit:
        raise
    except Exception as exc:
        sys.exit(str(exc))

    if "uri_allow_list" not in updated:
        sys.exit(
            "PATCH failed (uri_allow_list too large or validation error). "
            "Wildcards may already cover Gmail connect — check Dashboard → Auth → URL Configuration.",
        )

    added = [u for u in merged if u not in existing]
    print(f"Allow-list now has {len(merged)} entries ({len(added)} newly merged).")
    for u in added:
        print(f"  + {u}")


if __name__ == "__main__":
    main()
