import React from 'react';
import { useI18n } from '../context/I18nProvider';

const Footer: React.FC = () => {
    const { language, setLanguage, t } = useI18n();

    return (
        <footer className="bg-white dark:bg-gray-800 shadow-inner mt-8">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center text-sm text-slate-600 dark:text-slate-400 gap-4">
                <p>&copy; {new Date().getFullYear()} {t('header.title')}. {t('footer.madeWithLove')}</p>
                <div className="flex items-center gap-2">
                    <span className="font-semibold">{t('footer.language')}:</span>
                    <div className="p-1 bg-slate-100 dark:bg-gray-700 rounded-lg flex gap-1">
                        <button 
                            onClick={() => setLanguage('en')}
                            className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${language === 'en' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                            EN
                        </button>
                        <button
                            onClick={() => setLanguage('ar')}
                            className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${language === 'ar' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                            AR
                        </button>
                        <button
                            onClick={() => setLanguage('tr')}
                            className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${language === 'tr' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300'}`}
                        >
                            TR
                        </button>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
