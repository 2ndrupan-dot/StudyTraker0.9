import React, { useState, useRef, useEffect } from 'react';
import { RichTextPreview } from '@/components/RichTextEditor';
import { useAuth } from '@/context/AuthContext';
import { useStudy } from '@/context/StudyContext';
import type { MarkPath } from '@/lib/types';
import { useCourse } from '@/context/CourseContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import { Settings, LogOut, User as UserIcon, BookOpen, Target, ShieldCheck, Camera, CalendarDays, CheckCircle2, Plus, ArrowLeftRight, BookMarked, Pencil, BookOpenCheck, NotebookPen, StickyNote, Trash2, Search, ChevronRight, FileText, ExternalLink, Globe } from 'lucide-react';
import { TimezoneSelector } from '@/components/TimezoneSelector';
import { getTimezoneEntry, getCurrentOffset, getFlagUrl } from '@/lib/timezones';
import { Modal, ConfirmModal, Input, Button, NoteEditorModal, NotePagePreviewModal } from '@/components/ui';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isValid } from 'date-fns';

function safeFormat(dateStr: string | null | undefined, fmt: string, fallback = '—'): string {
  if (!dateStr) return fallback;
  try {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt) : fallback;
  } catch {
    return fallback;
  }
}

const cardVariants = {
  hidden: { opacity: 0, x: 48 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: [0.22, 1, 0.36, 1] }
  }),
};

// ─── Note Search Modal ───────────────────────────────────────────────────────
function NoteSearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { subjects, notePagesIndex, setNote } = useStudy();
  const { t } = useLang();
  const [, setLocation] = useLocation();

  // Drill-down state
  type Level = 'subjects' | 'chapters' | 'topics' | 'subtopics' | 'concepts' | 'points';
  const [level, setLevel] = React.useState<Level>('subjects');
  const [selSubject, setSelSubject] = React.useState<any>(null);
  const [selChapter, setSelChapter] = React.useState<any>(null);
  const [selTopic, setSelTopic] = React.useState<any>(null);
  const [selSubtopic, setSelSubtopic] = React.useState<any>(null);
  const [selConcept, setSelConcept] = React.useState<any>(null);

  // Edit note state (includes path for saving)
  const [viewNote, setViewNote] = React.useState<{ title: string; draft: string; path: MarkPath } | null>(null);
  // View A4 note page
  const [viewNotePageId, setViewNotePageId] = React.useState<{ id: string; title: string } | null>(null);

  const buildPath = (item: any): MarkPath => {
    if (level === 'subjects')  return { subjectId: item.id, level: 'subject' };
    if (level === 'chapters')  return { subjectId: selSubject.id, chapterId: item.id, level: 'chapter' };
    if (level === 'topics')    return { subjectId: selSubject.id, chapterId: selChapter.id, topicId: item.id, level: 'topic' };
    if (level === 'subtopics') return { subjectId: selSubject.id, chapterId: selChapter.id, topicId: selTopic.id, subtopicId: item.id, level: 'subtopic' };
    if (level === 'concepts')  return { subjectId: selSubject.id, chapterId: selChapter.id, topicId: selTopic.id, subtopicId: selSubtopic.id, conceptId: item.id, level: 'concept' };
    return { subjectId: selSubject.id, chapterId: selChapter.id, topicId: selTopic.id, subtopicId: selSubtopic.id, conceptId: selConcept.id, pointId: item.id, level: 'point' };
  };

  React.useEffect(() => {
    if (!isOpen) {
      setLevel('subjects'); setSelSubject(null); setSelChapter(null);
      setSelTopic(null); setSelSubtopic(null); setSelConcept(null);
    }
  }, [isOpen]);

  const goBack = () => {
    if (level === 'points')    { setSelConcept(null);  setLevel('concepts'); }
    else if (level === 'concepts')  { setSelSubtopic(null); setLevel('subtopics'); }
    else if (level === 'subtopics') { setSelTopic(null);    setLevel('topics'); }
    else if (level === 'topics')    { setSelChapter(null);  setLevel('chapters'); }
    else if (level === 'chapters')  { setSelSubject(null);  setLevel('subjects'); }
  };

  // Always derive from live `subjects` so note edits reflect immediately
  const liveSubject  = selSubject  ? subjects.find((s: any) => s.id === selSubject.id)                              : null;
  const liveChapter  = liveSubject && selChapter  ? liveSubject.chapters?.find((c: any) => c.id === selChapter.id)  : null;
  const liveTopic    = liveChapter && selTopic    ? liveChapter.topics?.find((t: any) => t.id === selTopic.id)      : null;
  const liveSubtopic = liveTopic   && selSubtopic ? liveTopic.subtopics?.find((s: any) => s.id === selSubtopic.id)  : null;
  const liveConcept  = liveSubtopic && selConcept ? liveSubtopic.concepts?.find((c: any) => c.id === selConcept.id) : null;

  const currentItems: any[] = level === 'subjects'   ? subjects
    : level === 'chapters'  ? (liveSubject?.chapters  ?? [])
    : level === 'topics'    ? (liveChapter?.topics    ?? [])
    : level === 'subtopics' ? (liveTopic?.subtopics   ?? [])
    : level === 'concepts'  ? (liveSubtopic?.concepts ?? [])
    : level === 'points'    ? (liveConcept?.points    ?? [])
    : [];

  const hasChildren = (item: any) => {
    if (level === 'subjects')   return (item.chapters?.length ?? 0) > 0;
    if (level === 'chapters')   return (item.topics?.length ?? 0) > 0;
    if (level === 'topics')     return (item.subtopics?.length ?? 0) > 0;
    if (level === 'subtopics')  return (item.concepts?.length ?? 0) > 0;
    if (level === 'concepts')   return (item.points?.length ?? 0) > 0;
    return false;
  };

  const drillInto = (item: any) => {
    if (level === 'subjects')   { setSelSubject(item);  setLevel('chapters'); }
    else if (level === 'chapters')  { setSelChapter(item);  setLevel('topics'); }
    else if (level === 'topics')    { setSelTopic(item);    setLevel('subtopics'); }
    else if (level === 'subtopics') { setSelSubtopic(item); setLevel('concepts'); }
    else if (level === 'concepts')  { setSelConcept(item);  setLevel('points'); }
  };

  const levelLabel: Record<Level, string> = {
    subjects: 'Subjects', chapters: 'Chapters', topics: 'Topics',
    subtopics: 'Subtopics', concepts: 'Concepts', points: 'Points',
  };

  const breadcrumbs = [
    selSubject?.title, selChapter?.title, selTopic?.title,
    selSubtopic?.title, selConcept?.title,
  ].filter(Boolean);

  const accentColor = selSubject?.color ?? '#6366f1';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={t('noteSearch')} icon={Search}>
        {/* Breadcrumb */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3 flex-wrap leading-relaxed">
            <button
              onClick={() => { setLevel('subjects'); setSelSubject(null); setSelChapter(null); setSelTopic(null); setSelSubtopic(null); setSelConcept(null); }}
              className="hover:text-foreground transition-colors"
            >
              {t('allItems')}
            </button>
            {breadcrumbs.map((c, i) => (
              <React.Fragment key={i}>
                <ChevronRight size={11} className="text-border" />
                <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Back button */}
        {level !== 'subjects' && (
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-xs text-primary mb-3 hover:underline"
          >
            <ChevronRight size={12} className="rotate-180" />
            Back
          </button>
        )}

        {/* A4 Note Pages (only at root level) */}
        {level === 'subjects' && notePagesIndex.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              {t('a4NotePages')}
            </p>
            <div className="space-y-1">
              {notePagesIndex.map(np => (
                <button
                  key={np.id}
                  onClick={() => setViewNotePageId({ id: np.id, title: np.title || 'Untitled' })}
                  className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-secondary transition-colors text-left"
                >
                  <FileText size={14} className="text-primary shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{np.title || 'Untitled'}</span>
                  <ExternalLink size={11} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
            <div className="border-t border-border/40 mt-3 mb-4" />
          </div>
        )}

        {/* Level label */}
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          {levelLabel[level]}
        </p>

        {/* Items list */}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {currentItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No items here.</p>
          ) : (
            currentItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-xl hover:bg-secondary/50 transition-colors group"
              >
                {/* Drill-in button */}
                <button
                  onClick={() => hasChildren(item) ? drillInto(item) : undefined}
                  className="flex-1 flex items-center gap-2.5 p-2.5 text-left min-w-0"
                  disabled={!hasChildren(item)}
                >
                  {selSubject?.color && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: level === 'subjects' ? item.color : accentColor }}
                    />
                  )}
                  <span className="text-sm font-medium truncate flex-1">{item.title}</span>
                  {hasChildren(item) && (
                    <ChevronRight size={14} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>

                {/* Note badge */}
                {item.note?.trim() && (
                  <button
                    onClick={() => setViewNote({ title: item.title, draft: item.note, path: buildPath(item) })}
                    className="p-2 mr-1 rounded-lg hover:bg-amber-500/10 text-amber-500 shrink-0 transition-colors"
                    title={t('viewNote')}
                  >
                    <StickyNote size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Item note editor */}
      {viewNote && (
        <NoteEditorModal
          isOpen={!!viewNote}
          onClose={() => setViewNote(null)}
          title={viewNote.title}
          icon={StickyNote}
          value={viewNote.draft}
          onChange={v => setViewNote(prev => prev ? { ...prev, draft: v } : null)}
          onClear={() => {
            setNote(viewNote.path, '');
            setViewNote(null);
          }}
          onSave={() => {
            setNote(viewNote.path, viewNote.draft);
            setViewNote(null);
          }}
          placeholder={t('overallNotePlaceholder')}
          clearLabel={t('clearNote')}
          saveLabel={t('saveNote')}
        />
      )}

      {/* A4 note page preview */}
      {viewNotePageId && (
        <NotePagePreviewModal
          isOpen={!!viewNotePageId}
          onClose={() => setViewNotePageId(null)}
          noteId={viewNotePageId.id}
          noteTitle={viewNotePageId.title}
        />
      )}
    </>
  );
}

// ─── Overall Notes Component ─────────────────────────────────────────────────
function OverallNotesCard() {
  const { overallNote, setOverallNote } = useStudy();
  const { t } = useLang();
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const openModal = () => {
    setDraft(overallNote);
    setModalOpen(true);
  };

  // Auto-open when navigated here from Global Search
  useEffect(() => {
    const stored = sessionStorage.getItem('study_nav_target');
    if (!stored) return;
    try {
      const nav = JSON.parse(stored);
      if (nav.kind === 'overallNote') {
        sessionStorage.removeItem('study_nav_target');
        setTimeout(() => openModal(), 150);
      }
    } catch {}
  }, []); // eslint-disable-line
  const closeModal = () => { setModalOpen(false); setDraft(''); };
  const saveNote = () => {
    setOverallNote(draft);
    closeModal();
  };

  const hasNote = overallNote.trim().length > 0;

  return (
    <>
      <motion.div
        custom={0.5}
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        onClick={openModal}
        className="bg-card border border-border/60 rounded-2xl p-4 mb-6 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-300/60 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/20 transition-colors">
            <NotebookPen size={17} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-indigo-600/80 uppercase tracking-wider mb-0.5">{t('overallNotes')}</p>
            {hasNote ? (
              <div className="text-sm text-foreground line-clamp-2 overflow-hidden">
                <RichTextPreview html={overallNote} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">{t('overallNotePlaceholder')}</p>
            )}
          </div>
          <div className="shrink-0 text-muted-foreground group-hover:text-indigo-500 transition-colors">
            <Pencil size={15} />
          </div>
        </div>
      </motion.div>

      <NoteEditorModal
        isOpen={modalOpen}
        onClose={closeModal}
        title={t('editOverallNote')}
        icon={StickyNote}
        value={draft}
        onChange={setDraft}
        onClear={() => setDraft('')}
        onSave={saveNote}
        placeholder={t('overallNotePlaceholder')}
        clearLabel={t('clearNote')}
        saveLabel={t('saveNote')}
      />
    </>
  );
}

export function Progress() {
  const { user, logout, updateProfile, updateProfilePhoto } = useAuth();
  const { subjects, settings, setCourseStartDate, setTimezone } = useStudy();
  const { courses, activeCourseId, activeCourse, createCourse, switchCourse, renameCourse, deleteCourse } = useCourse();
  const { t, lang, setLang } = useLang();

  const [modals, setModals] = useState({ profile: false, settings: false, logout: false, addCourse: false, switchCourse: false });
  const [tzSelectorOpen, setTzSelectorOpen] = useState(false);
  const [noteSearchOpen, setNoteSearchOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', currentPass: '', newPass: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Course management
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseError, setNewCourseError] = useState('');
  const [newCourseLoading, setNewCourseLoading] = useState(false);

  // Rename course
  const [renamingCourse, setRenamingCourse] = useState<{ id: string; name: string } | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);

  // Delete course
  const [deletingCourse, setDeletingCourse] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cannotDeleteError, setCannotDeleteError] = useState(false);

  // Course Start Date state
  const [pendingStartDate, setPendingStartDate] = useState('');
  const [showResetConfirm1, setShowResetConfirm1] = useState(false);
  const [showResetConfirm2, setShowResetConfirm2] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const totalChapters = subjects.flatMap(s => s.chapters).length;
  const completedChapters = subjects.flatMap(s => s.chapters).filter(c => c.completed).length;
  const overallProg = totalChapters === 0 ? 0 : Math.round((completedChapters / totalChapters) * 100);
  const completedSubjects = subjects.filter(s => s.completed).length;

  const handleUpdateProfile = async () => {
    if (!profileForm.name) return;
    if (!profileForm.currentPass) {
      setProfileError(t('currentPassRequired'));
      return;
    }
    setProfileSaving(true);
    setProfileError('');
    try {
      await updateProfile(profileForm.name, profileForm.currentPass, profileForm.newPass || undefined);
      setModals({ ...modals, profile: false });
      setProfileForm(prev => ({ ...prev, currentPass: '', newPass: '' }));
    } catch {
      setProfileError(t('profileUpdateFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoMsg('');
    try {
      await updateProfilePhoto(file);
      setPhotoMsg(t('photoUpdated'));
    } catch {
      setPhotoMsg(t('photoUpdateFailed'));
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openProfileModal = () => {
    setProfileForm({ name: user?.name || '', currentPass: '', newPass: '' });
    setProfileError('');
    setPhotoMsg('');
    setModals({ ...modals, profile: true });
  };

  // Course Start Date handlers
  const handleStartDateRequest = () => {
    if (!pendingStartDate) return;
    setShowResetConfirm1(true);
  };

  const handleConfirm1 = () => {
    setShowResetConfirm1(false);
    setShowResetConfirm2(true);
  };

  const handleConfirm2 = () => {
    setCourseStartDate(pendingStartDate);
    setShowResetConfirm2(false);
    setPendingStartDate('');
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 5000);
  };

  // Rename course handler
  const handleRenameCourse = async () => {
    if (!renamingCourse || !renamingCourse.name.trim()) return;
    setRenameLoading(true);
    try {
      await renameCourse(renamingCourse.id, renamingCourse.name.trim());
      setRenamingCourse(null);
    } catch { /* ignore */ } finally {
      setRenameLoading(false);
    }
  };

  // Delete course handler
  const handleDeleteCourse = async () => {
    if (!deletingCourse) return;
    if (courses.length <= 1) {
      setDeletingCourse(null);
      setCannotDeleteError(true);
      setTimeout(() => setCannotDeleteError(false), 4000);
      return;
    }
    setDeleteLoading(true);
    try {
      await deleteCourse(deletingCourse.id);
      setDeletingCourse(null);
    } catch { /* ignore */ } finally {
      setDeleteLoading(false);
    }
  };

  // Add new course
  const handleAddCourse = async () => {
    if (!newCourseName.trim()) {
      setNewCourseError(t('courseNameRequired'));
      return;
    }
    setNewCourseLoading(true);
    setNewCourseError('');
    try {
      await createCourse(newCourseName.trim());
      setNewCourseName('');
      setModals({ ...modals, addCourse: false });
    } catch {
      setNewCourseError(t('registerError'));
    } finally {
      setNewCourseLoading(false);
    }
  };

  return (
    <Layout>
      <div className="p-5">
        <header className="flex items-center justify-between mb-8">
          <motion.h1
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold text-foreground"
          >
            {t('progress')}
          </motion.h1>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setNoteSearchOpen(true)}
              title={t('noteSearch')}
              className="p-2.5 bg-secondary text-foreground rounded-full hover:bg-secondary/80 transition-colors shadow-sm"
            >
              <Search size={20} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setModals({ ...modals, settings: true })}
              className="p-2.5 bg-secondary text-foreground rounded-full hover:bg-secondary/80 transition-colors shadow-sm"
            >
              <Settings size={20} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setModals({ ...modals, logout: true })}
              className="p-2.5 bg-destructive/10 text-destructive rounded-full hover:bg-destructive hover:text-white transition-colors shadow-sm"
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </header>

        {/* User Card */}
        <motion.div
          custom={0}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          onClick={openProfileModal}
          className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-border/50 mb-5 flex items-center gap-4 cursor-pointer hover:shadow-xl transition-all group"
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl border-2 border-primary/20 overflow-hidden shadow-md group-hover:ring-2 group-hover:ring-primary/30 transition-all">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user?.name} className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-sm">
              <Camera size={11} className="text-primary-foreground" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground leading-tight truncate">{user?.name}</h2>
            <p className="text-sm text-muted-foreground font-medium truncate">{user?.email}</p>
            <p className="text-xs text-primary/70 font-medium mt-0.5">{t('editProfile')}</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 transition-colors">
            <UserIcon size={16} />
          </div>
        </motion.div>

        {/* Active Course Card */}
        <motion.div
          custom={-1}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-3xl p-4 border border-primary/20 mb-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <BookMarked size={18} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider">{t('currentCourse')}</p>
                <p className="font-bold text-foreground text-sm line-clamp-2 break-words">{activeCourse?.name ?? '—'}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0 items-end">
              <button
                onClick={() => { setNewCourseName(''); setNewCourseError(''); setModals({ ...modals, addCourse: true }); }}
                className="flex items-center gap-1 text-xs font-semibold text-foreground bg-secondary hover:bg-secondary/70 transition-colors px-2.5 py-1.5 rounded-xl"
              >
                <Plus size={12} />
                {t('addCourse')}
              </button>
              <div className="flex gap-1.5">
                <button
                  onClick={() => activeCourse && setRenamingCourse({ id: activeCourse.id, name: activeCourse.name })}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-secondary hover:bg-secondary/70 transition-colors px-2.5 py-1.5 rounded-xl"
                  title={t('renameCourse')}
                >
                  <Pencil size={12} />
                  {t('rename')}
                </button>
                {courses.length > 1 && (
                  <button
                    onClick={() => setModals({ ...modals, switchCourse: true })}
                    className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors px-2.5 py-1.5 rounded-xl"
                  >
                    <ArrowLeftRight size={12} />
                    {t('switchCourse')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Overall Notes Card */}
        <OverallNotesCard />

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center">
            <div className="text-primary bg-primary/10 w-9 h-9 rounded-full flex items-center justify-center mb-3">
              <ShieldCheck size={18} />
            </div>
            <motion.p
              key={completedSubjects}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl font-bold text-foreground"
            >
              {completedSubjects}
            </motion.p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">{t('completed')} {t('subjects')}</p>
          </motion.div>
          <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center">
            <div className="text-green-500 bg-green-500/10 w-9 h-9 rounded-full flex items-center justify-center mb-3">
              <BookOpen size={18} />
            </div>
            <p className="text-3xl font-bold text-foreground">{subjects.length}</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">{t('activeSubjects')}</p>
          </motion.div>
        </div>

        {/* Big Progress */}
        <motion.div
          custom={3}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-card rounded-3xl p-6 shadow-md border border-border/50 mb-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Target size={120} />
          </div>
          <h3 className="font-bold text-foreground mb-4 relative z-10">{t('overallProgress')}</h3>
          <div className="flex items-end gap-2 mb-3 relative z-10">
            <motion.span
              key={overallProg}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-5xl font-black text-primary leading-none"
            >
              {overallProg}%
            </motion.span>
          </div>
          <div className="h-4 w-full bg-secondary rounded-full overflow-hidden relative z-10 border border-border/50 shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallProg}%` }}
              transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
            />
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-3 relative z-10">
            {completedChapters} {t('completed')} / {totalChapters} {t('chapters')}
          </p>
        </motion.div>

        {/* Subject Breakdown */}
        <h3 className="font-bold text-lg mb-4 text-foreground px-1">{t('subjects')}</h3>
        <div className="space-y-3">
          {subjects.map((s, i) => {
            const chCount = s.chapters.length;
            const cCount = s.chapters.filter(c => c.completed).length;
            const p = chCount === 0 ? 0 : Math.round((cCount / chCount) * 100);
            return (
              <motion.div
                key={s.id}
                custom={i + 4}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                    <span className="font-bold text-foreground text-sm">{s.title}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-secondary px-2 py-1 rounded text-muted-foreground">
                    {safeFormat(s.deadline, 'MMM d')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p}%` }}
                      transition={{ duration: 0.6, delay: 0.1 * i }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground w-8 text-right">{p}%</span>
                </div>
              </motion.div>
            );
          })}
        </div>

      </div>

      {/* Profile Modal */}
      <Modal
        isOpen={modals.profile}
        onClose={() => { setModals({ ...modals, profile: false }); setProfileError(''); setPhotoMsg(''); }}
        title={t('editProfile')}
        align="bottom"
        icon={UserIcon}
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-primary/20 overflow-hidden shadow-md">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user?.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary font-bold text-2xl">
                    {user?.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
              {photoUploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button
              variant="outline"
              className="text-xs py-2 px-4 h-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoUploading}
            >
              <Camera size={13} className="mr-1.5" />
              {user?.photoURL ? t('changePhoto') : t('uploadPhoto')}
            </Button>
            {photoMsg && (
              <p className={`text-xs text-center ${photoMsg.includes(t('photoUpdated')) ? 'text-green-600' : 'text-destructive'}`}>
                {photoMsg}
              </p>
            )}
          </div>

          <div className="border-t border-border/40 pt-4 space-y-3">
            <Input placeholder={t('name')} value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} />
            <Input type="password" placeholder={t('currentPass')} value={profileForm.currentPass} onChange={e => setProfileForm({ ...profileForm, currentPass: e.target.value })} />
            <Input type="password" placeholder={t('newPasswordOp')} value={profileForm.newPass} onChange={e => setProfileForm({ ...profileForm, newPass: e.target.value })} />
          </div>
          {profileError && (
            <p className="text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2">{profileError}</p>
          )}
          <Button className="w-full mt-4 py-3.5" onClick={handleUpdateProfile} disabled={profileSaving}>
            {profileSaving ? '...' : t('saveChanges')}
          </Button>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={modals.settings} onClose={() => setModals({ ...modals, settings: false })} title={t('settings')} align="bottom" icon={Settings}>
        <div className="space-y-6">
          {/* Language */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-3">{t('language')}</p>
            <div className="flex bg-secondary p-1.5 rounded-xl relative border border-border/50">
              <motion.div
                layout
                className="absolute h-10 w-[calc(50%-6px)] bg-card rounded-lg shadow-sm"
                style={{ left: lang === 'en' ? '6px' : 'calc(50%)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
              <button
                className={`flex-1 h-10 z-10 font-bold text-sm transition-colors ${lang === 'en' ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setLang('en')}
              >
                English
              </button>
              <button
                className={`flex-1 h-10 z-10 font-bold text-sm transition-colors ${lang === 'bn' ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setLang('bn')}
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* Timezone */}
          <div className="border-t border-border/40 pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Globe size={15} className="text-primary" />
              <p className="text-sm font-semibold text-foreground">{t('timezoneLabel')}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('timezoneDesc')}</p>
            <button
              onClick={() => setTzSelectorOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 bg-secondary/70 border border-border/50 rounded-xl hover:bg-secondary transition-colors text-left"
            >
              {settings.timezone ? (
                <>
                  {(() => {
                    const entry = getTimezoneEntry(settings.timezone);
                    const flagUrl = entry?.code ? getFlagUrl(entry.code) : null;
                    return flagUrl
                      ? <img src={flagUrl} alt={entry?.country ?? ''} className="w-7 h-5 rounded-sm object-cover shrink-0" />
                      : <Globe size={20} className="text-muted-foreground shrink-0" />;
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {getTimezoneEntry(settings.timezone)?.country ?? settings.timezone}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground">{getCurrentOffset(settings.timezone)}</p>
                  </div>
                </>
              ) : (
                <>
                  {(() => {
                    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const entry = getTimezoneEntry(deviceTz);
                    const flagUrl = entry?.code ? getFlagUrl(entry.code) : null;
                    return flagUrl
                      ? <img src={flagUrl} alt={entry?.country ?? ''} className="w-7 h-5 rounded-sm object-cover shrink-0" />
                      : <Globe size={20} className="text-muted-foreground shrink-0" />;
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {(() => {
                        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        const entry = getTimezoneEntry(deviceTz);
                        return entry ? entry.country : deviceTz;
                      })()}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
                  </div>
                </>
              )}
              <ChevronRight size={15} className="text-muted-foreground shrink-0" />
            </button>
          </div>

          {/* Course Starting Date */}
          <div className="border-t border-border/40 pt-5">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={15} className="text-primary" />
              <p className="text-sm font-semibold text-foreground">{t('courseStartDate')}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('courseStartDateDesc')}</p>

            {settings.courseStartDate && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl">
                <CalendarDays size={13} className="text-primary shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium">{t('courseStartDateCurrent')}</p>
                  <p className="text-sm font-bold text-primary">
                    {safeFormat(settings.courseStartDate, 'MMM d, yyyy')}
                  </p>
                </div>
                {settings.resetScheduled && (
                  <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-200 px-2 py-0.5 rounded-full">
                    {lang === 'bn' ? 'নির্ধারিত' : 'Scheduled'}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="date"
                value={pendingStartDate}
                onChange={e => setPendingStartDate(e.target.value)}
                className="flex-1 text-sm rounded-xl border border-border/60 bg-secondary px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                onClick={handleStartDateRequest}
                disabled={!pendingStartDate}
                className="shrink-0 px-4 py-2.5 h-auto text-sm"
              >
                {settings.courseStartDate ? t('courseStartDateChange') : t('courseStartDateSet')}
              </Button>
            </div>

            {resetSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-200 rounded-xl"
              >
                <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                <p className="text-xs font-semibold text-green-700">{t('courseResetScheduled')}</p>
              </motion.div>
            )}
          </div>
        </div>
      </Modal>

      {/* Timezone Selector */}
      <TimezoneSelector
        isOpen={tzSelectorOpen}
        onClose={() => setTzSelectorOpen(false)}
        value={settings.timezone}
        onChange={tz => setTimezone(tz)}
        lang={lang}
      />

      {/* Add New Course Modal */}
      <Modal
        isOpen={modals.addCourse}
        onClose={() => { setModals({ ...modals, addCourse: false }); setNewCourseName(''); setNewCourseError(''); }}
        title={t('addCourse')}
        align="bottom"
        icon={BookMarked}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('courseWelcomeDescExtra')}</p>
          <Input
            placeholder={t('courseNamePlaceholder')}
            value={newCourseName}
            onChange={e => { setNewCourseName(e.target.value); setNewCourseError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCourse(); }}
            autoFocus
          />
          {newCourseError && (
            <p className="text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2">{newCourseError}</p>
          )}
          <Button
            className="w-full py-3.5"
            onClick={handleAddCourse}
            disabled={newCourseLoading || !newCourseName.trim()}
          >
            {newCourseLoading ? '...' : t('createCourseBtn')}
          </Button>
        </div>
      </Modal>

      {/* My Courses Modal */}
      <Modal
        isOpen={modals.switchCourse}
        onClose={() => setModals({ ...modals, switchCourse: false })}
        title={t('switchCourse')}
        align="bottom"
        icon={BookOpenCheck}
      >
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-3">{t('selectCourse')}</p>

          {/* Cannot delete error */}
          <AnimatePresence>
            {cannotDeleteError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl mb-2"
              >
                <Trash2 size={13} className="text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive font-medium">{t('cannotDeleteOnly')}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {courses.map((course, i) => {
              const isActive = course.id === activeCourseId;
              const canDelete = courses.length > 1;
              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex items-center gap-2 p-3 rounded-2xl border transition-all ${
                    isActive
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-secondary border-border/50'
                  }`}
                >
                  {/* Switch tap area */}
                  <button
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => {
                      switchCourse(course.id);
                      setModals({ ...modals, switchCourse: false });
                    }}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-primary/20' : 'bg-background'
                    }`}>
                      <BookMarked size={15} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm line-clamp-2 break-words ${isActive ? 'text-primary' : 'text-foreground'}`}>
                        {course.name}
                      </p>
                      {isActive && (
                        <p className="text-[10px] text-primary/60 font-medium">{t('currentCourse')}</p>
                      )}
                    </div>
                    {isActive && <CheckCircle2 size={15} className="text-primary shrink-0" />}
                  </button>

                  {/* Action icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingCourse({ id: course.id, name: course.name });
                      }}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                      title={t('renameCourse')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!canDelete) {
                          setCannotDeleteError(true);
                          setTimeout(() => setCannotDeleteError(false), 4000);
                        } else {
                          setDeletingCourse({ id: course.id, name: course.name });
                        }
                      }}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        canDelete
                          ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                          : 'text-muted-foreground/30 cursor-not-allowed'
                      }`}
                      title={canDelete ? t('deleteCourse') : t('cannotDeleteOnly')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </Modal>

      {/* Rename Course Modal */}
      <Modal
        isOpen={!!renamingCourse}
        onClose={() => setRenamingCourse(null)}
        title={t('renameCourse')}
        align="bottom"
        icon={Pencil}
      >
        <div className="space-y-4">
          <Input
            placeholder={t('courseNamePlaceholder')}
            value={renamingCourse?.name ?? ''}
            onChange={e => setRenamingCourse(prev => prev ? { ...prev, name: e.target.value } : null)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameCourse(); }}
            autoFocus
          />
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 py-3" onClick={() => setRenamingCourse(null)}>
              {t('cancel')}
            </Button>
            <Button
              className="flex-1 py-3"
              onClick={handleRenameCourse}
              disabled={renameLoading || !renamingCourse?.name.trim()}
            >
              {renameLoading ? '...' : t('rename')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Course Confirm */}
      <ConfirmModal
        isOpen={!!deletingCourse}
        onClose={() => setDeletingCourse(null)}
        onConfirm={handleDeleteCourse}
        title={`${t('deleteCourse')}: ${deletingCourse?.name ?? ''}`}
        message={t('deleteCourseConfirm')}
        confirmText={t('deleteCourse')}
        cancelText={t('cancel')}
        isDanger={true}
      />

      {/* Logout Confirm */}
      <ConfirmModal
        isOpen={modals.logout}
        onClose={() => setModals({ ...modals, logout: false })}
        onConfirm={logout}
        title={t('logout')}
        message={t('logoutConfirm')}
        confirmText={t('yes')}
        cancelText={t('no')}
        isDanger={true}
      />

      {/* Course Reset - First Confirmation */}
      <ConfirmModal
        isOpen={showResetConfirm1}
        onClose={() => setShowResetConfirm1(false)}
        onConfirm={handleConfirm1}
        title={t('courseResetConfirm1Title')}
        message={t('courseResetConfirm1Msg')}
        confirmText={t('courseResetProceeed')}
        cancelText={t('cancel')}
        isDanger={true}
      />

      {/* Course Reset - Second Confirmation */}
      <ConfirmModal
        isOpen={showResetConfirm2}
        onClose={() => setShowResetConfirm2(false)}
        onConfirm={handleConfirm2}
        title={t('courseResetConfirm2Title')}
        message={t('courseResetConfirm2Msg')}
        confirmText={t('courseResetAbsoluteSure')}
        cancelText={t('cancel')}
        isDanger={true}
      />

      {/* Note Search */}
      <NoteSearchModal isOpen={noteSearchOpen} onClose={() => setNoteSearchOpen(false)} />
    </Layout>
  );
}
