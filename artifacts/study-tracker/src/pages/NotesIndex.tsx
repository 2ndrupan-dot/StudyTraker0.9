import React, { useState, useRef, useEffect } from 'react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { useAuth } from '@/context/AuthContext';
import { useAdmin } from '@/context/AdminContext';
import { useCourse } from '@/context/CourseContext';
import { Layout } from '@/components/Layout';
import {
  Plus, FileText, Trash2, Pencil, Check, X, StickyNote, Loader2,
  ArrowUpDown, GripVertical, Search, BookOpen, User, ChevronLeft, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollReveal } from '@/components/ScrollReveal';
import { ConfirmModal, NoteEditorModal } from '@/components/ui';
import type { NotePage } from '@/lib/types';
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

type NoteItem = ReturnType<typeof useStudy>['notePagesIndex'][number];

// ─── Subject card accent colours (matching Test page) ─────────────────────────
const SUBJECT_ACCENTS = [
  'from-blue-500/20 to-blue-400/5 border-blue-200/60 dark:border-blue-800/40',
  'from-violet-500/20 to-violet-400/5 border-violet-200/60 dark:border-violet-800/40',
  'from-emerald-500/20 to-emerald-400/5 border-emerald-200/60 dark:border-emerald-800/40',
  'from-amber-500/20 to-amber-400/5 border-amber-200/60 dark:border-amber-800/40',
  'from-rose-500/20 to-rose-400/5 border-rose-200/60 dark:border-rose-800/40',
  'from-cyan-500/20 to-cyan-400/5 border-cyan-200/60 dark:border-cyan-800/40',
  'from-purple-500/20 to-purple-400/5 border-purple-200/60 dark:border-purple-800/40',
  'from-orange-500/20 to-orange-400/5 border-orange-200/60 dark:border-orange-800/40',
];
const SUBJECT_ICON_COLORS = [
  'text-blue-500', 'text-violet-500', 'text-emerald-500', 'text-amber-500',
  'text-rose-500', 'text-cyan-500', 'text-purple-500', 'text-orange-500',
];

// ─── Sortable wrapper ─────────────────────────────────────────────────────────
function SortableNoteCard({ id, reorderMode, children }: {
  id: string; reorderMode: boolean; children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: isDragging ? 'relative' : undefined,
    opacity: isDragging ? 0.55 : undefined,
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

type ActiveTab = 'course' | 'personal' | 'prompts';

// ─── Main component ───────────────────────────────────────────────────────────
export function NotesIndex() {
  const {
    subjects,
    notePagesIndex, createNotePage, renameNotePage, deleteNotePage, loadNotePage, saveNotePage, reorderNotePages,
    personalNotePagesIndex, createPersonalNotePage, renamePersonalNotePage, deletePersonalNotePage, loadPersonalNotePage, savePersonalNotePage, reorderPersonalNotePages,
    promptNotePagesIndex, createPromptNotePage, renamePromptNotePage, deletePromptNotePage, loadPromptNotePage, savePromptNotePage, reorderPromptNotePages,
  } = useStudy();
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, appContact } = useAdmin();
  const { activeCourseId, sharedCoursesMeta } = useCourse();
  const activeSharedMeta = activeCourseId ? sharedCoursesMeta[activeCourseId] : undefined;
  const isCourseNotesReadOnly = !!activeSharedMeta;

  // ── Tab & subject navigation ──
  const [activeTab, setActiveTab] = useState<ActiveTab>('course');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // ── Course Notes state ──
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const newTitleRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [noteModalId, setNoteModalId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [currentPage, setCurrentPage] = useState<NotePage | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [reorderMode, setReorderMode] = useState(false);

  // ── Personal Notes state ──
  const [isCreatingPersonal, setIsCreatingPersonal] = useState(false);
  const [newPersonalTitle, setNewPersonalTitle] = useState('');
  const newPersonalTitleRef = useRef<HTMLInputElement>(null);
  const [editingPersonalId, setEditingPersonalId] = useState<string | null>(null);
  const [draftPersonalTitle, setDraftPersonalTitle] = useState('');
  const [confirmDeletePersonal, setConfirmDeletePersonal] = useState<string | null>(null);
  const [personalModalId, setPersonalModalId] = useState<string | null>(null);
  const [personalDraft, setPersonalDraft] = useState('');
  const [currentPersonalPage, setCurrentPersonalPage] = useState<NotePage | null>(null);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [loadingPersonalId, setLoadingPersonalId] = useState<string | null>(null);
  const [personalHtmlCache, setPersonalHtmlCache] = useState<Record<string, string>>({});
  const [personalSearchQuery, setPersonalSearchQuery] = useState('');
  const [personalReorderMode, setPersonalReorderMode] = useState(false);

  // ── Prompt Notes state (super-admin only) ──
  const [isCreatingPrompt, setIsCreatingPrompt] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const newPromptTitleRef = useRef<HTMLInputElement>(null);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [draftPromptTitle, setDraftPromptTitle] = useState('');
  const [confirmDeletePrompt, setConfirmDeletePrompt] = useState<string | null>(null);
  const [promptModalId, setPromptModalId] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [currentPromptPage, setCurrentPromptPage] = useState<NotePage | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);
  const [promptHtmlCache, setPromptHtmlCache] = useState<Record<string, string>>({});
  const [promptSearchQuery, setPromptSearchQuery] = useState('');
  const [promptReorderMode, setPromptReorderMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Notes filtered by selected subject ──
  const subjectCourseNotes = selectedSubjectId
    ? notePagesIndex.filter(n => n.subjectId === selectedSubjectId)
    : [];
  const subjectPersonalNotes = selectedSubjectId
    ? personalNotePagesIndex.filter(n => n.subjectId === selectedSubjectId)
    : [];

  const filteredCourseNotes = searchQuery.trim()
    ? subjectCourseNotes.filter(n => n.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : subjectCourseNotes;

  const filteredPersonalNotes = personalSearchQuery.trim()
    ? subjectPersonalNotes.filter(n => n.title.toLowerCase().includes(personalSearchQuery.trim().toLowerCase()))
    : subjectPersonalNotes;

  // Prompt notes are course-agnostic — no subject filtering
  const filteredPromptNotes = promptSearchQuery.trim()
    ? promptNotePagesIndex.filter(n => n.title.toLowerCase().includes(promptSearchQuery.trim().toLowerCase()))
    : promptNotePagesIndex;
  const promptNoteCount = promptNotePagesIndex.length;

  // ── Count notes per subject ──
  const courseNoteCountForSubject = (sid: string) =>
    notePagesIndex.filter(n => n.subjectId === sid).length;
  const personalNoteCountForSubject = (sid: string) =>
    personalNotePagesIndex.filter(n => n.subjectId === sid).length;

  const selectedSubject = subjects.find(s => s.id === selectedSubjectId);

  // ── Drag-end handlers ──
  const handleCoursesDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = notePagesIndex.findIndex(n => n.id === active.id);
    const toIdx   = notePagesIndex.findIndex(n => n.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) reorderNotePages(fromIdx, toIdx);
  };

  const handlePersonalDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = personalNotePagesIndex.findIndex(n => n.id === active.id);
    const toIdx   = personalNotePagesIndex.findIndex(n => n.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) reorderPersonalNotePages(fromIdx, toIdx);
  };

  const handlePromptDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = promptNotePagesIndex.findIndex(n => n.id === active.id);
    const toIdx   = promptNotePagesIndex.findIndex(n => n.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) reorderPromptNotePages(fromIdx, toIdx);
  };

  useEffect(() => {
    if (isCreating) newTitleRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    if (isCreatingPersonal) newPersonalTitleRef.current?.focus();
  }, [isCreatingPersonal]);

  useEffect(() => {
    if (isCreatingPrompt) newPromptTitleRef.current?.focus();
  }, [isCreatingPrompt]);

  // Reset state when switching tabs or going back
  const handleBack = () => {
    setSelectedSubjectId(null);
    setIsCreating(false); setNewTitle('');
    setIsCreatingPersonal(false); setNewPersonalTitle('');
    setIsCreatingPrompt(false); setNewPromptTitle('');
    setReorderMode(false); setPersonalReorderMode(false); setPromptReorderMode(false);
    setSearchQuery(''); setPersonalSearchQuery(''); setPromptSearchQuery('');
    setEditingId(null); setEditingPersonalId(null); setEditingPromptId(null);
  };

  const handleSelectSubject = (sid: string) => {
    setSelectedSubjectId(sid);
    setIsCreating(false); setNewTitle('');
    setIsCreatingPersonal(false); setNewPersonalTitle('');
    setReorderMode(false); setPersonalReorderMode(false);
    setSearchQuery(''); setPersonalSearchQuery('');
    setEditingId(null); setEditingPersonalId(null);
  };

  useEffect(() => {
    setSelectedSubjectId(null);
    setIsCreating(false); setNewTitle('');
    setIsCreatingPersonal(false); setNewPersonalTitle('');
    setIsCreatingPrompt(false); setNewPromptTitle('');
    setReorderMode(false); setPersonalReorderMode(false); setPromptReorderMode(false);
    setSearchQuery(''); setPersonalSearchQuery(''); setPromptSearchQuery('');
  }, [activeTab]);

  // ── Course Notes: create ──
  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    createNotePage(title, false, selectedSubjectId ?? undefined);
    setNewTitle('');
    setIsCreating(false);
  };

  // ── Personal Notes: create ──
  const handleCreatePersonal = () => {
    const title = newPersonalTitle.trim();
    if (!title) return;
    createPersonalNotePage(title, selectedSubjectId ?? undefined);
    setNewPersonalTitle('');
    setIsCreatingPersonal(false);
  };

  // ── Prompt Notes: create ──
  const handleCreatePrompt = () => {
    const title = newPromptTitle.trim();
    if (!title) return;
    createPromptNotePage(title);
    setNewPromptTitle('');
    setIsCreatingPrompt(false);
  };

  // ── Course Notes: open ──
  const openRequestRef = useRef<string | null>(null);
  const openNote = async (meta: NoteItem) => {
    if (noteLoading) return;
    openRequestRef.current = meta.id;
    setNoteLoading(true);
    setLoadingNoteId(meta.id);
    try {
      const page = await loadNotePage(meta.id);
      if (openRequestRef.current !== meta.id) return;
      const resolved: NotePage = page ?? {
        id: meta.id, title: meta.title, elements: [], pageCount: 1, html: '',
        createdAt: meta.createdAt, updatedAt: meta.updatedAt,
      };
      setCurrentPage(resolved);
      const html = resolved.html ?? '';
      setNoteDraft(html);
      setHtmlCache(prev => ({ ...prev, [meta.id]: html }));
      setNoteModalId(meta.id);
    } finally {
      setNoteLoading(false);
      setLoadingNoteId(null);
    }
  };

  const saveNote = async () => {
    if (!noteModalId || !currentPage) return;
    if (activeSharedMeta && !activeSharedMeta.permissions.editNotes) { closeNote(); return; }
    const updated: NotePage = { ...currentPage, html: noteDraft };
    await saveNotePage(updated);
    setHtmlCache(prev => ({ ...prev, [noteModalId]: noteDraft }));
    setNoteModalId(null); setNoteDraft(''); setCurrentPage(null);
  };

  const closeNote = () => { setNoteModalId(null); setNoteDraft(''); setCurrentPage(null); };

  // ── Personal Notes: open ──
  const personalOpenRequestRef = useRef<string | null>(null);
  const openPersonalNote = async (meta: NoteItem) => {
    if (personalLoading) return;
    personalOpenRequestRef.current = meta.id;
    setPersonalLoading(true);
    setLoadingPersonalId(meta.id);
    try {
      const page = await loadPersonalNotePage(meta.id);
      if (personalOpenRequestRef.current !== meta.id) return;
      const resolved: NotePage = page ?? {
        id: meta.id, title: meta.title, elements: [], pageCount: 1, html: '',
        createdAt: meta.createdAt, updatedAt: meta.updatedAt,
      };
      setCurrentPersonalPage(resolved);
      const html = resolved.html ?? '';
      setPersonalDraft(html);
      setPersonalHtmlCache(prev => ({ ...prev, [meta.id]: html }));
      setPersonalModalId(meta.id);
    } finally {
      setPersonalLoading(false);
      setLoadingPersonalId(null);
    }
  };

  const savePersonalNote = async () => {
    if (!personalModalId || !currentPersonalPage) return;
    const updated: NotePage = { ...currentPersonalPage, html: personalDraft };
    await savePersonalNotePage(updated);
    setPersonalHtmlCache(prev => ({ ...prev, [personalModalId]: personalDraft }));
    setPersonalModalId(null); setPersonalDraft(''); setCurrentPersonalPage(null);
  };

  const closePersonalNote = () => { setPersonalModalId(null); setPersonalDraft(''); setCurrentPersonalPage(null); };

  // ── Prompt Notes: open / save / close ──
  const promptOpenRequestRef = useRef<string | null>(null);
  const openPromptNote = async (meta: NoteItem) => {
    if (promptLoading) return;
    promptOpenRequestRef.current = meta.id;
    setPromptLoading(true);
    setLoadingPromptId(meta.id);
    try {
      const page = await loadPromptNotePage(meta.id);
      if (promptOpenRequestRef.current !== meta.id) return;
      const resolved: NotePage = page ?? {
        id: meta.id, title: meta.title, elements: [], pageCount: 1, html: '',
        createdAt: meta.createdAt, updatedAt: meta.updatedAt,
      };
      setCurrentPromptPage(resolved);
      const html = resolved.html ?? '';
      setPromptDraft(html);
      setPromptHtmlCache(prev => ({ ...prev, [meta.id]: html }));
      setPromptModalId(meta.id);
    } finally {
      setPromptLoading(false);
      setLoadingPromptId(null);
    }
  };

  const savePromptNote = async () => {
    if (!promptModalId || !currentPromptPage) return;
    const updated: NotePage = { ...currentPromptPage, html: promptDraft };
    await savePromptNotePage(updated);
    setPromptHtmlCache(prev => ({ ...prev, [promptModalId]: promptDraft }));
    setPromptModalId(null); setPromptDraft(''); setCurrentPromptPage(null);
  };

  const closePromptNote = () => { setPromptModalId(null); setPromptDraft(''); setCurrentPromptPage(null); };

  const noteModalItem = notePagesIndex.find(n => n.id === noteModalId);
  const personalModalItem = personalNotePagesIndex.find(n => n.id === personalModalId);
  const promptModalItem = promptNotePagesIndex.find(n => n.id === promptModalId);

  const courseNoteCount = subjectCourseNotes.length;
  const personalNoteCount = subjectPersonalNotes.length;

  // ── Subject grid view (when no subject selected) ──
  const renderSubjectGrid = (tab: ActiveTab) => {
    if (subjects.length === 0) {
      return (
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
          <h3 className="text-lg font-bold text-foreground mb-2">
            {lang === 'bn' ? 'কোনো সাবজেক্ট নেই' : 'No subjects yet'}
          </h3>
          <p className="text-muted-foreground text-sm">
            {lang === 'bn' ? 'আগে Subjects-এ গিয়ে সাবজেক্ট যোগ করুন।' : 'Add subjects first from the Subjects section.'}
          </p>
        </motion.div>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <AnimatePresence>
          {subjects.map((subj, idx) => {
            const count = tab === 'course'
              ? courseNoteCountForSubject(subj.id)
              : personalNoteCountForSubject(subj.id);
            const accent = SUBJECT_ACCENTS[idx % SUBJECT_ACCENTS.length];
            const iconColor = SUBJECT_ICON_COLORS[idx % SUBJECT_ICON_COLORS.length];
            const Icon = tab === 'course' ? BookOpen : User;
            return (
              <ScrollReveal key={subj.id} direction="up" delay={idx * 0.06}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectSubject(subj.id)}
                  className={cn(
                    'w-full text-left bg-gradient-to-br border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer',
                    accent,
                  )}
                >
                  <div className={cn('w-9 h-9 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center mb-3 shadow-sm')}>
                    <Icon size={16} strokeWidth={2} className={iconColor} />
                  </div>
                  <p className="text-sm font-bold text-foreground leading-snug mb-1 line-clamp-2">{subj.title}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {count > 0
                      ? (lang === 'bn' ? `${count}টি নোট` : `${count} note${count !== 1 ? 's' : ''}`)
                      : (lang === 'bn' ? 'কোনো নোট নেই' : 'No notes yet')}
                  </p>
                </motion.button>
              </ScrollReveal>
            );
          })}
        </AnimatePresence>
      </div>
    );
  };

  // Read-only notice intentionally hidden

  // ── Header subtitle ──
  const headerSubtitle = selectedSubject
    ? selectedSubject.title
    : activeTab === 'course'
      ? (lang === 'bn' ? 'কোর্স নোটস' : 'Course Notes')
      : activeTab === 'personal'
        ? (lang === 'bn' ? 'ব্যক্তিগত নোটস' : 'Personal Notes')
        : (lang === 'bn' ? 'প্রম্পটস' : 'Prompts');

  // ── Show add button ──
  const showCourseAdd = activeTab === 'course' && selectedSubjectId && !isCourseNotesReadOnly && !isCreating;
  const showPersonalAdd = activeTab === 'personal' && selectedSubjectId && !isCreatingPersonal;
  const showPromptAdd = activeTab === 'prompts' && !isCreatingPrompt;

  return (
    <>
      <Layout>
        {/* ── Gradient header banner ── */}
        <div
          className="sticky top-0 z-20 relative overflow-hidden rounded-b-2xl"
          style={{ background: 'linear-gradient(135deg, hsl(263 80% 55%) 0%, hsl(326 80% 58%) 50%, hsl(349 89% 60%) 100%)' }}
        >
          <div className="absolute top-[-20px] right-[-20px] w-36 h-36 rounded-full bg-white/10 blur-2xl" />
          <div className="relative px-5 pt-5 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Back button when subject selected, else icon */}
              {selectedSubjectId ? (
                <button
                  onClick={handleBack}
                  className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg shrink-0 hover:bg-white/30 transition-colors active:scale-95"
                >
                  <ChevronLeft size={22} className="text-white" />
                </button>
              ) : (
                <button
                  onClick={() => window.location.reload()}
                  className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg shrink-0 cursor-pointer hover:bg-white/30 transition-colors active:scale-95"
                  title="Reload"
                >
                  <FileText size={22} className="text-white" strokeWidth={2.2} />
                </button>
              )}
              <div>
                <h1
                  className="text-2xl font-bold text-white leading-tight"
                  style={{ textShadow: '0 1px 8px rgba(0,0,0,0.25)' }}
                >
                  {t('notesTab')}
                </h1>
                <p className="text-white/80 text-xs font-semibold mt-0.5 truncate max-w-[180px]">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            {/* Add / Reorder buttons — only shown inside a subject */}
            {showCourseAdd && (
              <div className="flex items-center gap-2">
                {courseNoteCount > 1 && (
                  <span className="spin-border-wrap spin-border-round" style={{ '--spin-mask': 'hsl(326 80% 58%)' } as React.CSSProperties}>
                    <motion.button
                      whileTap={{ scale: 0.97 }} type="button"
                      onClick={() => setReorderMode(v => !v)}
                      className={`spin-border-inner h-7 w-7 flex items-center justify-center transition-colors ${reorderMode ? 'bg-white text-purple-600 shadow-md' : 'bg-white/15 text-white hover:bg-white/25'}`}
                    >
                      <ArrowUpDown size={13} />
                    </motion.button>
                  </span>
                )}
                <span className="spin-border-wrap" style={{ '--spin-mask': 'hsl(326 80% 58%)' } as React.CSSProperties}>
                  <motion.button
                    whileTap={{ scale: 0.97 }} type="button"
                    onClick={() => setIsCreating(true)}
                    className="spin-border-inner flex items-center h-7 gap-1 px-2.5 bg-white/20 text-white text-[11px] font-bold hover:bg-white/30 transition-colors"
                  >
                    <Plus size={12} />{t('addNote')}
                  </motion.button>
                </span>
              </div>
            )}

            {showPersonalAdd && (
              <div className="flex items-center gap-2">
                {personalNoteCount > 1 && (
                  <span className="spin-border-wrap spin-border-round" style={{ '--spin-mask': 'hsl(326 80% 58%)' } as React.CSSProperties}>
                    <motion.button
                      whileTap={{ scale: 0.97 }} type="button"
                      onClick={() => setPersonalReorderMode(v => !v)}
                      className={`spin-border-inner h-7 w-7 flex items-center justify-center transition-colors ${personalReorderMode ? 'bg-white text-purple-600 shadow-md' : 'bg-white/15 text-white hover:bg-white/25'}`}
                    >
                      <ArrowUpDown size={13} />
                    </motion.button>
                  </span>
                )}
                <span className="spin-border-wrap" style={{ '--spin-mask': 'hsl(326 80% 58%)' } as React.CSSProperties}>
                  <motion.button
                    whileTap={{ scale: 0.97 }} type="button"
                    onClick={() => setIsCreatingPersonal(true)}
                    className="spin-border-inner flex items-center h-7 gap-1 px-2.5 bg-white/20 text-white text-[11px] font-bold hover:bg-white/30 transition-colors"
                  >
                    <Plus size={12} />{t('addNote')}
                  </motion.button>
                </span>
              </div>
            )}

            {showPromptAdd && (
              <div className="flex items-center gap-2">
                {promptNoteCount > 1 && (
                  <span className="spin-border-wrap spin-border-round" style={{ '--spin-mask': 'hsl(326 80% 58%)' } as React.CSSProperties}>
                    <motion.button
                      whileTap={{ scale: 0.97 }} type="button"
                      onClick={() => setPromptReorderMode(v => !v)}
                      className={`spin-border-inner h-7 w-7 flex items-center justify-center transition-colors ${promptReorderMode ? 'bg-white text-purple-600 shadow-md' : 'bg-white/15 text-white hover:bg-white/25'}`}
                    >
                      <ArrowUpDown size={13} />
                    </motion.button>
                  </span>
                )}
                <span className="spin-border-wrap" style={{ '--spin-mask': 'hsl(326 80% 58%)' } as React.CSSProperties}>
                  <motion.button
                    whileTap={{ scale: 0.97 }} type="button"
                    onClick={() => setIsCreatingPrompt(true)}
                    className="spin-border-inner flex items-center h-7 gap-1 px-2.5 bg-white/20 text-white text-[11px] font-bold hover:bg-white/30 transition-colors"
                  >
                    <Plus size={12} />{lang === 'bn' ? 'প্রম্পট যোগ করুন' : 'Add Prompt'}
                  </motion.button>
                </span>
              </div>
            )}
          </div>

          {/* ── Tab switcher ── */}
          <div className="relative px-3 pb-3 flex gap-1">
            <button
              onClick={() => setActiveTab('course')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl font-bold transition-all ${isSuperAdmin ? 'text-[10px]' : 'text-xs'} ${
                activeTab === 'course'
                  ? 'bg-white text-purple-700 shadow-md'
                  : 'bg-white/15 text-white/80 hover:bg-white/25'
              }`}
            >
              <BookOpen size={10} className="shrink-0" />
              <span className="whitespace-nowrap">{lang === 'bn' ? 'কোর্স নোটস' : 'Course Notes'}</span>
            </button>
            <button
              onClick={() => setActiveTab('personal')}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl font-bold transition-all ${isSuperAdmin ? 'text-[10px]' : 'text-xs'} ${
                activeTab === 'personal'
                  ? 'bg-white text-purple-700 shadow-md'
                  : 'bg-white/15 text-white/80 hover:bg-white/25'
              }`}
            >
              <User size={10} className="shrink-0" />
              <span className="whitespace-nowrap">{lang === 'bn' ? 'ব্যক্তিগত নোটস' : 'Personal Notes'}</span>
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('prompts')}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                  activeTab === 'prompts'
                    ? 'bg-white text-purple-700 shadow-md'
                    : 'bg-white/15 text-white/80 hover:bg-white/25'
                }`}
              >
                <Sparkles size={10} className="shrink-0" />
                <span className="whitespace-nowrap">{lang === 'bn' ? 'প্রম্পটস' : 'Prompts'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-5 max-w-2xl mx-auto">
          <AnimatePresence mode="wait">

            {/* ══════════════════ COURSE NOTES TAB ══════════════════ */}
            {activeTab === 'course' && (
              <motion.div
                key={`course-${selectedSubjectId ?? 'grid'}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {/* Subject grid */}
                {!selectedSubjectId && renderSubjectGrid('course')}

                {/* Notes inside a subject */}
                {selectedSubjectId && (
                  <>
                    {/* Create input */}
                    <AnimatePresence>
                      {isCreating && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -8, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mb-4"
                        >
                          <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm">
                            <p className="text-[11px] font-medium text-muted-foreground mb-2">
                              {lang === 'bn' ? 'নতুন নোটের শিরোনাম' : 'New note title'}
                            </p>
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                ref={newTitleRef}
                                type="text"
                                value={newTitle}
                                onChange={e => setNewTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleCreate();
                                  if (e.key === 'Escape') { setIsCreating(false); setNewTitle(''); }
                                }}
                                placeholder={lang === 'bn' ? 'শিরোনাম লিখুন…' : 'Enter title…'}
                                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              <button
                                onClick={handleCreate}
                                disabled={!newTitle.trim()}
                                className="shrink-0 p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                onClick={() => { setIsCreating(false); setNewTitle(''); }}
                                className="shrink-0 p-2.5 rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Search */}
                    {courseNoteCount > 0 && !isCreating && (
                      <div className="relative mb-3">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder={lang === 'bn' ? 'নোট খুঁজুন...' : 'Search notes...'}
                          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Empty state */}
                    {courseNoteCount === 0 && !isCreating && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="flex flex-col items-center justify-center py-12 text-center px-6"
                      >
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          className="mb-4 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
                        >
                          <BookOpen size={28} className="text-primary" />
                        </motion.div>
                        <h3 className="text-lg font-bold text-foreground mb-1.5">
                          {lang === 'bn' ? 'কোনো কোর্স নোট নেই' : 'No course notes yet'}
                        </h3>
                        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                          {isCourseNotesReadOnly
                            ? (lang === 'bn' ? 'অ্যাডমিন এখনও কোনো নোট শেয়ার করেননি।' : 'Admin has not shared any notes yet.')
                            : (lang === 'bn' ? 'নতুন কোর্স নোট তৈরি করুন!' : 'Create your first course note!')}
                        </p>
                        {!isCourseNotesReadOnly && (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setIsCreating(true); setTimeout(() => newTitleRef.current?.focus(), 50); }}
                            className="flex items-center gap-2 py-3 px-6 rounded-2xl bg-primary text-white text-sm font-semibold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
                          >
                            <Plus size={18} />{lang === 'bn' ? 'নোট যোগ করুন' : 'Add Note'}
                          </motion.button>
                        )}
                      </motion.div>
                    )}

                    {/* No search results */}
                    {courseNoteCount > 0 && filteredCourseNotes.length === 0 && searchQuery.trim() && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-12 text-center px-6"
                      >
                        <div className="mb-3 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Search size={24} className="text-primary/60" />
                        </div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {lang === 'bn' ? 'কোনো নোট পাওয়া যায়নি' : 'No notes found'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lang === 'bn' ? `"${searchQuery}" এর সাথে কোনো নোট মিলছে না` : `No notes match "${searchQuery}"`}
                        </p>
                      </motion.div>
                    )}

                    {/* Note list */}
                    {courseNoteCount > 0 && filteredCourseNotes.length > 0 && (
                      <DndContext sensors={sensors} onDragEnd={handleCoursesDragEnd}>
                        <SortableContext items={filteredCourseNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                          <ul className="space-y-2">
                            <AnimatePresence>
                              {filteredCourseNotes.map((note, idx) => (
                                <SortableNoteCard key={note.id} id={note.id} reorderMode={reorderMode && !isCourseNotesReadOnly}>
                                  {handle => (
                                    <NoteCard
                                      note={note} index={idx}
                                      isEditing={editingId === note.id}
                                      editDraft={draftTitle}
                                      isLoadingThis={loadingNoteId === note.id}
                                      hasContent={!!(htmlCache[note.id]?.trim())}
                                      reorderMode={reorderMode && !isCourseNotesReadOnly}
                                      dragHandle={handle}
                                      showActions={!isCourseNotesReadOnly}
                                      onEditDraftChange={setDraftTitle}
                                      onOpenNote={() => openNote(note)}
                                      onStartRename={() => { setEditingId(note.id); setDraftTitle(note.title); }}
                                      onSaveRename={() => { renameNotePage(note.id, draftTitle); setEditingId(null); }}
                                      onCancelRename={() => setEditingId(null)}
                                      onDelete={() => setConfirmDelete(note.id)}
                                    />
                                  )}
                                </SortableNoteCard>
                              ))}
                            </AnimatePresence>
                          </ul>
                        </SortableContext>
                      </DndContext>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ══════════════════ PERSONAL NOTES TAB ══════════════════ */}
            {activeTab === 'personal' && (
              <motion.div
                key={`personal-${selectedSubjectId ?? 'grid'}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {/* Subject grid */}
                {!selectedSubjectId && renderSubjectGrid('personal')}

                {/* Notes inside a subject */}
                {selectedSubjectId && (
                  <>
                    {/* Create input */}
                    <AnimatePresence>
                      {isCreatingPersonal && (
                        <motion.div
                          initial={{ opacity: 0, y: -8, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -8, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="mb-4"
                        >
                          <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm">
                            <p className="text-[11px] font-medium text-muted-foreground mb-2">
                              {lang === 'bn' ? 'নতুন ব্যক্তিগত নোটের শিরোনাম' : 'New personal note title'}
                            </p>
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                ref={newPersonalTitleRef}
                                type="text"
                                value={newPersonalTitle}
                                onChange={e => setNewPersonalTitle(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleCreatePersonal();
                                  if (e.key === 'Escape') { setIsCreatingPersonal(false); setNewPersonalTitle(''); }
                                }}
                                placeholder={lang === 'bn' ? 'শিরোনাম লিখুন…' : 'Enter title…'}
                                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                              <button
                                onClick={handleCreatePersonal}
                                disabled={!newPersonalTitle.trim()}
                                className="shrink-0 p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                onClick={() => { setIsCreatingPersonal(false); setNewPersonalTitle(''); }}
                                className="shrink-0 p-2.5 rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Search */}
                    {personalNoteCount > 0 && !isCreatingPersonal && (
                      <div className="relative mb-3">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          value={personalSearchQuery}
                          onChange={e => setPersonalSearchQuery(e.target.value)}
                          placeholder={lang === 'bn' ? 'ব্যক্তিগত নোট খুঁজুন...' : 'Search personal notes...'}
                          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                        />
                        {personalSearchQuery && (
                          <button
                            onClick={() => setPersonalSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Empty state */}
                    {personalNoteCount === 0 && !isCreatingPersonal && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="flex flex-col items-center justify-center py-12 text-center px-6"
                      >
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                          className="mb-4 w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center"
                        >
                          <User size={28} className="text-emerald-600" />
                        </motion.div>
                        <h3 className="text-lg font-bold text-foreground mb-1.5">
                          {lang === 'bn' ? 'কোনো ব্যক্তিগত নোট নেই' : 'No personal notes yet'}
                        </h3>
                        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                          {lang === 'bn' ? 'শুধুমাত্র আপনার জন্য নোট তৈরি করুন!' : 'Create notes just for yourself!'}
                        </p>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => { setIsCreatingPersonal(true); setTimeout(() => newPersonalTitleRef.current?.focus(), 50); }}
                          className="flex items-center gap-2 py-3 px-6 rounded-2xl bg-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-500 transition-colors"
                        >
                          <Plus size={18} />{lang === 'bn' ? 'নোট যোগ করুন' : 'Add Note'}
                        </motion.button>
                      </motion.div>
                    )}

                    {/* No search results */}
                    {personalNoteCount > 0 && filteredPersonalNotes.length === 0 && personalSearchQuery.trim() && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-12 text-center px-6"
                      >
                        <div className="mb-3 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Search size={24} className="text-primary/60" />
                        </div>
                        <p className="text-sm font-semibold text-foreground mb-1">
                          {lang === 'bn' ? 'কোনো নোট পাওয়া যায়নি' : 'No notes found'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {lang === 'bn'
                            ? `"${personalSearchQuery}" এর সাথে কোনো নোট মিলছে না`
                            : `No notes match "${personalSearchQuery}"`}
                        </p>
                      </motion.div>
                    )}

                    {/* Personal note list */}
                    {personalNoteCount > 0 && filteredPersonalNotes.length > 0 && (
                      <DndContext sensors={sensors} onDragEnd={handlePersonalDragEnd}>
                        <SortableContext items={filteredPersonalNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                          <ul className="space-y-2">
                            <AnimatePresence>
                              {filteredPersonalNotes.map((note, idx) => (
                                <SortableNoteCard key={note.id} id={note.id} reorderMode={personalReorderMode}>
                                  {handle => (
                                    <NoteCard
                                      note={note} index={idx}
                                      isEditing={editingPersonalId === note.id}
                                      editDraft={draftPersonalTitle}
                                      isLoadingThis={loadingPersonalId === note.id}
                                      hasContent={!!(personalHtmlCache[note.id]?.trim())}
                                      reorderMode={personalReorderMode}
                                      dragHandle={handle}
                                      showActions={true}
                                      accentVariant="personal"
                                      onEditDraftChange={setDraftPersonalTitle}
                                      onOpenNote={() => openPersonalNote(note)}
                                      onStartRename={() => { setEditingPersonalId(note.id); setDraftPersonalTitle(note.title); }}
                                      onSaveRename={() => { renamePersonalNotePage(note.id, draftPersonalTitle); setEditingPersonalId(null); }}
                                      onCancelRename={() => setEditingPersonalId(null)}
                                      onDelete={() => setConfirmDeletePersonal(note.id)}
                                    />
                                  )}
                                </SortableNoteCard>
                              ))}
                            </AnimatePresence>
                          </ul>
                        </SortableContext>
                      </DndContext>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ══════════════════ PROMPTS TAB (super-admin only) ══════════════════ */}
            {activeTab === 'prompts' && isSuperAdmin && (
              <motion.div
                key="prompts"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {/* Create input */}
                <AnimatePresence>
                  {isCreatingPrompt && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: 'auto' }}
                      exit={{ opacity: 0, y: -8, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mb-4"
                    >
                      <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm">
                        <p className="text-[11px] font-medium text-muted-foreground mb-2">
                          {lang === 'bn' ? 'নতুন প্রম্পটের শিরোনাম' : 'New prompt title'}
                        </p>
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            ref={newPromptTitleRef}
                            type="text"
                            value={newPromptTitle}
                            onChange={e => setNewPromptTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCreatePrompt();
                              if (e.key === 'Escape') { setIsCreatingPrompt(false); setNewPromptTitle(''); }
                            }}
                            placeholder={lang === 'bn' ? 'শিরোনাম লিখুন…' : 'Enter title…'}
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <button
                            onClick={handleCreatePrompt}
                            disabled={!newPromptTitle.trim()}
                            className="shrink-0 p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            onClick={() => { setIsCreatingPrompt(false); setNewPromptTitle(''); }}
                            className="shrink-0 p-2.5 rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Search */}
                {promptNoteCount > 0 && !isCreatingPrompt && (
                  <div className="relative mb-3">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={promptSearchQuery}
                      onChange={e => setPromptSearchQuery(e.target.value)}
                      placeholder={lang === 'bn' ? 'প্রম্পট খুঁজুন...' : 'Search prompts...'}
                      className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
                    />
                    {promptSearchQuery && (
                      <button
                        onClick={() => setPromptSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {promptNoteCount === 0 && !isCreatingPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex flex-col items-center justify-center py-12 text-center px-6"
                  >
                    <motion.div
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      className="mb-4 w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center"
                    >
                      <Sparkles size={28} className="text-amber-500" />
                    </motion.div>
                    <h3 className="text-lg font-bold text-foreground mb-1.5">
                      {lang === 'bn' ? 'কোনো প্রম্পট নেই' : 'No prompts yet'}
                    </h3>
                    <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                      {lang === 'bn' ? 'প্রম্পট যোগ করুন — সব কোর্সে একই থাকবে।' : 'Add prompts — they sync across all courses.'}
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setIsCreatingPrompt(true); setTimeout(() => newPromptTitleRef.current?.focus(), 50); }}
                      className="flex items-center gap-2 py-3 px-6 rounded-2xl bg-amber-500 text-white text-sm font-semibold shadow-lg shadow-amber-500/25 hover:bg-amber-400 transition-colors"
                    >
                      <Plus size={18} />{lang === 'bn' ? 'প্রম্পট যোগ করুন' : 'Add Prompt'}
                    </motion.button>
                  </motion.div>
                )}

                {/* No search results */}
                {promptNoteCount > 0 && filteredPromptNotes.length === 0 && promptSearchQuery.trim() && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-12 text-center px-6"
                  >
                    <div className="mb-3 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Search size={24} className="text-primary/60" />
                    </div>
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {lang === 'bn' ? 'কোনো প্রম্পট পাওয়া যায়নি' : 'No prompts found'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lang === 'bn'
                        ? `"${promptSearchQuery}" এর সাথে কোনো প্রম্পট মিলছে না`
                        : `No prompts match "${promptSearchQuery}"`}
                    </p>
                  </motion.div>
                )}

                {/* Prompt note list */}
                {promptNoteCount > 0 && filteredPromptNotes.length > 0 && (
                  <DndContext sensors={sensors} onDragEnd={handlePromptDragEnd}>
                    <SortableContext items={filteredPromptNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-2">
                        <AnimatePresence>
                          {filteredPromptNotes.map((note, idx) => (
                            <SortableNoteCard key={note.id} id={note.id} reorderMode={promptReorderMode}>
                              {handle => (
                                <NoteCard
                                  note={note} index={idx}
                                  isEditing={editingPromptId === note.id}
                                  editDraft={draftPromptTitle}
                                  isLoadingThis={loadingPromptId === note.id}
                                  hasContent={!!(promptHtmlCache[note.id]?.trim())}
                                  reorderMode={promptReorderMode}
                                  dragHandle={handle}
                                  showActions={true}
                                  accentVariant="prompt"
                                  onEditDraftChange={setDraftPromptTitle}
                                  onOpenNote={() => openPromptNote(note)}
                                  onStartRename={() => { setEditingPromptId(note.id); setDraftPromptTitle(note.title); }}
                                  onSaveRename={() => { renamePromptNotePage(note.id, draftPromptTitle); setEditingPromptId(null); }}
                                  onCancelRename={() => setEditingPromptId(null)}
                                  onDelete={() => setConfirmDeletePrompt(note.id)}
                                />
                              )}
                            </SortableNoteCard>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </Layout>

      {/* ── Course Note editor modal ── */}
      <NoteEditorModal
        isOpen={!!noteModalId}
        onClose={closeNote}
        title={noteModalItem?.title ?? t('notesTab')}
        icon={StickyNote}
        value={noteDraft}
        onChange={setNoteDraft}
        onClear={() => setNoteDraft('')}
        onSave={saveNote}
        placeholder={t('notePlaceholder')}
        clearLabel={t('clearNote')}
        saveLabel={t('saveNote')}
        editAllowed={!activeSharedMeta || activeSharedMeta.permissions.editNotes}
        downloadAllowed={!activeSharedMeta || activeSharedMeta.permissions.downloadNotes}
        copyAllowed={!activeSharedMeta || activeSharedMeta.permissions.copyNotes}
        pdfUserEmail={user?.email ?? ''}
        pdfIsAdmin={isAdmin}
        pdfIsShared={!!activeSharedMeta}
        pdfWhatsApp={appContact.whatsapp}
        pdfWebsite={appContact.website}
      />

      {/* ── Personal Note editor modal ── */}
      <NoteEditorModal
        isOpen={!!personalModalId}
        onClose={closePersonalNote}
        title={personalModalItem?.title ?? (lang === 'bn' ? 'ব্যক্তিগত নোট' : 'Personal Note')}
        icon={User}
        value={personalDraft}
        onChange={setPersonalDraft}
        onClear={() => setPersonalDraft('')}
        onSave={savePersonalNote}
        placeholder={t('notePlaceholder')}
        clearLabel={t('clearNote')}
        saveLabel={t('saveNote')}
        editAllowed={true}
        downloadAllowed={true}
        copyAllowed={true}
        pdfUserEmail={user?.email ?? ''}
        pdfIsAdmin={isAdmin}
        pdfIsShared={false}
        pdfWhatsApp={appContact.whatsapp}
        pdfWebsite={appContact.website}
      />

      {/* ── Prompt Note editor modal ── */}
      <NoteEditorModal
        isOpen={!!promptModalId}
        onClose={closePromptNote}
        title={promptModalItem?.title ?? (lang === 'bn' ? 'প্রম্পট' : 'Prompt')}
        icon={Sparkles}
        value={promptDraft}
        onChange={setPromptDraft}
        onClear={() => setPromptDraft('')}
        onSave={savePromptNote}
        placeholder={t('notePlaceholder')}
        clearLabel={t('clearNote')}
        saveLabel={t('saveNote')}
        editAllowed={true}
        downloadAllowed={true}
        copyAllowed={true}
        pdfUserEmail={user?.email ?? ''}
        pdfIsAdmin={isAdmin}
        pdfIsShared={false}
        pdfWhatsApp={appContact.whatsapp}
        pdfWebsite={appContact.website}
      />

      {/* ── Course note delete confirm ── */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await deleteNotePage(confirmDelete);
            setHtmlCache(prev => { const n = { ...prev }; delete n[confirmDelete]; return n; });
          }
          setConfirmDelete(null);
        }}
        title={t('deletePage')}
        message={t('deletePageConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isDanger
      />

      {/* ── Personal note delete confirm ── */}
      <ConfirmModal
        isOpen={!!confirmDeletePersonal}
        onClose={() => setConfirmDeletePersonal(null)}
        onConfirm={async () => {
          if (confirmDeletePersonal) {
            await deletePersonalNotePage(confirmDeletePersonal);
            setPersonalHtmlCache(prev => { const n = { ...prev }; delete n[confirmDeletePersonal]; return n; });
          }
          setConfirmDeletePersonal(null);
        }}
        title={t('deletePage')}
        message={t('deletePageConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isDanger
      />

      {/* ── Prompt note delete confirm ── */}
      <ConfirmModal
        isOpen={!!confirmDeletePrompt}
        onClose={() => setConfirmDeletePrompt(null)}
        onConfirm={async () => {
          if (confirmDeletePrompt) {
            await deletePromptNotePage(confirmDeletePrompt);
            setPromptHtmlCache(prev => { const n = { ...prev }; delete n[confirmDeletePrompt]; return n; });
          }
          setConfirmDeletePrompt(null);
        }}
        title={t('deletePage')}
        message={t('deletePageConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        isDanger
      />
    </>
  );
}

// ─── Single note card ─────────────────────────────────────────────────────────
interface NoteCardProps {
  note: NoteItem;
  index: number;
  isEditing: boolean;
  editDraft: string;
  isLoadingThis: boolean;
  hasContent: boolean;
  reorderMode: boolean;
  dragHandle: React.ReactNode;
  showActions: boolean;
  accentVariant?: 'course' | 'personal' | 'prompt';
  onEditDraftChange: (v: string) => void;
  onOpenNote: () => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

const CARD_ACCENTS = [
  'from-blue-500/20 to-blue-400/5 border-blue-200/60 dark:border-blue-800/40',
  'from-violet-500/20 to-violet-400/5 border-violet-200/60 dark:border-violet-800/40',
  'from-emerald-500/20 to-emerald-400/5 border-emerald-200/60 dark:border-emerald-800/40',
  'from-amber-500/20 to-amber-400/5 border-amber-200/60 dark:border-amber-800/40',
  'from-rose-500/20 to-rose-400/5 border-rose-200/60 dark:border-rose-800/40',
  'from-cyan-500/20 to-cyan-400/5 border-cyan-200/60 dark:border-cyan-800/40',
];

const PERSONAL_CARD_ACCENTS = [
  'from-emerald-500/20 to-emerald-400/5 border-emerald-200/60 dark:border-emerald-800/40',
  'from-teal-500/20 to-teal-400/5 border-teal-200/60 dark:border-teal-800/40',
  'from-green-500/20 to-green-400/5 border-green-200/60 dark:border-green-800/40',
  'from-lime-500/20 to-lime-400/5 border-lime-200/60 dark:border-lime-800/40',
  'from-cyan-500/20 to-cyan-400/5 border-cyan-200/60 dark:border-cyan-800/40',
  'from-sky-500/20 to-sky-400/5 border-sky-200/60 dark:border-sky-800/40',
];

const PROMPT_CARD_ACCENTS = [
  'from-amber-500/20 to-amber-400/5 border-amber-200/60 dark:border-amber-800/40',
  'from-orange-500/20 to-orange-400/5 border-orange-200/60 dark:border-orange-800/40',
  'from-yellow-500/20 to-yellow-400/5 border-yellow-200/60 dark:border-yellow-800/40',
  'from-amber-400/20 to-amber-300/5 border-amber-200/60 dark:border-amber-800/40',
  'from-orange-400/20 to-orange-300/5 border-orange-200/60 dark:border-orange-800/40',
  'from-yellow-400/20 to-yellow-300/5 border-yellow-200/60 dark:border-yellow-800/40',
];

const ICON_COLORS = [
  'text-blue-500', 'text-violet-500', 'text-emerald-500',
  'text-amber-500', 'text-rose-500', 'text-cyan-500',
];

const PERSONAL_ICON_COLORS = [
  'text-emerald-500', 'text-teal-500', 'text-green-500',
  'text-lime-600', 'text-cyan-500', 'text-sky-500',
];

const PROMPT_ICON_COLORS = [
  'text-amber-500', 'text-orange-500', 'text-yellow-500',
  'text-amber-400', 'text-orange-400', 'text-yellow-400',
];

function NoteCard({
  note, index, isEditing, editDraft, isLoadingThis, hasContent,
  reorderMode, dragHandle, showActions, accentVariant = 'course',
  onEditDraftChange, onOpenNote, onStartRename, onSaveRename, onCancelRename, onDelete,
}: NoteCardProps) {
  const accents = accentVariant === 'personal' ? PERSONAL_CARD_ACCENTS : accentVariant === 'prompt' ? PROMPT_CARD_ACCENTS : CARD_ACCENTS;
  const iconColors = accentVariant === 'personal' ? PERSONAL_ICON_COLORS : accentVariant === 'prompt' ? PROMPT_ICON_COLORS : ICON_COLORS;
  const accent = accents[index % accents.length];
  const iconColor = iconColors[index % iconColors.length];

  return (
    <motion.li layout exit={{ opacity: 0, scale: 0.96, y: -4 }}>
      <ScrollReveal direction="right" delay={index * 0.08}>
        <div className={`group relative bg-gradient-to-r ${accent} border rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden`}>
          <div className="flex items-center gap-3 px-4 py-3.5">

            {/* Left icon */}
            <div className="shrink-0 w-8 h-8 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center shadow-sm">
              {isLoadingThis
                ? <Loader2 size={15} className={`${iconColor} animate-spin`} />
                : <FileText size={15} className={hasContent ? 'text-rose-500' : iconColor} />
              }
            </div>

            {/* Title / rename */}
            {isEditing ? (
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <input
                  autoFocus
                  value={editDraft}
                  onChange={e => onEditDraftChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onSaveRename();
                    if (e.key === 'Escape') onCancelRename();
                  }}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-border bg-white dark:bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button onClick={onSaveRename} className="shrink-0 text-primary p-2 rounded-lg hover:bg-white/50 transition-colors"><Check size={15} /></button>
                <button onClick={onCancelRename} className="shrink-0 text-muted-foreground p-2 rounded-lg hover:bg-white/50 transition-colors"><X size={15} /></button>
              </div>
            ) : (
              <button
                onClick={reorderMode ? undefined : onOpenNote}
                disabled={isLoadingThis || reorderMode}
                className="flex-1 text-left text-sm font-semibold text-foreground leading-snug truncate hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-default"
              >
                {note.title}
              </button>
            )}

            {/* Action icons */}
            {!isEditing && !reorderMode && showActions && (
              <div className="flex items-center gap-0.5 shrink-0">
                <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={onStartRename} title="Rename"
                  className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors">
                  <Pencil size={13} />
                </motion.button>
                <motion.button whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={onDelete} title="Delete"
                  className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10 text-muted-foreground hover:text-rose-600 transition-colors">
                  <Trash2 size={13} />
                </motion.button>
              </div>
            )}

            {/* Drag handle */}
            {!isEditing && dragHandle}
          </div>
        </div>
      </ScrollReveal>
    </motion.li>
  );
}
