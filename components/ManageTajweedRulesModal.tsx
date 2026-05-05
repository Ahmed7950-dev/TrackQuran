import React, { useState } from 'react';
import { useI18n } from '../context/I18nProvider';

interface ManageTajweedRulesModalProps {
    isOpen: boolean;
    onClose: () => void;
    rules: string[];
    onUpdateRules: (rules: string[]) => void;
}

const ManageTajweedRulesModal: React.FC<ManageTajweedRulesModalProps> = ({ isOpen, onClose, rules, onUpdateRules }) => {
    const [newRule, setNewRule] = useState('');
    const [editingRule, setEditingRule] = useState<{ index: number; text: string } | null>(null);
    const { t } = useI18n();

    if (!isOpen) return null;

    const handleAddRule = () => {
        if (newRule.trim() && !rules.includes(newRule.trim())) {
            onUpdateRules([...rules, newRule.trim()]);
            setNewRule('');
        }
    };

    const handleDeleteRule = (index: number) => {
        onUpdateRules(rules.filter((_, i) => i !== index));
    };

    const handleUpdateRule = () => {
        if (editingRule && editingRule.text.trim()) {
            const updatedRules = [...rules];
            updatedRules[editingRule.index] = editingRule.text.trim();
            onUpdateRules(updatedRules);
            setEditingRule(null);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('modals.manageTajweed.title')}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pe-2 mb-4">
                    {rules.map((rule, index) => (
                        <div key={index} className="flex items-center justify-between bg-slate-50 dark:bg-gray-700/50 p-2 rounded-md">
                           {editingRule?.index === index ? (
                                <input 
                                    type="text"
                                    value={editingRule.text}
                                    onChange={(e) => setEditingRule({...editingRule, text: e.target.value})}
                                    className="flex-grow bg-white dark:bg-gray-700 dark:text-white border border-teal-500 dark:border-orange-500 rounded-md px-2 py-1 text-sm"
                                />
                           ) : (
                                <span className="text-sm text-slate-800 dark:text-slate-200">{rule}</span>
                           )}
                           <div className="flex items-center gap-2 ms-2">
                               {editingRule?.index === index ? (
                                    <button onClick={handleUpdateRule} className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">{t('modals.manageTajweed.save')}</button>
                               ) : (
                                    <button onClick={() => setEditingRule({ index, text: rule })} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs">{t('modals.manageTajweed.edit')}</button>
                               )}
                                <button onClick={() => handleDeleteRule(index)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs">{t('modals.manageTajweed.delete')}</button>
                           </div>
                        </div>
                    ))}
                </div>

                <div className="flex gap-2 pt-4 border-t dark:border-gray-700">
                    <input
                        type="text"
                        value={newRule}
                        onChange={(e) => setNewRule(e.target.value)}
                        placeholder={t('modals.manageTajweed.placeholder')}
                        className="flex-grow w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm"
                    />
                    <button onClick={handleAddRule} className="px-4 py-2 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-md hover:bg-teal-700 dark:hover:bg-orange-700">{t('modals.manageTajweed.button')}</button>
                </div>
            </div>
        </div>
    );
};

export default ManageTajweedRulesModal;
