import React, { useMemo, useState, useEffect } from 'react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import {
  Plus, Trash2, ChevronRight,
  BookOpen, Layers, List, Lightbulb, Dot, FolderPlus,
  CheckCircle2, Circle, Pencil, Lock,
  BookOpenCheck, Star, AlertTriangle, StickyNote, Filter, RotateCcw, GripVertical, ArrowUpDown,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  isChapterUnlocked, isTopicUnlocked, isSubtopicUnlocked,
  isConceptUnlocked, isPointUnlocked,
  isChapterContentDone, isTopicContentDone, isSubtopicContentDone, isConceptContentDone,
} from '@/lib/timeEngine';
import { Modal, ConfirmModal, Input, Button, NoteEditorModal } from '@/components/ui';
import { ItemActions, MarksBadgeRow } from '@/components/ItemActions';
import { TempNoteSection } from '@/components/TempNoteSection';
import { motion, AnimatePresence } from 'framer-motion';
import { getRandomColor } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { DifficultyLevel, MarkPath, Subject, Chapter, Topic, Subtopic, Concept, Point } from '@/lib/types';

type LevelType = 'subject' | 'chapter' | 'topic' | 'subtopic' | 'concept' | 'point';
type StatusFilter = 'all' | 'inProgress' | 'completed' | 'notStarted';

// ─── Status helpers ────────────────────────────────────────────────────────
function chapterHasAnyProgress(ch: Chapter): boolean {
  if (ch.completed) return true;
  for (const t of ch.topics) {
    if (t.completed) return true;
    for (const s of t.subtopics) {
      if (s.completed) return true;
      for (const c of s.concepts) {
        if (c.completed) return true;
        for (const p of c.points) if (p.completed) return true;
      }
    }
  }
  return false;
}
function chapterStatus(ch: Chapter): 'completed' | 'inProgress' | 'notStarted' {
  if (isChapterContentDone(ch)) return 'completed';
  if (chapterHasAnyProgress(ch)) return 'inProgress';
  return 'notStarted';
}
function subjectStatus(s: Subject): 'completed' | 'inProgress' | 'notStarted' {
  if (s.chapters.length === 0) return 'notStarted';
  if (s.chapters.every(isChapterContentDone)) return 'completed';
  if (s.chapters.some(ch => chapterHasAnyProgress(ch) || isChapterContentDone(ch))) return 'inProgress';
  return 'notStarted';
}
const matchesStatus = (status: 'completed' | 'inProgress' | 'notStarted', f: StatusFilter) =>
  f === 'all' || f === status;

// Flat marked item (for the importantOnly/weakOnly flat list view)
export interface FlatMarkedItem {
  level: 'subject' | 'chapter' | 'topic' | 'subtopic' | 'concept' | 'point';
  title: string;
  breadcrumb: string[];
  important?: boolean;
  weak?: boolean;
  note?: string;
  path: MarkPath;
  subjectColor: string;
  subjectId: string;
}

// Walk the subject tree and gather every node that has at least one of the requested flags.
export function gatherFlaggedItems(
  subjects: Subject[],
  opts: { important: boolean; weak: boolean }
): FlatMarkedItem[] {
  const out: FlatMarkedItem[] = [];
  const matches = (item: { important?: boolean; weak?: boolean }) =>
    (opts.important && !!item.important) || (opts.weak && !!item.weak);

  for (const subj of subjects) {
    const subjBread = [subj.title];
    if (matches(subj)) {
      out.push({
        level: 'subject', title: subj.title, breadcrumb: [],
        important: subj.important, weak: subj.weak, note: subj.note,
        path: { level: 'subject', subjectId: subj.id },
        subjectColor: subj.color, subjectId: subj.id,
      });
    }
    for (const ch of subj.chapters) {
      if (matches(ch)) {
        out.push({
          level: 'chapter', title: ch.title, breadcrumb: subjBread,
          important: ch.important, weak: ch.weak, note: ch.note,
          path: { level: 'chapter', subjectId: subj.id, chapterId: ch.id },
          subjectColor: subj.color, subjectId: subj.id,
        });
      }
      const chBread = [...subjBread, ch.title];
      for (const tp of ch.topics) {
        if (matches(tp)) {
          out.push({
            level: 'topic', title: tp.title, breadcrumb: chBread,
            important: tp.important, weak: tp.weak, note: tp.note,
            path: { level: 'topic', subjectId: subj.id, chapterId: ch.id, topicId: tp.id },
            subjectColor: subj.color, subjectId: subj.id,
          });
        }
        const tpBread = [...chBread, tp.title];
        for (const sub of tp.subtopics) {
          if (matches(sub)) {
            out.push({
              level: 'subtopic', title: sub.title, breadcrumb: tpBread,
              important: sub.important, weak: sub.weak, note: sub.note,
              path: { level: 'subtopic', subjectId: subj.id, chapterId: ch.id, topicId: tp.id, subtopicId: sub.id },
              subjectColor: subj.color, subjectId: subj.id,
            });
          }
          const subBread = [...tpBread, sub.title];
          for (const c of sub.concepts) {
            if (matches(c)) {
              out.push({
                level: 'concept', title: c.title, breadcrumb: subBread,
                important: c.important, weak: c.weak, note: c.note,
                path: { level: 'concept', subjectId: subj.id, chapterId: ch.id, topicId: tp.id, subtopicId: sub.id, conceptId: c.id },
                subjectColor: subj.color, subjectId: subj.id,
              });
            }
            const cBread = [...subBread, c.title];
            for (const p of c.points) {
              if (matches(p)) {
                out.push({
                  level: 'point', title: p.title, breadcrumb: cBread,
                  important: p.important, weak: p.weak, note: p.note,
                  path: { level: 'point', subjectId: subj.id, chapterId: ch.id, topicId: tp.id, subtopicId: sub.id, conceptId: c.id, pointId: p.id },
                  subjectColor: subj.color, subjectId: subj.id,
                });
              }
            }
          }
        }
      }
    }
  }
  return out;
}

// Recursively check if any descendant has the given flag set
function subjectHasDeepFlag(s: Subject, flag: 'important' | 'weak'): boolean {
  for (const ch of s.chapters) {
    if (ch[flag]) return true;
    for (const t of ch.topics) {
      if (t[flag]) return true;
      for (const sub of t.subtopics) {
        if (sub[flag]) return true;
        for (const c of sub.concepts) {
          if (c[flag]) return true;
          for (const p of c.points) if (p[flag]) return true;
        }
      }
    }
  }
  return false;
}

// Counts of overview-done vs content-done chapters within a subject
function chapterCounts(s: Subject) {
  let contentDone = 0;
  let overviewOnly = 0; // chapters with completed flag set but content not yet finished
  for (const c of s.chapters) {
    const cd = isChapterContentDone(c);
    if (cd) contentDone++;
    else if (c.completed) overviewOnly++;
  }
  return { total: s.chapters.length, contentDone, overviewOnly };
}

interface ActivePath {
  subjId: string;
  chapterId: string;
  topicId: string;
  subtopicId: string;
  conceptId: string;
  pointId: string;
  level: LevelType;
}

const collapseAnim = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } },
};

const itemAnim = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22 } },
  exit: { opacity: 0, x: -8, transition: { duration: 0.15 } },
};

// ─── Time Slider Component ─────────────────────────────────────────────────
interface TimeSliderProps {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  unit: string;
}

function TimeSlider({ label, value, max, onChange, unit }: TimeSliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className={`text-sm font-bold px-2.5 py-0.5 rounded-lg ${value > 0 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-2 appearance-none rounded-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${(value / max) * 100}%, var(--color-secondary) ${(value / max) * 100}%, var(--color-secondary) 100%)`,
          accentColor: 'var(--color-primary)',
        }}
      />
    </div>
  );
}

function totalMinsFromSliders(months: number, days: number, hours: number, mins: number): number {
  return months * 30 * 1440 + days * 1440 + hours * 60 + mins;
}

function formatTotalTime(total: number, t: (k: string) => string): string {
  if (total === 0) return t('timeAuto');
  const mo = Math.floor(total / (30 * 1440));
  const d = Math.floor((total % (30 * 1440)) / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (mo > 0) parts.push(`${mo} ${t('months')}`);
  if (d > 0) parts.push(`${d} ${t('days')}`);
  if (h > 0) parts.push(`${h} ${t('hoursLabel')}`);
  if (m > 0) parts.push(`${m} ${t('minutesLabel')}`);
  return parts.join(' ') || t('timeAuto');
}

function minutesToSliders(totalMins: number) {
  const months = Math.floor(totalMins / (30 * 1440));
  const rem1 = totalMins % (30 * 1440);
  const days = Math.floor(rem1 / 1440);
  const rem2 = rem1 % 1440;
  const hours = Math.floor(rem2 / 60);
  const mins = rem2 % 60;
  return { months, days, hours, mins };
}

// ─── Sortable Item Wrapper ──────────────────────────────────────────────────
function SortableItemWrapper({ id, reorderMode, children }: { id: string; reorderMode: boolean; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' : undefined,
    opacity: isDragging ? 0.55 : undefined,
  };
  const handle = (
    <button
      type="button"
      {...attributes}
      {...(reorderMode ? listeners : {})}
      onClick={e => e.stopPropagation()}
      className={`touch-none shrink-0 self-stretch flex items-center px-1.5 transition-colors select-none border-l border-border/30 ml-1 ${
        reorderMode
          ? 'cursor-grab active:cursor-grabbing text-primary/70 hover:text-primary hover:bg-primary/10'
          : 'cursor-default text-muted-foreground/20'
      }`}
      title={reorderMode ? 'ড্র্যাগ করে সরান' : 'Reorder Mode চালু করুন'}
    >
      <GripVertical size={14} />
    </button>
  );
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>;
}

// ─── Main Component ────────────────────────────────────────────────────────
export function Subjects() {
  const {
    subjects, addSubject, deleteSubject, updateSubjectDays, updateSubjectMeta,
    updateChapterMeta, updateTopicMeta, updateSubtopicMeta, updateConceptMeta, updatePointMeta,
    addChapter, deleteChapter, toggleChapterComplete,
    addTopic, deleteTopic, toggleTopicComplete,
    addSubtopic, deleteSubtopic, toggleSubtopicComplete,
    addConcept, deleteConcept, toggleConceptComplete,
    addPoint, deletePoint, togglePointComplete,
    setNote, resetSubjectProgress,
    reorderSubjects, reorderChapters, reorderTopics, reorderSubtopics, reorderConcepts, reorderPoints,
  } = useStudy();
  const { t } = useLang();

  const [reorderMode, setReorderMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 1500, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSubjDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = subjects.findIndex(s => s.id === active.id);
    const toIdx = subjects.findIndex(s => s.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) reorderSubjects(fromIdx, toIdx);
  };

  // ─── Filter / marks state ─────────────────────────────────────────────
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [importantOnly, setImportantOnly] = useState(false);
  const [weakOnly, setWeakOnly] = useState(false);

  // Single note modal for any level
  const [notePath, setNotePath] = useState<MarkPath | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const openNote = (path: MarkPath, current: string) => {
    setNotePath(path);
    setNoteDraft(current);
  };
  const closeNote = () => { setNotePath(null); setNoteDraft(''); };
  const saveNote = () => {
    if (!notePath) return;
    setNote(notePath, noteDraft);
    closeNote();
  };

  // Expanded state per level
  const [expandedSubj, setExpandedSubj] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [expandedSubtopic, setExpandedSubtopic] = useState<string | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);

  // Auto-expand to a specific item when navigating from Global Search
  useEffect(() => {
    const stored = sessionStorage.getItem('study_nav_target');
    if (!stored) return;
    try {
      const nav = JSON.parse(stored);
      if (!['subject','chapter','topic','subtopic','concept','point','tempNote'].includes(nav.kind)) return;
      sessionStorage.removeItem('study_nav_target');
      if (nav.subjectId) setExpandedSubj(nav.subjectId);
      if (nav.chapterId) setExpandedChapter(nav.chapterId);
      if (nav.topicId) setExpandedTopic(nav.topicId);
      if (nav.subtopicId) setExpandedSubtopic(nav.subtopicId);
      if (nav.conceptId) setExpandedConcept(nav.conceptId);
      // Scroll to the deepest expanded item after a brief delay
      const targetId = nav.pointId || nav.conceptId || nav.subtopicId || nav.topicId || nav.chapterId || nav.subjectId;
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(`study-item-${targetId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
      }
    } catch {}
  }, []); // eslint-disable-line

  const toggleSubj = (id: string) => {
    setExpandedSubj(e => e === id ? null : id);
    setExpandedChapter(null); setExpandedTopic(null); setExpandedSubtopic(null); setExpandedConcept(null);
  };
  const toggleChapter = (id: string) => {
    setExpandedChapter(e => e === id ? null : id);
    setExpandedTopic(null); setExpandedSubtopic(null); setExpandedConcept(null);
  };
  const toggleTopic = (id: string) => {
    setExpandedTopic(e => e === id ? null : id);
    setExpandedSubtopic(null); setExpandedConcept(null);
  };
  const toggleSubtopicExpand = (id: string) => {
    setExpandedSubtopic(e => e === id ? null : id);
    setExpandedConcept(null);
  };
  const toggleConceptExpand = (id: string) => setExpandedConcept(e => e === id ? null : id);

  // Modal state
  type ModalType = null | 'add' | 'edit' | 'days' | 'delete';
  const [modal, setModal] = useState<ModalType>(null);
  const [activePath, setActivePath] = useState<ActivePath>({
    subjId: '', chapterId: '', topicId: '', subtopicId: '', conceptId: '', pointId: '', level: 'subject'
  });
  const [formTitle, setFormTitle] = useState('');
  const [formDays, setFormDays] = useState('');
  const [formDifficulty, setFormDifficulty] = useState<DifficultyLevel>('easy');

  // Slider state for time
  const [sliderMonths, setSliderMonths] = useState(0);
  const [sliderDays, setSliderDays] = useState(0);
  const [sliderHours, setSliderHours] = useState(0);
  const [sliderMins, setSliderMins] = useState(0);

  // ─── Reset subject progress state ────────────────────────────────────
  const [resetConfirmSubjId, setResetConfirmSubjId] = useState<string | null>(null);

  const resetSliders = () => { setSliderMonths(0); setSliderDays(0); setSliderHours(0); setSliderMins(0); };
  const resetForm = () => { setFormTitle(''); setFormDays(''); setFormDifficulty('easy'); resetSliders(); };
  const closeModal = () => { setModal(null); resetForm(); };

  const openAdd = (level: LevelType, path: Partial<ActivePath>) => {
    setActivePath(prev => ({ ...prev, ...path, level }));
    resetForm();
    setModal('add');
  };

  const openEdit = (level: LevelType, path: Partial<ActivePath>, currentTitle: string, currentMins?: number, currentDays?: number, currentDifficulty?: DifficultyLevel) => {
    setActivePath(prev => ({ ...prev, ...path, level }));
    setFormTitle(currentTitle);
    if (currentDays !== undefined) setFormDays(currentDays.toString());
    else setFormDays('');
    if (currentDifficulty) setFormDifficulty(currentDifficulty);
    else setFormDifficulty('easy');
    if (currentMins && currentMins > 0) {
      const { months, days, hours, mins } = minutesToSliders(currentMins);
      setSliderMonths(months);
      setSliderDays(days);
      setSliderHours(hours);
      setSliderMins(mins);
    } else {
      resetSliders();
    }
    setModal('edit');
  };

  const openDelete = (level: LevelType, path: Partial<ActivePath>) => {
    setActivePath(prev => ({ ...prev, ...path, level }));
    setModal('delete');
  };

  const totalMins = totalMinsFromSliders(sliderMonths, sliderDays, sliderHours, sliderMins);
  // Show time picker for all levels except subject (in edit) and except point
  const showTimePicker = activePath.level !== 'point' && !(modal === 'edit' && activePath.level === 'subject');

  const handleSave = () => {
    if (!formTitle.trim()) return;
    const { subjId, chapterId, topicId, subtopicId, conceptId, pointId, level } = activePath;
    const mins = totalMins;

    if (modal === 'add') {
      const diff = formDifficulty;
      if (level === 'subject') {
        addSubject({ title: formTitle, color: getRandomColor(), allocatedDays: parseInt(formDays) || 0, manualDays: !!formDays, deadline: new Date().toISOString(), totalMinutes: mins || 1200 });
      } else if (level === 'chapter') {
        addChapter(subjId, { title: formTitle, totalMinutes: mins, ...(mins > 0 ? { estimatedMinutes: mins } : {}), ...(diff !== undefined ? { difficulty: diff } : {}) });
      } else if (level === 'topic') {
        addTopic(subjId, chapterId, { title: formTitle, totalMinutes: mins, ...(mins > 0 ? { estimatedMinutes: mins } : {}), ...(diff !== undefined ? { difficulty: diff } : {}) });
      } else if (level === 'subtopic') {
        addSubtopic(subjId, chapterId, topicId, { title: formTitle, ...(mins > 0 ? { estimatedMinutes: mins } : {}), ...(diff !== undefined ? { difficulty: diff } : {}) });
      } else if (level === 'concept') {
        addConcept(subjId, chapterId, topicId, subtopicId, { title: formTitle, ...(mins > 0 ? { estimatedMinutes: mins } : {}), ...(diff !== undefined ? { difficulty: diff } : {}) });
      } else if (level === 'point') {
        addPoint(subjId, chapterId, topicId, subtopicId, conceptId, { title: formTitle, difficulty: diff });
      }
    } else if (modal === 'edit') {
      const newMins = mins > 0 ? mins : undefined;
      const diff = formDifficulty;
      if (level === 'subject') {
        updateSubjectMeta(subjId, formTitle);
        const parsedDays = parseInt(formDays);
        if (!isNaN(parsedDays) && parsedDays > 0) updateSubjectDays(subjId, parsedDays);
      }
      else if (level === 'chapter') updateChapterMeta(subjId, chapterId, formTitle, newMins, diff);
      else if (level === 'topic') updateTopicMeta(subjId, chapterId, topicId, formTitle, newMins, diff);
      else if (level === 'subtopic') updateSubtopicMeta(subjId, chapterId, topicId, subtopicId, formTitle, newMins, diff);
      else if (level === 'concept') updateConceptMeta(subjId, chapterId, topicId, subtopicId, conceptId, formTitle, newMins, diff);
      else if (level === 'point') updatePointMeta(subjId, chapterId, topicId, subtopicId, conceptId, pointId, formTitle, diff);
    } else if (modal === 'days') {
      if (formDays) updateSubjectDays(subjId, parseInt(formDays));
    }
    closeModal();
  };

  const handleDelete = () => {
    const { subjId, chapterId, topicId, subtopicId, conceptId, pointId, level } = activePath;
    if (level === 'subject') deleteSubject(subjId);
    else if (level === 'chapter') deleteChapter(subjId, chapterId);
    else if (level === 'topic') deleteTopic(subjId, chapterId, topicId);
    else if (level === 'subtopic') deleteSubtopic(subjId, chapterId, topicId, subtopicId);
    else if (level === 'concept') deleteConcept(subjId, chapterId, topicId, subtopicId, conceptId);
    else if (level === 'point') deletePoint(subjId, chapterId, topicId, subtopicId, conceptId, pointId);
    closeModal();
  };

  const levelTitleKey: Record<LevelType, string> = {
    subject: 'addSubject', chapter: 'addChapter', topic: 'addTopic',
    subtopic: 'addSubtopic', concept: 'addConcept', point: 'addPoint',
  };
  const deleteTitleKey: Record<LevelType, string> = {
    subject: 'deleteSubject', chapter: 'deleteChapter', topic: 'deleteTopic',
    subtopic: 'deleteSubtopic', concept: 'deleteConcept', point: 'deletePoint',
  };
  const levelIcon: Record<LevelType, any> = {
    subject: BookOpen, chapter: FolderPlus, topic: Layers,
    subtopic: List, concept: Lightbulb, point: Dot,
  };

  const modalTitle = modal === 'edit' ? `${t('edit')}: ${formTitle || '...'}` : t(levelTitleKey[activePath.level]);
  const ModalIcon = levelIcon[activePath.level];

  // ─── Apply filter to subject list ───────────────────────────────────────
  const subjectMatchesMarks = (s: Subject): boolean => {
    if (importantOnly && !s.important && !subjectHasDeepFlag(s, 'important')) return false;
    if (weakOnly && !s.weak && !subjectHasDeepFlag(s, 'weak')) return false;
    return true;
  };
  const filteredSubjects = useMemo(() => {
    return subjects.filter(s =>
      matchesStatus(subjectStatus(s), filter) && subjectMatchesMarks(s)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, filter, importantOnly, weakOnly]);

  return (
    <Layout>
      <div className="p-5">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <h1 className="text-2xl font-bold text-foreground">{t('subjects')}</h1>
          <div className="flex items-center gap-2">
            <motion.div whileTap={{ scale: 0.95 }}>
              <button
                type="button"
                onClick={() => setReorderMode(v => !v)}
                className={`p-2 rounded-xl border transition-all ${
                  reorderMode
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
                    : 'bg-card text-muted-foreground border-border/60 hover:bg-secondary'
                }`}
                title={reorderMode ? 'Reorder Mode বন্ধ করুন' : 'Reorder Mode চালু করুন'}
              >
                <ArrowUpDown size={16} />
              </button>
            </motion.div>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                variant="primary"
                className="py-2 px-3 h-auto rounded-xl text-xs gap-1.5 shadow-md"
                onClick={() => openAdd('subject', {})}
              >
                <Plus size={16} /> {t('addSubject')}
              </Button>
            </motion.div>
          </div>
        </motion.header>

        {/* ─── Quick to-do notes (Temp Notes) ──────────────────────── */}
        <TempNoteSection />

        {/* ─── Filter chip bar ────────────────────────────────────────── */}
        {subjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-center gap-1.5 flex-wrap"
          >
            <Filter size={13} className="text-muted-foreground mr-0.5" />
            {([
              ['all',         t('filterAll'),         'bg-primary text-primary-foreground'],
              ['inProgress',  t('filterInProgress'),  'bg-amber-500 text-white'],
              ['completed',   t('filterCompleted'),   'bg-green-500 text-white'],
              ['notStarted',  t('filterNotStarted'),  'bg-slate-500 text-white'],
            ] as const).map(([key, label, activeCls]) => {
              const isActive = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                    isActive
                      ? `${activeCls} border-transparent shadow-sm`
                      : 'bg-card text-muted-foreground border-border/60 hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <span className="mx-1 text-muted-foreground/40">|</span>
            <button
              type="button"
              onClick={() => setImportantOnly(v => !v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1 transition-all ${
                importantOnly
                  ? 'bg-yellow-400 text-yellow-900 border-yellow-500 shadow-sm'
                  : 'bg-card text-muted-foreground border-border/60 hover:bg-secondary'
              }`}
            >
              <Star size={11} fill={importantOnly ? 'currentColor' : 'none'} />
              {t('importantOnly')}
            </button>
            <button
              type="button"
              onClick={() => setWeakOnly(v => !v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1 transition-all ${
                weakOnly
                  ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                  : 'bg-card text-muted-foreground border-border/60 hover:bg-secondary'
              }`}
            >
              <AlertTriangle size={11} fill={weakOnly ? 'currentColor' : 'none'} />
              {t('weakOnly')}
            </button>
          </motion.div>
        )}

        {/* Empty state */}
        {subjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center px-6"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-6 w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center"
            >
              <BookOpen size={36} className="text-primary" />
            </motion.div>
            <h3 className="text-xl font-bold text-foreground mb-2">
              {t('noSubjectsYet')}
            </h3>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              {t('addFirstSubject')}
            </p>
            <motion.div whileTap={{ scale: 0.95 }}>
              <Button
                variant="primary"
                className="py-3 px-6 rounded-2xl text-sm gap-2 shadow-lg shadow-primary/25"
                onClick={() => openAdd('subject', {})}
              >
                <Plus size={18} /> {t('addSubject')}
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* No-filter-results state */}
        {subjects.length > 0 && filteredSubjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border/50 rounded-2xl"
          >
            <Filter size={32} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-sm">{t('noResultsForFilter')}</p>
            <button
              onClick={() => { setFilter('all'); setImportantOnly(false); setWeakOnly(false); }}
              className="mt-3 px-3 py-1 text-xs font-bold text-primary hover:underline"
            >
              {t('filterAll')}
            </button>
          </motion.div>
        )}

        {/* ─── Grouped marked-items view (when Important/Weak filter is on) ─── */}
        {(importantOnly || weakOnly) && subjects.length > 0 && (() => {
          const flagged = gatherFlaggedItems(subjects, { important: importantOnly, weak: weakOnly });
          if (flagged.length === 0) return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-16 text-center px-6"
            >
              {importantOnly
                ? <Star size={32} className="text-yellow-400 mb-3" />
                : <AlertTriangle size={32} className="text-rose-400 mb-3" />}
              <p className="text-sm font-bold text-foreground mb-1">
                {importantOnly ? t('importantOnly') : t('weakOnly')}
              </p>
              <p className="text-xs text-muted-foreground">{t('noResultsForFilter')}</p>
            </motion.div>
          );

          // Group items by subject, preserving subject order
          const groups = subjects
            .map(s => ({
              subjectId: s.id,
              subjectTitle: s.title,
              subjectColor: s.color,
              items: flagged.filter(f => f.subjectId === s.id),
            }))
            .filter(g => g.items.length > 0);

          return (
            <div className="space-y-4">
              {groups.map(group => (
                <motion.div
                  key={group.subjectId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border/60 rounded-2xl overflow-hidden"
                >
                  {/* Subject header */}
                  <div
                    className="px-4 py-3 border-b border-border/50 flex items-center gap-2.5"
                    style={{ borderLeftColor: group.subjectColor, borderLeftWidth: 4 }}
                  >
                    <span className="text-sm font-bold text-foreground flex-1">{group.subjectTitle}</span>
                    <span className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border/60">
                      {group.items.length}
                    </span>
                  </div>
                  {/* Items */}
                  <ul className="divide-y divide-border/40">
                    {group.items.map((it, i) => (
                      <li key={`${it.level}-${i}`} className="px-4 py-3 group/row hover:bg-secondary/30 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className="flex-1 min-w-0">
                            {/* Breadcrumb (excluding subject name since it's the header) */}
                            {it.breadcrumb.slice(1).length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap text-[10px] text-muted-foreground font-medium mb-1.5 leading-relaxed">
                                {it.breadcrumb.slice(1).map((c, ci) => (
                                  <React.Fragment key={ci}>
                                    {ci > 0 && <ChevronRight size={8} className="opacity-40 shrink-0" />}
                                    <span className="max-w-[140px] truncate">{c}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                            )}
                            {/* Level tag + title */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border/60 shrink-0">
                                {it.level}
                              </span>
                              <h4 className="text-sm font-bold text-foreground flex-1 min-w-0">{it.title}</h4>
                            </div>
                            {/* Marks badges */}
                            <div className="mt-1.5">
                              <MarksBadgeRow
                                important={it.important}
                                weak={it.weak}
                                note={it.note}
                                onClickNote={() => openNote(it.path, it.note ?? '')}
                              />
                            </div>
                          </div>
                          <ItemActions
                            path={it.path}
                            important={it.important}
                            weak={it.weak}
                            hasNote={!!it.note}
                            currentNote={it.note}
                            onOpenNote={openNote}
                            size="sm"
                            alwaysVisible
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          );
        })()}

        {/* ─── Full subjects list (hidden when Important/Weak filter is active) ─── */}
        {!importantOnly && !weakOnly && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubjDragEnd}>
          <SortableContext items={filteredSubjects.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence>
          <div className="space-y-4">
            {filteredSubjects.map((subj, idx) => {
              const isExpanded = expandedSubj === subj.id;
              const chapterCount = subj.chapters.length;
              const completedChapters = subj.chapters.filter(c => isChapterContentDone(c)).length;
              const counts = chapterCounts(subj);
              const prog = chapterCount === 0 ? 0 : (completedChapters / chapterCount) * 100;
              const overviewProg = chapterCount === 0 ? 0 : (counts.overviewOnly / chapterCount) * 100;
              const subjPath: MarkPath = { subjectId: subj.id, level: 'subject' };

              return (
                <SortableItemWrapper key={subj.id} id={subj.id} reorderMode={reorderMode}>
                {(subjHandle) => (
                <motion.div
                  id={`study-item-${subj.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: idx * 0.05, type: 'spring', stiffness: 260, damping: 22 }}
                  className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden card-hover"
                >
                  {/* Subject header */}
                  <div
                    className="p-3 relative flex items-center justify-between cursor-pointer active:bg-secondary/40 transition-colors group/row"
                    onClick={() => toggleSubj(subj.id)}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: subj.color }} />
                    <div className="pl-3 flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="font-bold text-foreground text-base leading-tight truncate mb-0.5">{subj.title}</h3>
                      {/* Badges row — L1, days, status badges, marks */}
                      <div className="flex items-center gap-1 flex-wrap mb-1">
                        <span className="text-[9px] font-bold text-muted-foreground/60 bg-secondary/80 px-1.5 py-0.5 rounded border border-border/40">L1</span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setActivePath(prev => ({ ...prev, subjId: subj.id, level: 'subject' }));
                            setFormDays(subj.allocatedDays.toString());
                            setModal('days');
                          }}
                          className="px-1.5 py-0.5 bg-secondary text-muted-foreground text-[10px] font-bold rounded-md border border-border/50 cursor-pointer hover:bg-primary/10 transition-colors"
                        >
                          {subj.allocatedDays} d
                        </button>
                        {subj.chapters.length > 0 && subj.chapters.every(c => isChapterContentDone(c)) && (
                          <span className="px-1.5 py-0.5 bg-green-500/10 text-green-700 text-[9px] font-bold rounded-md">✓ {t('filterCompleted')}</span>
                        )}
                        {counts.overviewOnly > 0 && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-500/15 text-indigo-700 text-[9px] font-bold rounded-md border border-indigo-300/60">
                            <BookOpenCheck size={9} /> {counts.overviewOnly} {t('overviewBadge')}
                          </span>
                        )}
                        <MarksBadgeRow important={subj.important} weak={subj.weak} note={subj.note} onClickNote={() => openNote(subjPath, subj.note ?? '')} size="xs" />
                      </div>
                      {/* Meta row — chapters count + date */}
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                        <span>{t('chapters')}: {completedChapters}/{chapterCount}</span>
                        {counts.overviewOnly > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-600 font-bold">{counts.overviewOnly} {t('overviewDone')}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{format(parseISO(subj.deadline), 'MMM d, yy')}</span>
                      </div>
                      {/* Layered progress bar */}
                      <div className="mt-2 h-1 w-full bg-secondary rounded-full overflow-hidden relative">
                        {overviewProg > 0 && (
                          <motion.div
                            className="absolute left-0 top-0 h-full opacity-40"
                            initial={{ width: 0 }}
                            animate={{ width: `${prog + overviewProg}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            style={{ backgroundColor: subj.color }}
                          />
                        )}
                        <motion.div
                          className="absolute left-0 top-0 h-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${prog}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{ backgroundColor: subj.color }}
                        />
                      </div>
                    </div>
                    {/* Action buttons — compact two-row layout */}
                    <div className="flex flex-col items-end gap-0.5 pl-2 shrink-0">
                      <div className="flex items-center gap-0.5">
                        <ItemActions
                          path={subjPath}
                          important={subj.important}
                          weak={subj.weak}
                          hasNote={!!subj.note}
                          currentNote={subj.note}
                          onOpenNote={openNote}
                        />
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={e => { e.stopPropagation(); setResetConfirmSubjId(subj.id); }}
                          className="p-1.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 rounded-full transition-colors"
                          title={t('resetSubject')}
                        >
                          <RotateCcw size={13} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openEdit('subject', { subjId: subj.id }, subj.title, undefined, subj.allocatedDays); }}
                          className="p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-full transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openDelete('subject', { subjId: subj.id }); }}
                          className="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                        <motion.div
                          animate={{ rotate: isExpanded ? 90 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-muted-foreground bg-secondary p-1.5 rounded-full"
                        >
                          <ChevronRight size={14} />
                        </motion.div>
                      </div>
                    </div>
                    {subjHandle}
                  </div>

                  {/* Chapters */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div {...collapseAnim} className="overflow-hidden bg-secondary/10 border-t border-border/40">
                        <div className="p-3 pl-4 space-y-2">
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                            const { active, over } = e;
                            if (!over || active.id === over.id) return;
                            const fIdx = subj.chapters.findIndex(c => c.id === active.id);
                            const tIdx = subj.chapters.findIndex(c => c.id === over.id);
                            if (fIdx !== -1 && tIdx !== -1) reorderChapters(subj.id, fIdx, tIdx);
                          }}>
                          <SortableContext items={subj.chapters.filter(c => matchesStatus(chapterStatus(c), filter)).map(c => c.id)} strategy={verticalListSortingStrategy}>
                          {subj.chapters
                            .filter(c => matchesStatus(chapterStatus(c), filter))
                            .map((chapter, chIdx) => {
                            // chIdx in filtered list is fine for unlock since filter is purely visual;
                            // use original index for unlock check
                            const origChIdx = subj.chapters.findIndex(c => c.id === chapter.id);
                            const chLocked = !isChapterUnlocked(subj, origChIdx);
                            const chExpanded = expandedChapter === chapter.id;
                            const topicCount = chapter.topics.length;
                            const completedTopics = chapter.topics.filter(t => isTopicContentDone(t)).length;
                            const overviewTopics = chapter.topics.filter(t => t.completed && !isTopicContentDone(t)).length;
                            let chSubtopics = 0, chCompletedSubs = 0;
                            chapter.topics.forEach(t => { chSubtopics += t.subtopics.length; chCompletedSubs += t.subtopics.filter(s => isSubtopicContentDone(s)).length; });
                            const chPath: MarkPath = { subjectId: subj.id, chapterId: chapter.id, level: 'chapter' };
                            return (
                              <SortableItemWrapper key={chapter.id} id={chapter.id} reorderMode={reorderMode}>
                              {(chHandle) => (
                              <motion.div id={`study-item-${chapter.id}`} {...itemAnim} className={`bg-card border rounded-xl overflow-hidden shadow-sm ${chLocked ? 'border-border/30 opacity-70' : 'border-border/50'} ${chapter.important ? 'ring-1 ring-yellow-300/60' : ''} ${chapter.weak ? 'ring-1 ring-rose-300/60' : ''}`}>
                                <div
                                  className="p-3 flex items-center gap-2 cursor-pointer hover:bg-secondary/30 transition-colors group/row"
                                  onClick={() => toggleChapter(chapter.id)}
                                >
                                  <button
                                    onClick={e => { e.stopPropagation(); if (!chLocked) toggleChapterComplete(subj.id, chapter.id); }}
                                    className={`shrink-0 transition-colors ${chLocked ? 'cursor-not-allowed text-muted-foreground/50' : 'text-muted-foreground hover:text-primary'}`}
                                    disabled={chLocked}
                                    title={chLocked ? t('completePrevChapter') : undefined}
                                  >
                                    {chLocked ? <Lock size={18} className="text-muted-foreground/50" /> : isChapterContentDone(chapter) ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <BookOpen size={13} className="text-primary shrink-0" />
                                      <span className={`font-semibold text-sm ${isChapterContentDone(chapter) ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                        {chapter.title}
                                      </span>
                                      <span className="text-[9px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L2</span>
                                      {chapter.completed && !isChapterContentDone(chapter) && (
                                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-indigo-700 bg-indigo-500/15 px-1.5 py-0.5 rounded-full border border-indigo-400/60 shrink-0">
                                          <BookOpenCheck size={9} /> {t('overviewBadge')}
                                        </span>
                                      )}
                                    </div>
                                    <MarksBadgeRow important={chapter.important} weak={chapter.weak} note={chapter.note} onClickNote={() => openNote(chPath, chapter.note ?? '')} />
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {t('topics')}: {completedTopics}/{topicCount}
                                      {overviewTopics > 0 ? ` • ${overviewTopics} ${t('overviewBadge')}` : ''}
                                      {chSubtopics > 0 ? ` • Subtopics: ${chCompletedSubs}/${chSubtopics}` : ''}
                                      {chapter.estimatedMinutes ? ` • ${formatTotalTime(chapter.estimatedMinutes, t)}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <ItemActions
                                      path={chPath}
                                      important={chapter.important}
                                      weak={chapter.weak}
                                      hasNote={!!chapter.note}
                                      currentNote={chapter.note}
                                      onOpenNote={openNote}
                                      size="sm"
                                    />
                                    <button
                                      onClick={e => { e.stopPropagation(); openEdit('chapter', { subjId: subj.id, chapterId: chapter.id }, chapter.title, chapter.estimatedMinutes, undefined, chapter.difficulty); }}
                                      className="p-1.5 text-muted-foreground hover:text-primary rounded-lg transition-colors"
                                    >
                                      <Pencil size={12} />
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); openDelete('chapter', { subjId: subj.id, chapterId: chapter.id }); }}
                                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                    <motion.div animate={{ rotate: chExpanded ? 90 : 0 }} transition={{ duration: 0.18 }}>
                                      <ChevronRight size={15} className="text-muted-foreground" />
                                    </motion.div>
                                    {chHandle}
                                  </div>
                                </div>

                                {/* Topics */}
                                <AnimatePresence>
                                  {chExpanded && (
                                    <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/30 bg-secondary/10">
                                      <div className="p-2 pl-8 space-y-1.5">
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                                          const { active, over } = e;
                                          if (!over || active.id === over.id) return;
                                          const fIdx = chapter.topics.findIndex(t => t.id === active.id);
                                          const tIdx = chapter.topics.findIndex(t => t.id === over.id);
                                          if (fIdx !== -1 && tIdx !== -1) reorderTopics(subj.id, chapter.id, fIdx, tIdx);
                                        }}>
                                        <SortableContext items={chapter.topics.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                        {chapter.topics.map((topic, topIdx) => {
                                          const topLocked = chLocked || !isTopicUnlocked(chapter, topIdx);
                                          const tExpanded = expandedTopic === topic.id;
                                          const completedSubs = topic.subtopics.filter(s => isSubtopicContentDone(s)).length;
                                          const overviewSubs = topic.subtopics.filter(s => s.completed && !isSubtopicContentDone(s)).length;
                                          let topConcepts = 0, topCompletedConcepts = 0;
                                          topic.subtopics.forEach(s => { topConcepts += s.concepts.length; topCompletedConcepts += s.concepts.filter(c => c.completed).length; });
                                          const topPath: MarkPath = { subjectId: subj.id, chapterId: chapter.id, topicId: topic.id, level: 'topic' };
                                          return (
                                            <SortableItemWrapper key={topic.id} id={topic.id} reorderMode={reorderMode}>
                                            {(topHandle) => (
                                            <motion.div id={`study-item-${topic.id}`} {...itemAnim} className={`bg-card border rounded-lg overflow-hidden ${topLocked ? 'border-border/20 opacity-60' : 'border-border/40'} ${topic.important ? 'ring-1 ring-yellow-300/50' : ''} ${topic.weak ? 'ring-1 ring-rose-300/50' : ''}`}>
                                              <div
                                                className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-secondary/20 group/row"
                                                onClick={() => toggleTopic(topic.id)}
                                              >
                                                <button
                                                  onClick={e => { e.stopPropagation(); if (!topLocked) toggleTopicComplete(subj.id, chapter.id, topic.id); }}
                                                  className="shrink-0"
                                                  disabled={topLocked}
                                                  title={topLocked ? t('completePrevTopic') : undefined}
                                                >
                                                  {topLocked ? <Lock size={15} className="text-muted-foreground/40" /> : isTopicContentDone(topic) ? <CheckCircle2 size={15} className="text-green-500" /> : <Circle size={15} className="text-muted-foreground" />}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Layers size={11} className="text-accent-foreground shrink-0" />
                                                    <span className={`text-xs font-semibold ${isTopicContentDone(topic) ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                      {topic.title}
                                                    </span>
                                                    <span className="text-[8px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L3</span>
                                                    {topic.completed && !isTopicContentDone(topic) && (
                                                      <span className="flex items-center gap-0.5 text-[8px] font-bold text-indigo-700 bg-indigo-500/15 px-1.5 py-0.5 rounded-full border border-indigo-400/60 shrink-0">
                                                        <BookOpenCheck size={8} /> {t('overviewBadge')}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <MarksBadgeRow size="xs" important={topic.important} weak={topic.weak} note={topic.note} onClickNote={() => openNote(topPath, topic.note ?? '')} />
                                                  <p className="text-[9px] text-muted-foreground mt-0.5">
                                                    Subtopics: {completedSubs}/{topic.subtopics.length}
                                                    {overviewSubs > 0 ? ` • ${overviewSubs} ${t('overviewBadge')}` : ''}
                                                    {topConcepts > 0 ? ` • Concepts: ${topCompletedConcepts}/${topConcepts}` : ''}
                                                    {topic.estimatedMinutes ? ` • ${formatTotalTime(topic.estimatedMinutes, t)}` : ''}
                                                  </p>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                  <ItemActions
                                                    path={topPath}
                                                    important={topic.important}
                                                    weak={topic.weak}
                                                    hasNote={!!topic.note}
                                                    currentNote={topic.note}
                                                    onOpenNote={openNote}
                                                    size="sm"
                                                  />
                                                  <button
                                                    onClick={e => { e.stopPropagation(); openEdit('topic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id }, topic.title, topic.estimatedMinutes, undefined, topic.difficulty); }}
                                                    className="p-1 text-muted-foreground hover:text-primary"
                                                  >
                                                    <Pencil size={10} />
                                                  </button>
                                                  <button
                                                    onClick={e => { e.stopPropagation(); openDelete('topic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id }); }}
                                                    className="p-1 text-muted-foreground hover:text-destructive"
                                                  >
                                                    <Trash2 size={11} />
                                                  </button>
                                                  <motion.div animate={{ rotate: tExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                    <ChevronRight size={13} className="text-muted-foreground" />
                                                  </motion.div>
                                                  {topHandle}
                                                </div>
                                              </div>

                                              {/* Subtopics */}
                                              <AnimatePresence>
                                                {tExpanded && (
                                                  <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/20 bg-secondary/10">
                                                    <div className="p-2 pl-10 space-y-1">
                                                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                                                        const { active, over } = e;
                                                        if (!over || active.id === over.id) return;
                                                        const fIdx = topic.subtopics.findIndex(s => s.id === active.id);
                                                        const tIdx = topic.subtopics.findIndex(s => s.id === over.id);
                                                        if (fIdx !== -1 && tIdx !== -1) reorderSubtopics(subj.id, chapter.id, topic.id, fIdx, tIdx);
                                                      }}>
                                                      <SortableContext items={topic.subtopics.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                                      {topic.subtopics.map((sub, subIdx) => {
                                                        const subLocked = topLocked || !isSubtopicUnlocked(topic, subIdx);
                                                        const subExpanded = expandedSubtopic === sub.id;
                                                        const completedConcepts = sub.concepts.filter(c => isConceptContentDone(c)).length;
                                                        const overviewConcepts = sub.concepts.filter(c => c.completed && !isConceptContentDone(c)).length;
                                                        let subPoints = 0, subCompletedPoints = 0;
                                                        sub.concepts.forEach(c => { subPoints += c.points.length; subCompletedPoints += c.points.filter(p => p.completed).length; });
                                                        const subPath: MarkPath = { subjectId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, level: 'subtopic' };
                                                        return (
                                                          <SortableItemWrapper key={sub.id} id={sub.id} reorderMode={reorderMode}>
                                                          {(subHandle) => (
                                                          <motion.div id={`study-item-${sub.id}`} {...itemAnim} className={`bg-card border rounded-lg overflow-hidden ${subLocked ? 'border-border/15 opacity-55' : 'border-border/30'} ${sub.important ? 'ring-1 ring-yellow-300/40' : ''} ${sub.weak ? 'ring-1 ring-rose-300/40' : ''}`}>
                                                            <div
                                                              className="px-2.5 py-2 flex items-center gap-1.5 cursor-pointer hover:bg-secondary/20 group/row"
                                                              onClick={() => toggleSubtopicExpand(sub.id)}
                                                            >
                                                              <button onClick={e => { e.stopPropagation(); if (!subLocked) toggleSubtopicComplete(subj.id, chapter.id, topic.id, sub.id); }} disabled={subLocked} title={subLocked ? t('completePrevSubtopic') : undefined}>
                                                                {subLocked ? <Lock size={13} className="text-muted-foreground/35" /> : isSubtopicContentDone(sub) ? <CheckCircle2 size={13} className="text-green-500" /> : <Circle size={13} className="text-muted-foreground" />}
                                                              </button>
                                                              <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1 flex-wrap">
                                                                  <List size={10} className="text-blue-400 shrink-0" />
                                                                  <span className={`text-[11px] font-medium ${isSubtopicContentDone(sub) ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                    {sub.title}
                                                                  </span>
                                                                  <span className="text-[8px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L4</span>
                                                                  {sub.completed && !isSubtopicContentDone(sub) && (
                                                                    <span className="flex items-center gap-0.5 text-[8px] font-bold text-indigo-700 bg-indigo-500/15 px-1.5 py-0.5 rounded-full border border-indigo-400/60 shrink-0">
                                                                      <BookOpenCheck size={8} /> {t('overviewBadge')}
                                                                    </span>
                                                                  )}
                                                                </div>
                                                                <MarksBadgeRow size="xs" important={sub.important} weak={sub.weak} note={sub.note} onClickNote={() => openNote(subPath, sub.note ?? '')} />
                                                                <p className="text-[8px] text-muted-foreground">
                                                                  Concepts: {completedConcepts}/{sub.concepts.length}
                                                                  {overviewConcepts > 0 ? ` • ${overviewConcepts} ${t('overviewBadge')}` : ''}
                                                                  {subPoints > 0 ? ` • Points: ${subCompletedPoints}/${subPoints}` : ''}
                                                                  {sub.estimatedMinutes ? ` • ${formatTotalTime(sub.estimatedMinutes, t)}` : ''}
                                                                </p>
                                                              </div>
                                                              <div className="flex items-center gap-0.5 shrink-0">
                                                                <ItemActions
                                                                  path={subPath}
                                                                  important={sub.important}
                                                                  weak={sub.weak}
                                                                  hasNote={!!sub.note}
                                                                  currentNote={sub.note}
                                                                  onOpenNote={openNote}
                                                                  size="sm"
                                                                />
                                                                <button onClick={e => { e.stopPropagation(); openEdit('subtopic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id }, sub.title, sub.estimatedMinutes, undefined, sub.difficulty); }} className="p-1 text-muted-foreground hover:text-primary">
                                                                  <Pencil size={9} />
                                                                </button>
                                                                <button onClick={e => { e.stopPropagation(); openDelete('subtopic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id }); }} className="p-1 text-muted-foreground hover:text-destructive">
                                                                  <Trash2 size={10} />
                                                                </button>
                                                                <motion.div animate={{ rotate: subExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                                  <ChevronRight size={11} className="text-muted-foreground" />
                                                                </motion.div>
                                                                {subHandle}
                                                              </div>
                                                            </div>

                                                            {/* Concepts */}
                                                            <AnimatePresence>
                                                              {subExpanded && (
                                                                <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/20 bg-secondary/10">
                                                                  <div className="p-1.5 pl-8 space-y-1">
                                                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                                                                      const { active, over } = e;
                                                                      if (!over || active.id === over.id) return;
                                                                      const fIdx = sub.concepts.findIndex(c => c.id === active.id);
                                                                      const tIdx = sub.concepts.findIndex(c => c.id === over.id);
                                                                      if (fIdx !== -1 && tIdx !== -1) reorderConcepts(subj.id, chapter.id, topic.id, sub.id, fIdx, tIdx);
                                                                    }}>
                                                                    <SortableContext items={sub.concepts.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                                                    {sub.concepts.map((concept, conIdx) => {
                                                                      const conLocked = subLocked || !isConceptUnlocked(sub, conIdx);
                                                                      const cExpanded = expandedConcept === concept.id;
                                                                      const completedPoints = concept.points.filter(p => p.completed).length;
                                                                      const conPath: MarkPath = { subjectId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id, level: 'concept' };
                                                                      return (
                                                                        <SortableItemWrapper key={concept.id} id={concept.id} reorderMode={reorderMode}>
                                                                        {(conHandle) => (
                                                                        <motion.div id={`study-item-${concept.id}`} {...itemAnim} className={`bg-card border rounded-lg overflow-hidden ${conLocked ? 'border-border/10 opacity-50' : 'border-border/20'} ${concept.important ? 'ring-1 ring-yellow-300/40' : ''} ${concept.weak ? 'ring-1 ring-rose-300/40' : ''}`}>
                                                                          <div
                                                                            className="px-2 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-secondary/20 group/row"
                                                                            onClick={() => toggleConceptExpand(concept.id)}
                                                                          >
                                                                            <button onClick={e => { e.stopPropagation(); if (!conLocked) toggleConceptComplete(subj.id, chapter.id, topic.id, sub.id, concept.id); }} disabled={conLocked} title={conLocked ? t('completePrevConcept') : undefined}>
                                                                              {conLocked ? <Lock size={11} className="text-muted-foreground/30" /> : isConceptContentDone(concept) ? <CheckCircle2 size={11} className="text-green-500" /> : <Circle size={11} className="text-muted-foreground" />}
                                                                            </button>
                                                                            <div className="flex-1 min-w-0">
                                                                              <div className="flex items-center gap-1 flex-wrap">
                                                                                <Lightbulb size={9} className="text-yellow-500 shrink-0" />
                                                                                <span className={`text-[10px] font-medium ${isConceptContentDone(concept) ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                  {concept.title}
                                                                                </span>
                                                                                <span className="text-[8px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L5</span>
                                                                                {concept.completed && !isConceptContentDone(concept) && (
                                                                                  <span className="flex items-center gap-0.5 text-[8px] font-bold text-indigo-700 bg-indigo-500/15 px-1.5 py-0.5 rounded-full border border-indigo-400/60 shrink-0">
                                                                                    <BookOpenCheck size={7} /> {t('overviewBadge')}
                                                                                  </span>
                                                                                )}
                                                                              </div>
                                                                              <MarksBadgeRow size="xs" important={concept.important} weak={concept.weak} note={concept.note} onClickNote={() => openNote(conPath, concept.note ?? '')} />
                                                                              <p className="text-[8px] text-muted-foreground">
                                                                                {concept.points.length > 0 ? `Points: ${completedPoints}/${concept.points.length}` : ''}
                                                                                {concept.estimatedMinutes ? ` • ${formatTotalTime(concept.estimatedMinutes, t)}` : ''}
                                                                              </p>
                                                                            </div>
                                                                            <div className="flex items-center gap-0.5 shrink-0">
                                                                              <ItemActions
                                                                                path={conPath}
                                                                                important={concept.important}
                                                                                weak={concept.weak}
                                                                                hasNote={!!concept.note}
                                                                                currentNote={concept.note}
                                                                                onOpenNote={openNote}
                                                                                size="sm"
                                                                              />
                                                                              <button onClick={e => { e.stopPropagation(); openEdit('concept', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id }, concept.title, concept.estimatedMinutes, undefined, concept.difficulty); }} className="p-1 text-muted-foreground hover:text-primary">
                                                                                <Pencil size={8} />
                                                                              </button>
                                                                              <button onClick={e => { e.stopPropagation(); openDelete('concept', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id }); }} className="p-1 text-muted-foreground hover:text-destructive">
                                                                                <Trash2 size={9} />
                                                                              </button>
                                                                              <motion.div animate={{ rotate: cExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                                                <ChevronRight size={10} className="text-muted-foreground" />
                                                                              </motion.div>
                                                                              {conHandle}
                                                                            </div>
                                                                          </div>

                                                                          {/* Points */}
                                                                          <AnimatePresence>
                                                                            {cExpanded && (
                                                                              <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/10 bg-secondary/10">
                                                                                <div className="p-1.5 pl-7 space-y-0.5">
                                                                                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                                                                                    const { active, over } = e;
                                                                                    if (!over || active.id === over.id) return;
                                                                                    const fIdx = concept.points.findIndex(p => p.id === active.id);
                                                                                    const tIdx = concept.points.findIndex(p => p.id === over.id);
                                                                                    if (fIdx !== -1 && tIdx !== -1) reorderPoints(subj.id, chapter.id, topic.id, sub.id, concept.id, fIdx, tIdx);
                                                                                  }}>
                                                                                  <SortableContext items={concept.points.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                                                                  {concept.points.map((point, ptIdx) => {
                                                                                    const ptLocked = conLocked || !isPointUnlocked(concept, ptIdx);
                                                                                    const ptPath: MarkPath = { subjectId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id, pointId: point.id, level: 'point' };
                                                                                    return (
                                                                                    <SortableItemWrapper key={point.id} id={point.id} reorderMode={reorderMode}>
                                                                                    {(ptHandle) => (
                                                                                    <motion.div
                                                                                      id={`study-item-${point.id}`}
                                                                                      {...itemAnim}
                                                                                      className={`flex flex-col gap-0.5 px-2 py-1.5 rounded-lg hover:bg-card group/row ${ptLocked ? 'opacity-45' : ''} ${point.important ? 'ring-1 ring-yellow-300/40' : ''} ${point.weak ? 'ring-1 ring-rose-300/40' : ''}`}
                                                                                    >
                                                                                      <div className="flex items-center gap-1.5">
                                                                                        <button onClick={() => { if (!ptLocked) togglePointComplete(subj.id, chapter.id, topic.id, sub.id, concept.id, point.id); }} disabled={ptLocked} title={ptLocked ? t('completePrevPoint') : undefined}>
                                                                                          {ptLocked ? <Lock size={10} className="text-muted-foreground/30" /> : point.completed ? <CheckCircle2 size={10} className="text-green-500" /> : <Circle size={10} className="text-muted-foreground" />}
                                                                                        </button>
                                                                                        <Dot size={10} className="text-muted-foreground shrink-0" />
                                                                                        <span className={`text-[9px] font-medium flex-1 min-w-0 ${point.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                          {point.title}
                                                                                        </span>
                                                                                        <span className="text-[7px] font-bold text-muted-foreground/40 bg-secondary/60 px-1 py-0.5 rounded border border-border/20 shrink-0">L6</span>
                                                                                        <ItemActions
                                                                                          path={ptPath}
                                                                                          important={point.important}
                                                                                          weak={point.weak}
                                                                                          hasNote={!!point.note}
                                                                                          currentNote={point.note}
                                                                                          onOpenNote={openNote}
                                                                                          size="sm"
                                                                                        />
                                                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-all shrink-0">
                                                                                          <button onClick={() => openEdit('point', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id, pointId: point.id }, point.title, undefined, undefined, point.difficulty)} className="p-0.5 text-muted-foreground hover:text-primary">
                                                                                            <Pencil size={8} />
                                                                                          </button>
                                                                                          <button onClick={() => openDelete('point', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id, pointId: point.id })} className="p-0.5 text-muted-foreground hover:text-destructive">
                                                                                            <Trash2 size={9} />
                                                                                          </button>
                                                                                        </div>
                                                                                        {ptHandle}
                                                                                      </div>
                                                                                      {(point.important || point.weak || point.note) && (
                                                                                        <div className="ml-6">
                                                                                          <MarksBadgeRow size="xs" important={point.important} weak={point.weak} note={point.note} onClickNote={() => openNote(ptPath, point.note ?? '')} />
                                                                                        </div>
                                                                                      )}
                                                                                    </motion.div>
                                                                                    )}
                                                                                    </SortableItemWrapper>
                                                                                  ); })}
                                                                                  </SortableContext>
                                                                                  </DndContext>
                                                                                  <button
                                                                                    onClick={() => openAdd('point', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id })}
                                                                                    className="w-full py-1 border border-dashed border-border/60 text-[9px] font-semibold text-muted-foreground hover:text-foreground rounded-md flex items-center justify-center gap-0.5"
                                                                                  >
                                                                                    <Plus size={9} /> {t('addPoint')}
                                                                                  </button>
                                                                                </div>
                                                                              </motion.div>
                                                                            )}
                                                                          </AnimatePresence>
                                                                        </motion.div>
                                                                        )}
                                                                        </SortableItemWrapper>
                                                                      );
                                                                    })}
                                                                    </SortableContext>
                                                                    </DndContext>
                                                                    <button
                                                                      onClick={() => openAdd('concept', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id })}
                                                                      className="w-full py-1.5 border border-dashed border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-lg flex items-center justify-center gap-1"
                                                                    >
                                                                      <Plus size={10} /> {t('addConcept')}
                                                                    </button>
                                                                  </div>
                                                                </motion.div>
                                                              )}
                                                            </AnimatePresence>
                                                          </motion.div>
                                                          )}
                                                          </SortableItemWrapper>
                                                        );
                                                      })}
                                                      </SortableContext>
                                                      </DndContext>
                                                      <button
                                                        onClick={() => openAdd('subtopic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id })}
                                                        className="w-full py-2 border border-dashed border-border/60 text-[10px] font-semibold text-muted-foreground hover:text-foreground rounded-lg flex items-center justify-center gap-1"
                                                      >
                                                        <Plus size={11} /> {t('addSubtopic')}
                                                      </button>
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            </motion.div>
                                            )}
                                            </SortableItemWrapper>
                                          );
                                        })}
                                        </SortableContext>
                                        </DndContext>
                                        <button
                                          onClick={() => openAdd('topic', { subjId: subj.id, chapterId: chapter.id })}
                                          className="w-full py-2 border border-dashed border-border/60 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg flex items-center justify-center gap-1 hover:border-primary/40 hover:bg-primary/5 transition-all"
                                        >
                                          <Plus size={12} /> {t('addTopic')}
                                        </button>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                              )}
                              </SortableItemWrapper>
                            );
                          })}
                          </SortableContext>
                          </DndContext>

                          <button
                            onClick={() => openAdd('chapter', { subjId: subj.id })}
                            className="w-full py-3 border-2 border-dashed border-border/70 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 rounded-xl flex items-center justify-center gap-2 transition-all"
                          >
                            <FolderPlus size={16} /> {t('addChapter')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                )}
                </SortableItemWrapper>
              );
            })}
          </div>
          </AnimatePresence>
          </SortableContext>
        </DndContext>
        )}

        {subjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 text-muted-foreground"
          >
            <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-lg opacity-60">{t('addSubject')}</p>
          </motion.div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modal === 'add' || modal === 'edit'}
        onClose={closeModal}
        title={modalTitle}
        align="bottom"
        icon={ModalIcon}
      >
        <div className="space-y-5">
          <Input
            placeholder={t('title')}
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
          />

          {/* Days — for subject add OR subject edit */}
          {activePath.level === 'subject' && (
            <div>
              <Input
                type="number"
                placeholder={t('optionalDays')}
                value={formDays}
                onChange={e => setFormDays(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1 px-1">{t('autoCalcHint')}</p>
            </div>
          )}

          {/* Difficulty selector — for all levels except subject */}
          {activePath.level !== 'subject' && (modal === 'add' || modal === 'edit') && (
            <div>
              <p className="text-xs font-bold text-foreground mb-2">{t('difficultyLabel')}</p>
              <div className="flex gap-2">
                {(['easy', 'medium', 'hard'] as const).map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFormDifficulty(level)}
                    className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                      formDifficulty === level
                        ? level === 'easy'   ? 'bg-green-500 text-white border-green-500'
                        : level === 'medium' ? 'bg-amber-500 text-white border-amber-500'
                        :                     'bg-red-500 text-white border-red-500'
                        : 'bg-secondary text-muted-foreground border-border/50 hover:bg-secondary/80'
                    }`}
                  >
                    {level === 'easy' ? t('easy') : level === 'medium' ? t('medium') : t('hard')}
                    <span className="block text-[9px] font-medium opacity-75 mt-0.5">
                      {level === 'easy' ? '1×' : level === 'medium' ? '1.5×' : '2×'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 px-1">{t('difficultyHint')}</p>
            </div>
          )}

          {/* Time Sliders — for add (not point, not subject), and for edit (not subject, not point) */}
          {showTimePicker && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-foreground">{t('estimatedTime')}</p>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${totalMins > 0 ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                  {formatTotalTime(totalMins, t)}
                </span>
              </div>
              <TimeSlider label={t('months')} value={sliderMonths} max={12} onChange={setSliderMonths} unit={t('months')} />
              <TimeSlider label={t('days')} value={sliderDays} max={30} onChange={setSliderDays} unit={t('days')} />
              <TimeSlider label={t('hoursLabel')} value={sliderHours} max={23} onChange={setSliderHours} unit={t('hoursLabel')} />
              <TimeSlider label={t('minutesLabel')} value={sliderMins} max={59} onChange={setSliderMins} unit={t('minutesLabel')} />
              {totalMins === 0 && (
                <p className="text-[10px] text-muted-foreground text-center">{t('autoCalcHint')}</p>
              )}
            </div>
          )}

          <Button className="w-full py-3.5" onClick={handleSave}>{modal === 'edit' ? t('saveChanges') : t('save')}</Button>
        </div>
      </Modal>

      {/* Days modal (subject days allocation) */}
      <Modal isOpen={modal === 'days'} onClose={closeModal} title={t('setDays')} align="bottom">
        <div className="space-y-4">
          <Input type="number" placeholder="Days" value={formDays} onChange={e => setFormDays(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()} />
          <Button className="w-full mt-2" onClick={handleSave}>{t('save')}</Button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={modal === 'delete'}
        onClose={closeModal}
        onConfirm={handleDelete}
        title={t(deleteTitleKey[activePath.level] as any)}
        message={t('deleteConfirmMsg')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isDanger={true}
      />

      {/* Note editor */}
      <NoteEditorModal
        isOpen={!!notePath}
        onClose={closeNote}
        title={t('editNote')}
        icon={StickyNote}
        value={noteDraft}
        onChange={setNoteDraft}
        onClear={() => setNoteDraft('')}
        onSave={saveNote}
        placeholder={t('notePlaceholder')}
        clearLabel={t('clearNote')}
        saveLabel={t('saveNote')}
      />

      {/* Reset subject progress confirm */}
      <ConfirmModal
        isOpen={!!resetConfirmSubjId}
        onClose={() => setResetConfirmSubjId(null)}
        onConfirm={() => {
          if (resetConfirmSubjId) {
            resetSubjectProgress(resetConfirmSubjId);
          }
          setResetConfirmSubjId(null);
        }}
        title={t('resetSubjectTitle')}
        message={t('resetSubjectConfirm')}
        confirmText={t('resetSubject')}
        cancelText={t('cancel')}
        isDanger={true}
      />

    </Layout>
  );
}
