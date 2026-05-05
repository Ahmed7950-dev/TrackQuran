import React from 'react';
import { Progress } from '../types';
import { MILESTONES, QURAN_METADATA } from '../constants';
import { getPageOfAyah } from '../services/dataService';

interface MilestoneTrackerProps {
  studentProgress?: Progress;
}

const MilestoneTracker: React.FC<MilestoneTrackerProps> = ({ studentProgress }) => {
  if (!studentProgress) {
    return null;
  }
  
  // This is a simplified progress calculation for display purposes.
  // A full implementation would check all completed ranges.
  const currentPage = getPageOfAyah(studentProgress.surah, studentProgress.ayah);
  const completedPages = new Set<number>();
  for(let i = 1; i <= currentPage; i++) {
    completedPages.add(i);
  }

  const upcomingMilestone = MILESTONES.find(m => !m.isAchieved(completedPages));

  if (!upcomingMilestone) {
    return (
        <div className="mt-4 text-center p-2 bg-green-100 text-green-800 rounded-lg">
            Masha'Allah! All major milestones achieved!
        </div>
    );
  }
  
  // A very rough estimate of pages to next milestone
  let pagesToNext = '...';
  if (upcomingMilestone.id === 'al-baqarah') {
     pagesToNext = `${QURAN_METADATA[1].endPage - currentPage}`;
  } else if (upcomingMilestone.id === '5-juz') {
     pagesToNext = `${100 - currentPage}`;
  } else if (upcomingMilestone.id === 'khatm') {
    pagesToNext = `${604 - currentPage}`;
  }


  return (
    <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
      <strong>Next Milestone:</strong> {upcomingMilestone.title} ({upcomingMilestone.description})
    </div>
  );
};

export default MilestoneTracker;
