import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  ShieldCheck, Users, Send, List, Plus, Trash2, Edit3, Check, X,
  BookOpen, StickyNote, ChevronRight, ChevronLeft, Clock, ArrowLeft,
  UserCheck, UserMinus, RefreshCw, Eye, EyeOff, Save, MessageSquare,
  TimerReset, ListPlus, Undo2, AlertTriangle, Archive, Search,
  Phone, Globe, Link2, MessageCircle,
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
import { Countdown } from '@/components/Countdown';
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

/** Human-readable title for any share card, handling multi-note shares. */
function shareTitle(share: ShareRequest, lang: string): string {
  if (share.type === 'course') return share.courseName || '—';
  if (share.type === 'message') return share.messageText || '—';
  if (share.notes && share.notes.length > 1) {
    return lang === 'bn' ? `${share.notes.length}টি নোট` : `${share.notes.length} notes`;
  }
  return share.notes?.[0]?.title || share.noteTitle || '—';
}

const DEFAULT_PERMISSIONS: SharePermissions = {
  editNotes: false,
  deleteNotes: false,
  downloadNotes: false,
  copyNotes: false,
  renameCourse: false,
  addItems: false,
  takeScreenshot: false,
  selectCopyText: false,
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
  onToggle,
  pickedIds,
  lang,
}: {
  subjects: Subject[];
  /** Toggles the given item in/out of the multi-select list. */
  onToggle: (pick: NotePick & { id: string }) => void;
  /** ids of notes already selected — used to render the checked state. */
  pickedIds: Set<string>;
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
    onToggle({ id: item.id, title: item.title, html, breadcrumb });
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
                    className={cn(
                      "flex items-center gap-1 p-2 mr-1 rounded-lg text-xs font-semibold shrink-0 transition-colors",
                      pickedIds.has(item.id)
                        ? "bg-green-500/15 text-green-700 hover:bg-green-500/25"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                  >
                    {pickedIds.has(item.id) && <Check size={11} />}
                    {pickedIds.has(item.id)
                      ? (lang === 'bn' ? 'যোগ হয়েছে' : 'Added')
                      : (lang === 'bn' ? 'সিলেক্ট' : 'Select')}
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

// ─── Note Pages Picker (standalone "Notes" section — notePagesIndex) ─────────
// Unlike NotePicker (which drills through the subjects hierarchy), standalone
// note pages only have metadata (id/title) in memory — the HTML content lives
// in a separate Firestore doc per page. Selecting a page fetches that content
// on demand via loadNotePage() and produces the same NotePick shape used by
// the subject-tree picker, so the rest of the send/accept pipeline (NoteShareItem,
// shareRequest.notes[]) needs no changes at all.
function NotePagesPicker({
  notePagesIndex,
  loadNotePage,
  onToggle,
  pickedIds,
  lang,
}: {
  notePagesIndex: { id: string; title: string }[];
  loadNotePage: (id: string) => Promise<{ html?: string } | null>;
  onToggle: (pick: NotePick & { id: string }) => void;
  pickedIds: Set<string>;
  lang: string;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handlePick = async (page: { id: string; title: string }) => {
    if (pickedIds.has(page.id)) {
      // Already selected — toggling off doesn't need the content.
      onToggle({ id: page.id, title: page.title, html: '', breadcrumb: [lang === 'bn' ? 'নোট' : 'Notes', page.title] });
      return;
    }
    setLoadingId(page.id);
    try {
      const full = await loadNotePage(page.id);
      onToggle({
        id: page.id,
        title: page.title,
        html: full?.html || '',
        breadcrumb: [lang === 'bn' ? 'নোট' : 'Notes', page.title],
      });
    } finally {
      setLoadingId(null);
    }
  };

  if (notePagesIndex.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        {lang === 'bn' ? 'কোনো নোট নেই।' : 'No notes yet.'}
      </p>
    );
  }

  return (
    <div className="space-y-1 max-h-52 overflow-y-auto">
      {notePagesIndex.map(page => (
        <div key={page.id} className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-secondary/60 transition-colors">
          <StickyNote size={14} className="text-primary shrink-0" />
          <span className="text-sm font-medium truncate flex-1">{page.title}</span>
          <button
            onClick={() => handlePick(page)}
            disabled={loadingId === page.id}
            className={cn(
              "flex items-center gap-1 p-2 rounded-lg text-xs font-semibold shrink-0 transition-colors disabled:opacity-60",
              pickedIds.has(page.id)
                ? "bg-green-500/15 text-green-700 hover:bg-green-500/25"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {pickedIds.has(page.id) && <Check size={11} />}
            {loadingId === page.id
              ? (lang === 'bn' ? 'লোড হচ্ছে...' : 'Loading...')
              : pickedIds.has(page.id)
                ? (lang === 'bn' ? 'যোগ হয়েছে' : 'Added')
                : (lang === 'bn' ? 'সিলেক্ট' : 'Select')}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Permissions Checkboxes ────────────────────────────────────────────────────

function PermissionsEditor({
  permissions, onChange, lang,
}: { permissions: SharePermissions; onChange: (p: SharePermissions) => void; lang: string }) {
  const items: { key: keyof SharePermissions; label: string; color: string; divider?: boolean }[] = [
    { key: 'downloadNotes', label: lang === 'bn' ? 'নোট ডাউনলোড করতে পারবে'  : 'Can download notes',       color: 'text-green-600' },
    { key: 'copyNotes',     label: lang === 'bn' ? 'নোট কপি করতে পারবে'       : 'Can copy notes',           color: 'text-purple-600', divider: true },
    { key: 'renameCourse',  label: lang === 'bn' ? 'কোর্সের নাম পরিবর্তন করতে পারবে' : 'Can rename course', color: 'text-orange-600', divider: true },
    { key: 'takeScreenshot', label: lang === 'bn' ? 'স্ক্রিনশট / স্ক্রিন রেকর্ড নিতে পারবে' : 'Can take screenshots',      color: 'text-rose-600' },
    { key: 'selectCopyText', label: lang === 'bn' ? 'টেক্সট সিলেক্ট করে কপি করতে পারবে'    : 'Can select & copy text',    color: 'text-cyan-600' },
  ];

  return (
    <div className="space-y-2">
      {items.map(({ key, label, color, divider }) => (
        <React.Fragment key={key}>
          {divider && <div className="border-t border-border/50 my-1" />}
          <button
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
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Sent Shares List ─────────────────────────────────────────────────────────

function SentShareRow({
  share, lang,
  onEditPermissions,
  onDelete,
  onExtend,
  onAddSubjects,
}: {
  share: ShareRequest;
  lang: string;
  onEditPermissions: (share: ShareRequest) => void;
  onDelete: (share: ShareRequest) => void;
  onExtend: (share: ShareRequest) => void;
  onAddSubjects: (share: ShareRequest) => void;
}) {
  // For note/message shares, "declined" means the recipient deleted the
  // notification themselves rather than the admin cancelling a pending share.
  const declinedLabel = share.type === 'course'
    ? (lang === 'bn' ? 'প্রত্যাখ্যান করেছে' : 'Rejected')
    : (lang === 'bn' ? 'ইউজার ডিলিট করেছে' : 'Deleted by user');

  const countdownTarget = share.status === 'accepted' ? share.actualExpiresAt : share.pendingExpiresAt;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", typeColorClass(share.type))}>
          {typeIcon(share.type, 16)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">
            {shareTitle(share, lang)}
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
          {(share.status === 'pending' || share.status === 'accepted') && countdownTarget && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-primary/10">
              <Clock size={10} className="text-primary" />
              <span className="text-[11px] font-mono font-bold text-primary tabular-nums">
                <Countdown targetMs={countdownTarget} lang={lang} />
              </span>
              <span className="text-[9px] text-primary/70">
                {lang === 'bn' ? 'বাকি' : 'left'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(share.status === 'pending' || share.status === 'accepted') && share.type !== 'message' && (
          <button
            onClick={() => onEditPermissions(share)}
            className="flex-1 min-w-[45%] flex items-center justify-center gap-1.5 py-2 rounded-xl bg-secondary text-foreground hover:bg-secondary/70 transition-colors text-xs font-semibold"
          >
            <Edit3 size={12} />
            {lang === 'bn' ? 'অনুমতি' : 'Permissions'}
          </button>
        )}
        {(share.status === 'pending' || share.status === 'accepted') && (
          <button
            onClick={() => onExtend(share)}
            className="flex-1 min-w-[45%] flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors text-xs font-semibold"
          >
            <TimerReset size={12} />
            {lang === 'bn' ? 'সময় বাড়ান' : 'Extend Time'}
          </button>
        )}
        {share.status === 'accepted' && share.type === 'course' && (
          <button
            onClick={() => onAddSubjects(share)}
            className="flex-1 min-w-[45%] flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 transition-colors text-xs font-semibold"
          >
            <ListPlus size={12} />
            {lang === 'bn' ? 'সাবজেক্ট যোগ করুন' : 'Add Subjects'}
          </button>
        )}
        <button
          onClick={() => onDelete(share)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold"
        >
          <Trash2 size={12} />
          {lang === 'bn' ? 'ডিলিট' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ─── Trashed Share Row ─────────────────────────────────────────────────────

function TrashedShareRow({
  share, lang, onRestore, onPermanentDelete,
}: {
  share: ShareRequest;
  lang: string;
  onRestore: (shareId: string) => void;
  onPermanentDelete: (share: ShareRequest) => void;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3 opacity-90">
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", typeColorClass(share.type))}>
          {typeIcon(share.type, 16)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">
            {shareTitle(share, lang)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">→ {share.toEmail}</p>
          {share.trashedAt && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {lang === 'bn' ? 'ডিলিট করা হয়েছে' : 'Deleted'} · {formatDate(share.trashedAt)}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onRestore(share.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-500/10 text-green-700 hover:bg-green-500/20 transition-colors text-xs font-semibold"
        >
          <Undo2 size={12} />
          {lang === 'bn' ? 'পুনরুদ্ধার' : 'Restore'}
        </button>
        <button
          onClick={() => onPermanentDelete(share)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold"
        >
          <Trash2 size={12} />
          {lang === 'bn' ? 'স্থায়ীভাবে মুছুন' : 'Delete Forever'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Admin Panel ──────────────────────────────────────────────────────────

export function AdminPanel() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { lang } = useLang();
  const { isAdmin, isSuperAdmin, adminEmails, loadingAdmins, addAdmin, removeAdmin,
    sendShare, sentShares, trashedShares, loadingSentShares, updateSharePermissions,
    extendShare, getCourseSubjectsForShare, addSubjectsToShare,
    trashShare, restoreShare, permanentlyDeleteShare,
    appContact, saveContactSettings } = useAdmin();
  const { courses, activeCourse } = useCourse();
  const { subjects, notePagesIndex, loadNotePage } = useStudy();

  const [tab, setTab] = useState<'admins' | 'share' | 'sent' | 'contact'>('admins');
  const [sentSubTab, setSentSubTab] = useState<'active' | 'trash'>('active');

  // ── Contact tab state ──
  const [contactForm, setContactForm] = useState({ whatsapp: '', website: '', supportLink: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);

  // Sync form whenever Firestore data loads/updates
  useEffect(() => {
    setContactForm({ whatsapp: appContact.whatsapp, website: appContact.website, supportLink: appContact.supportLink });
  }, [appContact.whatsapp, appContact.website, appContact.supportLink]);

  // ── Admins tab state ──
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  // ── Share tab state ──
  const [shareStep, setShareStep] = useState(1); // 1=recipient, 2=content, 3=duration+perms
  const [shareForm, setShareForm] = useState({
    // One or more recipients. A single email behaves exactly like the old
    // single-recipient flow; multiple emails fan out into one separate
    // shareRequest card per recipient when sent.
    toEmails: [] as string[],
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
  const [emailInput, setEmailInput] = useState('');
  const [emailInputError, setEmailInputError] = useState('');
  // One or more notes picked together to be sent as a single share card.
  const [notesPickedList, setNotesPickedList] = useState<Array<NotePick & { id: string }>>([]);
  // Which picker is shown for note shares: inline subject/chapter/topic notes,
  // or standalone pages from the top-level "Notes" section. Both feed the same
  // notesPickedList / NoteShareItem[] pipeline, so they can be mixed freely.
  const [noteSource, setNoteSource] = useState<'inline' | 'pages'>('inline');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Subject-level selection for course shares (only relevant when the picked
  // course actually has subjects — courses with none skip this entirely).
  const [courseSubjects, setCourseSubjects] = useState<{ id: string; title: string }[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [loadingCourseSubjects, setLoadingCourseSubjects] = useState(false);

  useEffect(() => {
    if (shareForm.type !== 'course' || !shareForm.courseId) {
      setCourseSubjects([]);
      setSelectedSubjectIds([]);
      return;
    }
    let active = true;
    setLoadingCourseSubjects(true);
    getCourseSubjectsForShare(shareForm.courseId).then(list => {
      if (!active) return;
      setCourseSubjects(list);
      setSelectedSubjectIds(list.map(s => s.id)); // default: select all
      setLoadingCourseSubjects(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareForm.type, shareForm.courseId]);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAllSubjects = () => {
    setSelectedSubjectIds(prev => prev.length === courseSubjects.length ? [] : courseSubjects.map(s => s.id));
  };

  // ── Sent tab state ──
  const [sentSearch, setSentSearch] = useState('');
  const filteredSentShares = sentSearch.trim()
    ? sentShares.filter(s => s.toEmail.toLowerCase().includes(sentSearch.trim().toLowerCase()))
    : sentShares;
  const [editPermModal, setEditPermModal] = useState<ShareRequest | null>(null);
  const [editPermissions, setEditPermissions] = useState<SharePermissions>({ ...DEFAULT_PERMISSIONS });
  const [savingPerms, setSavingPerms] = useState(false);
  const [deleteConfirmShare, setDeleteConfirmShare] = useState<ShareRequest | null>(null);
  const [permDeleteConfirmShare, setPermDeleteConfirmShare] = useState<ShareRequest | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [extendModal, setExtendModal] = useState<ShareRequest | null>(null);
  const [extendValue, setExtendValue] = useState(1);
  const [extendUnit, setExtendUnit] = useState<'hours' | 'days' | 'months'>('days');
  const [extendDirection, setExtendDirection] = useState<'add' | 'subtract'>('add');
  const [extending, setExtending] = useState(false);
  const [addSubjectsModal, setAddSubjectsModal] = useState<ShareRequest | null>(null);
  const [addSubjectsAvailable, setAddSubjectsAvailable] = useState<{ id: string; title: string }[]>([]);
  const [addSubjectsPicked, setAddSubjectsPicked] = useState<string[]>([]);
  const [addingSubjects, setAddingSubjects] = useState(false);

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

  const handleSaveContact = async () => {
    setSavingContact(true);
    try {
      await saveContactSettings({
        whatsapp: contactForm.whatsapp.trim(),
        website: contactForm.website.trim(),
        supportLink: contactForm.supportLink.trim(),
      });
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 3000);
    } finally {
      setSavingContact(false);
    }
  };

  // ── Multi-recipient email chip helpers ──
  // Accepts a single email or a batch pasted/typed with commas, spaces, or
  // newlines between them, and adds every valid, not-yet-added one as a chip.
  const addEmailChips = (raw: string) => {
    const candidates = raw.split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    if (candidates.length === 0) return;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid: string[] = [];
    let sawInvalid = false;
    for (const c of candidates) {
      if (emailRe.test(c)) valid.push(c);
      else sawInvalid = true;
    }
    setShareForm(f => ({ ...f, toEmails: Array.from(new Set([...f.toEmails, ...valid])) }));
    setEmailInput('');
    setEmailInputError(sawInvalid ? (lang === 'bn' ? 'কিছু ইমেইল সঠিক নয়, বাদ দেওয়া হয়েছে।' : 'Some emails were invalid and skipped.') : '');
  };
  const removeEmailChip = (email: string) => {
    setShareForm(f => ({ ...f, toEmails: f.toEmails.filter(e => e !== email) }));
  };

  const handleSendShare = async () => {
    setSending(true);
    setSendError(null);
    try {
      const noteItems = shareForm.type === 'note'
        ? notesPickedList.map(({ id: _id, ...rest }) => rest)
        : undefined;
      // Fan out to a separate shareRequest doc per recipient AND, for note
      // shares, per note — each recipient gets their own independent card
      // (own status/permissions/expiry), and each selected note becomes its
      // own notification instead of being bundled into one "N notes" card.
      const noteBatches = shareForm.type === 'note'
        ? (noteItems && noteItems.length > 0 ? noteItems.map(n => [n]) : [undefined])
        : [undefined];
      for (const toEmail of shareForm.toEmails) {
        for (const noteBatch of noteBatches) {
          await sendShare({
            toEmail,
            type: shareForm.type,
            courseId: shareForm.type === 'course' ? shareForm.courseId : undefined,
            courseName: shareForm.type === 'course' ? shareForm.courseName : undefined,
            noteTitle: shareForm.type === 'note' ? noteBatch?.[0]?.title : undefined,
            noteHtml: shareForm.type === 'note' ? noteBatch?.[0]?.html : undefined,
            noteBreadcrumb: shareForm.type === 'note' ? noteBatch?.[0]?.breadcrumb : undefined,
            notes: noteBatch,
            messageText: shareForm.type === 'message' ? shareForm.messageText.trim() : undefined,
            permissions: shareForm.type === 'message' ? { editNotes: false, deleteNotes: false, downloadNotes: false, copyNotes: false, renameCourse: false, addItems: false, takeScreenshot: false, selectCopyText: false } : shareForm.permissions,
            durationValue: shareForm.durationValue,
            durationUnit: shareForm.durationUnit,
            sharedSubjectIds: shareForm.type === 'course' && courseSubjects.length > 0 ? selectedSubjectIds : undefined,
          });
        }
      }
      setSendSuccess(true);
      setShareStep(1);
      setShareForm({
        toEmails: [], type: 'course', courseId: '', courseName: '', noteTitle: '', noteHtml: '',
        noteBreadcrumb: [], messageText: '', durationValue: 7, durationUnit: 'days', permissions: { ...DEFAULT_PERMISSIONS },
      });
      setEmailInput('');
      setEmailInputError('');
      setNotesPickedList([]);
      setNoteSource('inline');
      setCourseSubjects([]);
      setSelectedSubjectIds([]);
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

  const handleConfirmDelete = async () => {
    if (!deleteConfirmShare) return;
    setDeletingId(deleteConfirmShare.id);
    try {
      await trashShare(deleteConfirmShare.id);
      setDeleteConfirmShare(null);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (shareId: string) => {
    await restoreShare(shareId);
  };

  const handleConfirmPermanentDelete = async () => {
    if (!permDeleteConfirmShare) return;
    setDeletingId(permDeleteConfirmShare.id);
    try {
      await permanentlyDeleteShare(permDeleteConfirmShare.id);
      setPermDeleteConfirmShare(null);
    } finally {
      setDeletingId(null);
    }
  };

  const openExtendModal = (share: ShareRequest) => {
    setExtendModal(share);
    setExtendValue(1);
    setExtendUnit('days');
    setExtendDirection('add');
  };

  const handleConfirmExtend = async () => {
    if (!extendModal) return;
    setExtending(true);
    try {
      const signedValue = extendDirection === 'subtract' ? -extendValue : extendValue;
      await extendShare(extendModal.id, signedValue, extendUnit);
      setExtendModal(null);
    } finally {
      setExtending(false);
    }
  };

  const openAddSubjectsModal = async (share: ShareRequest) => {
    if (!share.courseId) return;
    setAddSubjectsModal(share);
    setAddSubjectsPicked([]);
    const list = await getCourseSubjectsForShare(share.courseId);
    setAddSubjectsAvailable(list);
  };

  const handleConfirmAddSubjects = async () => {
    if (!addSubjectsModal || addSubjectsPicked.length === 0) return;
    setAddingSubjects(true);
    try {
      await addSubjectsToShare(addSubjectsModal.id, addSubjectsPicked);
      setAddSubjectsModal(null);
      setAddSubjectsPicked([]);
    } finally {
      setAddingSubjects(false);
    }
  };

  const tabs = [
    { id: 'admins', label: lang === 'bn' ? 'এডমিন' : 'Admins', Icon: Users },
    { id: 'share', label: lang === 'bn' ? 'শেয়ার' : 'Share', Icon: Send },
    { id: 'sent', label: lang === 'bn' ? 'পাঠানো' : 'Sent', Icon: List },
    { id: 'contact', label: lang === 'bn' ? 'কন্টাক্ট' : 'Contact', Icon: Phone },
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
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {lang === 'bn'
                      ? 'একজনের ইমেইল দিন, অথবা একাধিক ইমেইল কমা/স্পেস দিয়ে লিখে একসাথে অনেকজনকে পাঠান'
                      : 'Add one email, or paste several separated by commas/spaces to send to many at once'}
                  </p>
                  {shareForm.toEmails.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {shareForm.toEmails.map(email => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold"
                        >
                          {email}
                          <button
                            onClick={() => removeEmailChip(email)}
                            className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={lang === 'bn' ? 'প্রাপকের ইমেইল আইডি' : 'Recipient email(s)'}
                      value={emailInput}
                      onChange={e => { setEmailInput(e.target.value); setEmailInputError(''); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addEmailChips(emailInput); }
                      }}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => addEmailChips(emailInput)}
                      disabled={!emailInput.trim()}
                      className="px-4 py-0 h-12"
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                  {emailInputError && <p className="text-xs text-destructive mt-1">{emailInputError}</p>}
                </div>
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
                  disabled={shareForm.toEmails.length === 0}
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

                    {/* Subject-level selection — only shown for courses that actually
                        have subjects; a course with none is shared as a whole. */}
                    {shareForm.courseId && loadingCourseSubjects && (
                      <p className="text-xs text-muted-foreground py-2">
                        {lang === 'bn' ? 'সাবজেক্ট লোড হচ্ছে...' : 'Loading subjects...'}
                      </p>
                    )}
                    {shareForm.courseId && !loadingCourseSubjects && courseSubjects.length > 0 && (
                      <div className="pt-2 border-t border-border/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-foreground">
                            {lang === 'bn' ? 'কোন সাবজেক্টগুলো পাঠাবেন?' : 'Which subjects to send?'}
                          </p>
                          <button
                            onClick={toggleSelectAllSubjects}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            {selectedSubjectIds.length === courseSubjects.length
                              ? (lang === 'bn' ? 'সব বাদ দিন' : 'Deselect all')
                              : (lang === 'bn' ? 'সব সিলেক্ট করুন' : 'Select all')}
                          </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                          {courseSubjects.map(s => (
                            <label
                              key={s.id}
                              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/60 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSubjectIds.includes(s.id)}
                                onChange={() => toggleSubject(s.id)}
                                className="w-4 h-4 rounded accent-primary shrink-0"
                              />
                              <span className="text-sm text-foreground truncate">{s.title}</span>
                            </label>
                          ))}
                        </div>
                        {selectedSubjectIds.length === 0 && (
                          <p className="text-[11px] text-destructive">
                            {lang === 'bn' ? 'অন্তত একটি সাবজেক্ট সিলেক্ট করুন' : 'Select at least one subject'}
                          </p>
                        )}
                      </div>
                    )}
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
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {lang === 'bn'
                        ? 'একটি বা একাধিক নোট সিলেক্ট করুন — সবগুলো একসাথে একটি কার্ড হিসেবে পাঠানো হবে'
                        : 'Select one or more notes — they will all be sent together as a single card'}
                    </p>

                    {notesPickedList.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-foreground">
                          {lang === 'bn'
                            ? `সিলেক্ট করা হয়েছে (${notesPickedList.length})`
                            : `Selected (${notesPickedList.length})`}
                        </p>
                        {notesPickedList.map(note => (
                          <div key={note.id} className="flex items-center justify-between gap-2 p-2.5 bg-amber-500/5 border border-amber-300/50 rounded-xl">
                            <p className="text-xs text-foreground flex items-center gap-1 flex-wrap min-w-0 flex-1">
                              {note.breadcrumb.map((c, i) => (
                                <React.Fragment key={i}>
                                  {i > 0 && <ChevronRight size={9} className="shrink-0" />}
                                  <span className={i === note.breadcrumb.length - 1 ? 'font-semibold' : ''}>{c}</span>
                                </React.Fragment>
                              ))}
                            </p>
                            <button
                              onClick={() => setNotesPickedList(list => list.filter(n => n.id !== note.id))}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground shrink-0"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Source toggle: subject/chapter/topic notes vs. standalone Notes-page items */}
                    <div className="flex items-center gap-1.5 p-1 bg-secondary rounded-xl">
                      <button
                        onClick={() => setNoteSource('inline')}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          noteSource === 'inline' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {lang === 'bn' ? 'সাবজেক্ট নোট' : 'Subject notes'}
                      </button>
                      <button
                        onClick={() => setNoteSource('pages')}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                          noteSource === 'pages' ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {lang === 'bn' ? 'নোট সেকশন' : 'Notes section'}
                      </button>
                    </div>

                    {noteSource === 'inline' ? (
                      <NotePicker
                        subjects={subjects}
                        pickedIds={new Set(notesPickedList.map(n => n.id))}
                        onToggle={pick => setNotesPickedList(list =>
                          list.some(n => n.id === pick.id)
                            ? list.filter(n => n.id !== pick.id)
                            : [...list, pick]
                        )}
                        lang={lang}
                      />
                    ) : (
                      <NotePagesPicker
                        notePagesIndex={notePagesIndex}
                        loadNotePage={loadNotePage}
                        pickedIds={new Set(notesPickedList.map(n => n.id))}
                        onToggle={pick => setNotesPickedList(list =>
                          list.some(n => n.id === pick.id)
                            ? list.filter(n => n.id !== pick.id)
                            : [...list, pick]
                        )}
                        lang={lang}
                      />
                    )}
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={
                    shareForm.type === 'course' ? (!shareForm.courseId || (courseSubjects.length > 0 && selectedSubjectIds.length === 0))
                      : shareForm.type === 'message' ? !shareForm.messageText.trim()
                      : notesPickedList.length === 0
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
                  <p>
                    <span className="text-muted-foreground">
                      {lang === 'bn'
                        ? `প্রাপক (${shareForm.toEmails.length}):`
                        : `To (${shareForm.toEmails.length}):`}
                    </span>{' '}
                    <span className="font-semibold">{shareForm.toEmails.join(', ')}</span>
                  </p>
                  <p><span className="text-muted-foreground">{lang === 'bn' ? 'কন্টেন্ট:' : 'Content:'}</span>{' '}
                    <span className="font-semibold">
                      {shareForm.type === 'course' ? shareForm.courseName
                        : shareForm.type === 'message' ? shareForm.messageText
                        : notesPickedList.length > 1
                          ? (lang === 'bn' ? `${notesPickedList.length}টি নোট` : `${notesPickedList.length} notes`)
                          : (notesPickedList[0]?.title || '—')}
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
            {/* Active / Trash sub-toggle */}
            <div className="flex gap-2 p-1 bg-secondary/60 rounded-xl">
              <button
                onClick={() => setSentSubTab('active')}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  sentSubTab === 'active' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {lang === 'bn' ? 'পাঠানো' : 'Active'}
              </button>
              <button
                onClick={() => setSentSubTab('trash')}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5",
                  sentSubTab === 'trash' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                <Archive size={12} />
                {lang === 'bn' ? 'ট্র্যাশ' : 'Trash'}
                {trashedShares.length > 0 && (
                  <span className="text-[10px] bg-destructive/15 text-destructive px-1.5 rounded-full">{trashedShares.length}</span>
                )}
              </button>
            </div>

            {/* Search by recipient email — jump straight to a specific user's cards to edit them */}
            {sentSubTab === 'active' && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={sentSearch}
                  onChange={e => setSentSearch(e.target.value)}
                  placeholder={lang === 'bn' ? 'ইমেইল দিয়ে খুঁজুন...' : 'Search by email...'}
                  className="w-full h-10 pl-9 pr-8 rounded-xl border border-border/60 bg-secondary text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {sentSearch && (
                  <button
                    onClick={() => setSentSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary/80 text-muted-foreground"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {loadingSentShares ? (
              <div className="py-8 flex justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : sentSubTab === 'active' ? (
              filteredSentShares.length === 0 ? (
                <div className="py-12 text-center">
                  <List size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {sentShares.length === 0
                      ? (lang === 'bn' ? 'এখনো কিছু পাঠানো হয়নি।' : 'Nothing sent yet.')
                      : (lang === 'bn' ? 'এই ইমেইলে কিছু পাঠানো হয়নি।' : 'Nothing sent to this email.')}
                  </p>
                </div>
              ) : filteredSentShares.map(share => (
                <SentShareRow
                  key={share.id}
                  share={share}
                  lang={lang}
                  onEditPermissions={s => { setEditPermissions({ ...s.permissions }); setEditPermModal(s); }}
                  onDelete={s => setDeleteConfirmShare(s)}
                  onExtend={s => openExtendModal(s)}
                  onAddSubjects={s => openAddSubjectsModal(s)}
                />
              ))
            ) : (
              trashedShares.length === 0 ? (
                <div className="py-12 text-center">
                  <Archive size={32} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {lang === 'bn' ? 'ট্র্যাশ খালি।' : 'Trash is empty.'}
                  </p>
                </div>
              ) : trashedShares.map(share => (
                <TrashedShareRow
                  key={share.id}
                  share={share}
                  lang={lang}
                  onRestore={handleRestore}
                  onPermanentDelete={s => setPermDeleteConfirmShare(s)}
                />
              ))
            )}
          </div>
        )}

        {/* ── Contact Tab ── */}
        {tab === 'contact' && (
          <div className="space-y-4 mt-2">
            <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-4">
              <p className="text-sm font-bold text-foreground">
                {lang === 'bn' ? 'কন্টাক্ট তথ্য সেট করুন' : 'Set Contact Information'}
              </p>
              <p className="text-xs text-muted-foreground">
                {lang === 'bn'
                  ? 'এখানে সেট করা তথ্য সব ইউজারের PDF ফুটারে এবং কন্টাক্ট বাটনে লাইভ আপডেট হবে।'
                  : 'These settings appear in PDF footers and the contact button for all users, updated live.'}
              </p>

              {/* WhatsApp Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <MessageCircle size={12} className="text-green-600" />
                  {lang === 'bn' ? 'WhatsApp নম্বর' : 'WhatsApp Number'}
                </label>
                <Input
                  type="text"
                  placeholder={lang === 'bn' ? 'যেমন: 9999999999' : 'e.g. 9999999999'}
                  value={contactForm.whatsapp}
                  onChange={e => setContactForm(f => ({ ...f, whatsapp: e.target.value }))}
                  className="h-10 text-sm"
                />
              </div>

              {/* Website Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Globe size={12} className="text-blue-600" />
                  {lang === 'bn' ? 'ওয়েবসাইট লিঙ্ক' : 'Website Link'}
                </label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={contactForm.website}
                  onChange={e => setContactForm(f => ({ ...f, website: e.target.value }))}
                  className="h-10 text-sm"
                />
              </div>

              {/* Support Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Link2 size={12} className="text-indigo-600" />
                  {lang === 'bn' ? 'সাপোর্ট লিঙ্ক (WhatsApp/Telegram চ্যাট)' : 'Support Link (WhatsApp/Telegram chat)'}
                </label>
                <Input
                  type="url"
                  placeholder="https://wa.me/91... or https://t.me/..."
                  value={contactForm.supportLink}
                  onChange={e => setContactForm(f => ({ ...f, supportLink: e.target.value }))}
                  className="h-10 text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  {lang === 'bn'
                    ? 'এই লিঙ্কটি Today পেজের Contact বাটনে ওপেন হবে।'
                    : 'This link opens when users tap the Contact button on the Today page.'}
                </p>
              </div>

              <Button
                onClick={handleSaveContact}
                disabled={savingContact}
                className="w-full h-10 text-sm"
              >
                {savingContact
                  ? <RefreshCw size={14} className="animate-spin mr-2" />
                  : <Save size={14} className="mr-2" />}
                {lang === 'bn' ? 'সেভ করুন' : 'Save'}
              </Button>

              {contactSaved && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-green-600 text-center font-semibold"
                >
                  {lang === 'bn' ? '✓ সফলভাবে সেভ হয়েছে!' : '✓ Saved successfully!'}
                </motion.p>
              )}
            </div>

            {/* Current settings preview */}
            {(appContact.whatsapp || appContact.website || appContact.supportLink) && (
              <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-bold text-muted-foreground">
                  {lang === 'bn' ? 'বর্তমান তথ্য' : 'Current Settings'}
                </p>
                {appContact.whatsapp && (
                  <p className="text-sm text-foreground flex items-center gap-2">
                    <MessageCircle size={13} className="text-green-600 shrink-0" />
                    {appContact.whatsapp}
                  </p>
                )}
                {appContact.website && (
                  <p className="text-sm text-foreground flex items-center gap-2 break-all">
                    <Globe size={13} className="text-blue-600 shrink-0" />
                    {appContact.website}
                  </p>
                )}
                {appContact.supportLink && (
                  <p className="text-sm text-foreground flex items-center gap-2 break-all">
                    <Link2 size={13} className="text-indigo-600 shrink-0" />
                    {appContact.supportLink}
                  </p>
                )}
              </div>
            )}
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

      {/* Extend Time Modal */}
      <Modal
        isOpen={!!extendModal}
        onClose={() => setExtendModal(null)}
        title={lang === 'bn' ? 'সময় বাড়ান' : 'Extend Time'}
        align="bottom"
        icon={TimerReset}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">→ {extendModal?.toEmail}</p>
          <div className="flex rounded-xl bg-secondary p-1 gap-1">
            <button
              onClick={() => setExtendDirection('add')}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-semibold transition-colors",
                extendDirection === 'add' ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {lang === 'bn' ? 'সময় বাড়ান' : 'Extend'}
            </button>
            <button
              onClick={() => setExtendDirection('subtract')}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-semibold transition-colors",
                extendDirection === 'subtract' ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {lang === 'bn' ? 'সময় কমান' : 'Reduce'}
            </button>
          </div>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={extendValue}
              onChange={e => setExtendValue(Math.max(1, Number(e.target.value) || 1))}
              className="flex-1"
            />
            <select
              value={extendUnit}
              onChange={e => setExtendUnit(e.target.value as 'hours' | 'days' | 'months')}
              className="rounded-xl border border-border/60 bg-secondary px-3 text-sm text-foreground"
            >
              <option value="hours">{lang === 'bn' ? 'ঘণ্টা' : 'Hours'}</option>
              <option value="days">{lang === 'bn' ? 'দিন' : 'Days'}</option>
              <option value="months">{lang === 'bn' ? 'মাস' : 'Months'}</option>
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {extendDirection === 'add'
              ? (lang === 'bn'
                ? 'বর্তমান মেয়াদ শেষ হওয়ার সময়ের সাথে এই সময় যোগ হবে।'
                : 'This time will be added on top of the current expiry.')
              : (lang === 'bn'
                ? 'বর্তমান মেয়াদ শেষ হওয়ার সময় থেকে এই সময় কমে যাবে।'
                : 'This time will be subtracted from the current expiry.')}
          </p>
          <Button className="w-full" onClick={handleConfirmExtend} disabled={extending}>
            {extending ? '...' : (extendDirection === 'add'
              ? (lang === 'bn' ? 'সময় বাড়ান' : 'Extend')
              : (lang === 'bn' ? 'সময় কমান' : 'Reduce'))}
          </Button>
        </div>
      </Modal>

      {/* Add Subjects Modal */}
      <Modal
        isOpen={!!addSubjectsModal}
        onClose={() => setAddSubjectsModal(null)}
        title={lang === 'bn' ? 'আরও সাবজেক্ট যোগ করুন' : 'Add More Subjects'}
        align="bottom"
        icon={ListPlus}
      >
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">→ {addSubjectsModal?.toEmail}</p>
          {(() => {
            const alreadySent = new Set(addSubjectsModal?.sharedSubjectIds || []);
            const remaining = addSubjectsAvailable.filter(s => !alreadySent.has(s.id));
            const already = addSubjectsAvailable.filter(s => alreadySent.has(s.id));
            return (
              <>
                {already.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {lang === 'bn' ? 'আগে পাঠানো হয়েছে' : 'Already sent'}
                    </p>
                    {already.map(s => (
                      <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/40 opacity-60">
                        <Check size={13} className="text-green-600 shrink-0" />
                        <span className="text-sm text-foreground truncate">{s.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {remaining.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {lang === 'bn' ? 'নতুন সাবজেক্ট' : 'New subjects'}
                    </p>
                    <div className="max-h-52 overflow-y-auto space-y-1">
                      {remaining.map(s => (
                        <label key={s.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={addSubjectsPicked.includes(s.id)}
                            onChange={() => setAddSubjectsPicked(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                            className="w-4 h-4 rounded accent-primary shrink-0"
                          />
                          <span className="text-sm text-foreground truncate">{s.title}</span>
                        </label>
                      ))}
                    </div>
                    <Button className="w-full" onClick={handleConfirmAddSubjects} disabled={addingSubjects || addSubjectsPicked.length === 0}>
                      {addingSubjects ? '...' : (lang === 'bn' ? 'যোগ করুন' : 'Add Selected')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {lang === 'bn' ? 'সব সাবজেক্ট ইতিমধ্যে পাঠানো হয়েছে।' : 'All subjects already sent.'}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </Modal>

      {/* Delete confirmation (moves to trash) */}
      <Modal
        isOpen={!!deleteConfirmShare}
        onClose={() => setDeleteConfirmShare(null)}
        title={lang === 'bn' ? 'ডিলিট নিশ্চিত করুন' : 'Confirm Delete'}
        align="bottom"
        icon={AlertTriangle}
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            {lang === 'bn'
              ? 'এই কার্ডটি ট্র্যাশে সরানো হবে। পরে ট্র্যাশ থেকে পুনরুদ্ধার করতে পারবেন।'
              : 'This card will be moved to trash. You can restore it from trash later.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteConfirmShare(null)}
              className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/70 transition-colors"
            >
              {lang === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deletingId === deleteConfirmShare?.id}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deletingId === deleteConfirmShare?.id ? '...' : (lang === 'bn' ? 'ডিলিট করুন' : 'Delete')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Permanent delete confirmation (from trash) */}
      <Modal
        isOpen={!!permDeleteConfirmShare}
        onClose={() => setPermDeleteConfirmShare(null)}
        title={lang === 'bn' ? 'স্থায়ীভাবে মুছুন' : 'Delete Forever'}
        align="bottom"
        icon={AlertTriangle}
      >
        <div className="space-y-4">
          <p className="text-sm text-foreground">
            {lang === 'bn'
              ? 'এটি স্থায়ীভাবে মুছে যাবে এবং আর ফিরিয়ে আনা যাবে না।'
              : 'This will be permanently deleted and cannot be recovered.'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPermDeleteConfirmShare(null)}
              className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/70 transition-colors"
            >
              {lang === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
            <button
              onClick={handleConfirmPermanentDelete}
              disabled={deletingId === permDeleteConfirmShare?.id}
              className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deletingId === permDeleteConfirmShare?.id ? '...' : (lang === 'bn' ? 'মুছুন' : 'Delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
