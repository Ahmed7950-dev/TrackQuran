import React from 'react';
import { MILESTONES, TOTAL_QURAN_PAGES } from '../constants';

interface MilestoneTrackerProps {
  /** The student's ACTUAL read pages (recited ∪ memorized) — not an assumed 1..current range. */
  completedPages: Set<number>;
}

const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({ completedPages }) => {
  const upcomingMilestone = MILESTONES.find(m => !m.isAchieved(completedPages));

  if (!upcomingMilestone) {
    return (
        <div className="mt-4 text-center p-2 bg-green-100 text-green-800 rounded-lg">
            Masha'Allah! All major milestones achieved!
        </div>
    );
  }

  // Pages remaining for the count-based milestones.
  const have = completedPages.size;
  const pageTargets: Record<string, number> = { '5-juz': 100, '10-juz': 200, '15-juz': 300, 'khatm': TOTAL_QURAN_PAGES };
  const target = pageTargets[upcomingMilestone.id];
  const remaining = target ? Math.max(0, target - have) : null;

  return (
    <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
      <strong>Next Milestone:</strong> {upcomingMilestone.title} ({upcomingMilestone.description})
      {remaining !== null && <span className="text-slate-400"> — {remaining} pages to go</span>}
    </div>
  );
};

export default MilestoneTracker;
