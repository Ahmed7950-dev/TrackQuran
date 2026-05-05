import React, { useState, useEffect, useMemo } from 'react';
import { Student, SurahMetadata, MemorizationAchievement, TafsirMemorizationReview, AttendanceRecord, AttendanceStatus, RecitationAchievement, TafsirReview } from '../types';
import QualityScoreInput from './QualityScoreInput';
import { calculateVersesAndPages } from '../services/dataService';
import { useI18n } from '../context/I18nProvider';
import ConfirmationModal from './ConfirmationModal';

interface EditStudentDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateStudent: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  student: Student;
  quranMetadata: SurahMetadata[];
}

const EditStudentDataModal: React.FC<EditStudentDataModalProps> = ({ isOpen, onClose, onUpdateStudent, onDeleteStudent, student, quranMetadata }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'logbook'>('info');
  const [name, setName] = useState(student.name);
  const [dob, setDob] = useState(student.dob);
  
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogData, setEditingLogData] = useState<any | null>(null);
  const { t } = useI18n();

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    if (isOpen) {
        setName(student.name);
        setDob(student.dob);
        setActiveTab('info');
        setEditingLogId(null);
        setEditingLogData(null);
    }
  }, [student, isOpen]);

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateStudent({ ...student, name, dob });
    onClose();
  };
  
  const allLogs = useMemo(() => {
      const recitations = student.recitationAchievements.map(item => ({ ...item, type: 'Recitation' }));
      const memorizations = student.memorizationAchievements.map(item => ({ ...item, type: 'Memorization' }));
      const tafsirs = student.tafsirReviews.map(item => ({ ...item, type: 'Tafsir (Reading)' }));
      const tafsirMems = student.tafsirMemorizationReviews.map(item => ({ ...item, type: 'Tafsir (Hifdh)' }));
      const attendance = student.attendance.map(item => ({ ...item, type: 'Attendance' }));
      
      const combined = [...recitations, ...memorizations, ...tafsirs, ...tafsirMems, ...attendance];
      return combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [student]);


  const handleEditClick = (log: any) => {
    setEditingLogId(log.id);
    setEditingLogData({ ...log });
  };

  const handleCancelEdit = () => {
    setEditingLogId(null);
    setEditingLogData(null);
  };

  const handleSaveEdit = () => {
      if (!editingLogData) return;
      
      let updatedStudent = { ...student };
      const { type, id } = editingLogData;

      if (type === 'Recitation' || type === 'Memorization') {
          if ((type === 'Recitation' && (editingLogData.readingQuality === '' || editingLogData.tajweedQuality === '')) ||
              (type === 'Memorization' && editingLogData.memorizationQuality === '')) {
              alert(t('modals.editStudent.errorQuality'));
              return;
          }
          const { verses, pages } = calculateVersesAndPages(editingLogData.startSurah, editingLogData.startAyah, editingLogData.endSurah, editingLogData.endAyah);
          const finalData = { ...editingLogData, pagesCompleted: pages, versesCompleted: verses };

          if (type === 'Recitation') {
              updatedStudent.recitationAchievements = student.recitationAchievements.map(i => i.id === id ? finalData : i);
          } else {
              updatedStudent.memorizationAchievements = student.memorizationAchievements.map(i => i.id === id ? finalData : i);
          }
      } else if (type === 'Tafsir (Reading)' || type === 'Tafsir (Hifdh)') {
          if (editingLogData.reviewQuality === '') {
            alert(t('modals.editStudent.errorQuality'));
            return;
          }
          if (type === 'Tafsir (Reading)') {
              updatedStudent.tafsirReviews = student.tafsirReviews.map(i => i.id === id ? editingLogData : i);
          } else {
              updatedStudent.tafsirMemorizationReviews = student.tafsirMemorizationReviews.map(i => i.id === id ? editingLogData : i);
          }
      } else if (type === 'Attendance') {
          updatedStudent.attendance = student.attendance.map(i => i.id === id ? editingLogData : i);
      }
      
      onUpdateStudent(updatedStudent);
      handleCancelEdit();
  };

  const handleDeleteLogRequest = (type: string, id: string) => {
    setConfirmModalState({
      isOpen: true,
      title: t('modals.editStudent.deleteLogTitle'),
      message: t('modals.editStudent.confirmDeleteLog'),
      onConfirm: () => handleDeleteLog(type, id),
    });
  };

  const handleDeleteStudentRequest = () => {
     setConfirmModalState({
      isOpen: true,
      title: t('modals.editStudent.deleteStudentTitle'),
      message: t('modals.editStudent.confirmDelete', { name: student.name }),
      onConfirm: () => onDeleteStudent(student.id),
    });
  };

  const handleDeleteLog = (type: string, id: string) => {
    const updatedStudent = { ...student };

    switch (type) {
        case 'Recitation':
            updatedStudent.recitationAchievements = student.recitationAchievements.filter(i => i.id !== id);
            break;
        case 'Memorization':
            updatedStudent.memorizationAchievements = student.memorizationAchievements.filter(i => i.id !== id);
            break;
        case 'Tafsir (Reading)':
            updatedStudent.tafsirReviews = student.tafsirReviews.filter(i => i.id !== id);
            break;
        case 'Tafsir (Hifdh)':
            updatedStudent.tafsirMemorizationReviews = student.tafsirMemorizationReviews.filter(i => i.id !== id);
            break;
        case 'Attendance':
            updatedStudent.attendance = student.attendance.filter(i => i.id !== id);
            break;
        default:
            console.error("Unknown log type for deletion:", type);
            return;
    }
    
    onUpdateStudent(updatedStudent);
  };

  const renderLogDetails = (log: any) => {
    switch(log.type) {
      case 'Recitation':
      case 'Memorization':
        return `From ${quranMetadata.find(s=>s.number===log.startSurah)?.name} ${log.startAyah} to ${quranMetadata.find(s=>s.number===log.endSurah)?.name} ${log.endAyah}`;
      case 'Tafsir (Reading)':
      case 'Tafsir (Hifdh)':
        return `Review of ${quranMetadata.find(s=>s.number===log.surah)?.name}`;
      case 'Attendance':
        return `Session attendance`;
      default:
        return '';
    }
  };

 const renderScoreStatus = (log: any) => {
    switch (log.type) {
      case 'Recitation':
        return <span className="text-xs bg-slate-200 dark:bg-gray-600 text-slate-700 dark:text-slate-300 px-2 py-1 rounded-full">Read: {log.readingQuality}/10, Tajweed: {log.tajweedQuality}/10</span>;
      case 'Memorization':
        return <span className="text-xs bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 px-2 py-1 rounded-full">Hifdh: {log.memorizationQuality}/10</span>;
      case 'Tafsir (Reading)':
      case 'Tafsir (Hifdh)':
        return <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full">Quality: {log.reviewQuality}/10</span>;
      case 'Attendance':
        const statusClasses = {
          [AttendanceStatus.Present]: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
          [AttendanceStatus.Absent]: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
          [AttendanceStatus.Rescheduled]: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300',
        };
        return <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusClasses[log.status]}`}>{log.status}</span>;
      default:
        return null;
    }
  };

  const inputClasses = "block w-full bg-white dark:bg-gray-700 dark:text-white rounded-md border-slate-300 dark:border-gray-600 shadow-sm text-xs p-1";

  const renderEditRow = () => {
    const log = editingLogData;
    switch(log.type) {
        case 'Recitation':
        case 'Memorization':
            const startSurahMeta = quranMetadata.find(s => s.number === log.startSurah);
            const endSurahMeta = quranMetadata.find(s => s.number === log.endSurah);
            const isMemorization = log.type === 'Memorization';
            return (
                <tr className={isMemorization ? "bg-sky-50 dark:bg-sky-900/60" : "bg-teal-50 dark:bg-teal-900/60"}>
                    <td className="p-2 text-sm text-slate-800 dark:text-slate-300">{new Date(log.date).toLocaleDateString()}</td>
                    <td className="p-2 text-sm text-slate-800 dark:text-slate-300">{log.type}</td>
                    <td className="p-2 text-sm" colSpan={2}>
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.fromSurah')}</label>
                                <select value={log.startSurah} onChange={e => setEditingLogData({...log, startSurah: Number(e.target.value)})} className={`mt-1 ${inputClasses}`}>
                                    {quranMetadata.map(s => <option key={s.number} value={s.number}>{s.number}. {s.name}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.ayah')}</label>
                                <input type="number" value={log.startAyah} onChange={e => setEditingLogData({...log, startAyah: Number(e.target.value)})} min="1" max={startSurahMeta?.numberOfAyahs} className={`mt-1 ${inputClasses}`} />
                            </div>
                             <div>
                                <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.toSurah')}</label>
                                <select value={log.endSurah} onChange={e => setEditingLogData({...log, endSurah: Number(e.target.value)})} className={`mt-1 ${inputClasses}`}>
                                    {quranMetadata.filter(s => s.number >= log.startSurah).map(s => <option key={s.number} value={s.number}>{s.number}. {s.name}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.ayah')}</label>
                                <input type="number" value={log.endAyah} onChange={e => setEditingLogData({...log, endAyah: Number(e.target.value)})} min="1" max={endSurahMeta?.numberOfAyahs} className={`mt-1 ${inputClasses}`} />
                            </div>
                            {isMemorization ? (
                                <div className="col-span-2">
                                    <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.hifdhQuality')}</label>
                                    <QualityScoreInput value={log.memorizationQuality} onChange={val => setEditingLogData({...log, memorizationQuality: val})} />
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.readingQuality')}</label>
                                        <QualityScoreInput value={log.readingQuality} onChange={val => setEditingLogData({...log, readingQuality: val})} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-800 dark:text-slate-400">{t('modals.editStudent.tajweedQuality')}</label>
                                        <QualityScoreInput value={log.tajweedQuality} onChange={val => setEditingLogData({...log, tajweedQuality: val})} />
                                    </div>
                                </>
                            )}
                        </div>
                    </td>
                    <td className="p-2 text-sm">
                        <div className="flex flex-col gap-2">
                            <button onClick={handleSaveEdit} className="px-2 py-1 text-xs bg-teal-600 dark:bg-orange-600 text-white rounded hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.editStudent.save')}</button>
                            <button onClick={handleCancelEdit} className="px-2 py-1 text-xs bg-slate-200 dark:bg-gray-600 rounded hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.editStudent.cancel')}</button>
                        </div>
                    </td>
                </tr>
            );
        case 'Tafsir (Reading)':
        case 'Tafsir (Hifdh)':
             return (
                <tr className="bg-indigo-50 dark:bg-indigo-900/60">
                    <td className="p-2 text-sm text-slate-800 dark:text-slate-300">{new Date(log.date).toLocaleDateString()}</td>
                    <td className="p-2 text-sm text-slate-800 dark:text-slate-300">{log.type}</td>
                    <td className="p-2 text-sm">
                        <select value={log.surah} onChange={e => setEditingLogData({...log, surah: Number(e.target.value)})} className={inputClasses}>
                            {quranMetadata.map(s => <option key={s.number} value={s.number}>{s.number}. {s.name}</option>)}
                        </select>
                    </td>
                    <td className="p-2 text-sm">
                         <QualityScoreInput value={log.reviewQuality} onChange={val => setEditingLogData({...log, reviewQuality: val})} />
                    </td>
                     <td className="p-2 text-sm">
                        <div className="flex gap-2">
                            <button onClick={handleSaveEdit} className="px-3 py-1 text-xs bg-teal-600 dark:bg-orange-600 text-white rounded hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.editStudent.save')}</button>
                            <button onClick={handleCancelEdit} className="px-3 py-1 text-xs bg-slate-200 dark:bg-gray-600 rounded hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.editStudent.cancel')}</button>
                        </div>
                    </td>
                </tr>
            );
        case 'Attendance':
            return (
                <tr className="bg-yellow-50 dark:bg-yellow-900/60">
                     <td className="p-2 text-sm text-slate-800 dark:text-slate-300">{new Date(log.date).toLocaleDateString()}</td>
                     <td className="p-2 text-sm text-slate-800 dark:text-slate-300">{log.type}</td>
                     <td className="p-2 text-sm text-slate-800 dark:text-slate-300">-</td>
                     <td className="p-2 text-sm">
                         <select value={log.status} onChange={e => setEditingLogData({...log, status: e.target.value as AttendanceStatus})} className={inputClasses}>
                             {Object.values(AttendanceStatus).map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                     </td>
                     <td className="p-2 text-sm">
                         <div className="flex gap-2">
                            <button onClick={handleSaveEdit} className="px-3 py-1 text-xs bg-teal-600 dark:bg-orange-600 text-white rounded hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.editStudent.save')}</button>
                            <button onClick={handleCancelEdit} className="px-3 py-1 text-xs bg-slate-200 dark:bg-gray-600 rounded hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.editStudent.cancel')}</button>
                        </div>
                     </td>
                </tr>
            )
        default: return null;
    }
  }


  if (!isOpen) return null;

  return (
    <>
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-slate-50 dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-5xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex-shrink-0 flex justify-between items-center mb-4 pb-4 border-b dark:border-gray-700">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('modals.editStudent.title', { name: student.name })}</h2>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white text-3xl">&times;</button>
                </div>
                
                <div className="flex-shrink-0 border-b border-slate-200 dark:border-gray-700 mb-4">
                    <div className="flex space-x-4">
                        <button onClick={() => setActiveTab('info')} className={`py-2 px-4 text-sm font-medium ${activeTab === 'info' ? 'border-b-2 border-teal-500 dark:border-orange-500 text-teal-600 dark:text-orange-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{t('modals.editStudent.infoTab')}</button>
                        <button onClick={() => setActiveTab('logbook')} className={`py-2 px-4 text-sm font-medium ${activeTab === 'logbook' ? 'border-b-2 border-teal-500 dark:border-orange-500 text-teal-600 dark:text-orange-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{t('modals.editStudent.logbookTab')}</button>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto pe-2">
                    {activeTab === 'info' && (
                        <form onSubmit={handleInfoSubmit} className="p-4">
                            <div className="space-y-6">
                                <div>
                                    <label htmlFor="student-name-edit" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('modals.editStudent.nameLabel')}</label>
                                    <input type="text" id="student-name-edit" value={name} onChange={(e) => setName(e.target.value)} className="block w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm" />
                                </div>
                                <div>
                                    <label htmlFor="student-dob-edit" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('modals.editStudent.dobLabel')}</label>
                                    <div className="relative mt-1">
                                        <input type="date" id="student-dob-edit" value={dob} onChange={(e) => setDob(e.target.value)} className="block w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm pe-10" />
                                        <div className="absolute inset-y-0 right-0 flex items-center pe-3 pointer-events-none">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18M-4.5 12.75h22.5" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8 flex justify-end gap-4">
                                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.editStudent.cancel')}</button>
                                <button type="submit" className="px-6 py-2 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.editStudent.save')}</button>
                            </div>
                            <div className="mt-12 pt-6 border-t border-red-200 dark:border-red-900/50">
                                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">{t('modals.editStudent.dangerZone')}</h3>
                                <div className="mt-4 flex justify-between items-center bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                                    <div>
                                        <p className="font-medium text-slate-800 dark:text-slate-100">{t('modals.editStudent.deleteTitle')}</p>
                                        <p className="text-sm text-slate-600 dark:text-slate-400">{t('modals.editStudent.deleteDesc')}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleDeleteStudentRequest}
                                        className="px-4 py-2 bg-red-600 text-white font-semibold rounded-md shadow-sm hover:bg-red-700"
                                    >
                                        {t('modals.editStudent.deleteButton')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}

                    {activeTab === 'logbook' && (
                        <div className="p-2">
                            <table className="w-full border-collapse text-left">
                                <thead className="border-b-2 border-slate-200 dark:border-gray-700">
                                    <tr>
                                        <th className="p-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t('modals.editStudent.logDate')}</th>
                                        <th className="p-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t('modals.editStudent.logType')}</th>
                                        <th className="p-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t('modals.editStudent.logDetails')}</th>
                                        <th className="p-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t('modals.editStudent.logScore')}</th>
                                        <th className="p-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t('modals.editStudent.logActions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allLogs.map(log => 
                                        editingLogId === log.id ? (
                                            renderEditRow()
                                        ) : (
                                            <tr key={log.id} className="odd:bg-white even:bg-slate-50 dark:odd:bg-gray-800 dark:even:bg-gray-800/50 hover:bg-slate-100 dark:hover:bg-gray-700">
                                                <td className="p-2 text-sm text-slate-700 dark:text-slate-300">{new Date(log.date).toLocaleDateString()}</td>
                                                <td className="p-2 text-sm text-slate-700 dark:text-slate-300">{log.type}</td>
                                                <td className="p-2 text-sm text-slate-700 dark:text-slate-300">{renderLogDetails(log)}</td>
                                                <td className="p-2 text-sm text-slate-700 dark:text-slate-300">{renderScoreStatus(log)}</td>
                                                <td className="p-2 text-sm text-slate-700 dark:text-slate-300">
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleEditClick(log)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{t('modals.editStudent.edit')}</button>
                                                        <button onClick={() => handleDeleteLogRequest(log.type, log.id)} className="text-xs text-red-600 dark:text-red-400 hover:underline">{t('modals.editStudent.deleteLog')}</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                            {allLogs.length === 0 && <p className="text-center italic text-slate-500 dark:text-slate-400 py-8">{t('modals.editStudent.noLogs')}</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
        <ConfirmationModal 
            isOpen={confirmModalState.isOpen}
            onClose={() => setConfirmModalState({ ...confirmModalState, isOpen: false })}
            onConfirm={confirmModalState.onConfirm}
            title={confirmModalState.title}
            message={confirmModalState.message}
        />
    </>
  );
};

export default EditStudentDataModal;