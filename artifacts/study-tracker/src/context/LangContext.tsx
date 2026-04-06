import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations } from '@/lib/translations';

interface LangContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('@study_lang') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'bn')) {
      setLangState(savedLang);
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('@study_lang', newLang);
  };

  const t = (key: keyof typeof translations['en']) => {
    return translations[lang][key] || translations['en'][key] || key;
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LangContext);
  if (!context) throw new Error('useLang must be used within LangProvider');
  return context;
}
