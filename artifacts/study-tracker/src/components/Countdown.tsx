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

/**
 * Live-ticking "D:HH:MM:SS" count-UP timer. Shows how much time has passed
 * since `startMs`. Ticks once per second on its own internal timer.
 */
export function CountUp({
  startMs,
  className,
  lang = 'en',
}: {
  startMs: number;
  className?: string;
  lang?: string;
}) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [startMs]);

  const elapsed = Math.max(0, Date.now() - startMs);
  const days    = Math.floor(elapsed / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((elapsed % (1000 * 60)) / 1000);

  const text = days > 0
    ? `${days}${lang === 'bn' ? 'দি' : 'd'} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return <span className={className}>{text}</span>;
}

/**
 * Prominent months : days : hours : minutes countdown for an admin's own card.
 * Ticks every minute — no seconds shown.
 */
export function AdminTermCountdown({
  targetMs,
  lang = 'en',
  className,
}: {
  targetMs: number;
  lang?: string;
  className?: string;
}) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick(v => v + 1), 60_000);
    return () => clearInterval(id);
  }, [targetMs]);

  const diff = targetMs - Date.now();
  if (diff <= 0) return null;

  const totalMins  = Math.floor(diff / 60_000);
  const totalHours = Math.floor(totalMins / 60);
  const totalDays  = Math.floor(totalHours / 24);
  const months  = Math.floor(totalDays / 30);
  const days    = totalDays % 30;
  const hours   = totalHours % 24;
  const minutes = totalMins % 60;

  const units = lang === 'bn'
    ? [
        { value: months,  label: 'মাস' },
        { value: days,    label: 'দিন' },
        { value: hours,   label: 'ঘন্টা' },
        { value: minutes, label: 'মিনিট' },
      ]
    : [
        { value: months,  label: 'Months' },
        { value: days,    label: 'Days' },
        { value: hours,   label: 'Hours' },
        { value: minutes, label: 'Mins' },
      ];

  return (
    <div className={className}>
      <div className="flex items-end justify-center gap-1">
        {units.map((unit, i) => (
          <React.Fragment key={unit.label}>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold tabular-nums leading-none text-primary">
                {pad(unit.value)}
              </span>
              <span className="text-[9px] text-muted-foreground font-medium mt-0.5">
                {unit.label}
              </span>
            </div>
            {i < units.length - 1 && (
              <span className="text-primary/70 font-bold text-base leading-none mb-[1.1rem]">:</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
