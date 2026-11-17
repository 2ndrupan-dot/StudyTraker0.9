import { useEffect, useRef, RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Stagger fade+scale entrance on mount
export function useStaggerEntrance(
  containerRef: RefObject<HTMLElement | null>,
  selector: string = '.anim-item',
  delay = 0
) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        selector,
        { opacity: 0, y: 28, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.55,
          ease: 'power3.out',
          stagger: 0.08,
          delay,
        }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);
}

// ScrollTrigger whileInView for cards
export function useScrollReveal(
  containerRef: RefObject<HTMLElement | null>,
  selector: string = '.scroll-card'
) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(selector).forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 40, scale: 0.97 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 92%',
              toggleActions: 'play none none none',
            },
          }
        );
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);
}

// Magnetic button effect
export function useMagneticButton(ref: RefObject<HTMLElement | null>, strength = 0.35) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      gsap.to(el, { x: dx, y: dy, duration: 0.3, ease: 'power2.out' });
    };

    const handleMouseLeave = () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [strength]);
}

// Card 3D tilt + glow
export function useCardTilt(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      gsap.to(el, {
        rotateY: x * 10,
        rotateX: -y * 10,
        duration: 0.3,
        ease: 'power2.out',
        transformPerspective: 800,
      });
      el.style.setProperty('--glow-x', `${(x + 0.5) * 100}%`);
      el.style.setProperty('--glow-y', `${(y + 0.5) * 100}%`);
    };

    const handleMouseLeave = () => {
      gsap.to(el, {
        rotateY: 0,
        rotateX: 0,
        duration: 0.6,
        ease: 'elastic.out(1, 0.5)',
      });
    };

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);
}

// Page-level loading stagger animation with GSAP
export function usePageLoad() {
  useEffect(() => {
    gsap.fromTo(
      '.page-load',
      { opacity: 0, y: 20, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out', stagger: 0.07 }
    );
  }, []);
}

export { gsap, ScrollTrigger };
