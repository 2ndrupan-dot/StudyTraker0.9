/**
 * StudyActivityChart
 *
 * Shows a Week (Sun→Sat) / Month (4-week average) bar chart of daily progress %.
 *
 * Storage strategy (cross-device sync):
 *   • Primary:  Firestore  `users/{uid}/activitySnapshots/{courseId}`
 *               Field:     `snaps` — Record<"YYYY-MM-DD", number>
 *   • Cache:    localStorage key `@study_activity_snap_{uid}_{courseId}`
 *               Same JSON, loaded instantly while Firestore fetches in background.
 *
 * On every Progress page open, today's highest-seen % is written to both stores.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLang } from '@/context/LangContext';

// ── Types ──────────────────────────────────────────────────────────────────────
type SnapMap = Record<string, number>; // "YYYY-MM-DD" → progress %

// ── localStorage helpers ───────────────────────────────────────────────────────
function lsKey(uid: string, courseId: string) {
  return `@study_activity_snap_${uid}_${courseId}`;
}
function lsLoad(uid: string, courseId: string): SnapMap {
  try {
    const raw = localStorage.getItem(lsKey(uid, courseId));
    return raw ? (JSON.parse(raw) as SnapMap) : {};
  } catch {
    return {};
  }
}
function lsSave(uid: string, courseId: string, snaps: SnapMap) {
  try {
    localStorage.setItem(lsKey(uid, courseId), JSON.stringify(snaps));
  } catch { /* quota exceeded – ignore */ }
}

// ── Firestore helpers ──────────────────────────────────────────────────────────
function fsRef(uid: string, courseId: string) {
  return doc(db, 'users', uid, 'activitySnapshots', courseId);
}
async function fsSave(uid: string, courseId: string, snaps: SnapMap) {
  try {
    await setDoc(fsRef(uid, courseId), { snaps }, { merge: true });
  } catch { /* offline — will sync when back online */ }
}

// ── Date utilities ─────────────────────────────────────────────────────────────
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Week runs Sunday → Saturday (JS getDay(): 0=Sun … 6=Sat)
function daysSinceSun(d: Date): number { return d.getDay(); }

function getWeekDates(anchor: Date): Date[] {
  const off = daysSinceSun(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor); d.setDate(d.getDate() - off + i); return d;
  });
}

// Returns all calendar weeks (each Sun–Sat) of the current month.
// Each group carries the real week-of-month number (W1, W2, … W5).
// Only dates within the current month are included; future weeks are kept
// so the chart always shows the full month layout.
function getMonthWeeks(today: Date): { weekNum: number; dates: Date[] }[] {
  const year = today.getFullYear();
  const month = today.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  // Walk back to the Sunday that opens the first calendar week containing this month
  const firstSunday = new Date(firstOfMonth);
  firstSunday.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const lastOfMonth = new Date(year, month + 1, 0); // last day of month

  const groups: { weekNum: number; dates: Date[] }[] = [];
  let weekStart = new Date(firstSunday);
  let weekNum = 1;

  while (weekStart <= lastOfMonth) {
    // Keep only dates that actually fall in the current month
    const datesInMonth = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d;
    }).filter(d => d.getMonth() === month);

    if (datesInMonth.length) {
      groups.push({ weekNum, dates: datesInMonth });
      weekNum++;
    }

    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + 7);
    weekStart = next;
  }

  return groups;
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val: number = payload[0]?.value ?? 0;
  return (
    <div className="bg-card border border-border/60 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-bold text-foreground">{label}</p>
      <p className="text-primary font-black text-sm">{val > 0 ? `${val}%` : '—'}</p>
    </div>
  );
}

// ── Custom Bar Label (always above the bar) ────────────────────────────────────
// • Narrow bar (width < 36 px): "%" is omitted so the number fits.
// • y is clamped to ≥ 10 so the label never clips the chart top boundary.
function BarTopLabel({ x, y, width, value }: any) {
  if (!value || value <= 0) return null;

  const isNarrow = width < 36;
  const label = isNarrow ? `${value}` : `${value}%`;
  const fontSize = isNarrow ? 7 : 8;
  const labelY = Math.max(10, y - 3);

  return (
    <text x={x + width / 2} y={labelY}
      textAnchor="middle" dominantBaseline="auto"
      fontSize={fontSize} fontWeight={700} fill="hsl(var(--primary))">
      {label}
    </text>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  uid: string;
  courseId: string;
  overallProg: number;
}

export function StudyActivityChart({ uid, courseId, overallProg }: Props) {
  const { t, lang } = useLang();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => fmt(today), [today]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // snapshots merged from localStorage + Firestore
  const [snaps, setSnaps] = useState<SnapMap>(() =>
    uid && courseId ? lsLoad(uid, courseId) : {}
  );

  // track last value written this session (-1 = nothing written yet)
  const lastWritten = useRef<number>(-1);
  // once we've written locally, we own today's value — don't let Firestore overwrite it
  const hasLocalWrite = useRef<boolean>(false);

  // ── Real-time Firestore listener ─────────────────────────────────────────────
  // onSnapshot fires immediately with current data, then again on every remote
  // change — giving true cross-device live sync without any polling.
  useEffect(() => {
    if (!uid || !courseId) return;

    // Reset session flags when course/user changes
    lastWritten.current = -1;
    hasLocalWrite.current = false;

    // Show localStorage instantly while Firestore connects
    const local = lsLoad(uid, courseId);
    setSnaps(local);

    const unsub = onSnapshot(
      fsRef(uid, courseId),
      (snap) => {
        const remote = (snap.exists() ? (snap.data()?.snaps ?? {}) : {}) as SnapMap;
        setSnaps(prev => {
          const merged: SnapMap = { ...prev };
          for (const [k, v] of Object.entries(remote)) {
            if (k === todayStr) {
              // For today: only accept the remote value if we haven't written
              // locally yet this session. Once the user has triggered a local
              // write (complete / undo), we own today's value and ignore stale
              // remote updates (which can lag behind the latest undo).
              if (!hasLocalWrite.current) {
                merged[k] = v;
              }
            } else {
              // For past dates: highest value ever seen wins (preserve history)
              merged[k] = Math.max(merged[k] ?? 0, v);
            }
          }
          lsSave(uid, courseId, merged);
          return merged;
        });
      },
      () => { /* offline — keep showing localStorage data */ }
    );

    return () => unsub(); // clean up listener on unmount / courseId change
  }, [uid, courseId]); // intentionally exclude todayStr — it doesn't change within a session

  // ── Save today's snapshot whenever overallProg changes ──────────────────────
  // Writes on every change — including decreases — so completing then
  // undoing a chapter/topic is immediately reflected in the bar chart.
  useEffect(() => {
    if (!uid || !courseId) return;
    const rounded = Math.round(overallProg * 10000) / 10000; // keep 4 dp internally

    // Skip if nothing actually changed since last write
    if (rounded === lastWritten.current) return;

    lastWritten.current = rounded;
    hasLocalWrite.current = true;

    const updated = { ...snaps, [todayStr]: rounded };
    setSnaps(updated);
    lsSave(uid, courseId, updated);
    fsSave(uid, courseId, updated);
  }, [uid, courseId, overallProg, todayStr]); // intentionally exclude `snaps`

  // ── Day labels (Sun-first) ───────────────────────────────────────────────────
  const dayLabels = useMemo(() => [
    t('activityDaySun'), t('activityDayMon'), t('activityDayTue'),
    t('activityDayWed'), t('activityDayThu'), t('activityDayFri'), t('activityDaySat'),
  ], [lang]);

  // ── Build chart data ─────────────────────────────────────────────────────────
  const data = useMemo(() => {
    if (!uid || !courseId) return [];

    // Returns the last cumulative value recorded BEFORE `dateStr`.
    // This is the baseline we subtract to get "how much was done on that day".
    const prevCumulative = (dateStr: string): number => {
      const candidates = Object.keys(snaps)
        .filter(d => d < dateStr && (snaps[d] ?? 0) > 0)
        .sort();
      return candidates.length > 0 ? (snaps[candidates[candidates.length - 1]] ?? 0) : 0;
    };

    // Daily increment: cumulative value for that day minus the last known value before it.
    // Clamped to ≥ 0 so an undo that crosses midnight never shows a negative bar.
    const dayIncrement = (dk: string): number => {
      const val = snaps[dk] ?? 0;
      if (val === 0) return 0;
      const prev = prevCumulative(dk);
      return Math.max(0, Math.round((val - prev) * 100) / 100);
    };

    if (view === 'week') {
      return getWeekDates(today).map((d, i) => {
        const dk = fmt(d);
        const isFuture = d > today;
        return {
          label: dayLabels[i],
          progress: isFuture ? 0 : dayIncrement(dk),
          isToday: dk === todayStr,
          isFuture,
        };
      });
    }

    // Month view: weekly totals for each calendar week of the current month.
    // weekNum is the real week-of-month (W1…W5), future weeks show 0.
    return getMonthWeeks(today).map((wk) => {
      const allFuture = wk.dates.every(d => d > today);
      const weekTotal = wk.dates.reduce(
        (sum, d) => sum + (d <= today ? dayIncrement(fmt(d)) : 0),
        0,
      );
      return {
        label: `${t('activityWeekLabel')} ${wk.weekNum}`,
        progress: Math.round(weekTotal * 100) / 100,
        isToday: wk.dates.some(d => fmt(d) === todayStr),
        isFuture: allFuture,
      };
    });
  }, [view, snaps, today, todayStr, dayLabels, uid, courseId, lang]);

  const hasAnyData = data.some(d => d.progress > 0);
  const maxVal = Math.max(...data.map(d => d.progress), 5);
  const yMax = Math.ceil(maxVal / 10) * 10 || 10;

  return (
    <div className="bg-card rounded-3xl p-5 shadow-md border border-border/50 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <TrendingUp size={14} className="text-primary" />
          </div>
          <h3 className="font-bold text-foreground text-sm">{t('studyActivity')}</h3>
        </div>

        {/* Week / Month toggle */}
        <div className="flex bg-secondary rounded-xl p-1 gap-1">
          {(['week', 'month'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`relative px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                view === v ? 'text-foreground' : 'text-muted-foreground'}`}>
              {view === v && (
                <motion.div layoutId="activity-tab"
                  className="absolute inset-0 bg-card rounded-lg shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
              <span className="relative z-10">
                {v === 'week' ? t('activityWeek') : t('activityMonth')}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {!hasAnyData ? (
        <div className="flex items-center justify-center h-[140px] text-xs text-muted-foreground text-center px-4">
          {t('activityNoData')}
        </div>
      ) : (
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="25%"
              margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false} />
              <YAxis domain={[0, yMax]} tickFormatter={v => `${v}%`}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false} tickCount={4} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
              <Bar dataKey="progress" radius={[6, 6, 3, 3]} maxBarSize={isMobile ? 52 : 36}
                label={<BarTopLabel />}>
                {data.map((entry, idx) => (
                  <Cell key={idx}
                    fill={
                      entry.isFuture ? 'hsl(var(--secondary))'
                      : entry.isToday ? 'hsl(var(--primary))'
                      : 'hsl(var(--primary) / 0.55)'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
