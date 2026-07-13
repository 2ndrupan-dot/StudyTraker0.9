import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen } from 'lucide-react';

const SEEN_KEY = '@study_splash_seen_session';

/**
 * Animated launch splash screen (mobile and desktop).
 * Sequence: logo slides up from the bottom → "StudyTrack" title fades in below it
 * → the app content reveals.
 * Shown once per browser session (so it doesn't replay on every in-app navigation/reload).
 */
export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<'logo' | 'title' | 'done'>(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) ? 'done' : 'logo';
    } catch {
      return 'logo';
    }
  });

  useEffect(() => {
    if (stage === 'done') return;

    const t1 = setTimeout(() => setStage('title'), 650);
    const t2 = setTimeout(() => {
      setStage('done');
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    }, 1750);

    return () => {
      clearTimeout(t1); clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {children}
      <AnimatePresence>
        {stage !== 'done' && (
          <motion.div
            key="splash"
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gradient-hero"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-3xl bg-white/30 blur-xl scale-110" />
              <div className="relative w-20 h-20 bg-white/20 backdrop-blur-sm shadow-2xl rounded-3xl flex items-center justify-center border border-white/40">
                <BookOpen size={40} className="text-white drop-shadow-lg" />
              </div>
            </motion.div>

            <div className="mt-5 text-center min-h-[44px]">
              <AnimatePresence>
                {stage === 'title' && (
                  <motion.h1
                    key="title"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="text-3xl font-bold tracking-tight text-white drop-shadow"
                  >
                    StudyTrack
                  </motion.h1>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
