// services/oddLetterService.ts
// Leaderboard for the "Find the Odd Letter" alphabet game (1-player time trial).
// Backed by the odd_letter_scores table (see supabase/migrations/
// 20260706_odd_letter_scores.sql). All calls degrade gracefully: if the table
// isn't there yet, submit is a no-op and the leaderboard is empty, so the game
// still plays and shows the player's own time.
import { supabase } from '../lib/supabase';

export interface OddLetterEntry {
  id: string;
  playerName: string;
  totalMs: number;
  createdAt: string;
}

export interface SubmitResult {
  rank: number;   // 1-based position among all scores (1 = fastest)
  total: number;  // how many scores exist
}

/** Record a finished 1P run. Returns the player's rank, or null if unavailable. */
export async function submitOddLetterScore(playerName: string, totalMs: number, rounds = 5): Promise<SubmitResult | null> {
  try {
    const row = {
      id: `ols-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      player_name: (playerName || 'Player').slice(0, 24),
      total_ms: Math.round(totalMs),
      rounds,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('odd_letter_scores').insert(row);
    if (error) { console.error('submitOddLetterScore:', error.message); return null; }
    // rank = how many faster scores exist, +1
    const { count: faster } = await supabase
      .from('odd_letter_scores').select('id', { count: 'exact', head: true })
      .lt('total_ms', row.total_ms);
    const { count: total } = await supabase
      .from('odd_letter_scores').select('id', { count: 'exact', head: true });
    return { rank: (faster ?? 0) + 1, total: total ?? 1 };
  } catch (e) {
    console.error('submitOddLetterScore:', e);
    return null;
  }
}

/** Top-N fastest runs (ascending time). Empty array if unavailable. */
export async function getOddLetterLeaderboard(limit = 10): Promise<OddLetterEntry[]> {
  try {
    const { data, error } = await supabase
      .from('odd_letter_scores')
      .select('id, player_name, total_ms, created_at')
      .order('total_ms', { ascending: true })
      .limit(limit);
    if (error) { console.error('getOddLetterLeaderboard:', error.message); return []; }
    return (data ?? []).map((r: any) => ({
      id: r.id, playerName: r.player_name, totalMs: r.total_ms, createdAt: r.created_at,
    }));
  } catch (e) {
    console.error('getOddLetterLeaderboard:', e);
    return [];
  }
}
