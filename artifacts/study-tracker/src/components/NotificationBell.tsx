import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, Check, Trash2, BookOpen, StickyNote, MessageSquare, Clock, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAdmin, ShareRequest } from '@/context/AdminContext';
import { Modal, NoteEditorModal } from '@/components/ui';
import { useLang } from '@/context/LangContext';
import { Countdown } from '@/components/Countdown';

function formatDuration(value: number, unit: string, lang: string) {
  if (lang === 'bn') {
    const unitMap: Record<string, string> = { hours: 'ঘণ্টা', days: 'দিন', months: 'মাস' };
    return `${value} ${unitMap[unit] || unit}`;
  }
  return `${value} ${unit}`;
}

// Shared notes open in the exact same note viewer used everywhere else in the
// app (copy / download / search / edit / expand / close icon row), but the
// copy/download/edit icons are shown or hidden based on the permissions the
// admin granted for this specific share — not just always-on.
function SharedNoteModal({
  isOpen, onClose, share,
}: { isOpen: boolean; onClose: () => void; share: ShareRequest | null }) {
  const notes = share?.notes && share.notes.length > 0 ? share.notes : undefined;
  const singleNote = notes?.[0];
  const [localHtml, setLocalHtml] = useState(singleNote?.html ?? share?.noteHtml ?? '');

  useEffect(() => {
    setLocalHtml(singleNote?.html ?? share?.noteHtml ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share?.id]);

  if (!share) return null;

  // A share carrying multiple notes together is shown as a read-only,
  // stacked list — editing semantics don't map cleanly onto several
  // unrelated notes at once, so this view focuses on reading/copying.
  if (notes && notes.length > 1) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={`${notes.length} Notes`} icon={StickyNote}>
        <div className="space-y-3">
          {notes.map((note, i) => (
            <div key={i} className="p-3 bg-secondary/40 rounded-xl space-y-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                {note.breadcrumb.map((c, ci) => (
                  <React.Fragment key={ci}>
                    {ci > 0 && <ChevronRight size={9} />}
                    <span className={ci === note.breadcrumb.length - 1 ? 'text-foreground font-semibold' : ''}>{c}</span>
                  </React.Fragment>
                ))}
              </p>
              {note.html ? (
                <div
                  className={cn(
                    "text-sm leading-relaxed rich-text-content",
                    !share.permissions.selectCopyText && "select-none"
                  )}
                  dangerouslySetInnerHTML={{ __html: note.html }}
                />
              ) : (
                <p className="text-xs text-muted-foreground italic">No content available.</p>
              )}
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <NoteEditorModal
      isOpen={isOpen}
      onClose={onClose}
      title={singleNote?.title || share.noteTitle || 'Note'}
      icon={StickyNote}
      breadcrumb={singleNote?.breadcrumb || share.noteBreadcrumb}
      value={localHtml}
      onChange={setLocalHtml}
      onClear={() => setLocalHtml('')}
      onSave={onClose}
      placeholder="No content available."
      clearLabel="Clear"
      saveLabel="Done"
      copyAllowed={share.permissions.copyNotes}
      downloadAllowed={share.permissions.downloadNotes}
      editAllowed={share.permissions.editNotes}
    />
  );
}

function MessageViewModal({
  isOpen, onClose, share,
}: { isOpen: boolean; onClose: () => void; share: ShareRequest | null }) {
  const { declineShare } = useAdmin();
  const { lang } = useLang();
  if (!share) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={lang === 'bn' ? 'মেসেজ' : 'Message'} icon={MessageSquare}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{share.messageText}</p>
        <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
          {lang === 'bn' ? 'পাঠিয়েছেন' : 'From'}: <span className="font-semibold">{share.fromAdminName}</span>
        </p>
        <button
          onClick={async () => { await declineShare(share.id); onClose(); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-sm font-semibold"
        >
          <Trash2 size={14} />
          {lang === 'bn' ? 'মুছে দিন' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

// The dropdown is rendered through a portal into document.body and positioned
// with `position: fixed` computed from the bell button's own bounding rect.
// Why: the bell lives inside headers that use `overflow-hidden` (for rounded
// corners) — an `absolute`-positioned dropdown nested inside gets clipped by
// that ancestor and becomes an invisible sliver. Escaping to a portal avoids
// any ancestor's overflow/transform/z-index clipping it.
function useAnchoredPosition(anchorRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const [pos, setPos] = useState<{ top: number; right: number; width: number } | null>(null);

  const recompute = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Panel width shrinks to fit narrow phones (16px total side margin) instead
    // of a fixed 320px that can overflow small viewports.
    const width = Math.min(320, window.innerWidth - 16);
    // Anchor to the bell's right edge by default, but clamp so the panel
    // never extends past either screen edge — this is what previously let
    // the dropdown hang half off-screen on narrow phones.
    const idealRight = window.innerWidth - rect.right;
    const maxRight = window.innerWidth - 8 - width;
    const right = Math.min(Math.max(idealRight, 8), Math.max(8, maxRight));
    setPos({ top: rect.bottom + 8, right, width });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [open, recompute]);

  return pos;
}

export function NotificationBell() {
  const { pendingShares, acceptShare, declineShare, markSeen } = useAdmin();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [viewNote, setViewNote] = useState<ShareRequest | null>(null);
  const [viewMessage, setViewMessage] = useState<ShareRequest | null>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPosition(btnWrapRef, open);

  // Notifications are already sorted newest-first by the context; unread
  // count only counts the ones the user hasn't clicked into yet.
  const unread = pendingShares.filter(s => !s.seenAt).length;

  // Close on outside click (both the bell button and the portal panel count as "inside")
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnWrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAccept = async (share: ShareRequest) => {
    setAcceptingId(share.id);
    try {
      await markSeen(share.id);
      await acceptShare(share.id);
      // For course shares the accepted course is now written to the user's own
      // Firestore collections.  Reload so CourseContext picks up the new course
      // and it appears in the course switcher immediately.
      if (share.type === 'course' && share.courseSnapshot) {
        window.location.reload();
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (shareId: string) => {
    setDecliningId(shareId);
    try { await markSeen(shareId); await declineShare(shareId); } finally { setDecliningId(null); }
  };

  const handleOpenNote = (share: ShareRequest) => {
    markSeen(share.id);
    setViewNote(share);
    setOpen(false);
  };

  const handleOpenMessage = (share: ShareRequest) => {
    markSeen(share.id);
    setViewMessage(share);
    setOpen(false);
  };

  const panel = open && pos && (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        style={{ position: 'fixed', top: pos.top, right: pos.right, width: pos.width, zIndex: 9999 }}
        className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/30">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-primary" />
            <span className="text-sm font-bold text-foreground">
              {lang === 'bn' ? 'নোটিফিকেশন' : 'Notifications'}
            </span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-secondary text-muted-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body — newest notification on top, oldest at the bottom */}
        <div className="max-h-[420px] overflow-y-auto">
          {pendingShares.length === 0 ? (
            <div className="py-10 text-center">
              <Bell size={28} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {lang === 'bn' ? 'কোনো নোটিফিকেশন নেই' : 'No notifications'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {pendingShares.map(share => (
                <div
                  key={share.id}
                  onClick={() => markSeen(share.id)}
                  className={cn("p-4 space-y-3 relative", !share.seenAt && "bg-primary/[0.04]")}
                >
                  {!share.seenAt && (
                    <span className="absolute top-4 left-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                  {/* Type + sender */}
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                      share.type === 'course' ? "bg-indigo-500/10 text-indigo-600"
                        : share.type === 'message' ? "bg-sky-500/10 text-sky-600"
                        : "bg-amber-500/10 text-amber-600"
                    )}>
                      {share.type === 'course' ? <BookOpen size={15} />
                        : share.type === 'message' ? <MessageSquare size={15} />
                        : <StickyNote size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {share.type === 'course'
                          ? (share.courseName || (lang === 'bn' ? 'কোর্স শেয়ার' : 'Course Share'))
                          : share.type === 'message'
                            ? (lang === 'bn' ? 'নতুন মেসেজ' : 'New message')
                            : share.notes && share.notes.length > 1
                              ? (lang === 'bn' ? `${share.notes.length}টি নোট` : `${share.notes.length} notes`)
                              : (share.notes?.[0]?.title || share.noteTitle || (lang === 'bn' ? 'নোট শেয়ার' : 'Note Share'))
                        }
                      </p>
                      {share.type === 'message' && (
                        <p className="text-xs text-foreground/80 mt-0.5 line-clamp-2">{share.messageText}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lang === 'bn' ? 'পাঠিয়েছেন' : 'From'}: <span className="font-medium text-foreground">{share.fromAdminName}</span>
                      </p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={10} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {formatDuration(share.durationValue, share.durationUnit, lang)}
                        </span>
                      </div>
                      <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10">
                        <Clock size={9} className="text-rose-600" />
                        <span className="text-[10px] font-mono font-bold text-rose-600 tabular-nums">
                          <Countdown
                            targetMs={share.pendingExpiresAt}
                            lang={lang}
                          />
                        </span>
                        <span className="text-[9px] text-rose-600/70">
                          {lang === 'bn' ? 'বাকি' : 'left'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {share.type === 'course' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(share)}
                        disabled={acceptingId === share.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-semibold disabled:opacity-50"
                      >
                        <Check size={12} />
                        {acceptingId === share.id ? '...' : (lang === 'bn' ? 'গ্রহণ করুন' : 'Accept')}
                      </button>
                      <button
                        onClick={() => handleDecline(share.id)}
                        disabled={decliningId === share.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        {decliningId === share.id ? '...' : (lang === 'bn' ? 'মুছুন' : 'Delete')}
                      </button>
                    </div>
                  ) : share.type === 'message' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenMessage(share)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 transition-colors text-xs font-semibold"
                      >
                        <MessageSquare size={12} />
                        {lang === 'bn' ? 'খুলুন' : 'Open'}
                      </button>
                      <button
                        onClick={() => handleDecline(share.id)}
                        disabled={decliningId === share.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        {decliningId === share.id ? '...' : (lang === 'bn' ? 'মুছুন' : 'Delete')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenNote(share)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 transition-colors text-xs font-semibold"
                      >
                        <StickyNote size={12} />
                        {lang === 'bn' ? 'খুলুন' : 'Open'}
                      </button>
                      <button
                        onClick={() => handleDecline(share.id)}
                        disabled={decliningId === share.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-xs font-semibold disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        {decliningId === share.id ? '...' : (lang === 'bn' ? 'মুছুন' : 'Delete')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div ref={btnWrapRef} className="relative">
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={() => setOpen(v => !v)}
        title={lang === 'bn' ? 'নোটিফিকেশন' : 'Notifications'}
        className={cn(
          "p-2 sm:p-2.5 rounded-full hover:bg-white/25 transition-colors border shrink-0",
          open
            ? "bg-white/30 text-white border-white/40"
            : "bg-white/15 text-white border-white/20"
        )}
      >
        <Bell size={16} className="sm:hidden" />
        <Bell size={18} className="hidden sm:block" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key={unread}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow"
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {typeof document !== 'undefined' && createPortal(panel, document.body)}

      {/* Note / message view modals */}
      <SharedNoteModal
        isOpen={!!viewNote}
        onClose={() => setViewNote(null)}
        share={viewNote}
      />
      <MessageViewModal
        isOpen={!!viewMessage}
        onClose={() => setViewMessage(null)}
        share={viewMessage}
      />
    </div>
  );
}
