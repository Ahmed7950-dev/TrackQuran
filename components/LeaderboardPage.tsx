import React, { useState, useEffect } from 'react';
import { LeaderboardEntry } from '../types';
import { getCombinedLeaderboard } from '../services/examService';

// ─────────────────────────────────────────────────────────────────────────────
// Combined leaderboard for a level — merges Arabic + Transliteration results.
// ─────────────────────────────────────────────────────────────────────────────

const MEDAL = ['🥇', '🥈', '🥉'];

const VERSION_BADGE: Record<string, string> = {
  arabic:          'AR',
  transliteration: 'TR',
};

const LeaderboardPage: React.FC<{
  level: number;
  selfStudentId?: string;
  onExit: () => void;
}> = ({ level, selfStudentId, onExit }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCombinedLeaderboard(level, selfStudentId).then(({ entries }) => {
      setEntries(entries); setLoading(false);
    });
  }, [level, selfStudentId]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onExit} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-sm font-semibold">← Back</button>
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100">🏅 Level {level} Leaderboard</h2>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-center text-slate-400 py-10">No results yet — be the first to complete this exam!</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.studentId}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                e.isSelf
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}>
              <span className="w-8 text-center text-lg font-extrabold text-slate-400">
                {e.rank <= 3 ? MEDAL[e.rank - 1] : e.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{e.displayName}</p>
                <p className="text-[11px] text-slate-400">
                  {e.completedAt ? new Date(e.completedAt).toLocaleDateString() : ''}
                  {e.attemptNumber > 1 ? ` · attempt #${e.attemptNumber}` : ''}
                </p>
              </div>
              {e.version && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 flex-shrink-0">
                  {VERSION_BADGE[e.version] ?? e.version}
                </span>
              )}
              <div className="text-right flex-shrink-0">
                <p className={`font-extrabold ${e.passed ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}`}>{e.percentage}%</p>
                <p className="text-[11px] text-slate-400">{e.score} marks{e.passed ? ' · ✓' : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;
