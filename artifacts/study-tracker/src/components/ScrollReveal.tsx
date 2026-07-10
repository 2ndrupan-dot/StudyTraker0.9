import React, { useRef, useEffect, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Wraps children in a div that:
 * - Animates IN (smooth) when the element enters the viewport from below (scroll down)
 * - Stays visible when the element exits upward (scroll up past it)
 * - Resets instantly (no animation) when the element exits downward (user scrolled up,
 *   element is now below viewport) — so next scroll-down re-animates it
 */
export function ScrollReveal({ children, className, style }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        } else {
          const rect = entry.boundingClientRect;
          const root = entry.rootBounds;
          // Element is BELOW the viewport → reset (user scrolled back up, item not yet seen again)
          if (root && rect.top >= root.bottom) {
            setVisible(false);
          }
          // Element is ABOVE the viewport (already seen) → keep visible, do nothing
        }
      },
      { threshold: 0.05 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0px)' : 'translateY(14px)',
        // Smooth transition only when becoming visible; instant reset when hiding
        transition: visible
          ? 'opacity 0.38s cubic-bezier(0.22,1,0.36,1), transform 0.38s cubic-bezier(0.22,1,0.36,1)'
          : 'none',
      }}
    >
      {children}
    </div>
  );
}
