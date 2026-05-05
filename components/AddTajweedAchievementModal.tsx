import React, { useState } from 'react';
import ManageTajweedRulesModal from './ManageTajweedRulesModal';
import { useI18n } from '../context/I18nProvider';

interface AddTajweedAchievementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddTajweedRules: (rules: string[]) => void;
  studentMasteredRules: string[];
  allTajweedRules: string[];
  onUpdateTajweedRules: (rules: string[]) => void;
}

const AddTajweedAchievementModal: React.FC<AddTajweedAchievementModalProps> = ({ isOpen, onClose, onAddTajweedRules, studentMasteredRules, allTajweedRules, onUpdateTajweedRules }) => {
  const [selectedRules, setSelectedRules] = useState<string[]>([]);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const { t } = useI18n();

  if (!isOpen) return null;

  const availableRules = allTajweedRules.filter(rule => !studentMasteredRules.includes(rule));

  const handleToggleRule = (rule: string) => {
    setSelectedRules(prev => 
      prev.includes(rule) ? prev.filter(r => r !== rule) : [...prev, rule]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRules.length > 0) {
      onAddTajweedRules(selectedRules);
      setSelectedRules([]);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('modals.addTajweed.title')}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
          </div>
          <form onSubmit={handleSubmit}>
              {availableRules.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pe-2">
                      {availableRules.map(rule => (
                          <label key={rule} className="flex items-center p-2 rounded-md hover:bg-slate-50 dark:hover:bg-gray-700 cursor-pointer bg-white dark:bg-gray-800">
                              <input
                                  type="checkbox"
                                  checked={selectedRules.includes(rule)}
                                  onChange={() => handleToggleRule(rule)}
                                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-500 text-teal-600 dark:text-orange-600 focus:ring-teal-500 dark:focus:ring-orange-500 bg-gray-100 dark:bg-gray-900"
                              />
                              <span className="ms-3 text-sm text-slate-700 dark:text-slate-300">{rule}</span>
                          </label>
                      ))}
                  </div>
              ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-center italic my-4">{t('modals.addTajweed.allMastered')}</p>
              )}
              <div className="flex justify-between items-center gap-3 pt-4 mt-4 border-t dark:border-gray-700">
                  <button type="button" onClick={() => setIsManageModalOpen(true)} className="text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-500">{t('modals.addTajweed.manageRules')}</button>
                  <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500">{t('modals.common.cancel')}</button>
                    <button type="submit" disabled={selectedRules.length === 0} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-300 disabled:dark:bg-blue-800/50">{t('modals.addTajweed.button')}</button>
                  </div>
              </div>
          </form>
        </div>
      </div>
      <ManageTajweedRulesModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        rules={allTajweedRules}
        onUpdateRules={onUpdateTajweedRules}
      />
    </>
  );
};

export default AddTajweedAchievementModal;
