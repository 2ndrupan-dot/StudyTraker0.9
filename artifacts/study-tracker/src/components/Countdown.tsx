import React, { useEffect, useState, useRef } from 'react';

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function computeCountdownParts(targetMs: number): CountdownParts {
  const diff = targetMs - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds, expired: false };
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

/**
 * Live-ticking "D:HH:MM:SS" countdown. Ticks once per second on its own
 * internal timer so a whole list of these can render without forcing the
 * parent (and its Firestore-driven state) to re-render every second.
 * Calls `onExpire` exactly once, the moment it crosses zero.
 */
export function Countdown({
  targetMs,
  className,
  lang = 'en',
  onExpire,
}: {
  targetMs: number;
  className?: string;
  lang?: string;
  onExpire?: () => void;
}) {
  const [, forceTick] = useState(0);
  const firedExpireRef = useRef(false);

  useEffect(() => {
    firedExpireRef.current = false;
    const id = setInterval(() => forceTick(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const parts = computeCountdownParts(targetMs);

  useEffect(() => {
    if (parts.expired && !firedExpireRef.current) {
      firedExpireRef.current = true;
      onExpire?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts.expired]);

  if (parts.expired) {
    return <span className={className}>{lang === 'bn' ? 'মেয়াদ শেষ' : 'Expired'}</span>;
  }

  const text = parts.days > 0
    ? `${parts.days}${lang === 'bn' ? 'দি' : 'd'} ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`
    : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;

  return <span className={className}>{text}</span>;
}
