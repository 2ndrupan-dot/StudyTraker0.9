import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

/**
 * Shared branded loading/splash screen: logo slides up and fades in,
 * "Learning Sathi" title fades in below it, spinner sits at the bottom of
 * the screen (not inline with the logo/title).
 *
 * Layout:
 *   ┌─────────────────┐
 *   │                 │
 *   │   ┌──────────┐  │  ← flex-1 (top spacer)
 *   │   │  Logo    │  │
 *   │   │Learning Sathi│  │  ← logo + title centered here
 *   │   └──────────┘  │
 *   │                 │  ← flex-1 (bottom spacer)
 *   │      ( ⟳ )      │  ← spinner, pb-16 from very bottom
 *   └─────────────────┘
 */
export function BrandedLoadingScreen({ className = 'fixed inset-0 z-50' }: { className?: string }) {
  return (
    <motion.div
      key="branded-loading"
      className={`${className} flex flex-col items-center gradient-hero`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Top spacer — pushes logo+title to vertical center */}
      <div className="flex-1" />

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

      {/* Learning Sathi title — fades in after logo */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="text-3xl font-bold tracking-tight text-white drop-shadow mt-5 select-none"
      >
        Learning Sathi
      </motion.h1>

      {/* Bottom spacer — separates title from spinner */}
      <div className="flex-1" />

      {/* Spinner — at the bottom of the screen in normal flow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="pb-16 flex items-center justify-center"
      >
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </motion.div>
    </motion.div>
  );
}
