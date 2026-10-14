#!/usr/bin/env python3
"""
Build public/letter-index.json — the words and verses the Letters Hunter reads
from.

Why a file and not a query: the app has no local copy of the Qur'an. Verses come
from api.quran.com one chapter at a time, so "find me a short verse holding ر
and ز" would mean 114 requests at lesson time. This fetches the whole thing ONCE
here and ships the result; at runtime it is a single cached file.

What goes in, and what is deliberately left out:
  words   unique word forms of 3-8 letters. Shorter is unreadable out of
          context, longer stops being a letter drill and becomes a reading test.
  verses  whole verses of at most MAX_VERSE_LETTERS letters. A hunt is for a
          beginner: a verse he can finish in a breath, not a page of Al-Baqarah.

Both are matched on letters alone, and the stripping is done again in the
browser rather than shipped — a skeleton beside every entry doubled the file.

Both keep their diacritics — they are read aloud, so the vowels have to be there.

    python3 scripts/build-letter-index.py
"""
import json
import re
import sys
import time
import urllib.request

API = "https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number={}"
SOURCE = "api.quran.com v4 · text_uthmani"

# Two files, not one: a run with only the words round on never fetches the
# verses, and the verses are four fifths of the weight.
OUT_WORDS = "public/quran-words.json"
OUT_VERSES = "public/quran-short-verses.json"

# The 29 letters, and nothing else: every mark, pause sign and ornament goes.
LETTERS = set("ابتثجحخدذرزسشصضطظعغفقكلمنهوي ء")
# Alef variants collapse to alef; the hamza seats collapse to hamza, so a word
# written أَ is found when hunting ء.
FOLD = {
    "أ": "ء", "إ": "ء", "آ": "ء", "ؤ": "ء", "ئ": "ء", "ٱ": "ا",
    "ى": "ي", "ة": "ه",
}

MIN_WORD_LETTERS = 3
MAX_WORD_LETTERS = 8
MAX_VERSE_LETTERS = 45
MAX_WORDS = 7000


def skeleton(text: str) -> str:
    """The letters of a word, with nothing on them."""
    out = []
    for ch in text:
        ch = FOLD.get(ch, ch)
        if ch in LETTERS and ch != " ":
            out.append(ch)
    return "".join(out)


def fetch(chapter: int) -> list:
    # The API answers 403 to urllib's default agent.
    req = lambda: urllib.request.Request(
        API.format(chapter),
        headers={"User-Agent": "LisanQuran/1.0 (letter-index builder)", "Accept": "application/json"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req(), timeout=30) as r:
                return json.loads(r.read())["verses"]
        except Exception as e:                      # noqa: BLE001 — retry anything
            if attempt == 3:
                raise
            print(f"  chapter {chapter} failed ({e}); retrying", file=sys.stderr)
            time.sleep(2 + attempt * 2)
    return []


def main() -> None:
    word_count: dict[str, int] = {}
    verses: list[list[str]] = []

    for ch in range(1, 115):
        for v in fetch(ch):
            text = v["text_uthmani"].strip()
            key = v["verse_key"]
            skel = skeleton(text)
            if 0 < len(skel) <= MAX_VERSE_LETTERS:
                verses.append([key, text])
            for w in text.split():
                ws = skeleton(w)
                if MIN_WORD_LETTERS <= len(ws) <= MAX_WORD_LETTERS:
                    word_count[w] = word_count.get(w, 0) + 1
        print(f"chapter {ch:3d} · {len(word_count):6d} words · {len(verses):5d} short verses")

    # The commonest forms first: a word he has met before is a letter drill, a
    # hapax legomenon is a vocabulary test he was never set.
    words = [w for w, _ in sorted(word_count.items(), key=lambda kv: -kv[1])][:MAX_WORDS]

    # The skeletons are NOT shipped: stripping the marks again in the browser
    # costs a few milliseconds and would otherwise double the download.
    built = time.strftime("%Y-%m-%d")
    for path, payload in (
        (OUT_WORDS, {"built": built, "source": SOURCE, "words": words}),
        (OUT_VERSES, {"built": built, "source": SOURCE, "verses": verses}),
    ):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{path}: {len(payload.get('words') or payload['verses'])} entries")


if __name__ == "__main__":
    main()
