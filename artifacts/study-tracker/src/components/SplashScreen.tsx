import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen } from 'lucide-react';

const SEEN_KEY = '@study_splash_seen_session';

/**
 * Mobile-only animated launch splash screen.
 * Sequence: logo slides up from the bottom → "StudyTrack" title fades in below it
 * → tagline fades in below the title → a short chime plays → the app content reveals.
 * Shown once per browser session (so it doesn't replay on every in-app navigation/reload).
 */
export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [stage, setStage] = useState<'logo' | 'title' | 'tagline' | 'done'>(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) ? 'done' : 'logo';
    } catch {
      return 'logo';
    }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (stage === 'done') return;

    // This splash is mobile-only (md:hidden). Skip the whole sequence — timers,
    // audio, and the session-seen write — on desktop viewports so nothing runs
    // or plays behind the scenes when the overlay isn't even shown.
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) {
      setStage('done');
      return;
    }

    // Play the launch chime as soon as the logo starts animating in.
    let audio: HTMLAudioElement | null = null;
    try {
      audio = new Audio('/sounds/splash-chime.mp3');
      audio.volume = 0.55;
      audioRef.current = audio;
      audio.play().catch(() => { /* autoplay may be blocked until user gesture; ignore */ });
    } catch { /* ignore audio errors */ }

    const t1 = setTimeout(() => setStage('title'), 650);
    const t2 = setTimeout(() => setStage('tagline'), 1250);
    const t3 = setTimeout(() => {
      setStage('done');
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    }, 2350);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
      }
      audioRef.current = null;
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
            className="md:hidden fixed inset-0 z-[100] flex flex-col items-center justify-center gradient-hero"
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

            <div className="mt-5 text-center min-h-[64px]">
              <AnimatePresence>
                {(stage === 'title' || stage === 'tagline') && (
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
              <AnimatePresence>
                {stage === 'tagline' && (
                  <motion.p
                    key="tagline"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="text-white/85 mt-1.5 text-sm font-medium"
                  >
                    The Smart Learning Platform by Rupan Nama
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
