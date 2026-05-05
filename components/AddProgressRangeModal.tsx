import React, { useState, useEffect } from 'react';
import { Student, ProgressRange } from '../types';
import { QURAN_METADATA } from '../constants';
import { useI18n } from '../context/I18nProvider';

interface AddProgressRangeModalProps {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (range: Omit<ProgressRange, 'id'>) => void;
}

const AddProgressRangeModal: React.FC<AddProgressRangeModalProps> = ({ student, isOpen, onClose, onAdd }) => {
  const { t } = useI18n();
  const [startSurah, setStartSurah] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [endSurah, setEndSurah] = useState(1);
  const [endAyah, setEndAyah] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStartSurah(1);
      setStartAyah(1);
      setEndSurah(1);
      setEndAyah(1);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const startSurahMeta = QURAN_METADATA.find(s => s.number === startSurah);
  const endSurahMeta = QURAN_METADATA.find(s => s.number === endSurah);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!startSurahMeta || !endSurahMeta) {
      setError(t('modals.addRange.errorInvalidSurah'));
      return;
    }
    if (startSurah > endSurah || (startSurah === endSurah && startAyah > endAyah)) {
      setError(t('modals.addRange.errorEndPoint'));
      return;
    }

    onAdd({
      start: { surah: startSurah, ayah: startAyah },
      end: { surah: endSurah, ayah: endAyah },
    });
    onClose();
  };
  
  const inputBaseClasses = "mt-1 block w-full bg-white dark:bg-gray-700 dark:text-white rounded-md border-slate-300 dark:border-gray-600 shadow-sm focus:border-teal-500 focus:ring-teal-500 dark:focus:border-orange-500 dark:focus:ring-orange-500";


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('modals.addRange.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addRange.fromSurah')}</label>
              <select value={startSurah} onChange={e => setStartSurah(Number(e.target.value))} className={inputBaseClasses}>
                {QURAN_METADATA.map(s => <option key={s.number} value={s.number}>{s.number}. {s.transliteratedName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addRange.fromAyah')}</label>
              <input type="number" value={startAyah} onChange={e => setStartAyah(Number(e.target.value))} min="1" max={startSurahMeta?.numberOfAyahs} className={inputBaseClasses} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addRange.toSurah')}</label>
              <select value={endSurah} onChange={e => setEndSurah(Number(e.target.value))} className={inputBaseClasses}>
                {QURAN_METADATA.filter(s => s.number >= startSurah).map(s => <option key={s.number} value={s.number}>{s.number}. {s.transliteratedName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('modals.addRange.toAyah')}</label>
              <input type="number" value={endAyah} onChange={e => setEndAyah(Number(e.target.value))} min="1" max={endSurahMeta?.numberOfAyahs} className={inputBaseClasses} />
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.common.cancel')}</button>
            <button type="submit" className="px-6 py-2 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.addRange.button')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProgressRangeModal;