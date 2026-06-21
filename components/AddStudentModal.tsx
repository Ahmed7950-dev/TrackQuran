import React, { useState } from 'react';
import { AgeCategory } from '../types';
import { useI18n } from '../context/I18nProvider';
import StudentBillingFields, { StudentBilling } from './StudentBillingFields';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddStudent: (name: string, dob: string, ageCategory: AgeCategory, billing: StudentBilling) => void;
}

const AGE_CATEGORIES: { value: AgeCategory; label: string; range: string; emoji: string }[] = [
  { value: 'young_gems',        label: 'Young Gems',        range: 'Ages 4–15',  emoji: '⭐' },
  { value: 'aspiring_scholars', label: 'Aspiring Scholars', range: 'Ages 16–35', emoji: '📚' },
  { value: 'devoted_learners',  label: 'Devoted Learners',  range: 'Ages 36+',   emoji: '🌿' },
];

/** Derive an age category from a date-of-birth string. */
const categoryFromDob = (dob: string): AgeCategory => {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age <= 15) return 'young_gems';
  if (age <= 35) return 'aspiring_scholars';
  return 'devoted_learners';
};

const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, onAddStudent }) => {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [manualCategory, setManualCategory] = useState<AgeCategory>('young_gems');
  const [billing, setBilling] = useState<StudentBilling>({ studentType: 'preply', preplyPercentage: 18 });
  const [error, setError] = useState('');
  const { t } = useI18n();

  if (!isOpen) return null;

  // Effective category: auto-derived from DOB if provided, manual otherwise
  const effectiveCategory: AgeCategory = dob ? categoryFromDob(dob) : manualCategory;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter the student's name.");
      return;
    }
    setError('');
    onAddStudent(name.trim(), dob, effectiveCategory, billing);
    setName('');
    setDob('');
    setManualCategory('young_gems');
    setBilling({ studentType: 'preply', preplyPercentage: 18 });
  };

  const handleClose = () => {
    setName('');
    setDob('');
    setManualCategory('young_gems');
    setBilling({ studentType: 'preply', preplyPercentage: 18 });
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t('modals.addStudent.title')}</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="student-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('modals.addStudent.nameLabel')}
            </label>
            <input
              type="text"
              id="student-name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md shadow-sm placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500 sm:text-sm dark:text-white"
              placeholder={t('modals.addStudent.namePlaceholder')}
            />
          </div>

          {/* Date of Birth — optional */}
          <div>
            <label htmlFor="student-dob" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t('modals.addStudent.dobLabel')}
              <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="date"
                id="student-dob"
                value={dob}
                onChange={e => setDob(e.target.value)}
                className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500 sm:text-sm dark:text-white pe-10"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pe-3 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" />
                </svg>
              </div>
            </div>
            {dob && (
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                Age category auto-detected: <strong>{AGE_CATEGORIES.find(c => c.value === effectiveCategory)?.label}</strong>
              </p>
            )}
          </div>

          {/* Age Category */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Age Category
              {dob
                ? <span className="ml-1 text-xs font-normal text-slate-400">(auto-set from date of birth)</span>
                : <span className="ml-1 text-xs font-normal text-slate-400">(select manually)</span>
              }
            </label>
            <div className="grid grid-cols-3 gap-2">
              {AGE_CATEGORIES.map(cat => {
                const isSelected = effectiveCategory === cat.value;
                const isLocked = !!dob;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    disabled={isLocked}
                    onClick={() => !isLocked && setManualCategory(cat.value)}
                    className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-center transition-all
                      ${isSelected
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 dark:border-teal-400'
                        : 'border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-teal-300 dark:hover:border-teal-600'}
                      ${isLocked ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
                  >
                    <span className="text-xl">{cat.emoji}</span>
                    <span className={`text-xs font-semibold leading-tight ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-slate-700 dark:text-slate-300'}`}>
                      {cat.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{cat.range}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Billing & scheduling (tutor-only) */}
          <StudentBillingFields value={billing} onChange={setBilling} />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500"
            >
              {t('modals.common.cancel')}
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-md shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-orange-500"
            >
              {t('modals.addStudent.button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddStudentModal;
