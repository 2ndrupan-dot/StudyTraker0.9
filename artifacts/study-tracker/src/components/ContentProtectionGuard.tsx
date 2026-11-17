import { useEffect, useState, useRef } from 'react';
import { useCourse } from '@/context/CourseContext';

/**
 * Best-effort content protection for shared courses whose admin hasn't
 * granted the "takeScreenshot" / "selectCopyText" permissions.
 *
 * Browsers cannot truly block OS-level screenshots or screen recordings —
 * there is no web API for that. What we *can* do, and what this component
 * does, is:
 *  - Disable text selection & the copy/cut/contextmenu events site-wide
 *    while a protected shared course is active (selectCopyText permission).
 *  - Detect the PrintScreen key and common OS screenshot shortcuts, show a
 *    "Screenshot not allowed" warning, and briefly blur the screen.
 *  - Blur the whole app whenever the window loses focus/visibility (e.g. a
 *    screen-recording overlay, another app snapping a shot, task-switching)
 *    so nothing sensitive is visible in the captured frame.
 *
 * This is a deterrent, not a guarantee — it cannot stop a determined user
 * with a second camera/device, but it covers the common in-browser cases.
 */
export function ContentProtectionGuard() {
  const { activeCourseId, sharedCoursesMeta } = useCourse();
  const [warning, setWarning] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const meta = activeCourseId ? sharedCoursesMeta[activeCourseId] : undefined;
  const blockCopy = !!meta && meta.permissions.selectCopyText !== true;
  const blockScreenshot = !!meta && meta.permissions.takeScreenshot !== true;

  const flashWarning = () => {
    setWarning(true);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setWarning(false), 2200);
  };

  const flashBlur = () => {
    setBlurred(true);
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setBlurred(false), 900);
  };

  // ── Block selection / copy / right-click while active ─────────────────────
  useEffect(() => {
    document.body.classList.toggle('no-select-guard', blockCopy);
    if (!blockCopy) return;
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('contextmenu', block);
    return () => {
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('contextmenu', block);
      document.body.classList.remove('no-select-guard');
    };
  }, [blockCopy]);

  // ── Best-effort screenshot deterrence ──────────────────────────────────────
  useEffect(() => {
    if (!blockScreenshot) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === 'PrintScreen';
      const isMacShot = e.metaKey && e.shiftKey && ['3', '4', '5', '6'].includes(e.key);
      const isWinSnip = e.metaKey && e.shiftKey && e.key.toLowerCase() === 's';
      if (isPrintScreen || isMacShot || isWinSnip) {
        e.preventDefault();
        flashWarning();
        flashBlur();
        navigator.clipboard?.writeText('').catch(() => {});
      }
    };

    const onVisibility = () => {
      if (document.hidden) flashBlur();
    };
    const onBlur = () => flashBlur();

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [blockScreenshot]);

  useEffect(() => () => {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  if (!blockScreenshot) return null;

  return (
    <>
      {blurred && <div className="content-protection-blur-overlay" />}
      {warning && (
        <div className="content-protection-toast" role="alert">
          Screenshot not allowed
        </div>
      )}
    </>
  );
}
