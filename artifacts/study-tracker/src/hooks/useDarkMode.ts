import { useTheme } from '../context/ThemeContext';

export function useDarkMode() {
  const { theme, setTheme } = useTheme();
  const dark = theme === 'dark';
  const toggle = () => setTheme(dark ? 'light' : 'dark');
  return { dark, toggle, theme, setTheme };
}
