// data/revealedNotes/index.ts
// -----------------------------------------------------------------------------
// "Revealed App notes" — our own short explanation of a verse, written as a
// summary of the tafsir rather than a copy of it, and shown in tadabbur mode
// beside (or instead of) the fetched tafsir.
//
// One module per surah, loaded only when that surah is open, so the notes can
// grow to the whole Qur'an without weighing on the first paint. A surah with no
// module yet simply has no notes, and the panel says so.
// -----------------------------------------------------------------------------

/** ayah number → the note for that verse. */
export type SurahNotes = Record<number, string>;

const LOADERS: Record<number, () => Promise<{ default: SurahNotes }>> = {
  // 67: () => import('./067'),
};

/** Which surahs have notes — for the chip that offers them. */
export const surahHasRevealedNotes = (surah: number): boolean => surah in LOADERS;

const cache = new Map<number, SurahNotes>();

/** The notes of one surah, or an empty map if none have been written yet. */
export async function loadRevealedNotes(surah: number): Promise<SurahNotes> {
  const hit = cache.get(surah);
  if (hit) return hit;
  const load = LOADERS[surah];
  if (!load) return {};
  try {
    const mod = await load();
    cache.set(surah, mod.default);
    return mod.default;
  } catch (err) {
    console.error('[revealedNotes] could not load surah', surah, err);
    return {};
  }
}
