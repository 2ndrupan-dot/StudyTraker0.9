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
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
async function fsLoad(uid: string, courseId: string): Promise<SnapMap> {
  try {
    const snap = await getDoc(fsRef(uid, courseId));
    return (snap.exists() ? (snap.data()?.snaps ?? {}) : {}) as SnapMap;
  } catch {
    return {};
  }
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

  // track whether we've already written today's value (avoid re-writing unchanged data)
  const lastWritten = useRef<number>(-1);

  // ── On mount: fetch Firestore and merge ──────────────────────────────────────
  useEffect(() => {
    if (!uid || !courseId) return;
    // Show localStorage immediately, then overlay Firestore data
    const local = lsLoad(uid, courseId);
    setSnaps(local);

    fsLoad(uid, courseId).then(remote => {
      // Merge: take the higher value for each date
      const merged: SnapMap = { ...local };
      for (const [k, v] of Object.entries(remote)) {
        merged[k] = Math.max(merged[k] ?? 0, v);
      }
      setSnaps(merged);
      lsSave(uid, courseId, merged); // update local cache with remote data
    });
  }, [uid, courseId]);

  // ── Save today's snapshot whenever overallProg changes ──────────────────────
  useEffect(() => {
    if (!uid || !courseId) return;
    const rounded = Math.round(overallProg * 100) / 100;
    const existing = snaps[todayStr] ?? 0;

    // Only write if progress increased (and skip if same as last write)
    if (rounded <= existing || rounded === lastWritten.current) return;

    lastWritten.current = rounded;
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
          progress: isFuture ? 0 : Math.round((snaps[dk] ?? 0) * 10) / 10,
          isToday: dk === todayStr,
          isFuture,
        };
      });
    }

    // Month view: 4 weekly averages
    return getMonthWeeks(today, 4).map((wk, wi) => {
      const vals = wk.dates.map(d => snaps[fmt(d)] ?? 0).filter(v => v > 0);
      const avg = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
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
