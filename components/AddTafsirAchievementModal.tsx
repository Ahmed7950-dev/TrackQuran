import React, { useState, useMemo, useEffect } from 'react';
import { SurahMetadata } from '../types';
import QualityScoreInput from './QualityScoreInput';
import { useI18n } from '../context/I18nProvider';

interface TafsirReviewItem {
  id: string;
  surah: number;
  quality: number | '';
}

interface AddTafsirAchievementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTafsirReviews: (reviews: Array<{ surah: number, quality: number }>) => void;
  quranMetadata: SurahMetadata[];
}

const AddTafsirAchievementModal: React.FC<AddTafsirAchievementModalProps> = ({ isOpen, onClose, onAddTafsirReviews, quranMetadata }) => {
  const [reviews, setReviews] = useState<TafsirReviewItem[]>([]);
  const { t } = useI18n();

  useEffect(() => {
    // Reset the form when the modal is opened
    if (isOpen) {
      setReviews([]);
    }
  }, [isOpen]);

  const selectedSurahs = useMemo(() => new Set(reviews.map(r => r.surah)), [reviews]);

  const handleAddRow = () => {
    const firstAvailable = quranMetadata.find(s => !selectedSurahs.has(s.number));
    if (firstAvailable) {
      const newReview: TafsirReviewItem = {
        id: `new-tafsir-${Date.now()}`,
        surah: firstAvailable.number,
        quality: '',
      };
      setReviews([...reviews, newReview]);
    }
  };

  const handleUpdateReview = (id: string, field: 'surah' | 'quality', value: number | '') => {
    setReviews(reviews.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  
  const handleRemoveReview = (id: string) => {
    setReviews(reviews.filter(r => r.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reviews.some(r => r.quality === '')) {
      alert(t('modals.addTafsir.errorQuality'));
      return;
    }
    if (reviews.length > 0) {
      const formattedReviews = reviews.map(({ surah, quality }) => ({ surah, quality: quality as number }));
      onAddTafsirReviews(formattedReviews);
      setReviews([]);
    }
  };

  if (!isOpen) return null;
  
  const buttonText = reviews.length > 1 
    ? t('modals.addTafsir.button', { count: reviews.length })
    : t('modals.addTafsir.buttonSingle');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {t('modals.addTafsir.title')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white">
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
            <div className="space-y-3 max-h-80 overflow-y-auto p-1 pe-3">
                {reviews.length > 0 ? reviews.map((review) => (
                <div key={review.id} className="flex items-end gap-3 bg-slate-50 dark:bg-gray-700/50 p-3 rounded-lg animate-fade-in">
                    <div className="flex-grow">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('modals.addTafsir.surah')}</label>
                        <select
                            value={review.surah}
                            onChange={(e) => handleUpdateReview(review.id, 'surah', Number(e.target.value))}
                            className="mt-1 block w-full bg-white dark:bg-gray-700 dark:text-white rounded-md border-slate-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                            <option value={review.surah}>{quranMetadata.find(s=>s.number === review.surah)?.name}</option>
                            {quranMetadata.filter(s => !selectedSurahs.has(s.number)).map(s => (
                                <option key={s.number} value={s.number}>
                                    {s.number}. {s.name} ({s.transliteratedName})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="w-48 flex-shrink-0">
                        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{t('modals.addTafsir.quality')}</label>
                        <QualityScoreInput value={review.quality} onChange={(q) => handleUpdateReview(review.id, 'quality', q)} />
                    </div>
                    <button type="button" onClick={() => handleRemoveReview(review.id)} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors h-10 w-10 flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 4.811 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.067-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                </div>
                )) : (
                <div className="text-center text-slate-500 dark:text-slate-400 py-12">
                    <p>{t('modals.addTafsir.noReviews')}</p>
                </div>
                )}
            </div>
            <div className="mt-4 pt-4 border-t dark:border-gray-700">
                <button type="button" onClick={handleAddRow} disabled={reviews.length >= quranMetadata.length} className="w-full px-4 py-2 border-2 border-dashed border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 hover:border-slate-400 dark:hover:border-gray-500 transition-all disabled:opacity-50">
                    {t('modals.addTafsir.addSurah')}
                </button>
            </div>
            <div className="flex justify-end gap-3 pt-4 mt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.common.cancel')}</button>
                <button type="submit" disabled={reviews.length === 0} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:dark:bg-indigo-800/50">{buttonText}</button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default AddTafsirAchievementModal;
