// data/revealedNotes/index.ts
// -----------------------------------------------------------------------------
// "Revealed App notes" — our own short explanation of a verse, written as a
// summary of the tafsir rather than a copy of it, and shown in tadabbur mode
// beside (or instead of) the fetched tafsir.
//
// One module per surah PER LANGUAGE, loaded only when that surah is open and
// only in the language being read, so the notes can grow to the whole Qur'an
// without weighing on the first paint. A surah with no module yet simply has no
// notes, and the panel says so.
// -----------------------------------------------------------------------------

/** ayah number → the note for that verse. */
export type SurahNotes = Record<number, string>;

export type NotesLang = 'en' | 'ar';

type Loader = () => Promise<{ default: SurahNotes }>;

const LOADERS: Record<number, Partial<Record<NotesLang, Loader>>> = {
  67: { en: () => import('./067'), ar: () => import('./067.ar') },
};

/** Which surahs have notes — for the chip that offers them. */
export const surahHasRevealedNotes = (surah: number): boolean => surah in LOADERS;

/** Whether a surah's notes have been translated into this language. */
export const revealedNotesHaveLang = (surah: number, lang: NotesLang): boolean =>
  !!LOADERS[surah]?.[lang];

const cache = new Map<string, SurahNotes>();

/** The notes of one surah, or an empty map if none have been written yet.
 *  A language that has not been written falls back to English. */
export async function loadRevealedNotes(surah: number, lang: NotesLang = 'en'): Promise<SurahNotes> {
  const key = `${surah}:${lang}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const load = LOADERS[surah]?.[lang] ?? LOADERS[surah]?.en;
  if (!load) return {};
  try {
    const mod = await load();
    cache.set(key, mod.default);
    return mod.default;
  } catch (err) {
    console.error('[revealedNotes] could not load surah', surah, lang, err);
    return {};
  }
}
