import React, { useState, useEffect } from 'react';
import { SurahMetadata, RecitationAchievement, MemorizationAchievement } from '../types';
import QualityScoreInput from './QualityScoreInput';
import { useI18n } from '../context/I18nProvider';

type LogType = 'reading' | 'memorization';

interface AddRecitationAchievementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAchievement: (
    achievement: (Omit<RecitationAchievement, 'id' | 'pagesCompleted' | 'versesCompleted'> & { type: 'reading' }) | 
                 (Omit<MemorizationAchievement, 'id' | 'pagesCompleted' | 'versesCompleted'> & { type: 'memorization' })
  ) => void;
  quranMetadata: SurahMetadata[];
}

const toISODateString = (date: Date) => {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

const AddRecitationAchievementModal: React.FC<AddRecitationAchievementModalProps> = ({ isOpen, onClose, onAddAchievement, quranMetadata }) => {
  const [logType, setLogType] = useState<LogType>('reading');
  const [date, setDate] = useState(toISODateString(new Date()));
  const [startSurah, setStartSurah] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [endSurah, setEndSurah] = useState(1);
  const [endAyah, setEndAyah] = useState(1);
  const [readingQuality, setReadingQuality] = useState<number | ''>('');
  const [tajweedQuality, setTajweedQuality] = useState<number | ''>('');
  const [memorizationQuality, setMemorizationQuality] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const { t } = useI18n();

  const startSurahMeta = quranMetadata.find(s => s.number === startSurah);
  const endSurahMeta = quranMetadata.find(s => s.number === endSurah);
  
  useEffect(() => {
    if (startSurah > endSurah) {
        setEndSurah(startSurah);
    }
  }, [startSurah, endSurah]);
  
  useEffect(() => {
      // Reset state when modal opens
      if (isOpen) {
          setLogType('reading');
          setDate(toISODateString(new Date()));
          setStartSurah(1);
          setStartAyah(1);
          setEndSurah(1);
          setEndAyah(1);
          setReadingQuality('');
          setTajweedQuality('');
          setMemorizationQuality('');
          setNotes('');
          setError('');
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if ((logType === 'reading' && (readingQuality === '' || tajweedQuality === '')) || (logType === 'memorization' && memorizationQuality === '')) {
        setError(t('modals.addAchievement.errorQuality'));
        return;
    }

    if (!startSurahMeta || !endSurahMeta || !startAyah || !endAyah || !date) {
        setError(t('modals.addAchievement.errorFields'));
        return;
    }
    if (startAyah > startSurahMeta.numberOfAyahs || startAyah < 1) {
        setError(t('modals.addAchievement.errorStartAyah', { max: startSurahMeta.numberOfAyahs }));
        return;
    }
    if (endAyah > endSurahMeta.numberOfAyahs || endAyah < 1) {
        setError(t('modals.addAchievement.errorEndAyah', { max: endSurahMeta.numberOfAyahs }));
        return;
    }
    if (startSurah === endSurah && startAyah > endAyah) {
        setError(t('modals.addAchievement.errorAyahOrder'));
        return;
    }

    const commonData = { date: new Date(date).toISOString(), startSurah, startAyah, endSurah, endAyah, notes };

    if (logType === 'reading') {
        onAddAchievement({
            ...commonData,
            readingQuality: readingQuality as number, 
            tajweedQuality: tajweedQuality as number,
            type: 'reading'
        });
    } else {
        onAddAchievement({
            ...commonData,
            memorizationQuality: memorizationQuality as number,
            type: 'memorization'
        });
    }
  };
  
  const inputBaseClasses = "mt-1 block w-full bg-white dark:bg-gray-700 dark:text-white rounded-md border-slate-300 dark:border-gray-600 shadow-sm focus:border-teal-500 focus:ring-teal-500 dark:focus:border-orange-500 dark:focus:ring-orange-500";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('modals.addAchievement.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
        </div>
        
        <div className="mb-4 p-1 bg-slate-100 dark:bg-gray-700 rounded-lg flex gap-1">
            <button onClick={() => setLogType('reading')} className={`w-1/2 py-2 rounded-md text-sm font-semibold transition-colors ${logType === 'reading' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300'}`}>{t('modals.addAchievement.reading')}</button>
            <button onClick={() => setLogType('memorization')} className={`w-1/2 py-2 rounded-md text-sm font-semibold transition-colors ${logType === 'memorization' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300'}`}>{t('modals.addAchievement.memorization')}</button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.date')}</label>
                <div className="relative mt-1">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inputBaseClasses} pe-10`} />
                    <div className="absolute inset-y-0 right-0 flex items-center pe-3 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18M-4.5 12.75h22.5" />
                        </svg>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.from')}</label>
                    <select value={startSurah} onChange={e => setStartSurah(Number(e.target.value))} className={inputBaseClasses}>
                        {quranMetadata.map(s => <option key={s.number} value={s.number}>{s.number}. {s.name} ({s.transliteratedName})</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.ayah')}</label>
                    <input type="number" value={startAyah} onChange={e => setStartAyah(Number(e.target.value))} min="1" max={startSurahMeta?.numberOfAyahs} className={inputBaseClasses} />
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.to')}</label>
                    <select value={endSurah} onChange={e => setEndSurah(Number(e.target.value))} className={inputBaseClasses}>
                        {quranMetadata.filter(s => s.number >= startSurah).map(s => <option key={s.number} value={s.number}>{s.number}. {s.name} ({s.transliteratedName})</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.ayah')}</label>
                    <input type="number" value={endAyah} onChange={e => setEndAyah(Number(e.target.value))} min="1" max={endSurahMeta?.numberOfAyahs} className={inputBaseClasses} />
                </div>
            </div>

            {logType === 'reading' ? (
                <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.readingQuality')}</label>
                        <QualityScoreInput value={readingQuality} onChange={setReadingQuality} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.tajweedQuality')}</label>
                        <QualityScoreInput value={tajweedQuality} onChange={setTajweedQuality} />
                    </div>
                </div>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.hifdhQuality')}</label>
                    <QualityScoreInput value={memorizationQuality} onChange={setMemorizationQuality} />
                </div>
            )}
            
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addAchievement.notes')}</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inputBaseClasses} placeholder={t('modals.addAchievement.notesPlaceholder')}></textarea>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.common.cancel')}</button>
                <button type="submit" className="px-6 py-2 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.addAchievement.button')}</button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default AddRecitationAchievementModal;
