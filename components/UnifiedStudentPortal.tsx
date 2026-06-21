// components/UnifiedStudentPortal.tsx
// ---------------------------------------------------------------------------
// One permanent link for a student who has BOTH a Quran and an Arabic profile.
// Opening /portal/<token> shows a chooser (Arabic / Quran); after picking, the
// chosen portal renders below a persistent top tab bar so the student can
// switch between the two at any time from the same link.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { getPortalPairByToken, PortalPair } from '../services/portalPairService';
import SharedReportPage from './SharedReportPage';
import ArabicStudentPortal from './ArabicStudentPortal';

type View = 'choose' | 'arabic' | 'quran';

const UnifiedStudentPortal: React.FC<{ token: string }> = ({ token }) => {
  const [pair, setPair] = useState<PortalPair | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('choose');

  useEffect(() => {
    getPortalPairByToken(token)
      .then(p => setPair(p))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-gray-900 text-center px-6">
        <span className="text-5xl">🔗</span>
        <h1 className="text-xl font-bold text-slate-700 dark:text-slate-200">Link not found</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">This portal link is invalid or has been removed.</p>
      </div>
    );
  }

  const TabBar = (
    <div className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-slate-200 dark:border-gray-700">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {pair.studentName.charAt(0).toUpperCase()}
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{pair.studentName}</span>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-gray-800 flex-shrink-0">
          <button
            onClick={() => setView('arabic')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${view === 'arabic' ? 'bg-amber-500 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-amber-600'}`}
          >
            <span style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</span> Arabic
          </button>
          <button
            onClick={() => setView('quran')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${view === 'quran' ? 'bg-teal-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-teal-600'}`}
          >
            📖 Quran
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      {TabBar}
      {view === 'choose' ? (
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">
            Welcome, {pair.studentName} 👋
          </h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">Choose which portal you'd like to open. You can switch between them anytime.</p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setView('arabic')}
              className="group rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-8 hover:border-amber-400 hover:shadow-lg transition-all"
            >
              <div className="text-4xl mb-3" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-300">Arabic Portal</div>
              <div className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">Lessons, vocab & progress</div>
            </button>
            <button
              onClick={() => setView('quran')}
              className="group rounded-2xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 p-8 hover:border-teal-400 hover:shadow-lg transition-all"
            >
              <div className="text-4xl mb-3">📖</div>
              <div className="text-lg font-bold text-teal-700 dark:text-teal-300">Quran Portal</div>
              <div className="text-xs text-teal-600/70 dark:text-teal-400/70 mt-1">Recitation, mistakes & homework</div>
            </button>
          </div>
        </div>
      ) : view === 'arabic' ? (
        <ArabicStudentPortal token={pair.arabicShareToken} />
      ) : (
        <SharedReportPage reportId={pair.quranReportId} />
      )}
    </div>
  );
};

export default UnifiedStudentPortal;
