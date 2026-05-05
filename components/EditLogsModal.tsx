import React, { useState } from 'react';
import { Student, SurahMetadata, RecitationAchievement, TafsirReview, AttendanceRecord, AttendanceStatus } from '../types';

interface EditLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onUpdateStudent: (student: Student) => void;
  quranMetadata: SurahMetadata[];
}

const EditLogsModal: React.FC<EditLogsModalProps> = ({ isOpen, onClose, student, onUpdateStudent, quranMetadata }) => {

  const handleDeleteRecitation = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this recitation log?")) return;
    const updatedRecitations = student.recitationAchievements.filter(r => r.id !== id);
    onUpdateStudent({ ...student, recitationAchievements: updatedRecitations });
  };

  const handleDeleteTafsir = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this tafsir review?")) return;
    const updatedTafsir = student.tafsirReviews.filter(t => t.id !== id);
    onUpdateStudent({ ...student, tafsirReviews: updatedTafsir });
  };

  const handleDeleteAttendance = (id: string) => {
     if (!window.confirm("Are you sure you want to delete this attendance record?")) return;
    const updatedAttendance = student.attendance.filter(a => a.id !== id);
    onUpdateStudent({ ...student, attendance: updatedAttendance });
  };

  const LogItem: React.FC<{onDelete: () => void, children: React.ReactNode}> = ({ onDelete, children }) => (
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-md border border-slate-200 dark:border-gray-700">
          <div className="text-sm text-slate-700 dark:text-slate-300">{children}</div>
          <button onClick={onDelete} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold">DELETE</button>
      </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-slate-50 dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex justify-between items-center mb-4 pb-4 border-b dark:border-gray-700">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Edit Logbook for {student.name}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white text-3xl">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto space-y-6 pr-2">
            {/* Recitation Logs */}
            <div>
                <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-2">Recitation Achievements</h3>
                <div className="space-y-2">
                    {[...student.recitationAchievements].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(rec => (
                        <LogItem key={rec.id} onDelete={() => handleDeleteRecitation(rec.id)}>
                            <strong>{new Date(rec.date).toLocaleDateString()}:</strong> &nbsp;
                            From {quranMetadata.find(s=>s.number===rec.startSurah)?.name} {rec.startAyah} &nbsp;
                            to {quranMetadata.find(s=>s.number===rec.endSurah)?.name} {rec.endAyah}. &nbsp;
                            <span className="text-slate-500 dark:text-slate-400">(Quality: {rec.readingQuality}/10)</span>
                        </LogItem>
                    ))}
                </div>
            </div>

            {/* Tafsir Logs */}
            <div>
                <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-2">Tafsir Reviews</h3>
                <div className="space-y-2">
                    {[...student.tafsirReviews].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(taf => (
                        <LogItem key={taf.id} onDelete={() => handleDeleteTafsir(taf.id)}>
                            <strong>{new Date(taf.date).toLocaleDateString()}:</strong> &nbsp;
                            {quranMetadata.find(s=>s.number===taf.surah)?.name}. &nbsp;
                            <span className="text-slate-500 dark:text-slate-400">(Quality: {taf.reviewQuality}/10)</span>
                        </LogItem>
                    ))}
                </div>
            </div>

            {/* Attendance Logs */}
            <div>
                <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-2">Attendance Records</h3>
                <div className="space-y-2">
                    {[...student.attendance].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(att => (
                        <LogItem key={att.id} onDelete={() => handleDeleteAttendance(att.id)}>
                            <strong>{new Date(att.date).toLocaleDateString()}:</strong> &nbsp;
                            <span className={`font-semibold ${
                                att.status === AttendanceStatus.Present ? 'text-green-600 dark:text-green-400' : 
                                att.status === AttendanceStatus.Absent ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'
                            }`}>
                                {att.status}
                            </span>
                        </LogItem>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default EditLogsModal;