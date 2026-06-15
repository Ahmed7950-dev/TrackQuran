import React, { useState, useEffect } from 'react';
import { ExamVersion, LeaderboardEntry, ArabicExam } from '../types';
import { getLeaderboard } from '../services/examService';

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard for a level + version. Only published results appear. Names are
// formatted per the exam's privacy setting (handled in the service).
// ─────────────────────────────────────────────────────────────────────────────

const MEDAL = ['🥇', '🥈', '🥉'];

const LeaderboardPage: React.FC<{
  level: number;
  selfStudentId?: string;
  onExit: () => void;
}> = ({ level, selfStudentId, onExit }) => {
  const [version, setVersion] = useState<ExamVersion>('arabic');
  const [exam, setExam] = useState<ArabicExam | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getLeaderboard(level, version, selfStudentId).then(({ exam, entries }) => {
      setExam(exam); setEntries(entries); setLoading(false);
    });
  }, [level, version, selfStudentId]);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onExit} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-sm font-semibold">← Back</button>
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100">🏅 Level {level} Leaderboard</h2>
      </div>

      {/* Version toggle */}
      <div className="flex gap-2 mb-5">
        {(['arabic', 'transliteration'] as ExamVersion[]).map(v => (
          <button key={v} onClick={() => setVersion(v)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
              version === v
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                : 'border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300'
            }`}>
            {v === 'arabic' ? 'Arabic' : 'Transliteration'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10">Loading…</p>
      ) : !exam ? (
        <p className="text-center text-slate-400 py-10">No published exam for this version yet.</p>
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
