// services/quickMatchService.ts
// -----------------------------------------------------------------------------
// Quick match best scores — one per student and mode, kept by two
// security-definer functions (migration 20261123_quick_match_best.sql).
// Without a student (a tutor trying the game on a lesson with nobody picked)
// the best lives on this device only.
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';
import type { CrosswordMode } from '../utils/crossword';

const localKey = (mode: CrosswordMode) => `quickMatchBest:${mode}`;

function localBest(mode: CrosswordMode): number {
  try { return Number(localStorage.getItem(localKey(mode))) || 0; } catch { return 0; }
}

/** The best so far, 0 when there is none. Throws when the read fails. */
export async function getQuickMatchBest(studentId: string | undefined, mode: CrosswordMode): Promise<number> {
  if (!studentId) return localBest(mode);
  const { data, error } = await supabase.rpc('quick_match_best', { p_student: studentId });
  if (error) throw new Error(error.message);
  const row = (data as Array<{ mode: string; best: number }> | null)?.find(r => r.mode === mode);
  return row?.best ?? 0;
}

/** Both modes at once, for the game tile. Never throws: a tile just shows no best. */
export async function getQuickMatchBests(studentId: string): Promise<Record<CrosswordMode, number>> {
  const out: Record<CrosswordMode, number> = { arabic: 0, translit: 0 };
  const { data, error } = await supabase.rpc('quick_match_best', { p_student: studentId });
  if (error) { console.error(error); return out; }
  for (const r of (data as Array<{ mode: CrosswordMode; best: number }> | null) ?? []) out[r.mode] = r.best;
  return out;
}

/** Save a finished game; returns the best after it. Throws when the save fails. */
export async function saveQuickMatchScore(studentId: string | undefined, mode: CrosswordMode, score: number): Promise<number> {
  if (!studentId) {
    const best = Math.max(localBest(mode), score);
    try { localStorage.setItem(localKey(mode), String(best)); } catch { /* private mode */ }
    return best;
  }
  const { data, error } = await supabase.rpc('save_quick_match_score', { p_student: studentId, p_mode: mode, p_score: score });
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : score;
}
