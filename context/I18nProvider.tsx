import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import enTranslations from '../i18n/locales/en.json';
import arTranslations from '../i18n/locales/ar.json';

type Language = 'en' | 'ar';
// Using a more generic type for translations loaded from JSON
type TranslationMap = { [key: string]: string | TranslationMap };
type Translations = { [key in Language]?: TranslationMap };


interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, options?: { [key: string]: string | number }) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const getInitialLanguage = (): Language => {
    if (typeof window !== 'undefined') {
        const storedLang = localStorage.getItem('language');
        if (storedLang === 'en' || storedLang === 'ar') {
            return storedLang;
        }
        const browserLang = navigator.language.split('-')[0];
        if (browserLang === 'ar') {
            return 'ar';
        }
    }
    return 'en';
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [language, setLanguageState] = useState<Language>(getInitialLanguage());
    const translations: Translations = {
        en: enTranslations as TranslationMap,
        ar: arTranslations as TranslationMap,
    };
    const isLoading = false;

    useEffect(() => {
        localStorage.setItem('language', language);
        document.documentElement.lang = language;
        document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }, [language]);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
    };

    const t = useCallback((key: string, options?: { [key: string]: string | number }): string => {
        const langTranslations = translations[language];
        if (!langTranslations) {
            return key; // Return key if translations for the language are not loaded yet
        }
        const keys = key.split('.');
        let result: any = langTranslations;
        for (const k of keys) {
            result = result?.[k];
            if (result === undefined) {
                console.warn(`Translation key not found: ${key}`);
                return key;
            }
        }

        if (typeof result === 'string' && options) {
            return Object.entries(options).reduce((str, [key, value]) => {
                return str.replace(`{{${key}}}`, String(value));
            }, result);
        }

        return result;
    }, [language, translations]);

    if (isLoading) {
        return null; // Or a loading spinner, but null is fine to prevent rendering with missing text
    }

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = (): I18nContextType => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};
