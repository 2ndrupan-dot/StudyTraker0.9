import React, { useRef, useEffect, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  key?: React.Key;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

/** Walk up the DOM to find the nearest scrolling ancestor (overflow-y: auto/scroll). */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el || el === document.body) return null;
  const oy = window.getComputedStyle(el).overflowY;
  if (oy === 'auto' || oy === 'scroll') return el;
  return getScrollParent(el.parentElement);
}

/**
 * Wraps children in a div that:
 * - Animates IN (smooth fade + slide-up) when entering the viewport from below (scroll down)
 * - Stays visible when the element exits upward (already-seen content stays shown)
 * - Resets instantly (no animation) when below the viewport so the next scroll-down re-animates
 */
export function ScrollReveal({ children, className, style, onClick }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const root = getScrollParent(el.parentElement) ?? null;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        } else {
          const rect = entry.boundingClientRect;
          const rootRect = entry.rootBounds;
          // Element is BELOW the viewport/scroll-container → reset (re-animate on next scroll down)
          if (rootRect && rect.top >= rootRect.bottom) {
            setVisible(false);
          }
          // Element is ABOVE (already seen) → keep visible
        }
      },
      { threshold: 0.05, root }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onClick={onClick}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(16px)',
        transition: visible
          ? 'opacity 0.40s cubic-bezier(0.22,1,0.36,1), transform 0.40s cubic-bezier(0.22,1,0.36,1)'
          : 'none',
      }}
    >
      {children}
    </div>
  );
}
