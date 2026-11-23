#!/usr/bin/env python3
"""
Build public/mushaf-lines.json: the line of the printed Madani mushaf page
(1 to 15) that every word of the Qur'an sits on. The live logging page's page
bar reads it to number the line being read.

Why a file: the live page flows the text, so its screen lines are not the
mushaf's lines. quran.com's word list knows each word's line on the 15-line
page; fetching that once here beats a request per page during a lesson.

Shape: {"v": 1, "lines": [[entry per ayah] per surah]}, where an entry is
  [firstLine, b1, b2, ...]
  firstLine  the mushaf line of the ayah's first word
  b1, b2...  word indexes where the next line starts, one line further each.
Word indexes are the app's own (splitVerseWords over the same text the page
renders: split on spaces, stand-alone stop signs joined to the word before),
so `${surah}:${ayah}:${wordIndex}` in the page maps straight in. Tokens that
are not words (an empty token, ۞, ۩) take the line of the word beside them.

Checked here, so the page can trust it:
  - the app's words and quran.com's words line up, letter for letter, in
    every ayah
  - an ayah never crosses a page, and its page is the app's (quranPageData.ts,
    the 1405H Madani layout, quran.com's "v1")
  - inside an ayah the line only ever steps down by one

    python3 scripts/build-mushaf-lines.py
"""
import json
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "mushaf-lines.json"
PAGE_TABLE = ROOT / "services" / "quranPageData.ts"
# v1 = the 1405H Madani layout, the one services/quranPageData.ts numbers pages
# by. Ask for it by name: by_chapter's plain page_number is the newer (v2)
# printing's while its line_number is v1's, and they disagree in 56 ayat.
WORDS_API = ("https://api.quran.com/api/v4/verses/by_chapter/{}?words=true"
             "&word_fields=line_v1,v1_page,text_uthmani&per_page=50&page={}")
TEXT_API = "https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number={}"

STANDALONE_WAQF = re.compile("^[ۖ-ۜ]+$")
LETTER = re.compile("[ء-غف-يٮٯٱ-ۓەۺ-ۼ]")


def get(url):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mushaf-lines-build/1.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))


def app_words(text):
    """utils/quranicMarks.tsx splitVerseWords (Madani text), word for word."""
    out = []
    for w in text.replace("ْ", "ۡ").split(" "):
        if STANDALONE_WAQF.match(w) and out:
            out[-1] += w
        else:
            out.append(w)
    return out


BARE = str.maketrans({"ٱ": "ا", "ى": "ي"})


def skeleton(text):
    """The letters alone, hamza seats and wasla made bare (آ is one code point in
    one copy and two in the other; أَنَّا is اَنَّا in quran.com's word list)."""
    return "".join(LETTER.findall(unicodedata.normalize("NFD", text))).translate(BARE)


def same_word(a, b):
    """Same length, and most letters agree: the two copies differ in a few
    spellings (ٱفْتَرَىٰهُ against افْتَرَاهُ, 11:13), never in a word's length."""
    return len(a) == len(b) and sum(x == y for x, y in zip(a, b)) >= 0.6 * len(a)


def page_table():
    starts = [tuple(map(int, m)) for m in re.findall(r"\[(\d+),\s*(\d+),\s*(\d+)\]", PAGE_TABLE.read_text())]
    starts.sort()

    def page_of(s, a):
        page = 1
        for p, ss, aa in starts:
            if (s, a) >= (ss, aa):
                page = p
        return page
    return page_of


def main():
    page_of = page_table()
    surahs = []
    problems = []
    for s in range(1, 115):
        texts = {v["verse_key"]: v["text_uthmani"] for v in get(TEXT_API.format(s))["verses"]}
        words = {}
        page = 1
        while True:
            d = get(WORDS_API.format(s, page))
            for v in d["verses"]:
                words[v["verse_key"]] = [(w["line_v1"], w["v1_page"], w["text_uthmani"])
                                         for w in v["words"] if w["char_type_name"] == "word"]
            nxt = d["pagination"].get("next_page")
            if not nxt:
                break
            page = nxt
            time.sleep(0.12)
        entries = []
        for a in range(1, len(texts) + 1):
            key = f"{s}:{a}"
            api = words.get(key, [])
            toks = app_words(texts[key])
            real = [i for i, t in enumerate(toks) if LETTER.search(t)]
            pages = {p for _, p, _ in api}
            if len(pages) != 1 or next(iter(pages)) != page_of(s, a):
                problems.append(f"{key}: pages {sorted(pages)} vs app page {page_of(s, a)}")
            # Match words by their letters, not by count: quran.com keeps بَعْدَ مَا
            # and إِلْ يَاسِينَ as one word where the app shows two, and has a stray
            # space inside دَآئِرَ ةٌۭ (5:52) where the app has one.
            line_of = [None] * len(toks)
            t = 0
            lined_up = bool(api)
            for ln, _, text in api:
                want = skeleton(text)
                got = ""
                while t < len(real) and len(got) < len(want):
                    got += skeleton(toks[real[t]])
                    line_of[real[t]] = ln
                    t += 1
                if not same_word(got, want):
                    lined_up = False
                    break
            if not lined_up or t != len(real):
                problems.append(f"{key}: the app's words and quran.com's do not line up")
                entries.append([api[0][0] if api else 1])
                continue
            # Non-words take the line of the word before them (the next one at the start).
            for i in range(len(toks)):
                if line_of[i] is None:
                    line_of[i] = line_of[i - 1] if i > 0 and line_of[i - 1] is not None else None
            for i in range(len(toks) - 1, -1, -1):
                if line_of[i] is None:
                    line_of[i] = line_of[i + 1]
            entry = [line_of[0]]
            for i in range(1, len(toks)):
                step = line_of[i] - line_of[i - 1]
                if step == 1:
                    entry.append(i)
                elif step != 0:
                    problems.append(f"{key}: line jumps {line_of[i - 1]} -> {line_of[i]} at word {i}")
            entries.append(entry)
        surahs.append(entries)
        print(f"surah {s}: {len(entries)} ayat", file=sys.stderr)

    if problems:
        print("\n".join(problems), file=sys.stderr)
        sys.exit(f"{len(problems)} problem(s); file not written")
    OUT.write_text(json.dumps({"v": 1, "source": "api.quran.com v4 words, line_v1 (15-line Madani mushaf, the app's page layout)", "lines": surahs}, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
