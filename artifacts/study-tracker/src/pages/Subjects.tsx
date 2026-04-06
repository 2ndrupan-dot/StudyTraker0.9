import React, { useState } from 'react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import {
  Plus, Trash2, ChevronRight,
  BookOpen, Layers, List, Lightbulb, Dot, FolderPlus,
  CheckCircle2, Circle, Pencil, Lock,
} from 'lucide-react';
import {
  isChapterUnlocked, isTopicUnlocked, isSubtopicUnlocked,
  isConceptUnlocked, isPointUnlocked,
} from '@/lib/timeEngine';
import { Modal, ConfirmModal, Input, Button } from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import { getRandomColor } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { DifficultyLevel } from '@/lib/types';

type LevelType = 'subject' | 'chapter' | 'topic' | 'subtopic' | 'concept' | 'point';

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
  if (mo > 0) parts.push(`${mo} মাস`);
  if (d > 0) parts.push(`${d} দিন`);
  if (h > 0) parts.push(`${h} ঘণ্টা`);
  if (m > 0) parts.push(`${m} মিনিট`);
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
  } = useStudy();
  const { t } = useLang();

  // Expanded state per level
  const [expandedSubj, setExpandedSubj] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [expandedSubtopic, setExpandedSubtopic] = useState<string | null>(null);
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);

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

  const resetSliders = () => { setSliderMonths(0); setSliderDays(0); setSliderHours(0); setSliderMins(0); };
  const resetForm = () => { setFormTitle(''); setFormDays(''); setFormDifficulty('easy'); resetSliders(); };
  const closeModal = () => { setModal(null); resetForm(); };

  const [maxSubjectAlert, setMaxSubjectAlert] = useState(false);

  const openAdd = (level: LevelType, path: Partial<ActivePath>) => {
    if (level === 'subject' && subjects.length >= 3) {
      setMaxSubjectAlert(true);
      return;
    }
    setActivePath(prev => ({ ...prev, ...path, level }));
    resetForm();
    setModal('add');
  };

  const openEdit = (level: LevelType, path: Partial<ActivePath>, currentTitle: string, currentMins?: number, currentDays?: number) => {
    setActivePath(prev => ({ ...prev, ...path, level }));
    setFormTitle(currentTitle);
    if (currentDays !== undefined) setFormDays(currentDays.toString());
    else setFormDays('');
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
        addChapter(subjId, { title: formTitle, totalMinutes: mins, estimatedMinutes: mins || undefined, difficulty: diff });
      } else if (level === 'topic') {
        addTopic(subjId, chapterId, { title: formTitle, totalMinutes: mins, estimatedMinutes: mins || undefined, difficulty: diff });
      } else if (level === 'subtopic') {
        addSubtopic(subjId, chapterId, topicId, { title: formTitle, estimatedMinutes: mins || undefined, difficulty: diff });
      } else if (level === 'concept') {
        addConcept(subjId, chapterId, topicId, subtopicId, { title: formTitle, estimatedMinutes: mins || undefined, difficulty: diff });
      } else if (level === 'point') {
        addPoint(subjId, chapterId, topicId, subtopicId, conceptId, { title: formTitle, difficulty: diff });
      }
    } else if (modal === 'edit') {
      const newMins = mins > 0 ? mins : undefined;
      if (level === 'subject') {
        updateSubjectMeta(subjId, formTitle);
        const parsedDays = parseInt(formDays);
        if (!isNaN(parsedDays) && parsedDays > 0) updateSubjectDays(subjId, parsedDays);
      }
      else if (level === 'chapter') updateChapterMeta(subjId, chapterId, formTitle, newMins);
      else if (level === 'topic') updateTopicMeta(subjId, chapterId, topicId, formTitle, newMins);
      else if (level === 'subtopic') updateSubtopicMeta(subjId, chapterId, topicId, subtopicId, formTitle, newMins);
      else if (level === 'concept') updateConceptMeta(subjId, chapterId, topicId, subtopicId, conceptId, formTitle, newMins);
      else if (level === 'point') updatePointMeta(subjId, chapterId, topicId, subtopicId, conceptId, pointId, formTitle);
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

  return (
    <Layout>
      <div className="p-5">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center justify-between"
        >
          <h1 className="text-2xl font-bold text-foreground">{t('subjects')}</h1>
          <motion.div whileTap={{ scale: 0.95 }}>
            <Button
              variant="primary"
              className="py-2 px-3 h-auto rounded-xl text-xs gap-1.5 shadow-md"
              onClick={() => openAdd('subject', {})}
            >
              <Plus size={16} /> {t('addSubject')}
            </Button>
          </motion.div>
        </motion.header>

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
              {t('noSubjectsYet') ?? 'কোনো বিষয় নেই'}
            </h3>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              {t('addFirstSubject') ?? 'প্রথম বিষয় যোগ করুন এবং পড়াশোনা শুরু করুন!'}
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

        <AnimatePresence>
          <div className="space-y-4">
            {subjects.map((subj, idx) => {
              const isExpanded = expandedSubj === subj.id;
              const chapterCount = subj.chapters.length;
              const completedChapters = subj.chapters.filter(c => c.completed).length;
              const prog = chapterCount === 0 ? 0 : (completedChapters / chapterCount) * 100;

              return (
                <motion.div
                  key={subj.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: idx * 0.05, type: 'spring', stiffness: 260, damping: 22 }}
                  className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden card-hover"
                >
                  {/* Subject header */}
                  <div
                    className="p-4 relative flex items-center justify-between cursor-pointer active:bg-secondary/40 transition-colors"
                    onClick={() => toggleSubj(subj.id)}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: subj.color }} />
                    <div className="pl-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-foreground text-lg leading-tight">{subj.title}</h3>
                        <span className="text-[9px] font-bold text-muted-foreground/60 bg-secondary/80 px-1.5 py-0.5 rounded border border-border/40">L1</span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setActivePath(prev => ({ ...prev, subjId: subj.id, level: 'subject' }));
                            setFormDays(subj.allocatedDays.toString());
                            setModal('days');
                          }}
                          className="px-2 py-0.5 bg-secondary text-muted-foreground text-[10px] font-bold rounded-md border border-border/50 cursor-pointer hover:bg-primary/10 transition-colors"
                        >
                          {subj.allocatedDays} d
                        </button>
                        {subj.completed && (
                          <span className="px-2 py-0.5 bg-green-500/10 text-green-600 text-[10px] font-bold rounded-md">✓ Done</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium flex-wrap">
                        <span>{t('chapters')}: {completedChapters}/{chapterCount}</span>
                        <span>•</span>
                        <span>{format(parseISO(subj.deadline), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="mt-3 h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${prog}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          style={{ backgroundColor: subj.color }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pl-3 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit('subject', { subjId: subj.id }, subj.title, undefined, subj.allocatedDays); }}
                        className="p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary rounded-full transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openDelete('subject', { subjId: subj.id }); }}
                        className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-muted-foreground bg-secondary p-1.5 rounded-full"
                      >
                        <ChevronRight size={16} />
                      </motion.div>
                    </div>
                  </div>

                  {/* Chapters */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div {...collapseAnim} className="overflow-hidden bg-secondary/10 border-t border-border/40">
                        <div className="p-3 pl-4 space-y-2">
                          {subj.chapters.map((chapter, chIdx) => {
                            const chLocked = !isChapterUnlocked(subj, chIdx);
                            const chExpanded = expandedChapter === chapter.id;
                            const topicCount = chapter.topics.length;
                            const completedTopics = chapter.topics.filter(t => t.completed).length;
                            let chSubtopics = 0, chCompletedSubs = 0;
                            chapter.topics.forEach(t => { chSubtopics += t.subtopics.length; chCompletedSubs += t.subtopics.filter(s => s.completed).length; });
                            return (
                              <motion.div key={chapter.id} {...itemAnim} className={`bg-card border rounded-xl overflow-hidden shadow-sm ${chLocked ? 'border-border/30 opacity-70' : 'border-border/50'}`}>
                                <div
                                  className="p-3 flex items-center gap-2 cursor-pointer hover:bg-secondary/30 transition-colors"
                                  onClick={() => toggleChapter(chapter.id)}
                                >
                                  <button
                                    onClick={e => { e.stopPropagation(); if (!chLocked) toggleChapterComplete(subj.id, chapter.id); }}
                                    className={`shrink-0 transition-colors ${chLocked ? 'cursor-not-allowed text-muted-foreground/50' : 'text-muted-foreground hover:text-primary'}`}
                                    disabled={chLocked}
                                    title={chLocked ? 'আগের chapter সম্পন্ন করুন' : undefined}
                                  >
                                    {chLocked ? <Lock size={18} className="text-muted-foreground/50" /> : chapter.completed ? <CheckCircle2 size={18} className="text-green-500" /> : <Circle size={18} />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <BookOpen size={13} className="text-primary shrink-0" />
                                      <span className={`font-semibold text-sm ${chapter.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                        {chapter.title}
                                      </span>
                                      <span className="text-[9px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L2</span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {t('topics')}: {completedTopics}/{topicCount}
                                      {chSubtopics > 0 ? ` • Subtopics: ${chCompletedSubs}/${chSubtopics}` : ''}
                                      {chapter.estimatedMinutes ? ` • ${formatTotalTime(chapter.estimatedMinutes, t)}` : ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={e => { e.stopPropagation(); openEdit('chapter', { subjId: subj.id, chapterId: chapter.id }, chapter.title, chapter.estimatedMinutes); }}
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
                                  </div>
                                </div>

                                {/* Topics */}
                                <AnimatePresence>
                                  {chExpanded && (
                                    <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/30 bg-secondary/10">
                                      <div className="p-2 pl-8 space-y-1.5">
                                        {chapter.topics.map((topic, topIdx) => {
                                          const topLocked = chLocked || !isTopicUnlocked(chapter, topIdx);
                                          const tExpanded = expandedTopic === topic.id;
                                          const completedSubs = topic.subtopics.filter(s => s.completed).length;
                                          let topConcepts = 0, topCompletedConcepts = 0;
                                          topic.subtopics.forEach(s => { topConcepts += s.concepts.length; topCompletedConcepts += s.concepts.filter(c => c.completed).length; });
                                          return (
                                            <motion.div key={topic.id} {...itemAnim} className={`bg-card border rounded-lg overflow-hidden ${topLocked ? 'border-border/20 opacity-60' : 'border-border/40'}`}>
                                              <div
                                                className="px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-secondary/20"
                                                onClick={() => toggleTopic(topic.id)}
                                              >
                                                <button
                                                  onClick={e => { e.stopPropagation(); if (!topLocked) toggleTopicComplete(subj.id, chapter.id, topic.id); }}
                                                  className="shrink-0"
                                                  disabled={topLocked}
                                                  title={topLocked ? 'আগের topic সম্পন্ন করুন' : undefined}
                                                >
                                                  {topLocked ? <Lock size={15} className="text-muted-foreground/40" /> : topic.completed ? <CheckCircle2 size={15} className="text-green-500" /> : <Circle size={15} className="text-muted-foreground" />}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Layers size={11} className="text-accent-foreground shrink-0" />
                                                    <span className={`text-xs font-semibold ${topic.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                      {topic.title}
                                                    </span>
                                                    <span className="text-[8px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L3</span>
                                                  </div>
                                                  <p className="text-[9px] text-muted-foreground mt-0.5">
                                                    Subtopics: {completedSubs}/{topic.subtopics.length}
                                                    {topConcepts > 0 ? ` • Concepts: ${topCompletedConcepts}/${topConcepts}` : ''}
                                                    {topic.estimatedMinutes ? ` • ${formatTotalTime(topic.estimatedMinutes, t)}` : ''}
                                                  </p>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0">
                                                  <button
                                                    onClick={e => { e.stopPropagation(); openEdit('topic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id }, topic.title, topic.estimatedMinutes); }}
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
                                                </div>
                                              </div>

                                              {/* Subtopics */}
                                              <AnimatePresence>
                                                {tExpanded && (
                                                  <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/20 bg-secondary/10">
                                                    <div className="p-2 pl-10 space-y-1">
                                                      {topic.subtopics.map((sub, subIdx) => {
                                                        const subLocked = topLocked || !isSubtopicUnlocked(topic, subIdx);
                                                        const subExpanded = expandedSubtopic === sub.id;
                                                        const completedConcepts = sub.concepts.filter(c => c.completed).length;
                                                        let subPoints = 0, subCompletedPoints = 0;
                                                        sub.concepts.forEach(c => { subPoints += c.points.length; subCompletedPoints += c.points.filter(p => p.completed).length; });
                                                        return (
                                                          <motion.div key={sub.id} {...itemAnim} className={`bg-card border rounded-lg overflow-hidden ${subLocked ? 'border-border/15 opacity-55' : 'border-border/30'}`}>
                                                            <div
                                                              className="px-2.5 py-2 flex items-center gap-1.5 cursor-pointer hover:bg-secondary/20"
                                                              onClick={() => toggleSubtopicExpand(sub.id)}
                                                            >
                                                              <button onClick={e => { e.stopPropagation(); if (!subLocked) toggleSubtopicComplete(subj.id, chapter.id, topic.id, sub.id); }} disabled={subLocked} title={subLocked ? 'আগের subtopic সম্পন্ন করুন' : undefined}>
                                                                {subLocked ? <Lock size={13} className="text-muted-foreground/35" /> : sub.completed ? <CheckCircle2 size={13} className="text-green-500" /> : <Circle size={13} className="text-muted-foreground" />}
                                                              </button>
                                                              <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1 flex-wrap">
                                                                  <List size={10} className="text-blue-400 shrink-0" />
                                                                  <span className={`text-[11px] font-medium ${sub.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                    {sub.title}
                                                                  </span>
                                                                  <span className="text-[8px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L4</span>
                                                                </div>
                                                                <p className="text-[8px] text-muted-foreground">
                                                                  Concepts: {completedConcepts}/{sub.concepts.length}
                                                                  {subPoints > 0 ? ` • Points: ${subCompletedPoints}/${subPoints}` : ''}
                                                                  {sub.estimatedMinutes ? ` • ${formatTotalTime(sub.estimatedMinutes, t)}` : ''}
                                                                </p>
                                                              </div>
                                                              <div className="flex items-center gap-0.5 shrink-0">
                                                                <button onClick={e => { e.stopPropagation(); openEdit('subtopic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id }, sub.title, sub.estimatedMinutes); }} className="p-1 text-muted-foreground hover:text-primary">
                                                                  <Pencil size={9} />
                                                                </button>
                                                                <button onClick={e => { e.stopPropagation(); openDelete('subtopic', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id }); }} className="p-1 text-muted-foreground hover:text-destructive">
                                                                  <Trash2 size={10} />
                                                                </button>
                                                                <motion.div animate={{ rotate: subExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                                  <ChevronRight size={11} className="text-muted-foreground" />
                                                                </motion.div>
                                                              </div>
                                                            </div>

                                                            {/* Concepts */}
                                                            <AnimatePresence>
                                                              {subExpanded && (
                                                                <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/20 bg-secondary/10">
                                                                  <div className="p-1.5 pl-8 space-y-1">
                                                                    {sub.concepts.map((concept, conIdx) => {
                                                                      const conLocked = subLocked || !isConceptUnlocked(sub, conIdx);
                                                                      const cExpanded = expandedConcept === concept.id;
                                                                      const completedPoints = concept.points.filter(p => p.completed).length;
                                                                      return (
                                                                        <motion.div key={concept.id} {...itemAnim} className={`bg-card border rounded-lg overflow-hidden ${conLocked ? 'border-border/10 opacity-50' : 'border-border/20'}`}>
                                                                          <div
                                                                            className="px-2 py-1.5 flex items-center gap-1.5 cursor-pointer hover:bg-secondary/20"
                                                                            onClick={() => toggleConceptExpand(concept.id)}
                                                                          >
                                                                            <button onClick={e => { e.stopPropagation(); if (!conLocked) toggleConceptComplete(subj.id, chapter.id, topic.id, sub.id, concept.id); }} disabled={conLocked} title={conLocked ? 'আগের concept সম্পন্ন করুন' : undefined}>
                                                                              {conLocked ? <Lock size={11} className="text-muted-foreground/30" /> : concept.completed ? <CheckCircle2 size={11} className="text-green-500" /> : <Circle size={11} className="text-muted-foreground" />}
                                                                            </button>
                                                                            <div className="flex-1 min-w-0">
                                                                              <div className="flex items-center gap-1 flex-wrap">
                                                                                <Lightbulb size={9} className="text-yellow-500 shrink-0" />
                                                                                <span className={`text-[10px] font-medium ${concept.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                  {concept.title}
                                                                                </span>
                                                                                <span className="text-[8px] font-bold text-muted-foreground/50 bg-secondary/80 px-1 py-0.5 rounded border border-border/30">L5</span>
                                                                              </div>
                                                                              <p className="text-[8px] text-muted-foreground">
                                                                                {concept.points.length > 0 ? `Points: ${completedPoints}/${concept.points.length}` : ''}
                                                                                {concept.estimatedMinutes ? ` • ${formatTotalTime(concept.estimatedMinutes, t)}` : ''}
                                                                              </p>
                                                                            </div>
                                                                            <div className="flex items-center gap-0.5 shrink-0">
                                                                              <button onClick={e => { e.stopPropagation(); openEdit('concept', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id }, concept.title, concept.estimatedMinutes); }} className="p-1 text-muted-foreground hover:text-primary">
                                                                                <Pencil size={8} />
                                                                              </button>
                                                                              <button onClick={e => { e.stopPropagation(); openDelete('concept', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id }); }} className="p-1 text-muted-foreground hover:text-destructive">
                                                                                <Trash2 size={9} />
                                                                              </button>
                                                                              <motion.div animate={{ rotate: cExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                                                <ChevronRight size={10} className="text-muted-foreground" />
                                                                              </motion.div>
                                                                            </div>
                                                                          </div>

                                                                          {/* Points */}
                                                                          <AnimatePresence>
                                                                            {cExpanded && (
                                                                              <motion.div {...collapseAnim} className="overflow-hidden border-t border-border/10 bg-secondary/10">
                                                                                <div className="p-1.5 pl-7 space-y-0.5">
                                                                                  {concept.points.map((point, ptIdx) => {
                                                                                    const ptLocked = conLocked || !isPointUnlocked(concept, ptIdx);
                                                                                    return (
                                                                                    <motion.div
                                                                                      key={point.id}
                                                                                      {...itemAnim}
                                                                                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-card group/point ${ptLocked ? 'opacity-45' : ''}`}
                                                                                    >
                                                                                      <button onClick={() => { if (!ptLocked) togglePointComplete(subj.id, chapter.id, topic.id, sub.id, concept.id, point.id); }} disabled={ptLocked} title={ptLocked ? 'আগের point সম্পন্ন করুন' : undefined}>
                                                                                        {ptLocked ? <Lock size={10} className="text-muted-foreground/30" /> : point.completed ? <CheckCircle2 size={10} className="text-green-500" /> : <Circle size={10} className="text-muted-foreground" />}
                                                                                      </button>
                                                                                      <Dot size={10} className="text-muted-foreground shrink-0" />
                                                                                      <span className={`text-[9px] font-medium flex-1 min-w-0 ${point.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                                                                        {point.title}
                                                                                      </span>
                                                                                      <span className="text-[7px] font-bold text-muted-foreground/40 bg-secondary/60 px-1 py-0.5 rounded border border-border/20 shrink-0">L6</span>
                                                                                      <div className="flex items-center gap-0.5 opacity-0 group-hover/point:opacity-100 transition-all shrink-0">
                                                                                        <button onClick={() => openEdit('point', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id, pointId: point.id }, point.title)} className="p-0.5 text-muted-foreground hover:text-primary">
                                                                                          <Pencil size={8} />
                                                                                        </button>
                                                                                        <button onClick={() => openDelete('point', { subjId: subj.id, chapterId: chapter.id, topicId: topic.id, subtopicId: sub.id, conceptId: concept.id, pointId: point.id })} className="p-0.5 text-muted-foreground hover:text-destructive">
                                                                                          <Trash2 size={9} />
                                                                                        </button>
                                                                                      </div>
                                                                                    </motion.div>
                                                                                  ); })}
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
                                                                      );
                                                                    })}
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
                                                        );
                                                      })}
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
                                          );
                                        })}
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
                            );
                          })}

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
              );
            })}
          </div>
        </AnimatePresence>

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
          {activePath.level !== 'subject' && (modal === 'add') && (
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
              <TimeSlider label="মাস (Months)" value={sliderMonths} max={12} onChange={setSliderMonths} unit="মাস" />
              <TimeSlider label="দিন (Days)" value={sliderDays} max={30} onChange={setSliderDays} unit="দিন" />
              <TimeSlider label="ঘণ্টা (Hours)" value={sliderHours} max={23} onChange={setSliderHours} unit="ঘণ্টা" />
              <TimeSlider label="মিনিট (Minutes)" value={sliderMins} max={59} onChange={setSliderMins} unit="মিনিট" />
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

      {/* Max 3 subjects alert */}
      <Modal isOpen={maxSubjectAlert} onClose={() => setMaxSubjectAlert(false)} title="সর্বোচ্চ ৩টি Subject" align="center" icon={BookOpen}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Daily Routine System সর্বোচ্চ <strong>৩টি Subject</strong> সমর্থন করে।
            নতুন Subject যোগ করতে আগের একটি মুছুন।
          </p>
          <Button className="w-full" onClick={() => setMaxSubjectAlert(false)}>ঠিক আছে</Button>
        </div>
      </Modal>
    </Layout>
  );
}
