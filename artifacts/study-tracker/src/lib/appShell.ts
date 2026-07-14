/**
 * Controls the static pre-hydration "app shell" markup that lives directly in
 * index.html (outside #root). That markup paints synchronously with the very
 * first frame — before React, CSS-in-JS, or any data fetch — so a reload never
 * shows a blank white page. Once real content is ready to display we fade it
 * out and remove it.
 */
export function hideAppShell() {
  try {
    const el = document.getElementById('app-shell-loader');
    if (!el || el.dataset.hidden) return;
    el.dataset.hidden = '1';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  } catch {
    /* ignore */
  }
}
