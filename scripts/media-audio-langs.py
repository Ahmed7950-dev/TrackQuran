#!/usr/bin/env python3
"""Which languages each Media reel can be heard in, written as SQL to run.

The browser cannot ask YouTube this (youtube.com sends no CORS header) and
Vercel gets a bot check, so it runs on a home connection, from this Mac:

    echo "select id, kind, youtube_id, title, latest_video_ids from media_items where audio_langs is null;" > /tmp/q.sql
    supabase db query --linked -f /tmp/q.sql > /tmp/items.json
    python3 -I scripts/media-audio-langs.py /tmp/items.json supabase/data/<date>_media_audio_langs.sql
    supabase db query --linked -f supabase/data/<date>_media_audio_langs.sql

What counts, read from the watch page:
  * the audio tracks a video offers (multi-language audio: "Arabic original",
    "English", "English (US)"…) — every one of them;
  * with no tracks listed, the language of YouTube's automatic captions, which
    is the language it heard being spoken.
Codes are cut to their base ("en-US" -> "en"). A playlist is the union of its
first three videos. A reel with nothing to go on is left out (stays null), so
the tutor's own setting is the only thing that fills it.
"""
from __future__ import annotations
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/130.0 Safari/537.36')


def watch_page(video_id: str) -> str:
    req = urllib.request.Request(
        f'https://www.youtube.com/watch?v={video_id}',
        headers={'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')


def langs_of(video_id: str) -> set[str] | None:
    for attempt in range(2):
        try:
            page = watch_page(video_id)
            break
        except Exception:  # noqa: BLE001 — one retry, then give up on this one
            if attempt:
                return None
            time.sleep(2)
    if '"playabilityStatus":{"status":"OK"' not in page:
        return None
    tracks = re.findall(r'"audioTrack":\{"displayName":"[^"]*","id":"([A-Za-z-]+)\.\d+"', page)
    if tracks:
        return {t.split('-')[0].lower() for t in tracks}
    asr = re.findall(r'"vssId":"a\.([A-Za-z-]+)"', page)
    if asr:
        return {a.split('-')[0].lower() for a in asr}
    return None


def main() -> None:
    items = json.load(open(sys.argv[1]))['rows']
    jobs: dict[str, list[str]] = {}
    for it in items:
        if it['kind'] == 'video':
            jobs[it['id']] = [it['youtube_id']]
        else:
            jobs[it['id']] = (it.get('latest_video_ids') or [])[:3]
    every = sorted({v for vs in jobs.values() for v in vs})
    with ThreadPoolExecutor(4) as pool:
        found = dict(zip(every, pool.map(langs_of, every)))

    lines = ['-- Sound languages for the Media shelf, from YouTube (scripts/media-audio-langs.py).',
             '-- Only reels still unset are touched, so a tutor\'s own choice is never overwritten.']
    for it in items:
        got: set[str] = set()
        seen = False
        for v in jobs[it['id']]:
            if found.get(v) is not None:
                seen = True
                got |= found[v]
        title = it['title'].replace('\n', ' ')
        if not seen:
            print(f'  ?        {title}')
            continue
        arr = '{' + ','.join(sorted(got)) + '}'
        print(f'  {arr:<10}{title}')
        lines.append(f"update media_items set audio_langs = '{arr}' "
                     f"where id = '{it['id']}' and audio_langs is null;  -- {title.replace('--', '-')}")
    open(sys.argv[2], 'w').write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
