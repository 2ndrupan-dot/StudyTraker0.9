import React, { useRef, useEffect, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  key?: React.Key;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** Direction the element slides in from. Defaults to 'up' (translateY). */
  direction?: 'up' | 'right';
  /** Stagger delay in seconds, applied on top of the base transition. */
  delay?: number;
}

const HIDDEN_TRANSFORM: Record<'up' | 'right', string> = {
  up: 'translateY(16px)',
  right: 'translateX(32px)',
};

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
export function ScrollReveal({ children, className, style, onClick, direction = 'up', delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const hasAnimatedOnce = useRef(false);
  const effectiveDelayRef = useRef(delay);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const root = getScrollParent(el.parentElement) ?? null;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Only apply the stagger delay on the very first reveal; re-entries
          // while scrolling back down should feel instant, not re-stagger.
          effectiveDelayRef.current = hasAnimatedOnce.current ? 0 : delay;
          hasAnimatedOnce.current = true;
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
        transform: visible ? 'translate(0px, 0px)' : HIDDEN_TRANSFORM[direction],
        transition: visible
          ? `opacity 0.40s cubic-bezier(0.22,1,0.36,1) ${effectiveDelayRef.current}s, transform 0.40s cubic-bezier(0.22,1,0.36,1) ${effectiveDelayRef.current}s`
          : 'none',
      }}
    >
      {children}
    </div>
  );
}
