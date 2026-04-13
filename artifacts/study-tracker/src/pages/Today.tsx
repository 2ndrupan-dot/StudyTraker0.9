import React, { useState, useEffect, useRef } from 'react';
import { useStudy } from '@/context/StudyContext';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import {
  Target, CheckCircle2, Clock, CalendarDays, Edit3, BookOpen,
  Layers, Zap, Sun, ChevronRight, AlarmClock, Hash, Lightbulb, List,
  ChevronDown, AlertTriangle, X, RotateCcw, TrendingUp, PlayCircle,
  Lock, Flame, ThumbsUp, RefreshCw,
} from 'lucide-react';
import { format, differenceInDays, parseISO, addDays } from 'date-fns';
import { Modal, Input, Button } from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import type { Subject } from '@/lib/types';
import {
  adjPoint, adjConcept, adjSubtopic, adjTopic, adjChapter,
  findNextItem, calculateAdaptivePressure,
  totalContentMinutes, totalAdjustedMinutes,
} from '@/lib/timeEngine';

// ─── Types ──────────────────────────────────────────────────────────────────
export type PlanLevel = 'chapter' | 'topic' | 'subtopic' | 'concept' | 'point';

export interface PlanTask {
  key: string;
  subjectId: string; chapterId: string;
  topicId?: string; subtopicId?: string; conceptId?: string; pointId?: string;
  subjectTitle: string; subjectColor: string;
  breadcrumb: string[];
  mainTitle: string;
  level: PlanLevel;
  estimatedMins: number;
  daysLeft: number;
  urgency: 'high' | 'medium' | 'low';
  urgencyScore: number;
  isInProgress?: boolean;
}

export interface PendingItem {
  task: PlanTask;
  plannedDate: string;
  addedDate?: string;
}

// Revision entry: scheduled for Day+2, Day+5, Day+10 after completion
export interface RevisionEntry {
  id: string;
  taskKey: string;
  mainTitle: string;
  subjectTitle: string;
  subjectColor: string;
  breadcrumb: string[];
  level: PlanLevel;
  scheduledDate: string; // yyyy-MM-dd
  revisionMins: number;  // 50% of original
  done: boolean;
}

const PENDING_EXPIRY_DAYS = 2;
const REVISION_DAYS = [2, 5, 10];
const MIN_POINT = 3, MIN_CONCEPT = 5, MIN_SUBTOPIC = 7;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatMins(mins: number, h: string, m: string) {
  if (mins < 60) return `${mins} ${m}`;
  const hh = Math.floor(mins / 60), mm = mins % 60;
  return mm > 0 ? `${hh} ${h} ${mm} ${m}` : `${hh} ${h}`;
}

function getAllItemIds(subjects: Subject[]): Set<string> {
  const ids = new Set<string>();
  for (const s of subjects) {
    ids.add(s.id);
    for (const ch of s.chapters) {
      ids.add(ch.id);
      for (const t of ch.topics) {
        ids.add(t.id);
        for (const sub of t.subtopics) {
          ids.add(sub.id);
          for (const c of sub.concepts) {
            ids.add(c.id);
            for (const p of c.points) ids.add(p.id);
          }
        }
      }
    }
  }
  return ids;
}

function pendingDaysLeft(item: PendingItem, todayStr: string): number {
  const from = item.addedDate ?? item.plannedDate;
  try {
    const elapsed = differenceInDays(parseISO(todayStr), parseISO(from));
    return PENDING_EXPIRY_DAYS - elapsed;
  } catch { return PENDING_EXPIRY_DAYS; }
}

function doesTaskExist(subjects: Subject[], task: PlanTask): boolean {
  const subj = subjects.find(s => s.id === task.subjectId);
  if (!subj) return false;
  const ch = subj.chapters.find(c => c.id === task.chapterId);
  if (!ch) return false;
  if (task.level === 'chapter') return true;
  const t = ch.topics.find(t => t.id === task.topicId);
  if (!t) return false;
  if (task.level === 'topic') return true;
  const sub = t.subtopics.find(s => s.id === task.subtopicId);
  if (!sub) return false;
  if (task.level === 'subtopic') return true;
  const c = sub.concepts.find(c => c.id === task.conceptId);
  if (!c) return false;
  if (task.level === 'concept') return true;
  return c.points.some(p => p.id === task.pointId);
}

function isTaskCompleted(subjects: Subject[], task: PlanTask): boolean {
  const subj = subjects.find(s => s.id === task.subjectId);
  if (!subj) return false;
  const ch = subj.chapters.find(c => c.id === task.chapterId);
  if (!ch) return false;
  if (task.level === 'chapter') return ch.completed;
  const t = ch.topics.find(t => t.id === task.topicId);
  if (!t) return false;
  if (task.level === 'topic') return t.completed;
  const sub = t.subtopics.find(s => s.id === task.subtopicId);
  if (!sub) return false;
  if (task.level === 'subtopic') return sub.completed;
  const c = sub.concepts.find(c => c.id === task.conceptId);
  if (!c) return false;
  if (task.level === 'concept') return c.completed;
  return c.points.find(p => p.id === task.pointId)?.completed ?? false;
}

// ─── Seeded RNG (LCG) for deterministic daily rotation ───────────────────────
function lcgRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ─── Smart plan generator ────────────────────────────────────────────────────
// Rules:
// 1. Up to 3 subjects per day (1 if budget < 90 min), selected by weighted rotation
// 2. Selection weights = urgencyScore = f(completionPct, deadline)
//    → less complete + tighter deadline → appears more often across days
// 3. Rotation: date-seeded weighted random ensures all subjects are covered
//    proportionally to their remaining work and urgency
// 4. Topic-First: topic appears as overview before subtopics
// 5. In-progress items always included first
// 6. Pending re-scheduled items have priority
function generateSmartPlan(
  subjects: Subject[],
  dailyBudgetMinutes: number,
  pendingItems: PendingItem[],
  todayStr: string
): PlanTask[] {
  interface SubjectCandidate {
    subj: Subject;
    daysLeft: number;
    urgencyScore: number;
    urgency: 'high' | 'medium' | 'low';
    hasInProgress: boolean;
  }

  const subjCandidates: SubjectCandidate[] = [];

  for (const subj of subjects) {
    if (subj.completed) continue;
    const hasAnyIncomplete = subj.chapters.some(ch => !ch.completed);
    if (!hasAnyIncomplete) continue;

    const daysLeft = Math.max(0, differenceInDays(parseISO(subj.deadline), new Date()));

    let total = 0, incomplete = 0, hasInProgress = false;
    for (const ch of subj.chapters) {
      if (ch.topics.length === 0) { total++; if (!ch.completed) { incomplete++; } continue; }
      for (const t of ch.topics) {
        total++;
        if (!t.completed) { incomplete++; }
        if (t.subtopics.length === 0) continue;
        for (const sub of t.subtopics) {
          if (sub.concepts.length === 0) { total++; if (!sub.completed) incomplete++; continue; }
          for (const c of sub.concepts) {
            if (c.points.length === 0) { total++; if (!c.completed) incomplete++; continue; }
            for (const p of c.points) { total++; if (!p.completed) incomplete++; }
          }
        }
      }
    }
    if (total === 0) continue;

    // urgencyScore: higher = less complete + closer deadline → needs more study days
    const completionPct = (total - incomplete) / total; // 0=nothing done, 1=all done
    const urgencyScore = daysLeft === 0
      ? 10000
      : ((1 - completionPct) * 100) / Math.sqrt(daysLeft + 1);
    const urgency: 'high' | 'medium' | 'low' = urgencyScore > 25 ? 'high' : urgencyScore > 8 ? 'medium' : 'low';
    subjCandidates.push({ subj, daysLeft, urgencyScore, urgency, hasInProgress });
  }

  // Max subjects per session based on available time
  const maxSubjects = dailyBudgetMinutes < 90 ? 1 : 3;
  const n = subjCandidates.length;

  let selected: SubjectCandidate[];

  if (n <= maxSubjects) {
    // All subjects fit — sort by urgency
    selected = [...subjCandidates].sort((a, b) => {
      if (a.hasInProgress !== b.hasInProgress) return a.hasInProgress ? -1 : 1;
      return b.urgencyScore - a.urgencyScore;
    });
  } else {
    // Weighted random selection seeded by today's date
    // Over many days, each subject appears proportional to its urgencyScore
    // → less complete subjects with tighter deadlines appear more often
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    const rand = lcgRandom(dayIndex * 31337 + 12345);

    const pool = [...subjCandidates];
    selected = [];

    // Always include in-progress subjects first
    for (let i = pool.length - 1; i >= 0; i--) {
      if (pool[i].hasInProgress && selected.length < maxSubjects) {
        selected.push(...pool.splice(i, 1));
      }
    }

    // Fill remaining slots with urgency-weighted random selection
    while (selected.length < maxSubjects && pool.length > 0) {
      const totalW = pool.reduce((s, c) => s + Math.max(c.urgencyScore, 1), 0);
      let r = rand() * totalW;
      let chosen = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= Math.max(pool[i].urgencyScore, 1);
        if (r <= 0) { chosen = i; break; }
      }
      selected.push(...pool.splice(chosen, 1));
    }
  }

  const perSubjectBudget = selected.length > 0 ? Math.floor(dailyBudgetMinutes / selected.length) : dailyBudgetMinutes;

  const pendingKeys = new Set(pendingItems.filter(p => pendingDaysLeft(p, todayStr) > 0).map(p => p.task.key));

  const result: PlanTask[] = [];

  for (const { subj, daysLeft, urgency, urgencyScore } of selected) {
    let remaining = perSubjectBudget;
    const base = {
      subjectId: subj.id, chapterId: '', subjectTitle: subj.title,
      subjectColor: subj.color, daysLeft, urgency, urgencyScore
    };

    const firstCh = subj.chapters.find(ch => !ch.completed);
    if (!firstCh) continue;

    const chBase = { ...base, chapterId: firstCh.id };

    const pushTask = (key: string, extra: Partial<PlanTask>, mins: number) => {
      if (pendingKeys.has(key)) return;
      const clampedMins = Math.min(mins, remaining);
      if (clampedMins <= 0) return;
      result.push({ ...chBase, ...extra, key, estimatedMins: clampedMins } as PlanTask);
      remaining -= clampedMins;
    };

    if (firstCh.topics.length === 0) {
      if (!firstCh.completed) {
        const mins = adjChapter(firstCh);
        pushTask(`${subj.id}|${firstCh.id}`, { breadcrumb: [], mainTitle: firstCh.title, level: 'chapter' }, mins);
      }
      continue;
    }

    outer: for (const t of firstCh.topics) {
      if (t.completed || remaining <= 0) continue;

      // Topic-First: if topic has subtopics and is not yet complete, show topic as overview
      if (t.subtopics.length > 0 && !t.completed) {
        const mins = Math.max(adjTopic(t), MIN_SUBTOPIC);
        pushTask(`${subj.id}|${firstCh.id}|${t.id}`,
          { topicId: t.id, breadcrumb: [firstCh.title], mainTitle: `[Overview] ${t.title}`, level: 'topic' }, mins);
        continue; // Don't show subtopics until topic is complete
      }

      if (t.subtopics.length === 0) {
        const mins = Math.max(adjTopic(t), MIN_SUBTOPIC);
        pushTask(`${subj.id}|${firstCh.id}|${t.id}`,
          { topicId: t.id, breadcrumb: [firstCh.title], mainTitle: t.title, level: 'topic' }, mins);
        continue;
      }

      // Topic is complete, now process subtopics
      for (const sub of t.subtopics) {
        if (sub.completed || remaining <= 0) continue;

        if (sub.concepts.length === 0) {
          const mins = Math.max(adjSubtopic(sub), MIN_SUBTOPIC);
          pushTask(`${subj.id}|${firstCh.id}|${t.id}|${sub.id}`,
            { topicId: t.id, subtopicId: sub.id, breadcrumb: [firstCh.title, t.title], mainTitle: sub.title, level: 'subtopic' }, mins);
          continue;
        }

        for (const c of sub.concepts) {
          if (c.completed || remaining <= 0) continue;

          if (c.points.length === 0) {
            const mins = Math.max(adjConcept(c), MIN_CONCEPT);
            pushTask(`${subj.id}|${firstCh.id}|${t.id}|${sub.id}|${c.id}`,
              { topicId: t.id, subtopicId: sub.id, conceptId: c.id, breadcrumb: [firstCh.title, t.title, sub.title], mainTitle: c.title, level: 'concept' }, mins);
            continue;
          }

          for (const pt of c.points) {
            if (pt.completed || remaining <= 0) continue;
            const mins = Math.max(adjPoint(pt), MIN_POINT);
            pushTask(`${subj.id}|${firstCh.id}|${t.id}|${sub.id}|${c.id}|${pt.id}`,
              { topicId: t.id, subtopicId: sub.id, conceptId: c.id, pointId: pt.id, breadcrumb: [firstCh.title, t.title, sub.title, c.title], mainTitle: pt.title, level: 'point' }, mins);
          }
          if (remaining <= 0) break outer;
        }
        if (remaining <= 0) break outer;
      }
    }
  }

  return result;
}

// ─── UI Constants ─────────────────────────────────────────────────────────
const LEVEL_META: Record<PlanLevel, { Icon: React.ElementType; en: string; bn: string; color: string; levelNum: string }> = {
  chapter:  { Icon: BookOpen,  en: 'Chapter',  bn: 'চ্যাপ্টার', color: 'text-blue-600 bg-blue-500/10 border-blue-200',   levelNum: 'L2' },
  topic:    { Icon: Layers,    en: 'Topic',    bn: 'টপিক',      color: 'text-violet-600 bg-violet-500/10 border-violet-200', levelNum: 'L3' },
  subtopic: { Icon: List,      en: 'Subtopic', bn: 'সাবটপিক',  color: 'text-cyan-600 bg-cyan-500/10 border-cyan-200',   levelNum: 'L4' },
  concept:  { Icon: Lightbulb, en: 'Concept',  bn: 'কনসেপ্ট',  color: 'text-amber-600 bg-amber-500/10 border-amber-200', levelNum: 'L5' },
  point:    { Icon: Hash,      en: 'Point',    bn: 'পয়েন্ট',   color: 'text-green-600 bg-green-500/10 border-green-200', levelNum: 'L6' },
};

const URGENCY_COLORS: Record<'high' | 'medium' | 'low', string> = {
  high:   'bg-red-500/10   text-red-600   border-red-200',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-200',
  low:    'bg-secondary    text-muted-foreground border-border/50',
};

const PRESSURE_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 border-red-300 text-red-700',
  behind:   'bg-orange-500/10 border-orange-300 text-orange-700',
  ontrack:  'bg-green-500/10 border-green-300 text-green-700',
  ahead:    'bg-blue-500/10 border-blue-300 text-blue-700',
};

// localStorage keys
const planKey     = (email: string) => `@study_today_plan_v2_${email}`;
const pendKey     = (email: string) => `@study_pending_v2_${email}`;
const revisionKey = (email: string) => `@study_revisions_v1_${email}`;

function loadStoredPlan(email: string): { date: string; tasks: PlanTask[] } | null {
  try { return JSON.parse(localStorage.getItem(planKey(email)) ?? 'null'); } catch { return null; }
}
function savePlan(email: string, date: string, tasks: PlanTask[]) {
  localStorage.setItem(planKey(email), JSON.stringify({ date, tasks }));
}
function loadPending(email: string): PendingItem[] {
  try { return JSON.parse(localStorage.getItem(pendKey(email)) ?? '[]'); } catch { return []; }
}
function savePending(email: string, items: PendingItem[]) {
  localStorage.setItem(pendKey(email), JSON.stringify(items));
}
function loadRevisions(email: string): RevisionEntry[] {
  try { return JSON.parse(localStorage.getItem(revisionKey(email)) ?? '[]'); } catch { return []; }
}
function saveRevisions(email: string, entries: RevisionEntry[]) {
  localStorage.setItem(revisionKey(email), JSON.stringify(entries));
}

// ─── Component ──────────────────────────────────────────────────────────────
export function Today() {
  const {
    subjects, settings, dataLoaded,
    setCourseTotalDays, setDailyStudyHours,
    toggleChapterComplete, toggleTopicComplete,
    toggleSubtopicComplete, toggleConceptComplete, togglePointComplete,
  } = useStudy();
  const { user } = useAuth();
  const { t, lang } = useLang();
  const isBn = lang === 'bn';
  const email = user?.email ?? 'guest';

  const [isDaysModalOpen, setDaysModalOpen] = useState(false);
  const [isHoursModalOpen, setHoursModalOpen] = useState(false);
  const [isCompletedModalOpen, setCompletedModalOpen] = useState(false);
  const [daysInput, setDaysInput] = useState(settings.courseTotalDays?.toString() || '');
  const [hoursInput, setHoursInput] = useState(settings.dailyStudyHours?.toString() || '3');

  // Accordion: single expanded subject at a time (null = all collapsed)
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  // Completed section accordion (inside modal)
  const [completedExpandedSubjId, setCompletedExpandedSubjId] = useState<string | null>(null);
  const [isPendingCollapsed, setIsPendingCollapsed] = useState(true);
  const [isRevisionCollapsed, setIsRevisionCollapsed] = useState(true);

  // NEW: Clean UI state
  const [showDetails, setShowDetails] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const firstIncompleteRef = useRef<HTMLDivElement>(null);
  const [showRevisionPanel, setShowRevisionPanel] = useState(false);
  const [showPendingPanel, setShowPendingPanel] = useState(false);

  // Confirm dialog: { message, onConfirm }
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const dailyBudgetMins = (settings.dailyStudyHours ?? 3) * 60;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const prevHoursRef = useRef<number | null>(null);
  const itemIdsRef = useRef<Set<string> | null>(null);

  const [lockedPlan, setLockedPlan]     = useState<PlanTask[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [revisions, setRevisions]       = useState<RevisionEntry[]>([]);
  const [planReady, setPlanReady]       = useState(false);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return;

    const stored = loadStoredPlan(email);
    let currentPending = loadPending(email);
    let currentRevisions = loadRevisions(email);

    // Expire pending items older than 10 days
    currentPending = currentPending.filter(p => pendingDaysLeft(p, todayStr) > 0);
    savePending(email, currentPending);

    // Clean up completed revisions older than 30 days
    currentRevisions = currentRevisions.filter(r => {
      if (!r.done) return true;
      try {
        const diff = differenceInDays(parseISO(todayStr), parseISO(r.scheduledDate));
        return diff <= 30;
      } catch { return true; }
    });

    // Auto-reschedule missed revisions older than 10 days
    const toReschedule = currentRevisions.filter(r => {
      if (r.done) return false;
      try {
        return differenceInDays(parseISO(todayStr), parseISO(r.scheduledDate)) > 10;
      } catch { return false; }
    });
    if (toReschedule.length > 0) {
      // For each one, find a low-pressure future day
      const getDateCounts = (revList: typeof currentRevisions, excludeId: string) => {
        const counts: Record<string, number> = {};
        for (let i = 1; i <= 14; i++) {
          const d = format(addDays(new Date(), i), 'yyyy-MM-dd');
          counts[d] = revList.filter(r => !r.done && r.scheduledDate === d && r.id !== excludeId).length;
        }
        return counts;
      };
      toReschedule.forEach(rev => {
        const counts = getDateCounts(currentRevisions, rev.id);
        const bestDate = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
        const newId = `${rev.taskKey}_rev_auto_${bestDate}`;
        currentRevisions = currentRevisions
          .map(r => r.id === rev.id ? { ...r, done: true } : r)
          .filter(r => r.id !== newId);
        currentRevisions = [...currentRevisions, { ...rev, id: newId, scheduledDate: bestDate, done: false }];
      });
    }

    saveRevisions(email, currentRevisions);

    if (stored && stored.date === todayStr) {
      setLockedPlan(stored.tasks);
    } else {
      if (stored && stored.date !== todayStr) {
        const stillIncomplete = stored.tasks.filter(t => !isTaskCompleted(subjects, t));
        if (stillIncomplete.length > 0) {
          const existingKeys = new Set(currentPending.map(p => p.task.key));
          const newPending: PendingItem[] = stillIncomplete
            .filter(t => !existingKeys.has(t.key))
            .map(task => ({ task, plannedDate: stored.date, addedDate: todayStr }));
          currentPending = [...currentPending, ...newPending];
          savePending(email, currentPending);
        }
      }
      const fresh = generateSmartPlan(subjects, dailyBudgetMins, currentPending, todayStr);
      setLockedPlan(fresh);
      savePlan(email, todayStr, fresh);
    }

    itemIdsRef.current = getAllItemIds(subjects);
    setPendingItems(currentPending);
    setRevisions(currentRevisions);
    setPlanReady(true);
  }, [dataLoaded, email]); // eslint-disable-line

  // ── React to structural additions ──────────────────────────────────────────
  useEffect(() => {
    if (!planReady) return;

    let currentPlan = lockedPlan;
    let dirty = false;

    const cleanedPlan = currentPlan.filter(t => doesTaskExist(subjects, t));
    if (cleanedPlan.length !== currentPlan.length) { currentPlan = cleanedPlan; dirty = true; }

    const cleanedPending = pendingItems.filter(
      p => doesTaskExist(subjects, p.task) && pendingDaysLeft(p, todayStr) > 0
    );
    if (cleanedPending.length !== pendingItems.length) {
      setPendingItems(cleanedPending);
      savePending(email, cleanedPending);
    }

    const currentIds = getAllItemIds(subjects);
    const prevIds = itemIdsRef.current;
    let hasNewItems = false;
    if (prevIds !== null) {
      for (const id of currentIds) { if (!prevIds.has(id)) { hasNewItems = true; break; } }
    }
    itemIdsRef.current = currentIds;

    if (hasNewItems) {
      const freshPlan = generateSmartPlan(subjects, dailyBudgetMins, pendingItems, todayStr);
      setLockedPlan(freshPlan);
      savePlan(email, todayStr, freshPlan);
      return;
    }
    if (dirty) { setLockedPlan(currentPlan); savePlan(email, todayStr, currentPlan); }
  }, [subjects, planReady]); // eslint-disable-line

  // ── Auto-scroll to first incomplete item ─────────────────────────────────
  useEffect(() => {
    if (!planReady) return;
    const timer = setTimeout(() => {
      firstIncompleteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
    return () => clearTimeout(timer);
  }, [planReady]); // eslint-disable-line

  // ── Regenerate when hours change ───────────────────────────────────────────
  useEffect(() => {
    if (!planReady) return;
    const currentHours = settings.dailyStudyHours ?? 3;
    if (prevHoursRef.current === null) { prevHoursRef.current = currentHours; return; }
    if (prevHoursRef.current === currentHours) return;
    prevHoursRef.current = currentHours;

    const fresh = generateSmartPlan(subjects, currentHours * 60, pendingItems, todayStr);
    setLockedPlan(fresh);
    savePlan(email, todayStr, fresh);
  }, [settings.dailyStudyHours, planReady]); // eslint-disable-line

  const dismissPending = (key: string) => {
    const updated = pendingItems.filter(p => p.task.key !== key);
    setPendingItems(updated);
    savePending(email, updated);
  };

  const confirmDismissPending = (key: string) => {
    setConfirmDialog({
      message: t('confirmDismissPending'),
      onConfirm: () => { dismissPending(key); setConfirmDialog(null); },
    });
  };

  const completePendingTask = (item: PendingItem) => {
    // Mark the task complete in the hierarchy
    markComplete(item.task);
    // Remove from pending list
    dismissPending(item.task.key);
  };

  const confirmCompletePending = (item: PendingItem) => {
    setConfirmDialog({
      message: t('confirmCompletePending'),
      onConfirm: () => { completePendingTask(item); setConfirmDialog(null); },
    });
  };

  // Complete revision → mark done:true permanently
  const completeRevision = (id: string) => {
    const updated = revisions.map(r => r.id === id ? { ...r, done: true } : r);
    setRevisions(updated);
    saveRevisions(email, updated);
  };

  // Keep for backward compat (revision panel uses this name)
  const dismissRevision = completeRevision;

  // Dismiss + reschedule to a future low-pressure day (1–14 days, fewest revisions)
  const rescheduleRevision = (id: string) => {
    const current = revisions.find(r => r.id === id);
    if (!current) return;
    // Count revisions per future date
    const dateCounts: Record<string, number> = {};
    for (let i = 1; i <= 14; i++) {
      const d = format(addDays(new Date(), i), 'yyyy-MM-dd');
      dateCounts[d] = revisions.filter(r => !r.done && r.scheduledDate === d && r.id !== id).length;
    }
    const bestDate = Object.entries(dateCounts).sort((a, b) => a[1] - b[1])[0][0];
    const newId = `${current.taskKey}_rev_reschedule_${bestDate}`;
    const updated = revisions
      .map(r => r.id === id ? { ...r, done: true } : r) // mark original done
      .filter(r => r.id !== newId);                       // remove duplicate if any
    const rescheduled: RevisionEntry = { ...current, id: newId, scheduledDate: bestDate, done: false };
    const merged = [...updated, rescheduled];
    setRevisions(merged);
    saveRevisions(email, merged);
  };

  const confirmCompleteRevision = (id: string) => {
    setConfirmDialog({
      message: t('confirmCompleteRevision'),
      onConfirm: () => { completeRevision(id); setConfirmDialog(null); },
    });
  };

  const confirmDismissRevision = (id: string) => {
    setConfirmDialog({
      message: t('confirmRescheduleRevision'),
      onConfirm: () => { rescheduleRevision(id); setConfirmDialog(null); },
    });
  };

  // Schedule revision tasks when a task is marked complete
  const scheduleRevisions = (task: PlanTask) => {
    const existing = loadRevisions(email);
    const existingIds = new Set(existing.map(r => r.id));
    const newRevisions: RevisionEntry[] = REVISION_DAYS.map(days => ({
      id: `${task.key}_rev_${days}`,
      taskKey: task.key,
      mainTitle: task.mainTitle,
      subjectTitle: task.subjectTitle,
      subjectColor: task.subjectColor,
      breadcrumb: task.breadcrumb,
      level: task.level,
      scheduledDate: format(addDays(new Date(), days), 'yyyy-MM-dd'),
      revisionMins: Math.max(Math.round(task.estimatedMins * 0.5), MIN_POINT),
      done: false,
    }));
    const toAdd = newRevisions.filter(r => !existingIds.has(r.id));
    const merged = [...existing, ...toAdd];
    setRevisions(merged);
    saveRevisions(email, merged);
  };

  // ── Task status ───────────────────────────────────────────────────────────
  const tasksWithStatus = lockedPlan
    .filter(t => doesTaskExist(subjects, t))
    .map(t => ({ ...t, isCompleted: isTaskCompleted(subjects, t) }));
  const incompleteTasks = tasksWithStatus.filter(t => !t.isCompleted);
  const completedTasks  = tasksWithStatus.filter(t =>  t.isCompleted);

  // ── Incomplete subject groups (main list) ─────────────────────────────────
  interface SubjectGroup {
    subjectId: string; subjectTitle: string; subjectColor: string;
    daysLeft: number; urgency: 'high' | 'medium' | 'low';
    incompleteTasks: typeof tasksWithStatus;
  }
  const incompleteGroupsMap = new Map<string, SubjectGroup>();
  for (const task of incompleteTasks) {
    if (!incompleteGroupsMap.has(task.subjectId)) {
      incompleteGroupsMap.set(task.subjectId, {
        subjectId: task.subjectId, subjectTitle: task.subjectTitle,
        subjectColor: task.subjectColor, daysLeft: task.daysLeft, urgency: task.urgency,
        incompleteTasks: [],
      });
    }
    incompleteGroupsMap.get(task.subjectId)!.incompleteTasks.push(task);
  }
  const incompleteSubjectGroups = Array.from(incompleteGroupsMap.values());

  // ── Completed subject groups (for modal) ──────────────────────────────────
  interface CompletedGroup {
    subjectId: string; subjectTitle: string; subjectColor: string;
    tasks: typeof tasksWithStatus;
  }
  const completedGroupsMap = new Map<string, CompletedGroup>();
  for (const task of completedTasks) {
    if (!completedGroupsMap.has(task.subjectId)) {
      completedGroupsMap.set(task.subjectId, {
        subjectId: task.subjectId, subjectTitle: task.subjectTitle,
        subjectColor: task.subjectColor, tasks: [],
      });
    }
    completedGroupsMap.get(task.subjectId)!.tasks.push(task);
  }
  const completedSubjectGroups = Array.from(completedGroupsMap.values());

  // Accordion toggle: only one subject open at a time
  const toggleSubjectAccordion = (subjId: string) => {
    setExpandedSubjectId(prev => prev === subjId ? null : subjId);
  };

  // ── Overall course progress ─────────────────────────────────────────────
  let totalLeaves = 0, completedLeaves = 0;
  for (const subj of subjects) {
    for (const ch of subj.chapters) {
      if (ch.topics.length === 0) { totalLeaves++; if (ch.completed) completedLeaves++; continue; }
      for (const t of ch.topics) {
        if (t.subtopics.length === 0) { totalLeaves++; if (t.completed) completedLeaves++; continue; }
        for (const sub of t.subtopics) {
          if (sub.concepts.length === 0) { totalLeaves++; if (sub.completed) completedLeaves++; continue; }
          for (const c of sub.concepts) {
            if (c.points.length === 0) { totalLeaves++; if (c.completed) completedLeaves++; continue; }
            for (const p of c.points) { totalLeaves++; if (p.completed) completedLeaves++; }
          }
        }
      }
    }
  }
  const overallPercent = totalLeaves === 0 ? 0 : Math.round((completedLeaves / totalLeaves) * 100);

  // ── Today's progress ───────────────────────────────────────────────────────
  const todayTotal = tasksWithStatus.length;
  const todayDone = completedTasks.length;
  const todayPercent = todayTotal === 0 ? 0 : Math.round((todayDone / todayTotal) * 100);
  const todayMins = tasksWithStatus.reduce((s, t) => s + t.estimatedMins, 0);
  const completedMins = completedTasks.reduce((s, t) => s + t.estimatedMins, 0);

  // ── Adaptive pressure ──────────────────────────────────────────────────────
  const pressure = calculateAdaptivePressure(completedMins, dailyBudgetMins, pendingItems.length);

  // ── Time engine stats ──────────────────────────────────────────────────────
  const totalContent = totalContentMinutes(subjects);
  const availableTime = (settings.dailyStudyHours ?? 3) * 60 * (settings.courseTotalDays ?? 0);

  // ── Next item (Continue Learning) ─────────────────────────────────────────
  const nextItem = findNextItem(subjects);

  // ── Revision tasks due today ──────────────────────────────────────────────
  const dueRevisions = revisions.filter(r => !r.done && r.scheduledDate <= todayStr);
  const futureRevisions = revisions.filter(r => !r.done && r.scheduledDate > todayStr);

  // ── Mark complete ──────────────────────────────────────────────────────────
  const markComplete = (task: PlanTask) => {
    const { subjectId: sId, chapterId: cId, topicId: tId, subtopicId: subId, conceptId: cId2, pointId: ptId } = task;
    const wasCompleted = isTaskCompleted(subjects, task);
    if      (task.level === 'point'    && ptId && cId2 && subId && tId) togglePointComplete(sId, cId, tId, subId, cId2, ptId);
    else if (task.level === 'concept'  && cId2 && subId && tId)         toggleConceptComplete(sId, cId, tId, subId, cId2);
    else if (task.level === 'subtopic' && subId && tId)                 toggleSubtopicComplete(sId, cId, tId, subId);
    else if (task.level === 'topic'    && tId)                          toggleTopicComplete(sId, cId, tId);
    else                                                                 toggleChapterComplete(sId, cId);

    // Schedule revisions only when marking as complete (not undo)
    if (!wasCompleted) {
      scheduleRevisions(task);
    }
  };

  const handleSetDays = () => {
    const d = parseInt(daysInput);
    if (!isNaN(d) && d > 0) { setCourseTotalDays(d); setDaysModalOpen(false); }
  };
  const handleSetHours = () => {
    const h = parseFloat(hoursInput);
    if (!isNaN(h) && h > 0) { setDailyStudyHours(h); setHoursModalOpen(false); }
  };

  // ── Render task card ───────────────────────────────────────────────────────
  const renderCard = (
    task: typeof tasksWithStatus[0],
    opts?: { pendingLabel?: string; pendingDLeft?: number; isRevision?: boolean; revisionId?: string }
  ) => {
    const { Icon, en, bn: bnLabel, levelNum } = LEVEL_META[task.level];
    const levelLabel = isBn ? bnLabel : en;
    const done = task.isCompleted;

    return (
      <div
        key={task.key}
        className={`bg-card rounded-2xl border relative overflow-hidden ${done ? 'opacity-55 border-border/30' : 'border-border/60 shadow-sm card-hover'}`}
      >
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full" style={{ backgroundColor: task.subjectColor }} />
        {done && <div className="absolute inset-0 bg-secondary/20 pointer-events-none" />}

        <div className="pl-3.5 pr-4 pt-3 pb-3 relative">
          {task.breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground font-medium mb-1.5 leading-relaxed">
              {task.breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight size={8} className="opacity-40 shrink-0" />}
                  <span className="max-w-[130px] truncate">{crumb}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 mb-2">
            <span className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${LEVEL_META[task.level].color}`}>
              <Icon size={9} /> {levelLabel}
            </span>
            {opts?.isRevision && (
              <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border text-purple-600 bg-purple-500/10 border-purple-200">
                <RefreshCw size={9} /> {isBn ? 'রিভিশন' : 'Revision'}
              </span>
            )}
            <h3 className={`font-bold text-sm leading-snug ${done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {task.mainTitle}
              <span className="ml-1.5 text-[70%] text-muted-foreground/55 font-medium not-italic align-baseline">({levelNum})</span>
            </h3>
          </div>

          {(opts?.pendingLabel || done) && (
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {opts?.pendingLabel && (
                <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  opts.pendingDLeft !== undefined && opts.pendingDLeft <= 3
                    ? 'text-red-600 bg-red-500/10 border-red-200'
                    : 'text-orange-600 bg-orange-500/10 border-orange-200'
                }`}>
                  <AlertTriangle size={8} /> {opts.pendingLabel}
                </span>
              )}
              {done && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-500/10 border border-green-200 px-1.5 py-0.5 rounded">
                  <CheckCircle2 size={8} /> {isBn ? 'সম্পন্ন' : 'Done'}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-muted-foreground text-[11px] font-semibold bg-secondary/70 px-2 py-1 rounded-lg">
                <Clock size={10} /> ~{formatMins(task.estimatedMins, t('hour'), t('mins'))}
              </div>
              {!opts?.isRevision && (
                <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border ${URGENCY_COLORS[task.urgency]}`}>
                  {task.urgency === 'high' && <Zap size={8} />}
                  <CalendarDays size={8} /> {task.daysLeft}d
                </div>
              )}
            </div>
            {!done ? (
              <button
                onClick={() => markComplete(task)}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-xl border border-border/80 text-xs font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all"
              >
                <CheckCircle2 size={12} /> {t('markComplete')}
              </button>
            ) : (
              <button
                onClick={() => markComplete(task)}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {isBn ? 'পূর্বাবস্থায় ফেরান' : 'Undo'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Render subject group (accordion, incomplete tasks only) ──────────────
  const renderSubjectGroup = (group: SubjectGroup) => {
    const isExpanded = expandedSubjectId === group.subjectId;
    const groupTotal = group.incompleteTasks.length;
    const groupMins = group.incompleteTasks.reduce((s, t) => s + t.estimatedMins, 0);

    return (
      <motion.div
        key={group.subjectId}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-border/60 overflow-hidden shadow-sm"
      >
        <button
          onClick={() => toggleSubjectAccordion(group.subjectId)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors bg-card hover:bg-secondary/30 active:bg-secondary/50"
        >
          <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: group.subjectColor }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-bold text-sm truncate" style={{ color: group.subjectColor }}>
                {group.subjectTitle}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
              <span>{groupTotal} {isBn ? 'টি কাজ বাকি' : 'tasks remaining'}</span>
              <span>·</span>
              <span className="flex items-center gap-0.5"><Clock size={9} /> {formatMins(groupMins, t('hour'), t('mins'))}</span>
              <span>·</span>
              <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${URGENCY_COLORS[group.urgency]}`}>
                {group.urgency === 'high' && <Zap size={8} />}
                <CalendarDays size={8} /> {group.daysLeft}d
              </div>
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`text-muted-foreground transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 space-y-2 bg-secondary/20">
                {group.incompleteTasks.map(task => renderCard({ ...task, isCompleted: false }))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // ── Render completed section modal ────────────────────────────────────────
  const renderCompletedModal = () => (
    <Modal
      isOpen={isCompletedModalOpen}
      onClose={() => setCompletedModalOpen(false)}
      title={isBn ? `সম্পন্ন কাজ (${completedTasks.length})` : `Completed (${completedTasks.length})`}
    >
      {completedSubjectGroups.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          {isBn ? 'এখনও কোনো কাজ সম্পন্ন হয়নি।' : 'No tasks completed yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {completedSubjectGroups.map(group => {
            const isExpanded = completedExpandedSubjId === group.subjectId;
            return (
              <div key={group.subjectId} className="rounded-xl border border-border/50 overflow-hidden">
                <button
                  onClick={() => setCompletedExpandedSubjId(prev => prev === group.subjectId ? null : group.subjectId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left bg-green-500/5 hover:bg-green-500/10 transition-colors"
                >
                  <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: group.subjectColor }} />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-sm" style={{ color: group.subjectColor }}>{group.subjectTitle}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {group.tasks.length} {isBn ? 'টি সম্পন্ন' : 'completed'}
                    </p>
                  </div>
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-2 pb-2 pt-1 space-y-1.5 bg-secondary/10">
                        {group.tasks.map(task => renderCard({ ...task, isCompleted: true }))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );

  return (
    <Layout>
      {/* ── Clean top settings bar ── */}
      <div className="flex items-center gap-0 bg-card border-b border-border/60">
        <motion.button whileTap={{ scale: 0.97 }}
          onClick={() => { setDaysInput(settings.courseTotalDays?.toString() || ''); setDaysModalOpen(true); }}
          className="flex-1 flex items-center gap-2 px-4 py-3 text-left hover:bg-secondary/50 transition-colors border-r border-border/40"
        >
          <Target size={15} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('courseCompletion')}</p>
            <p className="font-bold text-xs truncate text-foreground">
              {settings.courseTotalDays ? `${settings.courseTotalDays} ${t('daysGoal')}` : t('setDays')}
            </p>
          </div>
          <Edit3 size={11} className="text-muted-foreground/40 ml-auto shrink-0" />
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }}
          onClick={() => { setHoursInput(settings.dailyStudyHours?.toString() || '3'); setHoursModalOpen(true); }}
          className="flex-1 flex items-center gap-2 px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
        >
          <AlarmClock size={15} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('dailyStudyHours')}</p>
            <p className="font-bold text-xs text-foreground">{settings.dailyStudyHours ?? 3} {t('hours')}</p>
          </div>
          <Edit3 size={11} className="text-muted-foreground/40 ml-auto shrink-0" />
        </motion.button>
      </div>

      <div className="p-4">
        {/* ── Clean header ── */}
        <header className="mb-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">{t('todayPlan')}</h1>
              <p className="text-muted-foreground text-sm font-medium mt-0.5">{format(new Date(), 'EEEE, MMMM d')}</p>
            </div>

            {/* Right side icons */}
            <div className="flex items-center gap-2">
              {/* ── Pending notification icon (always visible when plan ready) ── */}
              {planReady && (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setShowPendingPanel(true)}
                  className="relative w-8 h-8 rounded-xl flex items-center justify-center border transition-all"
                  style={pendingItems.length > 0
                    ? { backgroundColor: 'rgb(249 115 22 / 0.1)', borderColor: 'rgb(249 115 22 / 0.35)' }
                    : { backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
                >
                  <AlertTriangle size={14} className={pendingItems.length > 0 ? 'text-orange-500' : 'text-muted-foreground'} />
                  {pendingItems.length > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm"
                    >
                      {pendingItems.length}
                    </motion.span>
                  )}
                </motion.button>
              )}

              {/* ── Revision notification icon (always visible) ── */}
              {planReady && (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setShowRevisionPanel(true)}
                  className="relative w-8 h-8 rounded-xl flex items-center justify-center border transition-all"
                  style={dueRevisions.length > 0
                    ? { backgroundColor: 'rgb(147 51 234 / 0.1)', borderColor: 'rgb(147 51 234 / 0.3)' }
                    : { backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
                >
                  <RefreshCw size={14} className={dueRevisions.length > 0 ? 'text-purple-600' : 'text-muted-foreground'} />
                  {/* Red badge — only when due revisions exist today */}
                  {dueRevisions.length > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm"
                    >
                      {dueRevisions.length}
                    </motion.span>
                  )}
                </motion.button>
              )}
            </div>
          </div>

          {/* Today progress */}
          {planReady && todayTotal > 0 && (
            <div>
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-foreground font-semibold">
                  {isBn ? `${todayDone}/${todayTotal} সম্পন্ন` : `${todayDone}/${todayTotal} done`}
                  <span className="text-muted-foreground font-normal ml-1.5">({todayPercent}%)</span>
                </span>
                {todayMins > 0 && (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock size={10} /> {formatMins(todayMins, t('hour'), t('mins'))}
                  </span>
                )}
              </div>
              <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden border border-border/40">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${todayPercent}%` }}
                  transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
                />
              </div>
            </div>
          )}
          {planReady && todayTotal === 0 && subjects.length > 0 && (
            <div className="h-2.5 w-full bg-secondary rounded-full overflow-hidden border border-border/40" />
          )}
        </header>

        {/* ── Skeleton loading while plan not ready ── */}
        {!planReady && (
          <div className="space-y-3 mb-4">
            <div className="skeleton h-3.5 w-40 rounded mb-3" />
            {[1,2].map(i => (
              <div key={i} className="bg-card rounded-2xl border border-border/50 p-4 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-1 h-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-32 rounded" />
                    <div className="skeleton h-3 w-48 rounded" />
                  </div>
                  <div className="skeleton h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Today's plan ── */}
        {planReady && (
          <>
            {incompleteSubjectGroups.length > 0 ? (
              <div className="space-y-3 mb-4" ref={firstIncompleteRef}>
                {incompleteSubjectGroups.map(group => renderSubjectGroup(group))}
              </div>
            ) : completedTasks.length === 0 ? (
              /* Empty: no subjects or no tasks */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-14 flex flex-col items-center justify-center text-center px-6"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="mb-6 w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center"
                >
                  <Sun size={40} className="text-primary" />
                </motion.div>
                <h3 className="text-xl font-bold text-foreground mb-2">{t('noTasksToday')}</h3>
                <p className="text-muted-foreground text-sm">{t('enjoyRest')}</p>
              </motion.div>
            ) : (
              /* All done today */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-10 flex flex-col items-center justify-center text-center px-6"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: 2, ease: 'easeInOut' }}
                  className="mb-4"
                >
                  <CheckCircle2 size={60} className="text-green-500" />
                </motion.div>
                <h3 className="text-xl font-bold text-foreground mb-1">
                  {isBn ? '🎉 আজকের সব কাজ সম্পন্ন!' : '🎉 All tasks completed!'}
                </h3>
                <p className="text-muted-foreground text-sm mb-5">{t('enjoyRest')}</p>
              </motion.div>
            )}

            {/* ── Show Completed toggle ── */}
            {completedTasks.length > 0 && (
              <div className="mb-4">
                <button
                  onClick={() => setShowCompleted(prev => !prev)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border/50 bg-secondary/40 hover:bg-secondary/70 transition-colors text-sm font-semibold text-muted-foreground"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-500" />
                    <span>{isBn ? `${completedTasks.length}টি সম্পন্ন` : `${completedTasks.length} completed`}</span>
                  </div>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showCompleted ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showCompleted && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 space-y-2">
                        {completedTasks.map(task => renderCard({ ...task, isCompleted: true }))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── View Details button ── */}
            <div className="mb-4">
              <button
                onClick={() => setShowDetails(prev => !prev)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border/50 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
              >
                <TrendingUp size={12} />
                {showDetails
                  ? (isBn ? 'বিস্তারিত লুকান' : 'Hide Details')
                  : (isBn ? 'বিস্তারিত দেখুন' : 'View Details')}
                <ChevronDown size={12} className={`transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-4">

                      {/* Motivation / pressure message */}
                      {(pressure.level === 'behind' || pressure.level === 'critical' || pressure.level === 'ahead') && (
                        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold ${
                          pressure.level === 'ahead'
                            ? PRESSURE_COLORS['ahead']
                            : PRESSURE_COLORS['ontrack']
                        }`}>
                          <ThumbsUp size={14} className="shrink-0" />
                          <span>
                            {pressure.level === 'ahead'
                              ? (isBn ? pressure.message_bn : pressure.message_en)
                              : (isBn ? 'আপনি ধরে আসছেন 🚀 চালিয়ে যান!' : "You're catching up 🚀 Keep going!")}
                          </span>
                        </div>
                      )}

                      {/* Overall course progress */}
                      {totalLeaves > 0 && (
                        <div className="bg-card rounded-xl border border-border/50 p-3">
                          <div className="flex items-center justify-between text-xs font-semibold mb-2">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <TrendingUp size={11} className="text-primary/60" />
                              {isBn ? 'সামগ্রিক অগ্রগতি' : 'Overall Progress'}
                            </span>
                            <span className="text-foreground font-bold">{overallPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-primary/50 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${overallPercent}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Time analysis */}
                      {settings.courseTotalDays && totalContent > 0 && (
                        <div className="px-3 py-2.5 rounded-xl bg-secondary/60 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
                          <Clock size={12} className="text-primary/60 shrink-0" />
                          <span>
                            {isBn
                              ? `কন্টেন্ট: ${Math.round(totalContent / 60)}ঘণ্টা • পাওয়া যাবে: ${Math.round(availableTime / 60)}ঘণ্টা`
                              : `Content: ${Math.round(totalContent / 60)}h • Available: ${Math.round(availableTime / 60)}h`}
                          </span>
                        </div>
                      )}

                      {/* ── Revision tasks (today only, always visible) ── */}
                      <div>
                        <button
                          onClick={() => {
                            const willOpen = isRevisionCollapsed;
                            setIsRevisionCollapsed(prev => !prev);
                            if (willOpen) setIsPendingCollapsed(true);
                          }}
                          className="w-full flex items-center justify-between mb-2"
                        >
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            dueRevisions.length > 0
                              ? 'text-purple-600 bg-purple-500/10 border-purple-200'
                              : 'text-muted-foreground bg-secondary border-border/50'
                          }`}>
                            <RefreshCw size={12} />
                            {isBn ? 'রিভিশন' : 'Revision'}
                            {dueRevisions.length > 0 && (
                              <span className="ml-1 bg-purple-600 text-white rounded-full px-1.5 py-0 text-[10px]">{dueRevisions.length}</span>
                            )}
                          </span>
                          <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${isRevisionCollapsed ? '' : 'rotate-180'}`} />
                        </button>
                        <AnimatePresence>
                          {!isRevisionCollapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              {dueRevisions.length > 0 ? (
                                <div className="space-y-2">
                                  {dueRevisions.map(rev => (
                                    <div key={rev.id} className="bg-card rounded-xl border border-purple-200/60 overflow-hidden shadow-sm">
                                      <div className="h-1 w-full" style={{ backgroundColor: rev.subjectColor }} />
                                      <div className="px-3 pt-2.5 pb-2.5">
                                        {rev.breadcrumb.length > 0 && (
                                          <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground mb-1">
                                            {rev.breadcrumb.map((crumb, i) => (
                                              <React.Fragment key={i}>
                                                {i > 0 && <ChevronRight size={7} className="opacity-40" />}
                                                <span className="max-w-[100px] truncate">{crumb}</span>
                                              </React.Fragment>
                                            ))}
                                          </div>
                                        )}
                                        <p className="font-bold text-sm text-foreground leading-snug mb-2">{rev.mainTitle}</p>
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-muted-foreground text-[11px] font-semibold bg-secondary px-2 py-1 rounded-lg flex items-center gap-1">
                                            <Clock size={10} /> {formatMins(rev.revisionMins, t('hour'), t('mins'))}
                                          </span>
                                        </div>
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => confirmCompleteRevision(rev.id)}
                                            className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 transition-colors"
                                          >
                                            <CheckCircle2 size={11} /> {isBn ? 'সম্পন্ন' : 'Complete'}
                                          </button>
                                          <button
                                            onClick={() => confirmDismissRevision(rev.id)}
                                            className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                                          >
                                            <X size={10} /> {isBn ? 'পরে করব' : 'Later'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="py-4 text-center text-[12px] text-muted-foreground bg-secondary/30 rounded-xl">
                                  {isBn ? 'আজকে কোনো রিভিশন নেই ✓' : 'No revision task today ✓'}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* ── Pending work (always visible) ── */}
                      <div>
                        <button
                          onClick={() => {
                            const willOpen = isPendingCollapsed;
                            setIsPendingCollapsed(prev => !prev);
                            if (willOpen) setIsRevisionCollapsed(true);
                          }}
                          className="w-full flex items-center justify-between mb-2"
                        >
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            pendingItems.length > 0
                              ? 'text-orange-600 bg-orange-500/10 border-orange-200'
                              : 'text-muted-foreground bg-secondary border-border/50'
                          }`}>
                            <AlertTriangle size={12} />
                            {isBn ? 'পেন্ডিং কাজ' : 'Pending Work'}
                            {pendingItems.length > 0 && (
                              <span className="ml-1 bg-orange-500 text-white rounded-full px-1.5 py-0 text-[10px]">{pendingItems.length}</span>
                            )}
                          </span>
                          <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${isPendingCollapsed ? '' : 'rotate-180'}`} />
                        </button>
                        <AnimatePresence>
                          {!isPendingCollapsed && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              {pendingItems.length > 0 ? (
                                <div className="space-y-2">
                                  {pendingItems.map(item => {
                                    const dLeft = pendingDaysLeft(item, todayStr);
                                    return (
                                      <div key={item.task.key} className="bg-card rounded-xl border border-orange-200/60 overflow-hidden shadow-sm">
                                        <div className="h-1 w-full" style={{ backgroundColor: item.task.subjectColor }} />
                                        <div className="px-3 pt-2.5 pb-2.5">
                                          {item.task.breadcrumb.length > 0 && (
                                            <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground mb-1">
                                              {item.task.breadcrumb.map((crumb, i) => (
                                                <React.Fragment key={i}>
                                                  {i > 0 && <ChevronRight size={7} className="opacity-40" />}
                                                  <span className="max-w-[100px] truncate">{crumb}</span>
                                                </React.Fragment>
                                              ))}
                                            </div>
                                          )}
                                          <p className="font-bold text-sm text-foreground leading-snug mb-1">{item.task.mainTitle}</p>
                                          <p className="text-[10px] text-orange-500 font-semibold mb-2.5">
                                            {isBn ? `${dLeft} দিন বাকি` : `${dLeft} day${dLeft !== 1 ? 's' : ''} left`}
                                          </p>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => confirmCompletePending(item)}
                                              className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition-colors"
                                            >
                                              <CheckCircle2 size={11} /> {isBn ? 'সম্পন্ন' : 'Complete'}
                                            </button>
                                            <button
                                              onClick={() => confirmDismissPending(item.task.key)}
                                              className="flex-1 flex items-center justify-center gap-1 h-7 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                            >
                                              <X size={10} /> {isBn ? 'বাতিল' : 'Dismiss'}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="py-4 text-center text-[12px] text-muted-foreground bg-secondary/30 rounded-xl">
                                  {isBn ? 'আজকে কোনো পেন্ডিং নেই ✓' : 'No pending task today ✓'}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* ── Pending Bottom Sheet Panel ── */}
      <AnimatePresence>
        {showPendingPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowPendingPanel(false)}
              className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border border-border/60 shadow-2xl max-h-[85vh] flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <AlertTriangle size={15} className="text-orange-500" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-foreground">
                      {isBn ? 'পেন্ডিং টাস্ক' : 'Pending Tasks'}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      {pendingItems.length > 0
                        ? (isBn ? `${pendingItems.length}টি বাকি আছে` : `${pendingItems.length} pending`)
                        : (isBn ? 'কোনো পেন্ডিং নেই' : 'No pending tasks')}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowPendingPanel(false)}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"
                >
                  <X size={16} />
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {pendingItems.length > 0 ? (
                  pendingItems.map(item => {
                    const dLeft = pendingDaysLeft(item, todayStr);
                    return (
                      <motion.div
                        key={item.task.key}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 40 }}
                        className="bg-background rounded-2xl border border-orange-200/70 overflow-hidden shadow-sm"
                      >
                        <div className="h-1 w-full" style={{ backgroundColor: item.task.subjectColor }} />
                        <div className="px-4 pt-3 pb-3">
                          {item.task.breadcrumb.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground mb-1.5">
                              {item.task.breadcrumb.map((crumb, i) => (
                                <React.Fragment key={i}>
                                  {i > 0 && <ChevronRight size={8} className="opacity-40" />}
                                  <span className="max-w-[100px] truncate">{crumb}</span>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                          <p className="font-bold text-sm text-foreground leading-snug mb-1">{item.task.mainTitle}</p>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] text-orange-500 font-bold bg-orange-500/10 px-2 py-0.5 rounded-full">
                              {isBn ? `ডেডলাইন: ${dLeft} দিন বাকি` : `Deadline: ${dLeft} day${dLeft !== 1 ? 's' : ''} left`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {item.plannedDate}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => confirmCompletePending(item)}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500 text-white text-xs font-bold shadow-sm hover:bg-green-600 transition-colors"
                            >
                              <CheckCircle2 size={13} />
                              {isBn ? 'সম্পন্ন' : 'Complete'}
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => confirmDismissPending(item.task.key)}
                              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            >
                              <X size={11} />
                              {isBn ? 'বাতিল' : 'Dismiss'}
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 flex flex-col items-center justify-center text-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                      <CheckCircle2 size={24} className="text-green-500" />
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {isBn ? 'কোনো পেন্ডিং টাস্ক নেই ✓' : 'No pending tasks ✓'}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {isBn ? 'সব কাজ ঠিকঠাক চলছে!' : "You're all caught up!"}
                    </p>
                  </motion.div>
                )}
                <div className="h-6" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Confirm Dialog ── */}
      <AnimatePresence>
        {confirmDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-[2px]"
              onClick={() => setConfirmDialog(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[61] bg-card rounded-2xl border border-border shadow-2xl p-5 max-w-sm mx-auto"
            >
              <p className="text-sm font-semibold text-foreground text-center mb-5 leading-relaxed">
                {confirmDialog.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isBn ? 'না, বাদ দাও' : 'Cancel'}
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
                >
                  {isBn ? 'হ্যাঁ, নিশ্চিত' : 'Yes, confirm'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Revision Bottom Sheet Panel ── */}
      <AnimatePresence>
        {showRevisionPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRevisionPanel(false)}
              className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px]"
            />
            {/* Panel */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border border-border/60 shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              {/* Panel header */}
              <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <RefreshCw size={15} className="text-purple-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-foreground">
                      {isBn ? 'আজকের রিভিশন' : "Today's Revision"}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      {dueRevisions.length > 0
                        ? (isBn ? `${dueRevisions.length}টি বাকি আছে` : `${dueRevisions.length} due today`)
                        : (isBn ? 'আজকে কোনো রিভিশন নেই' : 'No revision today')}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowRevisionPanel(false)}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </motion.button>
              </div>

              {/* Scrollable revision list — today only */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {dueRevisions.length > 0 ? (
                  dueRevisions.map(rev => (
                    <motion.div
                      key={rev.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40 }}
                      className="bg-background rounded-2xl border border-purple-200/70 overflow-hidden shadow-sm"
                    >
                      <div className="h-1 w-full" style={{ backgroundColor: rev.subjectColor }} />
                      <div className="px-4 pt-3 pb-3">
                        {rev.breadcrumb.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground mb-1.5">
                            {rev.breadcrumb.map((crumb, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <ChevronRight size={8} className="opacity-40" />}
                                <span className="max-w-[100px] truncate">{crumb}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        <h3 className="font-bold text-sm text-foreground leading-snug mb-2.5">
                          {rev.mainTitle}
                        </h3>
                        <div className="mb-3">
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold bg-secondary px-2.5 py-1 rounded-lg w-fit">
                            <Clock size={10} /> ~{formatMins(rev.revisionMins, t('hour'), t('mins'))}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => confirmCompleteRevision(rev.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-purple-600 text-white text-xs font-bold shadow-sm shadow-purple-500/30 hover:bg-purple-700 transition-colors"
                          >
                            <CheckCircle2 size={12} />
                            {isBn ? 'সম্পন্ন' : 'Complete'}
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => confirmDismissRevision(rev.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                          >
                            <X size={11} />
                            {isBn ? 'পরে করব' : 'Later'}
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  /* No revisions today */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 flex flex-col items-center justify-center text-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3">
                      <RefreshCw size={24} className="text-muted-foreground/50" />
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      {isBn ? 'No revision available' : 'No revision available'}
                    </p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {isBn ? 'আজকে কোনো রিভিশন নেই' : 'Nothing to revise today'}
                    </p>
                  </motion.div>
                )}

                <div className="h-6" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Modals */}
      {renderCompletedModal()}

      <Modal isOpen={isDaysModalOpen} onClose={() => setDaysModalOpen(false)} title={t('setCourseDays')}>
        <p className="text-sm text-muted-foreground mb-4">{t('setCourseDaysDesc')}</p>
        <Input
          label={t('numberOfDays')}
          type="number"
          value={daysInput}
          onChange={e => setDaysInput(e.target.value)}
          placeholder="e.g. 90"
          onKeyDown={e => e.key === 'Enter' && handleSetDays()}
        />
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={() => setDaysModalOpen(false)} className="flex-1">{t('cancel')}</Button>
          <Button variant="primary" onClick={handleSetDays} className="flex-1">{t('saveGoal')}</Button>
        </div>
      </Modal>

      <Modal isOpen={isHoursModalOpen} onClose={() => setHoursModalOpen(false)} title={t('setDailyHours')}>
        <p className="text-sm text-muted-foreground mb-4">{t('setDailyHoursDesc')}</p>
        <Input
          label={t('hoursPerDay')}
          type="number"
          step="0.5"
          value={hoursInput}
          onChange={e => setHoursInput(e.target.value)}
          placeholder="e.g. 3"
          onKeyDown={e => e.key === 'Enter' && handleSetHours()}
        />
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={() => setHoursModalOpen(false)} className="flex-1">{t('cancel')}</Button>
          <Button variant="primary" onClick={handleSetHours} className="flex-1">{t('save')}</Button>
        </div>
      </Modal>
    </Layout>
  );
}
