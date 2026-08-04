import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '@/components/Layout';
import { useStudy } from '@/context/StudyContext';
import { useTest, type TestCard } from '@/context/TestContext';
import { useCourse } from '@/context/CourseContext';
import { useLang } from '@/context/LangContext';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ConfirmModal } from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Plus, ChevronLeft, Pencil, Trash2, Check, X,
  ArrowUpDown, GripVertical, Info, Play, BookOpen,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

// ─── Sortable wrapper ─────────────────────────────────────────────────────────

function SortableItem({ id, reorderMode, children }: {
  id: string;
  reorderMode: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.55 : 1,
  };
  const handle = reorderMode ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      onClick={e => e.stopPropagation()}
      className="touch-none shrink-0 flex items-center px-2 cursor-grab active:cursor-grabbing text-primary/70 hover:text-primary transition-colors select-none"
    >
      <GripVertical size={15} />
    </button>
  ) : null;
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>;
}

// ─── Subject colour map ───────────────────────────────────────────────────────

const CARD_ACCENTS = [
  'from-blue-500/20 to-blue-400/5 border-blue-200/60 dark:border-blue-800/40',
  'from-violet-500/20 to-violet-400/5 border-violet-200/60 dark:border-violet-800/40',
  'from-emerald-500/20 to-emerald-400/5 border-emerald-200/60 dark:border-emerald-800/40',
  'from-amber-500/20 to-amber-400/5 border-amber-200/60 dark:border-amber-800/40',
  'from-rose-500/20 to-rose-400/5 border-rose-200/60 dark:border-rose-800/40',
  'from-cyan-500/20 to-cyan-400/5 border-cyan-200/60 dark:border-cyan-800/40',
  'from-purple-500/20 to-purple-400/5 border-purple-200/60 dark:border-purple-800/40',
  'from-orange-500/20 to-orange-400/5 border-orange-200/60 dark:border-orange-800/40',
];
const ICON_COLORS = [
  'text-blue-500', 'text-violet-500', 'text-emerald-500', 'text-amber-500',
  'text-rose-500', 'text-cyan-500', 'text-purple-500', 'text-orange-500',
];

// ─── Info modal ───────────────────────────────────────────────────────────────

function InfoModal({ open, onClose, lang, t }: {
  open: boolean;
  onClose: () => void;
  lang: string;
  t: (k: string) => string;
}) {
  if (!open) return null;
  const qExample = lang === 'bn'
    ? `১. ভারতের স্বাধীনতা লাভের বছর কোনটি?\na) ১৯৪৫\nb) ১৯৪৬\nc) ১৯৪৭\nd) ১৯৫০\n\n২. তাজমহল নির্মাণ করেন কে?\na) আকবর\nb) শাহজাহান\nc) জাহাঙ্গীর\nd) ঔরঙ্গজেব`
    : `1. What year did India gain independence?\na) 1945\nb) 1946\nc) 1947\nd) 1950\n\n2. Who built the Taj Mahal?\na) Akbar\nb) Shah Jahan\nc) Jahangir\nd) Aurangzeb`;
  const aExample = lang === 'bn'
    ? `১. c) ১৯৪৭\n\n২. b) শাহজাহান`
    : `1. c) 1947\n\n2. b) Shah Jahan`;
  const note = lang === 'bn'
    ? 'অপশনের লেবেল (a/b/c/d) এবং নম্বর না থাকলেও অ্যাপ বুঝতে পারবে।'
    : 'Option labels (a/b/c/d) and numbering are flexible — the app will understand even if they are missing or on the same line.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ duration: 0.18 }}
        className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-center gap-2 font-bold text-base text-foreground">
            <Info size={17} className="text-primary" />
            {t('testInfoTitle')}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Section label={t('testInfoQLabel')}>
            <pre className="text-[12px] font-mono bg-secondary/60 rounded-xl p-3 whitespace-pre-wrap leading-relaxed text-foreground">{qExample}</pre>
          </Section>
          <Section label={t('testInfoALabel')}>
            <pre className="text-[12px] font-mono bg-secondary/60 rounded-xl p-3 whitespace-pre-wrap leading-relaxed text-foreground">{aExample}</pre>
          </Section>
          <p className="text-[11px] text-muted-foreground leading-relaxed bg-primary/5 rounded-xl p-3 border border-primary/15">{note}</p>
        </div>
      </motion.div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-primary mb-1.5 uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}

// ─── Add / Edit form ──────────────────────────────────────────────────────────

interface CardFormProps {
  initialTitle?: string;
  initialQuestion?: string;
  initialAnswer?: string;
  onSave: (title: string, question: string, answer: string) => void;
  onCancel: () => void;
  onInfo: () => void;
  t: (k: string) => string;
  saveError: string;
}

function CardForm({ initialTitle = '', initialQuestion = '', initialAnswer = '', onSave, onCancel, onInfo, t, saveError }: CardFormProps) {
  const [title, setTitle] = useState(initialTitle);
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  const handleSave = () => onSave(title, question, answer);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22 }}
      className="overflow-hidden"
    >
      <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm mb-3">
        {/* Title */}
        <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">{t('testCardTitle')} *</label>
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('testCardTitle')}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />

        {/* Question */}
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-muted-foreground">{t('testCardQuestion')} *</label>
          <button onClick={onInfo} type="button" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
            <Info size={11} /> {t('testInfoTitle')}
          </button>
        </div>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder={`1. প্রশ্নের লেখা?\na) অপশন ১\nb) অপশন ২\nc) অপশন ৩\nd) অপশন ৪`}
          rows={6}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono resize-y"
        />

        {/* Answer */}
        <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">{t('testCardAnswer')} *</label>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder={`1. c) উত্তর\n2. b) উত্তর`}
          rows={4}
          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono resize-y"
        />

        {/* Error */}
        {saveError && (
          <p className="text-[11px] text-red-500 mb-3 px-1">{saveError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Check size={14} /> {t('testCardSave')}
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-muted-foreground text-sm font-semibold hover:bg-secondary/70 transition-colors"
          >
            <X size={14} /> {t('cancel')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Test() {
  const { subjects, reorderSubjects } = useStudy();
  const { testDecks, testDecksLoaded, addTestCard, updateTestCard, deleteTestCard, reorderTestCards } = useTest();
  const { activeCourseId, sharedCoursesMeta } = useCourse();
  const isSharedCourse = !!(activeCourseId && sharedCoursesMeta[activeCourseId]);
  const { t, lang } = useLang();
  const [, navigate] = useLocation();

  // Navigation state
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Card interactions
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  // Reorder
  const [reorderMode, setReorderMode] = useState(false);

  // Info modal
  const [showInfo, setShowInfo] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);
  const deck = selectedSubjectId ? (testDecks[selectedSubjectId] ?? []) : [];

  const handleBack = () => {
    setSelectedSubjectId(null);
    setIsAdding(false);
    setEditingCardId(null);
    setExpandedCardId(null);
    setReorderMode(false);
    setSaveError('');
  };

  const handleSelectSubject = (id: string) => {
    setSelectedSubjectId(id);
    setIsAdding(false);
    setEditingCardId(null);
    setExpandedCardId(null);
    setReorderMode(false);
    setSaveError('');
  };

  const handleSaveNew = async (title: string, question: string, answer: string) => {
    if (!title.trim() || !question.trim() || !answer.trim()) {
      setSaveError(t('testCardSaveError'));
      return;
    }
    if (!selectedSubjectId) return;
    setSaveError('');
    await addTestCard(selectedSubjectId, { title: title.trim(), question: question.trim(), answer: answer.trim() });
    setIsAdding(false);
  };

  const handleSaveEdit = async (title: string, question: string, answer: string) => {
    if (!title.trim() || !question.trim() || !answer.trim()) {
      setSaveError(t('testCardSaveError'));
      return;
    }
    if (!selectedSubjectId || !editingCardId) return;
    setSaveError('');
    await updateTestCard(selectedSubjectId, editingCardId, { title: title.trim(), question: question.trim(), answer: answer.trim() });
    setEditingCardId(null);
  };

  const handleDeleteCard = async () => {
    if (!confirmDeleteCardId || !selectedSubjectId) return;
    await deleteTestCard(selectedSubjectId, confirmDeleteCardId);
    if (expandedCardId === confirmDeleteCardId) setExpandedCardId(null);
    setConfirmDeleteCardId(null);
  };

  // Drag end for subjects (on subject view) or test cards (on deck view)
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (!selectedSubjectId) {
      // Reorder subjects
      const fromIdx = subjects.findIndex(s => s.id === active.id);
      const toIdx = subjects.findIndex(s => s.id === over.id);
      if (fromIdx !== -1 && toIdx !== -1) reorderSubjects(fromIdx, toIdx);
    } else {
      // Reorder test cards
      const fromIdx = deck.findIndex(c => c.id === active.id);
      const toIdx = deck.findIndex(c => c.id === over.id);
      if (fromIdx !== -1 && toIdx !== -1) reorderTestCards(selectedSubjectId, fromIdx, toIdx);
    }
  };

  const handleStartTest = (cardId: string) => {
    navigate(`/test/run?sid=${selectedSubjectId}&cid=${cardId}`);
  };

  // ── Sortable items list ───────────────────────────────────────────────────

  const sortableIds = selectedSubjectId
    ? deck.map(c => c.id)
    : subjects.map(s => s.id);

  // ── Render ────────────────────────────────────────────────────────────────

  const cardCount = selectedSubjectId ? deck.length : 0;

  return (
    <>
      <Layout>
        {/* ── Gradient header ── */}
        <div
          className="sticky top-0 z-20 relative overflow-hidden rounded-b-2xl"
          style={{ background: 'linear-gradient(135deg, hsl(243 88% 52%) 0%, hsl(283 80% 52%) 50%, hsl(313 80% 52%) 100%)' }}
        >
          <div className="absolute top-[-20px] right-[-20px] w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative px-5 pt-5 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedSubject ? (
                <button
                  onClick={handleBack}
                  className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg shrink-0 hover:bg-white/30 transition-colors active:scale-95"
                >
                  <ChevronLeft size={22} className="text-white" />
                </button>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg shrink-0">
                  <ClipboardList size={22} className="text-white" strokeWidth={2.2} />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white leading-tight" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.25)' }}>
                  {selectedSubject ? selectedSubject.title : t('testTabTitle')}
                </h1>
                {selectedSubject && (
                  <p className="text-white/80 text-xs font-semibold mt-0.5">
                    {cardCount > 0
                      ? `${cardCount} ${lang === 'bn' ? 'টি কার্ড উপলব্ধ' : `card${cardCount !== 1 ? 's' : ''} available`}`
                      : t('noTestCards')}
                  </p>
                )}
              </div>
            </div>

            {/* Header right actions */}
            <div className="flex items-center gap-2">
              {/* Reorder button - shown only on deck view; hidden for shared courses */}
              {(!!selectedSubjectId && deck.length > 0) && !isAdding && !editingCardId && !isSharedCourse && (
                <span className="spin-border-wrap spin-border-round" style={{ '--spin-mask': 'hsl(313 80% 52%)' } as React.CSSProperties}>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => setReorderMode(v => !v)}
                    className={`spin-border-inner h-7 w-7 flex items-center justify-center transition-colors ${
                      reorderMode ? 'bg-white text-purple-600 shadow-md' : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                    title={reorderMode ? (lang === 'bn' ? 'রি-অর্ডার বন্ধ' : 'Done reordering') : t(selectedSubjectId ? 'testReorderCards' : 'testReorderSubjects')}
                  >
                    <ArrowUpDown size={13} />
                  </motion.button>
                </span>
              )}

              {/* Add Test Card button — shown only on deck view; hidden for shared courses */}
              {selectedSubjectId && !isAdding && !editingCardId && !isSharedCourse && (
                <span className="spin-border-wrap" style={{ '--spin-mask': 'hsl(313 80% 52%)' } as React.CSSProperties}>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => { setIsAdding(true); setReorderMode(false); setExpandedCardId(null); setSaveError(''); }}
                    className="spin-border-inner flex items-center h-7 gap-1 px-2.5 bg-white/20 text-white text-[11px] font-bold hover:bg-white/30 transition-colors"
                  >
                    <Plus size={12} /> {t('addTestCard')}
                  </motion.button>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="p-4 max-w-2xl mx-auto">

          {/* ── Add form ── */}
          <AnimatePresence>
            {isAdding && (
              <CardForm
                onSave={handleSaveNew}
                onCancel={() => { setIsAdding(false); setSaveError(''); }}
                onInfo={() => setShowInfo(true)}
                t={t}
                saveError={saveError}
              />
            )}
          </AnimatePresence>

          {/* ── Subject list view ── */}
          {!selectedSubjectId && (
            <>
              {subjects.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-16 text-center px-6"
                >
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="mb-4 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
                  >
                    <BookOpen size={28} className="text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{t('testNoSubjects')}</h3>
                </motion.div>
              ) : (
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <AnimatePresence>
                        {subjects.map((subj, idx) => {
                          const count = (testDecks[subj.id] ?? []).length;
                          const accent = CARD_ACCENTS[idx % CARD_ACCENTS.length];
                          const iconColor = ICON_COLORS[idx % ICON_COLORS.length];
                          return (
                            <SortableItem key={subj.id} id={subj.id} reorderMode={reorderMode}>
                              {handle => (
                                <ScrollReveal direction="up" delay={idx * 0.06}>
                                  <motion.button
                                    whileTap={{ scale: reorderMode ? 1 : 0.97 }}
                                    onClick={() => { if (!reorderMode) handleSelectSubject(subj.id); }}
                                    className={cn(
                                      'w-full text-left bg-gradient-to-br border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 relative',
                                      accent,
                                      reorderMode ? 'cursor-grab' : 'cursor-pointer',
                                    )}
                                  >
                                    {reorderMode && (
                                      <div className="absolute top-2 right-2 opacity-50">
                                        <GripVertical size={14} className="text-muted-foreground" />
                                      </div>
                                    )}
                                    <div className={cn('w-9 h-9 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center mb-3 shadow-sm', iconColor)}>
                                      <ClipboardList size={16} strokeWidth={2} className={iconColor} />
                                    </div>
                                    <p className="text-sm font-bold text-foreground leading-snug mb-1 line-clamp-2">{subj.title}</p>
                                    <p className="text-[11px] text-muted-foreground font-medium">
                                      {count > 0
                                        ? `${count} ${lang === 'bn' ? 'টি কার্ড উপলব্ধ' : `card${count !== 1 ? 's' : ''} available`}`
                                        : t('noTestCards')}
                                    </p>
                                    {handle}
                                  </motion.button>
                                </ScrollReveal>
                              )}
                            </SortableItem>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}

          {/* ── Deck view (test cards for selected subject) ── */}
          {selectedSubjectId && (
            <>
              {deck.length === 0 && !isAdding && !editingCardId ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-12 text-center px-6"
                >
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="mb-4 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
                  >
                    <ClipboardList size={28} className="text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-foreground mb-1.5">{t('noTestCards')}</h3>
                  <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                    {lang === 'bn' ? 'টেস্ট কার্ড যোগ করুন।' : 'Add a test card to get started.'}
                  </p>
                  {!isSharedCourse && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsAdding(true)}
                      className="flex items-center gap-2 py-3 px-6 rounded-2xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
                    >
                      <Plus size={18} /> {t('addTestCard')}
                    </motion.button>
                  )}
                </motion.div>
              ) : (
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      <AnimatePresence>
                        {deck.map((card, idx) => (
                          <SortableItem key={card.id} id={card.id} reorderMode={reorderMode}>
                            {handle => (
                              editingCardId === card.id ? (
                                <AnimatePresence mode="wait">
                                  <CardForm
                                    key="edit"
                                    initialTitle={card.title}
                                    initialQuestion={card.question}
                                    initialAnswer={card.answer}
                                    onSave={handleSaveEdit}
                                    onCancel={() => { setEditingCardId(null); setSaveError(''); }}
                                    onInfo={() => setShowInfo(true)}
                                    t={t}
                                    saveError={saveError}
                                  />
                                </AnimatePresence>
                              ) : (
                                <TestCardItem
                                  key={card.id}
                                  card={card}
                                  index={idx}
                                  expanded={expandedCardId === card.id}
                                  reorderMode={reorderMode}
                                  dragHandle={handle}
                                  isShared={isSharedCourse}
                                  onToggleExpand={() => {
                                    if (!reorderMode) setExpandedCardId(id => id === card.id ? null : card.id);
                                  }}
                                  onEdit={() => { setEditingCardId(card.id); setExpandedCardId(null); setReorderMode(false); setSaveError(''); }}
                                  onDelete={() => setConfirmDeleteCardId(card.id)}
                                  onStartTest={() => handleStartTest(card.id)}
                                  t={t}
                                  lang={lang}
                                />
                              )
                            )}
                          </SortableItem>
                        ))}
                      </AnimatePresence>
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </>
          )}
        </div>
      </Layout>

      {/* Info modal */}
      <AnimatePresence>
        {showInfo && (
          <InfoModal open={showInfo} onClose={() => setShowInfo(false)} lang={lang} t={t} />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={!!confirmDeleteCardId}
        onClose={() => setConfirmDeleteCardId(null)}
        onConfirm={handleDeleteCard}
        title={t('testCardDeleteTitle')}
        message={t('testCardDeleteConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isDanger
      />
    </>
  );
}

// ─── Test card item ───────────────────────────────────────────────────────────

interface TestCardItemProps {
  card: TestCard;
  index: number;
  expanded: boolean;
  reorderMode: boolean;
  dragHandle: React.ReactNode;
  isShared?: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStartTest: () => void;
  t: (k: string) => string;
  lang: string;
}

function TestCardItem({
  card, index, expanded, reorderMode, dragHandle, isShared,
  onToggleExpand, onEdit, onDelete, onStartTest, t, lang,
}: TestCardItemProps) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const iconColor = ICON_COLORS[index % ICON_COLORS.length];

  return (
    <motion.div layout exit={{ opacity: 0, scale: 0.96, y: -4 }}>
      <ScrollReveal direction="right" delay={index * 0.07}>
        <div className={cn('bg-gradient-to-r border rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden', accent)}>
          {/* Card header row */}
          <div className="flex items-center gap-3 px-4 py-3.5">
            {/* Icon */}
            <div className="shrink-0 w-8 h-8 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center shadow-sm">
              <ClipboardList size={15} className={iconColor} />
            </div>

            {/* Title — click to expand */}
            <button
              onClick={reorderMode ? undefined : onToggleExpand}
              disabled={reorderMode}
              className="flex-1 text-left text-sm font-semibold text-foreground leading-snug truncate hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-default"
            >
              {card.title}
            </button>

            {/* Actions — hidden for shared courses */}
            {!reorderMode && !isShared && (
              <div className="flex items-center gap-0.5 shrink-0">
                <motion.button
                  whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                  onClick={onEdit}
                  title={t('testCardEdit')}
                  className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
                >
                  <Pencil size={13} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                  onClick={onDelete}
                  title={t('testCardDelete')}
                  className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10 text-muted-foreground hover:text-rose-600 transition-colors"
                >
                  <Trash2 size={13} />
                </motion.button>
              </div>
            )}

            {/* Drag handle */}
            {reorderMode && dragHandle}
          </div>

          {/* Expanded: Start Test button */}
          <AnimatePresence>
            {expanded && !reorderMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={onStartTest}
                    className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
                  >
                    <Play size={16} fill="currentColor" />
                    {t('startTest')}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollReveal>
    </motion.div>
  );
}
