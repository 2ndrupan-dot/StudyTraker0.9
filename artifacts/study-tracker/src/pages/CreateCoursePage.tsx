import React, { useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { useLang } from '@/context/LangContext';
import { BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input, Button } from '@/components/ui';

export function CreateCoursePage() {
  const { createCourse, courses } = useCourse();
  const { t, lang, setLang } = useLang();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isFirst = courses.length === 0;

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('courseNameRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await createCourse(name.trim());
    } catch {
      setError(t('registerError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] max-w-md mx-auto bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-br from-primary/20 to-accent/40 rounded-b-[40px] -z-10" />

      <div className="flex-1 px-6 pt-16 pb-8 flex flex-col">
        <div className="flex justify-center mb-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="w-20 h-20 bg-white shadow-xl rounded-3xl flex items-center justify-center border border-white/50 rotate-3"
          >
            <BookOpen size={40} className="text-primary -rotate-3" />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-4"
        >
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isFirst ? t('courseWelcome') : t('addCourse')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {isFirst ? t('courseWelcomeDesc') : t('courseWelcomeDescExtra')}
          </p>
        </motion.div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm border border-border/40 rounded-full px-3 py-1.5 shadow-sm"
          >
            <span className={`text-xs font-bold transition-colors ${lang === 'en' ? 'text-primary' : 'text-muted-foreground'}`}>ENG</span>
            <div className="relative w-8 h-4 bg-secondary rounded-full mx-0.5">
              <div
                className="absolute top-0.5 w-3 h-3 bg-primary rounded-full shadow-sm transition-all duration-200"
                style={{ left: lang === 'en' ? '2px' : '18px' }}
              />
            </div>
            <span className={`text-xs font-bold transition-colors ${lang === 'bn' ? 'text-primary' : 'text-muted-foreground'}`}>বাংলা</span>
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="bg-card rounded-3xl p-6 shadow-xl border border-border/50"
        >
          <p className="text-sm font-semibold text-foreground mb-2">{t('courseName')}</p>
          <Input
            placeholder={t('courseNamePlaceholder')}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />
          {error && (
            <p className="text-destructive text-sm mt-2 text-center font-medium bg-destructive/10 py-2 rounded-lg px-3">
              {error}
            </p>
          )}
          <Button
            className="w-full mt-4 py-4 text-base shadow-primary/25 shadow-lg"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? '...' : t('createCourseBtn')}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
