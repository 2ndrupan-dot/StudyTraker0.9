import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

/**
 * Shared branded loading/splash screen: logo slides up and fades in,
 * "StudyTrack" title fades in below it, spinner fades in pinned to the
 * bottom. Used both for the app-launch loading screen (App.tsx) and the
 * post-login transition overlay (Auth.tsx) so the two feel identical.
 */
export function BrandedLoadingScreen({ className = 'fixed inset-0 z-50' }: { className?: string }) {
  return (
    <motion.div
      key="branded-loading"
      className={`${className} flex flex-col items-center justify-center gradient-hero`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Logo — slides up */}
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="absolute inset-0 rounded-3xl bg-white/30 blur-xl scale-110" />
        <div className="relative w-20 h-20 bg-white/20 backdrop-blur-sm shadow-2xl rounded-3xl flex items-center justify-center border border-white/40">
          <BookOpen size={40} className="text-white drop-shadow-lg" />
        </div>
      </motion.div>

      {/* StudyTrack title — fades in after logo */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="text-3xl font-bold tracking-tight text-white drop-shadow mt-5 select-none"
      >
        StudyTrack
      </motion.h1>

      {/* Spinner — pinned to the very bottom of the screen */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="absolute bottom-28 left-1/2 -translate-x-1/2"
      >
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </motion.div>
    </motion.div>
  );
}
