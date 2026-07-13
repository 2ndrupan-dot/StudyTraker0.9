import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, Trash2, BookOpen, StickyNote, Clock, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAdmin, ShareRequest } from '@/context/AdminContext';
import { Modal } from '@/components/ui';
import { RichTextPreview } from '@/components/RichTextEditor';
import { useLang } from '@/context/LangContext';

function formatDuration(value: number, unit: string, lang: string) {
  if (lang === 'bn') {
    const unitMap: Record<string, string> = { hours: 'ঘণ্টা', days: 'দিন', months: 'মাস' };
    return `${value} ${unitMap[unit] || unit}`;
  }
  return `${value} ${unit}`;
}

function formatExpiry(expiresAt: number, lang: string) {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return lang === 'bn' ? 'মেয়াদ শেষ' : 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return lang === 'bn' ? `${days} দিন বাকি` : `${days}d left`;
  return lang === 'bn' ? `${hours} ঘণ্টা বাকি` : `${hours}h left`;
}

function NoteViewModal({
  isOpen, onClose, share,
}: { isOpen: boolean; onClose: () => void; share: ShareRequest | null }) {
  const { declineShare } = useAdmin();
  const { lang } = useLang();
  if (!share) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={share.noteTitle || 'Note'} icon={StickyNote}>
      <div className="space-y-4">
        {share.noteBreadcrumb && share.noteBreadcrumb.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
            {share.noteBreadcrumb.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={10} className="text-border" />}
                <span>{c}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {share.noteHtml ? (
          <div className="max-h-64 overflow-y-auto">
            <RichTextPreview html={share.noteHtml} className="text-sm leading-relaxed" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {lang === 'bn' ? 'কোনো কন্টেন্ট নেই।' : 'No content available.'}
          </p>
        )}
        <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
          {lang === 'bn' ? 'শেয়ার করেছেন' : 'Shared by'}: <span className="font-semibold">{share.fromAdminName}</span>
          {' · '}
          {lang === 'bn' ? 'মেয়াদ' : 'Expires'}: {formatExpiry(share.actualExpiresAt || share.pendingExpiresAt, lang)}
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

export function NotificationBell() {
  const { pendingShares, acceptShare, declineShare } = useAdmin();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [viewNote, setViewNote] = useState<ShareRequest | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const unread = pendingShares.length;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleAccept = async (share: ShareRequest) => {
    setAcceptingId(share.id);
    try { await acceptShare(share.id); } finally { setAcceptingId(null); }
  };

  const handleDecline = async (shareId: string) => {
    setDecliningId(shareId);
    try { await declineShare(shareId); } finally { setDecliningId(null); }
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={() => setOpen(v => !v)}
        title={lang === 'bn' ? 'নোটিফিকেশন' : 'Notifications'}
        className={cn(
          "p-2.5 rounded-full hover:bg-white/25 transition-colors border",
          open
            ? "bg-white/30 text-white border-white/40"
            : "bg-white/15 text-white border-white/20"
        )}
      >
        <Bell size={18} />
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute top-full right-0 mt-2 w-80 bg-card border border-border/60 rounded-2xl shadow-2xl z-50 overflow-hidden"
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

            {/* Body */}
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
                    <div key={share.id} className="p-4 space-y-3">
                      {/* Type + sender */}
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                          share.type === 'course' ? "bg-indigo-500/10 text-indigo-600" : "bg-amber-500/10 text-amber-600"
                        )}>
                          {share.type === 'course' ? <BookOpen size={15} /> : <StickyNote size={15} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {share.type === 'course'
                              ? (share.courseName || (lang === 'bn' ? 'কোর্স শেয়ার' : 'Course Share'))
                              : (share.noteTitle || (lang === 'bn' ? 'নোট শেয়ার' : 'Note Share'))
                            }
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lang === 'bn' ? 'পাঠিয়েছেন' : 'From'}: <span className="font-medium text-foreground">{share.fromAdminName}</span>
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock size={10} className="text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">
                              {formatDuration(share.durationValue, share.durationUnit, lang)}
                              {' · '}
                              {formatExpiry(share.pendingExpiresAt, lang)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Permissions preview */}
                      <div className="flex flex-wrap gap-1">
                        {share.permissions.editNotes && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                            {lang === 'bn' ? 'সম্পাদনা' : 'Edit'}
                          </span>
                        )}
                        {share.permissions.deleteNotes && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium">
                            {lang === 'bn' ? 'ডিলিট' : 'Delete'}
                          </span>
                        )}
                        {share.permissions.downloadNotes && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium">
                            {lang === 'bn' ? 'ডাউনলোড' : 'Download'}
                          </span>
                        )}
                        {share.permissions.copyNotes && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 font-medium">
                            {lang === 'bn' ? 'কপি' : 'Copy'}
                          </span>
                        )}
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
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setViewNote(share); setOpen(false); }}
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
        )}
      </AnimatePresence>

      {/* Note view modal */}
      <NoteViewModal
        isOpen={!!viewNote}
        onClose={() => setViewNote(null)}
        share={viewNote}
      />
    </div>
  );
}
