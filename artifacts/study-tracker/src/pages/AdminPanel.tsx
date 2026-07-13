import React, { useState } from 'react';
import { useLocation } from 'wouter';
import {
  ShieldCheck, Users, Send, List, Plus, Trash2, Edit3, Check, X,
  BookOpen, StickyNote, ChevronRight, ChevronLeft, Clock, ArrowLeft,
  UserCheck, UserMinus, RefreshCw, Eye, EyeOff, Save, MessageSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useAdmin, SharePermissions, ShareRequest } from '@/context/AdminContext';
import { useCourse } from '@/context/CourseContext';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Button, Input, Modal } from '@/components/ui';
import { RichTextPreview } from '@/components/RichTextEditor';
import type { Subject } from '@/lib/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(value: number, unit: string, lang: string) {
  if (lang === 'bn') {
    const m: Record<string, string> = { hours: 'ঘণ্টা', days: 'দিন', months: 'মাস' };
    return `${value} ${m[unit] || unit}`;
  }
  return `${value} ${unit}`;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusColor(status: string) {
  if (status === 'pending') return 'bg-amber-500/10 text-amber-700';
  if (status === 'accepted') return 'bg-green-500/10 text-green-700';
  return 'bg-red-500/10 text-red-600';
}

function typeIcon(type: ShareRequest['type'], size = 16) {
  if (type === 'course') return <BookOpen size={size} />;
  if (type === 'message') return <MessageSquare size={size} />;
  return <StickyNote size={size} />;
}

function typeColorClass(type: ShareRequest['type']) {
  if (type === 'course') return 'bg-indigo-500/10 text-indigo-600';
  if (type === 'message') return 'bg-sky-500/10 text-sky-600';
  return 'bg-amber-500/10 text-amber-600';
}

const DEFAULT_PERMISSIONS: SharePermissions = {
  editNotes: false,
  deleteNotes: false,
  downloadNotes: true,
  copyNotes: true,
};

// ─── Note Picker (drill-down through subjects hierarchy) ──────────────────────

type NoteLevel = 'subjects' | 'chapters' | 'topics' | 'subtopics' | 'concepts' | 'points';

interface NotePick {
  title: string;
  html: string;
  breadcrumb: string[];
}

function NotePicker({
  subjects,
  onPick,
  lang,
}: {
  subjects: Subject[];
  onPick: (pick: NotePick) => void;
  lang: string;
}) {
  const [level, setLevel] = useState<NoteLevel>('subjects');
  const [sel, setSel] = useState<{
    subject?: any; chapter?: any; topic?: any; subtopic?: any; concept?: any;
  }>({});
  const [dir, setDir] = useState<1 | -1>(1);

  const liveSubject = sel.subject ? subjects.find(s => s.id === sel.subject.id) : null;
  const liveChapter = liveSubject && sel.chapter ? liveSubject.chapters?.find(c => c.id === sel.chapter.id) : null;
  const liveTopic = liveChapter && sel.topic ? liveChapter.topics?.find(t => t.id === sel.topic.id) : null;
  const liveSubtopic = liveTopic && sel.subtopic ? liveTopic.subtopics?.find(s => s.id === sel.subtopic.id) : null;
  const liveConcept = liveSubtopic && sel.concept ? liveSubtopic.concepts?.find(c => c.id === sel.concept.id) : null;

  const currentItems: any[] = {
    subjects,
    chapters: liveSubject?.chapters ?? [],
    topics: liveChapter?.topics ?? [],
    subtopics: liveTopic?.subtopics ?? [],
    concepts: liveSubtopic?.concepts ?? [],
    points: liveConcept?.points ?? [],
  }[level] ?? [];

  const hasChildren = (item: any) => {
    if (level === 'subjects') return (item.chapters?.length ?? 0) > 0;
    if (level === 'chapters') return (item.topics?.length ?? 0) > 0;
    if (level === 'topics') return (item.subtopics?.length ?? 0) > 0;
    if (level === 'subtopics') return (item.concepts?.length ?? 0) > 0;
    if (level === 'concepts') return (item.points?.length ?? 0) > 0;
    return false;
  };

  const buildBreadcrumb = (): string[] =>
    [sel.subject?.title, sel.chapter?.title, sel.topic?.title, sel.subtopic?.title, sel.concept?.title].filter(Boolean);

  const drillDown = (item: any) => {
    setDir(1);
    const next: Record<NoteLevel, NoteLevel> = {
      subjects: 'chapters', chapters: 'topics', topics: 'subtopics',
      subtopics: 'concepts', concepts: 'points', points: 'points',
    };
    if (level === 'subjects') setSel({ subject: item });
    else if (level === 'chapters') setSel(s => ({ ...s, chapter: item }));
    else if (level === 'topics') setSel(s => ({ ...s, topic: item }));
    else if (level === 'subtopics') setSel(s => ({ ...s, subtopic: item }));
    else if (level === 'concepts') setSel(s => ({ ...s, concept: item }));
    setLevel(next[level]);
  };

  const goBack = () => {
    setDir(-1);
    const prev: Partial<Record<NoteLevel, NoteLevel>> = {
      chapters: 'subjects', topics: 'chapters', subtopics: 'topics',
      concepts: 'subtopics', points: 'concepts',
    };
    if (prev[level]) {
      setLevel(prev[level]!);
      if (level === 'chapters') setSel({});
      else if (level === 'topics') setSel(s => ({ subject: s.subject }));
      else if (level === 'subtopics') setSel(s => ({ subject: s.subject, chapter: s.chapter }));
      else if (level === 'concepts') setSel(s => ({ subject: s.subject, chapter: s.chapter, topic: s.topic }));
      else if (level === 'points') setSel(s => ({ subject: s.subject, chapter: s.chapter, topic: s.topic, subtopic: s.subtopic }));
    }
  };

  const pickNote = (item: any) => {
    const html = item.note || '';
    const breadcrumb = [...buildBreadcrumb(), item.title];
    onPick({ title: item.title, html, breadcrumb });
  };

  const accentColor = sel.subject?.color ?? '#6366f1';
  const levelLabel: Record<NoteLevel, string> = lang === 'bn'
    ? { subjects: 'সাবজেক্ট', chapters: 'চ্যাপ্টার', topics: 'টপিক', subtopics: 'সাবটপিক', concepts: 'কনসেপ্ট', points: 'পয়েন্ট' }
    : { subjects: 'Subjects', chapters: 'Chapters', topics: 'Topics', subtopics: 'Subtopics', concepts: 'Concepts', points: 'Points' };

  return (
    <div className="space-y-3">
      {/* Breadcrumb */}
      {buildBreadcrumb().length > 0 && (
        <div className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground">
          <button onClick={() => { setLevel('subjects'); setSel({}); }} className="hover:text-foreground transition-colors">
            {lang === 'bn' ? 'সব' : 'All'}
          </button>
          {buildBreadcrumb().map((c, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={10} />
              <span className={i === buildBreadcrumb().length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {level !== 'subjects' && (
        <button onClick={goBack} className="flex items-center gap-1 text-xs text-primary hover:underline">
          <ChevronLeft size={12} />
          {lang === 'bn' ? 'ফিরে যান' : 'Back'}
        </button>
      )}

      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{levelLabel[level]}</p>

      <div className="relative max-h-48 overflow-hidden">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={level}
            custom={dir}
            initial={{ x: dir === 1 ? 20 : -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: dir === 1 ? -20 : 20, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-1 max-h-48 overflow-y-auto"
          >
            {currentItems.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {lang === 'bn' ? 'কিছু নেই।' : 'Nothing here.'}
              </p>
            ) : currentItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 rounded-xl hover:bg-secondary/60 transition-colors group">
                <button
                  onClick={() => hasChildren(item) ? drillDown(item) : undefined}
                  className="flex-1 flex items-center gap-2.5 p-2.5 text-left min-w-0"
                  disabled={!hasChildren(item) && !item.note}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: level === 'subjects' ? item.color : accentColor }} />
                  <span className="text-sm font-medium truncate flex-1">{item.title}</span>
                  {hasChildren(item) && <ChevronRight size={13} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />}
                </button>
                {item.note?.trim() && (
                  <button
                    onClick={() => pickNote(item)}
                    className="p-2 mr-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold shrink-0 hover:bg-primary/20 transition-colors"
                  >
                    {lang === 'bn' ? 'সিলেক্ট' : 'Select'}
                  </button>
                )}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Permissions Checkboxes ────────────────────────────────────────────────────

function PermissionsEditor({
  permissions, onChange, lang,
}: { permissions: SharePermissions; onChange: (p: SharePermissions) => void; lang: string }) {
  const items = [
    { key: 'editNotes', label: lang === 'bn' ? 'নোট সম্পাদনা করতে পারবে' : 'Can edit notes', color: 'text-blue-600' },
    { key: 'deleteNotes', label: lang === 'bn' ? 'নোট ডিলিট করতে পারবে' : 'Can delete notes', color: 'text-red-600' },
    { key: 'downloadNotes', label: lang === 'bn' ? 'নোট ডাউনলোড করতে পারবে' : 'Can download notes', color: 'text-green-600' },
    { key: 'copyNotes', label: lang === 'bn' ? 'নোট কপি করতে পারবে' : 'Can copy notes', color: 'text-purple-600' },
  ] as const;

  return (
    <div className="space-y-2">
      {items.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onChange({ ...permissions, [key]: !permissions[key] })}
          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary/60 transition-colors text-left"
        >
          <div className={cn(
            "w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-all",
            permissions[key] ? "bg-primary border-primary" : "border-border bg-transparent"
          )}>
            {permissions[key] && <Check size={11} className="text-white" />}
          </div>
          <span className={cn("text-sm font-medium", color)}>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Sent Shares List ─────────────────────────────────────────────────────────

function SentShareRow({
  share, lang,
  onEditPermissions,
  onCancel,
}: {
  share: ShareRequest;
  lang: string;
  onEditPermissions: (share: ShareRequest) => void;
  onCancel: (shareId: string) => void;
}) {
  // For note/message shares, "declined" means the recipient deleted the
  // notification themselves rather than the admin cancelling a pending share.
  const declinedLabel = share.type === 'course'
    ? (lang === 'bn' ? 'প্রত্যাখ্যান করেছে' : 'Rejected')
    : (lang === 'bn' ? 'ইউজার ডিলিট করেছে' : 'Deleted by user');

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", typeColorClass(share.type))}>
          {typeIcon(share.type, 16)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">
            {share.type === 'course' ? (share.courseName || '—')
              : share.type === 'message' ? (share.messageText || '—')
              : (share.noteTitle || '—')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">→ {share.toEmail}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", statusColor(share.status))}>
              {share.status === 'pending'
                ? (lang === 'bn' ? 'অপেক্ষমাণ' : 'Pending')
                : share.status === 'accepted'
                  ? (lang === 'bn' ? 'গৃহীত' : 'Accepted')
                  : declinedLabel}
            </span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1",
              share.seenAt ? "bg-blue-500/10 text-blue-600" : "bg-secondary text-muted-foreground"
            )}>
              {share.seenAt ? <Eye size={10} /> : <EyeOff size={10} />}
              {share.seenAt
                ? (lang === 'bn' ? `দেখেছে · ${formatDate(share.seenAt)}` : `Seen · ${formatDate(share.seenAt)}`)
                : (lang === 'bn' ? 'দেখেনি' : 'Not seen')}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} />
              {formatDuration(share.durationValue, share.durationUnit, lang)}
            </span>
            <span className="text-[10px] text-muted-foreground">{formatDate(share.sentAt)}</span>
          </div>
        </div>
      </div>

      {share.status !== 'declined' && share.type !== 'message' && (
        <div className="flex gap-2">
          <button
            onClick={() => onEditPermissions(share)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/70 transition-colors text-xs font-semibold"
          >
            <Edit3 size={12} />
            {lang === 'bn' ? 'অনুমতি সম্পাদনা' : 'Edit Permissions'}
          </button>
          {share.status === 'pending' && (
            <button
              onClick={() => onCancel(share.id)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold"
            >
              <X size={12} />
              {lang === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
          )}
        </div>
      )}

      {share.status === 'pending' && share.type === 'message' && (
        <div className="flex gap-2">
          <button
            onClick={() => onCancel(share.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold"
          >
            <X size={12} />
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Panel ──────────────────────────────────────────────────────────

export function AdminPanel() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { lang } = useLang();
  const { isAdmin, isSuperAdmin, adminEmails, loadingAdmins, addAdmin, removeAdmin,
    sendShare, sentShares, loadingSentShares, updateSharePermissions, cancelShare } = useAdmin();
  const { courses, activeCourse } = useCourse();
  const { subjects } = useStudy();

  const [tab, setTab] = useState<'admins' | 'share' | 'sent'>('admins');

  // ── Admins tab state ──
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  // ── Share tab state ──
  const [shareStep, setShareStep] = useState(1); // 1=recipient, 2=content, 3=duration+perms
  const [shareForm, setShareForm] = useState({
    toEmail: '',
    type: 'course' as 'course' | 'note' | 'message',
    courseId: '',
    courseName: '',
    noteTitle: '',
    noteHtml: '',
    noteBreadcrumb: [] as string[],
    messageText: '',
    durationValue: 7,
    durationUnit: 'days' as 'hours' | 'days' | 'months',
    permissions: { ...DEFAULT_PERMISSIONS },
  });
  const [notePicking, setNotePicking] = useState(false);
  const [notePicked, setNotePicked] = useState<{ title: string; html: string; breadcrumb: string[] } | null>(null);
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // ── Sent tab state ──
  const [editPermModal, setEditPermModal] = useState<ShareRequest | null>(null);
  const [editPermissions, setEditPermissions] = useState<SharePermissions>({ ...DEFAULT_PERMISSIONS });
  const [savingPerms, setSavingPerms] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 p-8 bg-background">
        <ShieldCheck size={48} className="text-muted-foreground/30" />
        <p className="text-muted-foreground text-center">
          {lang === 'bn' ? 'আপনার এই পেজে প্রবেশের অনুমতি নেই।' : 'You do not have permission to access this page.'}
        </p>
        <button onClick={() => setLocation('/progress')} className="text-primary text-sm font-semibold hover:underline">
          {lang === 'bn' ? 'ফিরে যান' : 'Go back'}
        </button>
      </div>
    );
  }

  // ── Handlers ──

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    setAdminError('');
    setAddingAdmin(true);
    try {
      await addAdmin(newAdminEmail.trim());
      setNewAdminEmail('');
    } catch {
      setAdminError(lang === 'bn' ? 'যোগ করতে সমস্যা হয়েছে।' : 'Failed to add admin.');
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    setRemovingEmail(email);
    try { await removeAdmin(email); } finally { setRemovingEmail(null); }
  };

  const handleSendShare = async () => {
    setSending(true);
    setSendError(null);
    try {
      await sendShare({
        toEmail: shareForm.toEmail,
        type: shareForm.type,
        courseId: shareForm.type === 'course' ? shareForm.courseId : undefined,
        courseName: shareForm.type === 'course' ? shareForm.courseName : undefined,
        noteTitle: shareForm.type === 'note' ? (notePicked?.title || shareForm.noteTitle) : undefined,
        noteHtml: shareForm.type === 'note' ? (notePicked?.html || shareForm.noteHtml) : undefined,
        noteBreadcrumb: shareForm.type === 'note' ? (notePicked?.breadcrumb || []) : undefined,
        messageText: shareForm.type === 'message' ? shareForm.messageText.trim() : undefined,
        permissions: shareForm.type === 'message' ? { editNotes: false, deleteNotes: false, downloadNotes: false, copyNotes: false } : shareForm.permissions,
        durationValue: shareForm.durationValue,
        durationUnit: shareForm.durationUnit,
      });
      setSendSuccess(true);
      setShareStep(1);
      setShareForm({
        toEmail: '', type: 'course', courseId: '', courseName: '', noteTitle: '', noteHtml: '',
        noteBreadcrumb: [], messageText: '', durationValue: 7, durationUnit: 'days', permissions: { ...DEFAULT_PERMISSIONS },
      });
      setNotePicked(null);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : (lang === 'bn' ? 'শেয়ার পাঠাতে সমস্যা হয়েছে।' : 'Failed to send share.')
      );
    } finally {
      setSending(false);
    }
  };

  const handleSavePermissions = async () => {
    if (!editPermModal) return;
    setSavingPerms(true);
    try {
      await updateSharePermissions(editPermModal.id, editPermissions);
      setEditPermModal(null);
    } finally {
      setSavingPerms(false);
    }
  };

  const handleCancelShare = async (shareId: string) => {
    setCancellingId(shareId);
    try { await cancelShare(shareId); } finally { setCancellingId(null); }
  };

  const tabs = [
    { id: 'admins', label: lang === 'bn' ? 'এডমিন' : 'Admins', Icon: Users },
    { id: 'share', label: lang === 'bn' ? 'শেয়ার' : 'Share', Icon: Send },
    { id: 'sent', label: lang === 'bn' ? 'পাঠানো' : 'Sent', Icon: List },
  ] as const;

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div
        className="sticky top-0 z-20 relative overflow-hidden rounded-b-2xl shadow-md"
        style={{ background: 'linear-gradient(135deg, hsl(243 88% 55%) 0%, hsl(263 80% 52%) 60%, hsl(283 75% 52%) 100%)' }}
      >
        <div className="absolute top-[-20px] right-[-20px] w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative px-5 pt-5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation('/progress')}
              className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/30 hover:bg-white/30 transition-colors active:scale-95"
            >
              <ArrowLeft size={18} className="text-white" />
            </button>
            <div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-white/80" />
                <h1 className="font-bold text-white text-lg leading-tight">
                  {lang === 'bn' ? 'এডমিন প্যানেল' : 'Admin Panel'}
                </h1>
              </div>
              <p className="text-[10px] text-white/60 font-medium">{user?.email}</p>
            </div>
          </div>
          {isSuperAdmin && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-yellow-400/20 text-yellow-200 border border-yellow-300/30">
              {lang === 'bn' ? 'সুপার এডমিন' : 'Super Admin'}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex px-5 pb-0 gap-1">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all",
                tab === id
                  ? "bg-background text-primary shadow-sm"
                  : "text-white/60 hover:text-white/90 hover:bg-white/10"
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-5 max-w-2xl mx-auto">

        {/* ── Admins Tab ── */}
        {tab === 'admins' && (
          <div className="space-y-4 mt-2">
            {/* Add admin */}
            {isSuperAdmin && (
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
                <p className="text-sm font-bold text-foreground">
                  {lang === 'bn' ? 'নতুন এডমিন যোগ করুন' : 'Add New Admin'}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={lang === 'bn' ? 'ইমেইল আইডি' : 'Email address'}
                    value={newAdminEmail}
                    onChange={e => { setNewAdminEmail(e.target.value); setAdminError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddAdmin(); }}
                    className="flex-1 h-10 text-sm"
                  />
                  <Button
                    onClick={handleAddAdmin}
                    disabled={addingAdmin || !newAdminEmail.trim()}
                    className="h-10 px-4 py-0 text-sm"
                  >
                    {addingAdmin ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  </Button>
                </div>
                {adminError && <p className="text-xs text-destructive">{adminError}</p>}
              </div>
            )}

            {/* Admin list */}
            <div className="space-y-2">
              {loadingAdmins ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : adminEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {lang === 'bn' ? 'কোনো এডমিন নেই।' : 'No admins yet.'}
                </p>
              ) : adminEmails.map(email => {
                const isSA = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map((e: string) => e.trim().toLowerCase()).includes(email);
                return (
                  <div key={email} className="bg-card border border-border/50 rounded-2xl p-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <UserCheck size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{email}</p>
                      {isSA && (
                        <span className="text-[10px] font-bold text-yellow-600 bg-yellow-500/10 px-1.5 py-0.5 rounded-full">
                          {lang === 'bn' ? 'সুপার এডমিন' : 'Super Admin'}
                        </span>
                      )}
                    </div>
                    {!isSA && isSuperAdmin && (
                      <button
                        onClick={() => handleRemoveAdmin(email)}
                        disabled={removingEmail === email}
                        className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                      >
                        {removingEmail === email
                          ? <RefreshCw size={14} className="animate-spin" />
                          : <UserMinus size={14} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Share Tab ── */}
        {tab === 'share' && (
          <div className="space-y-4 mt-2">
            {sendSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 px-4 py-3 bg-green-500/10 border border-green-300/50 rounded-2xl"
              >
                <Check size={14} className="text-green-600 shrink-0" />
                <p className="text-sm text-green-700 font-medium">
                  {lang === 'bn' ? 'সফলভাবে পাঠানো হয়েছে!' : 'Sent successfully!'}
                </p>
              </motion.div>
            )}

            {/* Step indicator */}
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <React.Fragment key={s}>
                  <div className={cn(
                    "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all",
                    shareStep >= s ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
                  )}>{s}</div>
                  {s < 3 && <div className={cn("flex-1 h-1 rounded-full transition-all", shareStep > s ? "bg-primary" : "bg-secondary")} />}
                </React.Fragment>
              ))}
            </div>

            {/* Step 1: Recipient + Type */}
            {shareStep === 1 && (
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-4">
                <p className="text-sm font-bold text-foreground">
                  {lang === 'bn' ? '১. প্রাপক ও কন্টেন্ট টাইপ' : '1. Recipient & Content Type'}
                </p>
                <Input
                  type="email"
                  placeholder={lang === 'bn' ? 'প্রাপকের ইমেইল আইডি' : 'Recipient email'}
                  value={shareForm.toEmail}
                  onChange={e => setShareForm(f => ({ ...f, toEmail: e.target.value }))}
                />
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {lang === 'bn' ? 'কী শেয়ার করবেন?' : 'What to share?'}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['course', 'note', 'message'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setShareForm(f => ({ ...f, type }))}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all",
                          shareForm.type === type
                            ? "border-primary bg-primary/5"
                            : "border-border/50 bg-card hover:bg-secondary/50"
                        )}
                      >
                        {type === 'course' ? <BookOpen size={22} className="text-indigo-500" />
                          : type === 'note' ? <StickyNote size={22} className="text-amber-500" />
                          : <MessageSquare size={22} className="text-sky-500" />}
                        <span className="text-xs font-semibold text-foreground">
                          {type === 'course'
                            ? (lang === 'bn' ? 'কোর্স' : 'Course')
                            : type === 'note'
                              ? (lang === 'bn' ? 'নোট' : 'Note')
                              : (lang === 'bn' ? 'মেসেজ' : 'Message')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={!shareForm.toEmail.trim()}
                  onClick={() => setShareStep(2)}
                >
                  {lang === 'bn' ? 'পরবর্তী' : 'Next'} →
                </Button>
              </div>
            )}

            {/* Step 2: Content Selection */}
            {shareStep === 2 && (
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setShareStep(1)} className="p-1 rounded-full hover:bg-secondary text-muted-foreground">
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-sm font-bold text-foreground">
                    {shareForm.type === 'course'
                      ? (lang === 'bn' ? '২. কোর্স সিলেক্ট করুন' : '2. Select Course')
                      : shareForm.type === 'message'
                        ? (lang === 'bn' ? '২. মেসেজ লিখুন' : '2. Write Message')
                        : (lang === 'bn' ? '২. নোট সিলেক্ট করুন' : '2. Select Note')}
                  </p>
                </div>

                {shareForm.type === 'course' ? (
                  <div className="space-y-2">
                    {courses.map(course => (
                      <button
                        key={course.id}
                        onClick={() => setShareForm(f => ({ ...f, courseId: course.id, courseName: course.name }))}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all",
                          shareForm.courseId === course.id
                            ? "border-primary bg-primary/5"
                            : "border-border/50 hover:bg-secondary/50"
                        )}
                      >
                        <BookOpen size={16} className="text-primary shrink-0" />
                        <span className="text-sm font-semibold text-foreground flex-1 truncate">{course.name}</span>
                        {shareForm.courseId === course.id && <Check size={14} className="text-primary shrink-0" />}
                      </button>
                    ))}
                  </div>
                ) : shareForm.type === 'message' ? (
                  <textarea
                    value={shareForm.messageText}
                    onChange={e => setShareForm(f => ({ ...f, messageText: e.target.value }))}
                    placeholder={lang === 'bn' ? 'ইউজারকে যে মেসেজ পাঠাতে চান তা লিখুন...' : 'Write the message you want to send this user...'}
                    rows={6}
                    className="w-full rounded-xl border border-border/60 bg-secondary px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                ) : (
                  <>
                    {notePicked ? (
                      <div className="p-3 bg-amber-500/5 border border-amber-300/50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                              {notePicked.breadcrumb.map((c, i) => (
                                <React.Fragment key={i}>
                                  {i > 0 && <ChevronRight size={9} />}
                                  <span>{c}</span>
                                </React.Fragment>
                              ))}
                            </p>
                          </div>
                          <button onClick={() => setNotePicked(null)} className="p-1 rounded hover:bg-secondary text-muted-foreground shrink-0">
                            <X size={12} />
                          </button>
                        </div>
                        {notePicked.html && (
                          <div className="max-h-24 overflow-hidden rounded-lg bg-background/60 p-2">
                            <RichTextPreview html={notePicked.html} className="text-xs leading-relaxed" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <NotePicker subjects={subjects} onPick={setNotePicked} lang={lang} />
                    )}
                  </>
                )}

                <Button
                  className="w-full"
                  disabled={
                    shareForm.type === 'course' ? !shareForm.courseId
                      : shareForm.type === 'message' ? !shareForm.messageText.trim()
                      : !notePicked
                  }
                  onClick={() => setShareStep(3)}
                >
                  {lang === 'bn' ? 'পরবর্তী' : 'Next'} →
                </Button>
              </div>
            )}

            {/* Step 3: Duration + Permissions + Send */}
            {shareStep === 3 && (
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setShareStep(2)} className="p-1 rounded-full hover:bg-secondary text-muted-foreground">
                    <ChevronLeft size={16} />
                  </button>
                  <p className="text-sm font-bold text-foreground">
                    {lang === 'bn' ? '৩. সময়সীমা ও অনুমতি' : '3. Duration & Permissions'}
                  </p>
                </div>

                {/* Duration */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {lang === 'bn' ? 'কতদিনের জন্য?' : 'How long?'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      value={shareForm.durationValue}
                      onChange={e => setShareForm(f => ({ ...f, durationValue: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="w-24 h-10 rounded-xl border border-border/60 bg-secondary px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="flex bg-secondary p-1 rounded-xl border border-border/50 flex-1">
                      {(['hours', 'days', 'months'] as const).map(unit => (
                        <button
                          key={unit}
                          onClick={() => setShareForm(f => ({ ...f, durationUnit: unit }))}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            shareForm.durationUnit === unit ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {lang === 'bn'
                            ? { hours: 'ঘণ্টা', days: 'দিন', months: 'মাস' }[unit]
                            : { hours: 'Hours', days: 'Days', months: 'Months' }[unit]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Permissions — not applicable to plain messages */}
                {shareForm.type !== 'message' && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      {lang === 'bn' ? 'অনুমতি সেট করুন' : 'Set Permissions'}
                    </p>
                    <PermissionsEditor
                      permissions={shareForm.permissions}
                      onChange={p => setShareForm(f => ({ ...f, permissions: p }))}
                      lang={lang}
                    />
                  </div>
                )}

                {/* Summary */}
                <div className="bg-secondary/50 rounded-xl p-3 text-xs space-y-1">
                  <p><span className="text-muted-foreground">{lang === 'bn' ? 'প্রাপক:' : 'To:'}</span> <span className="font-semibold">{shareForm.toEmail}</span></p>
                  <p><span className="text-muted-foreground">{lang === 'bn' ? 'কন্টেন্ট:' : 'Content:'}</span>{' '}
                    <span className="font-semibold">
                      {shareForm.type === 'course' ? shareForm.courseName
                        : shareForm.type === 'message' ? shareForm.messageText
                        : (notePicked?.title || '—')}
                    </span>
                  </p>
                  <p><span className="text-muted-foreground">{lang === 'bn' ? 'সময়:' : 'Duration:'}</span>{' '}
                    <span className="font-semibold">{formatDuration(shareForm.durationValue, shareForm.durationUnit, lang)}</span>
                  </p>
                </div>

                {sendError && (
                  <p className="text-destructive text-xs text-center bg-destructive/10 rounded-lg py-2 px-3">
                    {sendError}
                  </p>
                )}

                <Button className="w-full" onClick={handleSendShare} disabled={sending}>
                  {sending ? (
                    <RefreshCw size={14} className="animate-spin mr-2" />
                  ) : (
                    <Send size={14} className="mr-2" />
                  )}
                  {lang === 'bn' ? 'পাঠান' : 'Send'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Sent Tab ── */}
        {tab === 'sent' && (
          <div className="space-y-3 mt-2">
            {loadingSentShares ? (
              <div className="py-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sentShares.length === 0 ? (
              <div className="py-12 text-center">
                <List size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {lang === 'bn' ? 'এখনো কিছু পাঠানো হয়নি।' : 'Nothing sent yet.'}
                </p>
              </div>
            ) : sentShares.map(share => (
              <SentShareRow
                key={share.id}
                share={share}
                lang={lang}
                onEditPermissions={s => { setEditPermissions({ ...s.permissions }); setEditPermModal(s); }}
                onCancel={id => handleCancelShare(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Permissions Modal */}
      <Modal
        isOpen={!!editPermModal}
        onClose={() => setEditPermModal(null)}
        title={lang === 'bn' ? 'অনুমতি সম্পাদনা' : 'Edit Permissions'}
        align="bottom"
        icon={Edit3}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            → {editPermModal?.toEmail}
          </p>
          <PermissionsEditor permissions={editPermissions} onChange={setEditPermissions} lang={lang} />
          <Button className="w-full" onClick={handleSavePermissions} disabled={savingPerms}>
            {savingPerms ? '...' : (
              <>
                <Save size={14} className="mr-2" />
                {lang === 'bn' ? 'সংরক্ষণ করুন' : 'Save'}
              </>
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
