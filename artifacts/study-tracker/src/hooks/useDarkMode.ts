import { useState, useEffect } from 'react';
import gsap from 'gsap';

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('@study_dark_mode');
    if (stored !== null) return stored === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    // Animate theme transition
    gsap.to(root, {
      duration: 0.35,
      ease: 'power2.inOut',
      onStart: () => {
        root.style.transition = 'background-color 0.35s, color 0.35s';
      },
      onComplete: () => {
        root.style.transition = '';
      },
    });
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('@study_dark_mode', String(dark));
  }, [dark]);

  const toggle = () => setDark((d) => !d);
  return { dark, toggle };
}
