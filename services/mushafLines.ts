/**
 * Which line of the printed Madani mushaf page (1 to 15) every word sits on.
 *
 * public/mushaf-lines.json, built by scripts/build-mushaf-lines.py from
 * quran.com's v1 layout: the one services/quranPageData.ts numbers pages by.
 * Word indexes are the app's own (splitVerseWords over the rendered text), the
 * same as in the letter ids (`letter-s:a:w:l`).
 */

/** [surah - 1][ayah - 1] = [line of the first word, word indexes where the next line starts...] */
export type MushafLineData = number[][][];

let loading: Promise<MushafLineData | null> | null = null;

/** The whole table (44 KB), fetched once. Null when it could not be loaded. */
export const loadMushafLines = (): Promise<MushafLineData | null> => {
    if (!loading) {
        const load = fetch('/mushaf-lines.json')
            .then(r => (r.ok ? r.json() : null))
            .then(j => (j && Array.isArray(j.lines) ? (j.lines as MushafLineData) : null))
            .catch(() => null);
        loading = load;
        // A failed load may be a passing blip: the next caller tries again.
        load.then(d => { if (!d && loading === load) loading = null; });
    }
    return loading;
};

/** The printed line of word `w` of ayah `s:a`, or null when unknown. */
export const mushafLineOf = (data: MushafLineData, s: number, a: number, w: number): number | null => {
    const e = data[s - 1]?.[a - 1];
    if (!e || !e.length) return null;
    let line = e[0];
    for (let i = 1; i < e.length && w >= e[i]; i++) line++;
    return line;
};
