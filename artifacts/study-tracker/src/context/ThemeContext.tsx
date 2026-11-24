import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'study';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = '@study_theme';
const LEGACY_DARK_KEY = '@study_dark_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'study') {
      return saved;
    }
    // Check legacy key
    const legacyDark = localStorage.getItem(LEGACY_DARK_KEY);
    if (legacyDark === 'true') {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'study');

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'study') {
      root.classList.add('study');
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      // Keep legacy key synced for backward compatibility
      localStorage.setItem(LEGACY_DARK_KEY, theme === 'dark' ? 'true' : 'false');

      // Update browser theme-color meta tag
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        if (theme === 'dark') {
          meta.setAttribute('content', '#131722');
        } else if (theme === 'study') {
          meta.setAttribute('content', '#ece3d2');
        } else {
          meta.setAttribute('content', '#5149f3');
        }
      }
    } catch {
      // ignore
    }
  }, [theme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
