import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLang } from '@/context/LangContext';

// ── localStorage helpers ───────────────────────────────────────────────────────
const SNAP_PREFIX = '@study_activity_snap_';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function saveActivitySnapshot(courseId: string, progress: number) {
  if (!courseId) return;
  const key = `${SNAP_PREFIX}${courseId}_${todayKey()}`;
  const existing = parseFloat(localStorage.getItem(key) ?? '0');
  // Only update if higher (progress only goes up within a day)
  if (progress > existing) {
    localStorage.setItem(key, String(Math.round(progress * 100) / 100));
  }
}

function readSnap(courseId: string, dateKey: string): number {
  const raw = localStorage.getItem(`${SNAP_PREFIX}${courseId}_${dateKey}`);
  return raw ? parseFloat(raw) : 0;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── Week helpers ───────────────────────────────────────────────────────────────
// Week runs Saturday → Friday (getDay(): 0=Sun,1=Mon,...,6=Sat)
function daysSinceSaturday(d: Date): number {
  const day = d.getDay(); // 0=Sun…6=Sat
  return (day + 1) % 7;  // Sat→0, Sun→1, Mon→2, …, Fri→6
}

function getWeekDates(today: Date): Date[] {
  const offset = daysSinceSaturday(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset + i);
    return d;
  });
}

// Returns last N days ending today, grouped into weeks (each week = 7 days)
function getMonthWeeks(today: Date, weeksCount = 4): { label: string; dates: Date[] }[] {
  const groups: { label: string; dates: Date[] }[] = [];
  // Build from oldest to newest week
  for (let w = weeksCount - 1; w >= 0; w--) {
    const refDay = new Date(today);
    refDay.setDate(refDay.getDate() - w * 7);
    const weekDates = getWeekDates(refDay);
    // Only include days that are not in the future
    const validDates = weekDates.filter(d => d <= today);
    if (validDates.length > 0) {
      groups.push({ label: `W${weeksCount - w}`, dates: validDates });
    }
  }
  return groups;
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div className="bg-card border border-border/60 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-bold text-foreground">{label}</p>
      <p className="text-primary font-black text-sm">{val > 0 ? `${val}%` : '—'}</p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface Props {
  courseId: string;
  overallProg: number; // current overall progress %
}

export function StudyActivityChart({ courseId, overallProg }: Props) {
  const { t, lang } = useLang();
  const [view, setView] = useState<'week' | 'month'>('week');
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => dateKey(today), [today]);

  // Day-name labels (Sat-first order)
  const dayLabels = useMemo(() => [
    t('activityDaySat'),
    t('activityDaySun'),
    t('activityDayMon'),
    t('activityDayTue'),
    t('activityDayWed'),
    t('activityDayThu'),
    t('activityDayFri'),
  ], [lang]);

  // Save snapshot on mount and whenever progress changes
  useEffect(() => {
    saveActivitySnapshot(courseId, overallProg);
  }, [courseId, overallProg]);

  // Build chart data
  const data = useMemo(() => {
    if (!courseId) return [];

    if (view === 'week') {
      const weekDates = getWeekDates(today);
      return weekDates.map((d, i) => {
        const dk = dateKey(d);
        const snap = readSnap(courseId, dk);
        const isToday = dk === todayStr;
        const isFuture = d > today;
        return {
          label: dayLabels[i],
          progress: isFuture ? 0 : snap,
          isToday,
          isFuture,
        };
      });
    } else {
      // Month: 4 weekly groups, each bar = avg of that week's snaps
      const weeks = getMonthWeeks(today, 4);
      return weeks.map((wk, wi) => {
        const snaps = wk.dates.map(d => readSnap(courseId, dateKey(d)));
        const nonZero = snaps.filter(v => v > 0);
        const avg = nonZero.length > 0
          ? Math.round((nonZero.reduce((a, b) => a + b, 0) / nonZero.length) * 10) / 10
          : 0;
        const isCurrentWeek = wk.dates.some(d => dateKey(d) === todayStr);
        return {
          label: `${t('activityWeekLabel')} ${wi + 1}`,
          progress: avg,
          isToday: isCurrentWeek,
          isFuture: false,
        };
      });
    }
  }, [view, courseId, overallProg, today, todayStr, dayLabels]);

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
            <button
              key={v}
              onClick={() => setView(v)}
              className={`relative px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                view === v ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {view === v && (
                <motion.div
                  layoutId="activity-tab"
                  className="absolute inset-0 bg-card rounded-lg shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
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
        <div className="h-[150px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barCategoryGap="25%" margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, yMax]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickCount={4}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
              <Bar dataKey="progress" radius={[6, 6, 3, 3]} maxBarSize={36}>
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      entry.isFuture
                        ? 'hsl(var(--secondary))'
                        : entry.isToday
                        ? 'hsl(var(--primary))'
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
