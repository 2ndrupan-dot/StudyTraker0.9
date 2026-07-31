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
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
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

// Write ONLY today's field using dot-notation updateDoc.
// This is intentional: we must never spread the full snaps map here because
// a stale onSnapshot can restore old past-date bars to localStorage, and
// spreading that into setDoc would write them back to Firestore — undoing a
// course reset. updateDoc only touches the one field we own right now.
// Fallback to setDoc when the doc doesn't exist yet (new course / first use).
async function fsSaveToday(uid: string, courseId: string, todayStr: string, value: number) {
  try {
    await updateDoc(fsRef(uid, courseId), { [`snaps.${todayStr}`]: value });
  } catch (e: any) {
    if (e?.code === 'not-found') {
      // Document doesn't exist yet — create it with just today's entry.
      await setDoc(fsRef(uid, courseId), { snaps: { [todayStr]: value } });
    }
    // Any other error (offline) — will sync when back online.
  }
}

// ── Module-level post-reset guard ─────────────────────────────────────────────
// Tracks courseIds that were recently reset (start date changed).
// Survives component remounts within the same app session so the guard stays
// active even when the user navigates away and back before the first post-reset
// write happens.  Cleared by the write effect after the first clean local write.
const _postResetCourses = new Set<string>();

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
  /** courseStartDate from settings — when this changes (date reset), wipe the chart */
  startDate?: string;
  /**
   * Pass the `dataLoaded` flag from StudyContext.
   * Writes are gated on this being true so that stale `overallProg` from the
   * *previous* course cannot contaminate this course's activitySnapshot during
   * the brief window between a course switch and the new course's data loading.
   */
  dataLoaded?: boolean;
}

export function StudyActivityChart({ uid, courseId, overallProg, startDate, dataLoaded = true }: Props) {
  const { t, lang } = useLang();
  const [view, setView] = useState<'week' | 'month'>('month');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => fmt(today), [today]);

  // ── Month picker state ────────────────────────────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => today.getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click
  useEffect(() => {
    if (!showMonthPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowMonthPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMonthPicker]);

  // Month abbreviation keys in order
  const monthKeys = [
    'activityMonthJan', 'activityMonthFeb', 'activityMonthMar',
    'activityMonthApr', 'activityMonthMay', 'activityMonthJun',
    'activityMonthJul', 'activityMonthAug', 'activityMonthSep',
    'activityMonthOct', 'activityMonthNov', 'activityMonthDec',
  ] as const;

  const isCurrentMonth = selectedMonth.getFullYear() === today.getFullYear() &&
    selectedMonth.getMonth() === today.getMonth();

  const selectedMonthLabel = useMemo(() => {
    const mo = selectedMonth.getMonth(); // 0-based
    const yr = selectedMonth.getFullYear();
    return `${t(monthKeys[mo])} ${yr}`;
  }, [selectedMonth, lang]);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // snapshots merged from localStorage + Firestore
  const [snaps, setSnaps] = useState<SnapMap>(() =>
    uid && courseId ? lsLoad(uid, courseId) : {}
  );

  // True only after the first onSnapshot has fired for the current course.
  // Prevents "No activity" from flashing before Firestore data arrives.
  const [snapLoaded, setSnapLoaded] = useState(false);

  // Animated dots counter: 0-7, cycles every ~300 ms while loading
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    if (snapLoaded) return;
    const id = setInterval(() => setDotCount(n => (n + 1) % 8), 300);
    return () => clearInterval(id);
  }, [snapLoaded]);

  // track last value written this session (-1 = nothing written yet)
  const lastWritten = useRef<number>(-1);
  // once we've written locally, we own today's value — don't let Firestore overwrite it
  const hasLocalWrite = useRef<boolean>(false);

  // ── Wipe in-memory snaps when startDate changes (course reset) ───────────────
  // StudyContext already deletes the Firestore doc and localStorage cache on reset,
  // but the component's in-memory `snaps` state needs an explicit clear so the
  // chart goes blank immediately without waiting for the next Firestore snapshot.
  //
  // Guard: only wipe when BOTH the previous and new values are real strings AND
  // they differ. This prevents triggering on initial hydration (undefined → "date")
  // when settings load asynchronously after the first render.
  const prevStartDate = useRef<string | undefined>(startDate);
  useEffect(() => {
    const prev = prevStartDate.current;
    prevStartDate.current = startDate;
    // Skip if: no prior real value (initial hydration), new value missing, or unchanged
    if (!prev || !startDate || prev === startDate) return;
    setSnaps({});
    lastWritten.current = -1;
    hasLocalWrite.current = false;
    if (uid && courseId) {
      lsSave(uid, courseId, {});
      // Mark this course as post-reset so onSnapshot ignores stale remote past-date
      // bars until the first clean local write confirms we're in a good state.
      // Module-level set survives component remounts (navigate away and back).
      _postResetCourses.add(courseId);
    }
  }, [startDate, uid, courseId]);

  // ── Real-time Firestore listener ─────────────────────────────────────────────
  // onSnapshot fires immediately with current data, then again on every remote
  // change — giving true cross-device live sync without any polling.
  useEffect(() => {
    if (!uid || !courseId) return;

    // Reset session flags when course/user changes
    lastWritten.current = -1;
    hasLocalWrite.current = false;
    setSnapLoaded(false);

    // Show localStorage instantly while Firestore connects
    const local = lsLoad(uid, courseId);
    setSnaps(local);

    const unsub = onSnapshot(
      fsRef(uid, courseId),
      (snap) => {
        setSnapLoaded(true); // first snapshot received — loading done
        if (!snap.exists()) {
          // Document was deleted (course reset) — wipe chart immediately.
          // Do NOT merge with prev: the old in-memory data would survive and
          // get saved back to localStorage, undoing the reset.
          setSnaps(prev => {
            if (Object.keys(prev).length === 0) return prev; // already empty, no re-render
            lsSave(uid, courseId, {});
            return {};
          });
          lastWritten.current = -1;
          hasLocalWrite.current = false;
          return;
        }

        const remote = (snap.data()?.snaps ?? {}) as SnapMap;
        setSnaps(prev => {
          // ── Remote wipe: Firestore doc was explicitly cleared (snaps: {}) ──
          // This happens after a course start-date reset. Do NOT spread `prev`
          // (which still holds old bars) — that would silently undo the wipe by
          // re-saving old past-date values back to localStorage and Firestore.
          // Instead, build a fresh map that only keeps today's locally-written
          // value (so an in-progress completion isn't lost), and discard all
          // past-date bars immediately.
          if (Object.keys(remote).length === 0) {
            const wiped: SnapMap = {};
            if (hasLocalWrite.current && prev[todayStr] !== undefined) {
              wiped[todayStr] = prev[todayStr];
            }
            // Skip the setState + lsSave if nothing actually changed
            const prevKeys = Object.keys(prev);
            const wipedKeys = Object.keys(wiped);
            if (prevKeys.length === wipedKeys.length &&
                wipedKeys.every(k => prev[k] === wiped[k])) return prev;
            lsSave(uid, courseId, wiped);
            return wiped;
          }

          const merged: SnapMap = { ...prev };
          // Are we in a post-reset window? If so, skip ALL past-date remote bars.
          // Stale Firestore snapshots (served from cache before the reset's setDoc
          // propagates) can carry old bars from before the reset. Spreading them
          // into `merged` would restore those bars to display and localStorage,
          // where the next write effect would re-save them to Firestore.
          const isPostReset = _postResetCourses.has(courseId);
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
              // For past dates: skip entirely during post-reset window.
              // Outside the window: highest value ever seen wins (cross-device sync).
              if (!isPostReset) {
                merged[k] = Math.max(merged[k] ?? 0, v);
              }
            }
          }
          lsSave(uid, courseId, merged);
          return merged;
        });
      },
      () => { setSnapLoaded(true); /* offline — keep showing localStorage data */ }
    );

    return () => unsub(); // clean up listener on unmount / courseId change
  }, [uid, courseId]); // intentionally exclude todayStr — it doesn't change within a session

  // ── Save today's snapshot whenever overallProg changes ──────────────────────
  // Writes on every change — including decreases — so completing then
  // undoing a chapter/topic is immediately reflected in the bar chart.
  //
  // Guard: only write once the current course's data has fully loaded.
  // Without this, a course switch briefly renders with the *previous* course's
  // overallProg (StudyContext resets subjects asynchronously) while courseId has
  // already changed, causing the old progress value to be written into the new
  // course's activitySnapshot and producing identical charts across courses.
  useEffect(() => {
    if (!uid || !courseId || !dataLoaded) return;
    const rounded = Math.round(overallProg * 10000) / 10000; // keep 4 dp internally

    // Skip if nothing actually changed since last write
    if (rounded === lastWritten.current) return;

    lastWritten.current = rounded;
    hasLocalWrite.current = true;

    // Post-reset window is now over: we have a confirmed clean local write.
    // Future onSnapshot snapshots may restore past-date bars normally (cross-device sync).
    _postResetCourses.delete(courseId);

    // Update in-memory state using functional update so we spread the CURRENT
    // memory snapshot (which is kept clean by the post-reset guard above) rather
    // than a stale closure value.
    setSnaps(prev => ({ ...prev, [todayStr]: rounded }));

    // Write ONLY today's field to Firestore via updateDoc (dot-notation).
    // Never spread localStorage here — a stale onSnapshot can restore old bars
    // to localStorage between a reset and this write, causing old bars to be
    // re-saved to Firestore and re-appear after navigation.
    fsSaveToday(uid, courseId, todayStr, rounded);

    // Keep localStorage in sync — still spread prev from localStorage so the
    // cache accurately reflects the full in-memory state for the next page load.
    const freshSnaps = lsLoad(uid, courseId);
    lsSave(uid, courseId, { ...freshSnaps, [todayStr]: rounded });
  }, [uid, courseId, overallProg, todayStr, dataLoaded]); // intentionally exclude `snaps`

  // ── Day labels (Sun-first) ───────────────────────────────────────────────────
  const dayLabels = useMemo(() => [
    t('activityDaySun'), t('activityDayMon'), t('activityDayTue'),
    t('activityDayWed'), t('activityDayThu'), t('activityDayFri'), t('activityDaySat'),
  ], [lang]);

  // ── Build chart data ─────────────────────────────────────────────────────────
  const data = useMemo(() => {
    // While the new course's data hasn't loaded yet, show nothing.
    // This prevents stale localStorage data (from the previous course or from
    // old cross-course contamination) from briefly appearing as bars after a
    // course switch.
    if (!uid || !courseId || !dataLoaded) return [];

    // ── Filter snaps by courseStartDate ────────────────────────────────────────
    // After a course reset the Firestore wipe (setDoc {snaps:{}}) may arrive
    // late or fail entirely (e.g. device was offline). On the next page load,
    // the module-level _postResetCourses set is also empty, so the onSnapshot
    // handler has no guard and would restore old bars from Firestore/localStorage.
    //
    // Filtering by startDate here is the robust fix: any snap key that predates
    // the current course start cannot belong to this course session and must
    // never render — regardless of what Firestore or localStorage contains.
    // This also fixes the "wrong bar grows" symptom: without old bars in the
    // dataset, prevCumulative() correctly returns 0 as today's baseline.
    const activeSnaps: Record<string, number> = startDate
      ? Object.fromEntries(Object.entries(snaps).filter(([k]) => k >= startDate))
      : snaps;

    // Returns the last cumulative value recorded BEFORE `dateStr`.
    // This is the baseline we subtract to get "how much was done on that day".
    const prevCumulative = (dateStr: string): number => {
      const candidates = Object.keys(activeSnaps)
        .filter(d => d < dateStr && (activeSnaps[d] ?? 0) > 0)
        .sort();
      return candidates.length > 0 ? (activeSnaps[candidates[candidates.length - 1]] ?? 0) : 0;
    };

    // Daily increment: cumulative value for that day minus the last known value before it.
    // Clamped to ≥ 0 so an undo that crosses midnight never shows a negative bar.
    const dayIncrement = (dk: string): number => {
      const val = activeSnaps[dk] ?? 0;
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

    // Month view: use selectedMonth as anchor so historical months can be browsed.
    // Future dates are capped at today — bars after today always show 0.
    return getMonthWeeks(selectedMonth).map((wk) => {
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
  }, [view, snaps, today, todayStr, dayLabels, uid, courseId, lang, startDate, dataLoaded, selectedMonth]);

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

        <div className="flex items-center gap-2">
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

          {/* Calendar icon — visible in month view to browse historical months */}
          {view === 'month' && (
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => { setShowMonthPicker(p => !p); setPickerYear(selectedMonth.getFullYear()); }}
                title={t('activitySelectMonth')}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                  !isCurrentMonth
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-secondary border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Calendar size={12} />
                {!isCurrentMonth && <span>{selectedMonthLabel}</span>}
              </button>

              <AnimatePresence>
                {showMonthPicker && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute right-0 top-8 z-50 bg-card border border-border rounded-2xl shadow-xl p-3 w-52"
                  >
                    {/* Year navigation */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <button
                        onClick={() => setPickerYear(y => y - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span className="text-xs font-bold text-foreground">{pickerYear}</span>
                      <button
                        onClick={() => setPickerYear(y => Math.min(y + 1, today.getFullYear()))}
                        disabled={pickerYear >= today.getFullYear()}
                        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>

                    {/* Month grid */}
                    <div className="grid grid-cols-3 gap-1">
                      {monthKeys.map((key, idx) => {
                        const mDate = new Date(pickerYear, idx, 1);
                        const isFutureMo = mDate > today;
                        const isBeforeStart = startDate
                          ? fmt(new Date(pickerYear, idx + 1, 0)) < startDate
                          : false;
                        const isSelected = selectedMonth.getFullYear() === pickerYear &&
                          selectedMonth.getMonth() === idx;
                        const disabled = isFutureMo || isBeforeStart;

                        return (
                          <button
                            key={key}
                            disabled={disabled}
                            onClick={() => {
                              setSelectedMonth(new Date(pickerYear, idx, 1));
                              setShowMonthPicker(false);
                            }}
                            className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              disabled
                                ? 'text-muted-foreground/30 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'hover:bg-secondary text-foreground'
                            }`}
                          >
                            {t(key)}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

        </div>
      </div>

      {/* Month label when browsing history */}
      {view === 'month' && !isCurrentMonth && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs text-muted-foreground font-medium">{selectedMonthLabel}</span>
          <button
            onClick={() => setSelectedMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="text-xs text-primary font-semibold hover:underline"
          >
            ← {lang === 'bn' ? 'এই মাসে ফিরুন' : 'Back to current'}
          </button>
        </div>
      )}

      {/* Chart */}
      {!snapLoaded ? (
        <div className="flex items-center justify-center h-[140px]">
          <span className="text-xs text-muted-foreground font-medium">
            {lang === 'bn' ? 'লোড হচ্ছে' : 'Loading'}
            <span className="inline-block w-[52px] text-left align-bottom">
              {'.'.repeat(dotCount)}
            </span>
          </span>
        </div>
      ) : !hasAnyData ? (
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
