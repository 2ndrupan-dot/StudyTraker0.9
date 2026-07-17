/**
 * StudyActivityChart
 *
 * Shows a Week (Sat→Fri) / Month (4-week average) bar chart of daily progress %.
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

// Week runs Saturday → Friday (JS getDay(): 0=Sun … 6=Sat)
function daysSinceSat(d: Date): number { return (d.getDay() + 1) % 7; }

function getWeekDates(anchor: Date): Date[] {
  const off = daysSinceSat(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(anchor); d.setDate(d.getDate() - off + i); return d;
  });
}

function getMonthWeeks(today: Date, count = 4): { label: string; dates: Date[] }[] {
  const groups: { label: string; dates: Date[] }[] = [];
  for (let w = count - 1; w >= 0; w--) {
    const ref = new Date(today); ref.setDate(ref.getDate() - w * 7);
    const dates = getWeekDates(ref).filter(d => d <= today);
    if (dates.length) groups.push({ label: `W${count - w}`, dates });
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

// ── Custom Bar Label (% on top) ────────────────────────────────────────────────
function BarTopLabel({ x, y, width, value }: any) {
  if (!value || value <= 0) return null;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" dominantBaseline="auto"
      fontSize={9} fontWeight={700} fill="hsl(var(--primary))">
      {value}%
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
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => fmt(today), [today]);

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

  // ── Day labels (Sat-first) ───────────────────────────────────────────────────
  const dayLabels = useMemo(() => [
    t('activityDaySat'), t('activityDaySun'), t('activityDayMon'),
    t('activityDayTue'), t('activityDayWed'), t('activityDayThu'), t('activityDayFri'),
  ], [lang]);

  // ── Build chart data ─────────────────────────────────────────────────────────
  const data = useMemo(() => {
    if (!uid || !courseId) return [];

    if (view === 'week') {
      return getWeekDates(today).map((d, i) => {
        const dk = fmt(d);
        const isFuture = d > today;
        return {
          label: dayLabels[i],
          progress: isFuture ? 0 : Math.round((snaps[dk] ?? 0) * 100) / 100,
          isToday: dk === todayStr,
          isFuture,
        };
      });
    }

    // Month view: 4 weekly averages
    return getMonthWeeks(today, 4).map((wk, wi) => {
      const vals = wk.dates.map(d => snaps[fmt(d)] ?? 0).filter(v => v > 0);
      const avg = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
        : 0;
      return {
        label: `${t('activityWeekLabel')} ${wi + 1}`,
        progress: avg,
        isToday: wk.dates.some(d => fmt(d) === todayStr),
        isFuture: false,
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
              <Bar dataKey="progress" radius={[6, 6, 3, 3]} maxBarSize={36}
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
