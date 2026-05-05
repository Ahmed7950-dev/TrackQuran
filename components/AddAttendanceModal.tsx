import React, { useState, useEffect } from 'react';
import { AttendanceStatus, AttendanceRecord } from '../types';
import { useI18n } from '../context/I18nProvider';

interface AddAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddAttendance: (record: Omit<AttendanceRecord, 'id'>) => void;
}

const toISODateString = (date: Date) => {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

const AddAttendanceModal: React.FC<AddAttendanceModalProps> = ({ isOpen, onClose, onAddAttendance }) => {
  const [status, setStatus] = useState<AttendanceStatus>(AttendanceStatus.Absent);
  const [dateType, setDateType] = useState<'today' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(toISODateString(new Date()));
  const [error, setError] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    if (isOpen) {
      setStatus(AttendanceStatus.Absent);
      setDateType('today');
      setCustomDate(toISODateString(new Date()));
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let finalDate = new Date();
    if (dateType === 'custom') {
      if (!customDate) {
        setError(t('modals.addAttendance.errorDate'));
        return;
      }
      finalDate = new Date(customDate);
    }
    
    // Normalize date to avoid timezone issues when comparing dates later
    finalDate.setUTCHours(12,0,0,0); 

    onAddAttendance({
      date: finalDate.toISOString(),
      status: status,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('modals.addAttendance.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('modals.addAttendance.status')}</label>
              <div className="flex gap-4">
                <button type="button" onClick={() => setStatus(AttendanceStatus.Absent)} className={`flex-1 py-3 px-4 text-sm font-semibold rounded-lg border-2 ${status === AttendanceStatus.Absent ? 'bg-red-50 dark:bg-red-900/50 border-red-500 text-red-600 dark:text-red-300' : 'bg-slate-50 dark:bg-gray-700 border-transparent text-slate-600 dark:text-slate-300'}`}>{t('modals.addAttendance.absent')}</button>
                <button type="button" onClick={() => setStatus(AttendanceStatus.Rescheduled)} className={`flex-1 py-3 px-4 text-sm font-semibold rounded-lg border-2 ${status === AttendanceStatus.Rescheduled ? 'bg-orange-50 dark:bg-orange-900/50 border-orange-500 text-orange-600 dark:text-orange-300' : 'bg-slate-50 dark:bg-gray-700 border-transparent text-slate-600 dark:text-slate-300'}`}>{t('modals.addAttendance.reschedule')}</button>
              </div>
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('modals.addAttendance.date')}</label>
              <div className="flex gap-4">
                <label className={`flex-1 cursor-pointer p-3 rounded-lg border text-center ${dateType === 'today' ? 'bg-teal-50 dark:bg-orange-900/50 border-teal-500 dark:border-orange-500' : 'bg-white dark:bg-gray-700'}`}>
                    <input type="radio" name="dateType" value="today" checked={dateType === 'today'} onChange={() => setDateType('today')} className="sr-only" />
                    {t('modals.addAttendance.today')}
                </label>
                <label className={`flex-1 cursor-pointer p-3 rounded-lg border text-center ${dateType === 'custom' ? 'bg-teal-50 dark:bg-orange-900/50 border-teal-500 dark:border-orange-500' : 'bg-white dark:bg-gray-700'}`}>
                    <input type="radio" name="dateType" value="custom" checked={dateType === 'custom'} onChange={() => setDateType('custom')} className="sr-only" />
                    {t('modals.addAttendance.custom')}
                </label>
              </div>
            </div>
            {dateType === 'custom' && (
              <div className="relative">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500 sm:text-sm dark:text-white pe-10"
                />
                <div className="absolute inset-y-0 right-0 flex items-center pe-3 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18M-4.5 12.75h22.5" />
                    </svg>
                </div>
              </div>
            )}
          </div>
           {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500"
            >
              {t('modals.common.cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-orange-500"
            >
              {t('modals.addAttendance.button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAttendanceModal;
