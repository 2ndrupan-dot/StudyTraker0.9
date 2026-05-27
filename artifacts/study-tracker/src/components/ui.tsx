import React from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, Pencil, Eye, FileText, ExternalLink, StickyNote, ChevronRight } from 'lucide-react';
import { RichTextEditor, RichTextPreview } from '@/components/RichTextEditor';
import { useStudy } from '@/context/StudyContext';
import { useLocation } from 'wouter';

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: 'bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border-2 border-border bg-transparent hover:bg-secondary/50',
      ghost: 'bg-transparent hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
      danger: 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground',
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: string }>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        <input
          ref={ref}
          className={cn(
            "flex h-12 w-full rounded-xl border border-border bg-card px-4 py-2 text-sm text-foreground transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 shadow-sm",
            error && "border-destructive focus-visible:ring-destructive/20",
            className
          )}
          {...props}
        />
        {error && <span className="text-xs text-destructive px-1">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Modal = ({
  isOpen, onClose, title, children, icon: Icon, align = 'center'
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  icon?: any;
  align?: 'center' | 'bottom';
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Transparent click-outside overlay — no dark background on full screen */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 max-w-md mx-auto"
            style={{ cursor: 'default' }}
          />

          {/* Modal sheet container */}
          <div className={cn(
            "fixed inset-0 z-50 max-w-md mx-auto pointer-events-none flex",
            align === 'bottom' ? 'items-end' : 'items-center justify-center p-4'
          )}>
            <motion.div
              initial={align === 'bottom' ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
              animate={align === 'bottom' ? { y: 0 } : { opacity: 1, scale: 1 }}
              exit={align === 'bottom' ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={cn(
                "w-full bg-card pointer-events-auto flex flex-col overflow-hidden",
                align === 'bottom'
                  ? "rounded-t-3xl pb-8 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] border-t border-x border-border/60"
                  : "rounded-3xl max-h-[85vh] shadow-2xl border border-border/60"
              )}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-border/50">
                <div className="flex items-center gap-3">
                  {Icon && <div className="p-2 bg-primary/10 rounded-full text-primary"><Icon size={20} /></div>}
                  <h2 className="text-lg font-bold text-foreground">{title}</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto no-scrollbar">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Note Page Preview Modal ──────────────────────────────────────────────────
export const NotePagePreviewModal = ({
  isOpen, onClose, noteId, noteTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
}) => {
  const { loadNotePage } = useStudy();
  const [, setLocation] = useLocation();
  const [note, setNote] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || !noteId) return;
    setLoading(true);
    setNote(null);
    loadNotePage(noteId).then(p => {
      setNote(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, noteId]);

  const textEls = (note?.elements ?? []).filter((e: any) => e.type === 'text' && e.text?.trim());
  const linkEls = (note?.elements ?? []).filter((e: any) => e.type === 'link' && e.href);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={noteTitle || 'Note Page'} icon={FileText}>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !note ? (
        <p className="text-muted-foreground text-sm py-6 text-center">Note not found.</p>
      ) : (
        <div className="space-y-4">
          {textEls.length === 0 && linkEls.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">This note page has no text content yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {textEls.map((el: any) => (
                <p
                  key={el.id}
                  className="text-sm text-foreground"
                  style={{
                    fontWeight: el.fontWeight ?? undefined,
                    fontStyle: el.fontStyle ?? undefined,
                    textAlign: (el.align ?? 'left') as any,
                  }}
                >
                  {el.text}
                </p>
              ))}
              {linkEls.map((el: any) => (
                <a
                  key={el.id}
                  href={el.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-primary underline break-all"
                >
                  {el.text || el.href}
                </a>
              ))}
            </div>
          )}
          <div className="pt-2 border-t border-border/40">
            <Button
              className="w-full"
              onClick={() => { onClose(); setLocation(`/notes/${noteId}`); }}
            >
              <ExternalLink size={14} className="mr-2" />
              Open Full Note
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Helper: build ancestor breadcrumb titles for an item path ───────────────
function buildItemBreadcrumb(subjects: any[], path: any): string[] {
  const crumbs: string[] = [];
  const s = subjects.find((x: any) => x.id === path.subjectId);
  if (!s) return crumbs;
  crumbs.push(s.title);
  if (path.level === 'subject') return crumbs.slice(0, -1); // item IS the subject

  const c = s.chapters?.find((x: any) => x.id === path.chapterId);
  if (!c) return crumbs;
  crumbs.push(c.title);
  if (path.level === 'chapter') return crumbs.slice(0, -1);

  const t = c.topics?.find((x: any) => x.id === path.topicId);
  if (!t) return crumbs;
  crumbs.push(t.title);
  if (path.level === 'topic') return crumbs.slice(0, -1);

  const st = t.subtopics?.find((x: any) => x.id === path.subtopicId);
  if (!st) return crumbs;
  crumbs.push(st.title);
  if (path.level === 'subtopic') return crumbs.slice(0, -1);

  const co = st.concepts?.find((x: any) => x.id === path.conceptId);
  if (!co) return crumbs;
  crumbs.push(co.title);
  if (path.level === 'concept') return crumbs.slice(0, -1);

  return crumbs; // point — show all ancestors
}

// ─── Helper: walk subjects tree and extract a specific item's note ────────────
function findItemNoteHtml(subjects: any[], path: any): string {
  const s = subjects.find((x: any) => x.id === path.subjectId);
  if (!s) return '';
  if (path.level === 'subject') return s.note || '';
  const c = s.chapters?.find((x: any) => x.id === path.chapterId);
  if (!c) return '';
  if (path.level === 'chapter') return c.note || '';
  const t = c.topics?.find((x: any) => x.id === path.topicId);
  if (!t) return '';
  if (path.level === 'topic') return t.note || '';
  const st = t.subtopics?.find((x: any) => x.id === path.subtopicId);
  if (!st) return '';
  if (path.level === 'subtopic') return st.note || '';
  const co = st.concepts?.find((x: any) => x.id === path.conceptId);
  if (!co) return '';
  if (path.level === 'concept') return co.note || '';
  const pt = co.points?.find((x: any) => x.id === path.pointId);
  return pt?.note || '';
}

// ─── Note Editor Modal (Rich Text — expand to A4 full-screen) ────────────────
export const NoteEditorModal = ({
  isOpen, onClose, value, onChange, onClear, onSave,
  title, placeholder, clearLabel, saveLabel, icon: Icon, breadcrumb,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  onSave: () => void;
  title: string;
  placeholder?: string;
  clearLabel: string;
  saveLabel: string;
  icon?: any;
  breadcrumb?: string[];
}) => {
  const { setNote, subjects } = useStudy();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  // Note-ref preview state (for clicking note links inside the preview)
  const [notePreview, setNotePreview] = React.useState<{
    id: string; title: string; html?: string; itemPath?: any; breadcrumb?: string[];
  } | null>(null);

  // Reset both states when modal closes
  React.useEffect(() => {
    if (!isOpen) { setExpanded(false); setEditing(false); setNotePreview(null); }
  }, [isOpen]);

  const handleNoteRef = (noteId: string, noteTitle: string, noteHtml?: string, itemPath?: any) => {
    if (itemPath) {
      // Item note — fetch latest from study context, open with edit + breadcrumb
      const currentHtml = findItemNoteHtml(subjects, itemPath) || (noteHtml ?? '');
      const crumbs = buildItemBreadcrumb(subjects, itemPath);
      setNotePreview({ id: '__item__', title: noteTitle, html: currentHtml, itemPath, breadcrumb: crumbs });
    } else if (noteId && noteId !== '__item__') {
      // A4 note page — navigate to full editor and close this modal
      onClose();
      setLocation('/notes/' + noteId);
    }
  };

  // Shared header action buttons (pencil/eye + expand/minimize + close)
  const HeaderActions = ({ isExpanded }: { isExpanded: boolean }) => (
    <div className="flex items-center gap-1 shrink-0">
      {/* Toggle edit / view */}
      <button
        onClick={() => setEditing(e => !e)}
        className={cn(
          "p-2 rounded-full transition-colors",
          editing
            ? "text-primary bg-primary/10 hover:bg-primary/20"
            : "text-muted-foreground hover:bg-secondary"
        )}
        title={editing ? "Switch to view mode" : "Edit note"}
      >
        {editing ? <Eye size={18} /> : <Pencil size={16} />}
      </button>

      {/* Expand / Minimize */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
        title={isExpanded ? "Minimize" : "Expand to full screen"}
      >
        {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
      </button>

      {/* Close */}
      <button
        onClick={onClose}
        className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
      >
        <X size={20} />
      </button>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: expanded ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={expanded ? onClose : undefined}
              className={cn(
                "fixed inset-0 z-50 transition-colors",
                expanded ? "bg-black/50" : "pointer-events-none"
              )}
            />

            <AnimatePresence mode="wait">
              {expanded ? (
                /* ── A4 full-screen expanded view ── */
                <motion.div
                  key="expanded"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 pointer-events-none"
                >
                  <div
                    className="w-full max-w-[794px] bg-card rounded-3xl shadow-2xl border border-border/60 flex flex-col pointer-events-auto overflow-hidden"
                    style={{ height: 'min(90vh, 1123px)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 shrink-0">
                      {Icon && <div className="p-2 bg-primary/10 rounded-full text-primary shrink-0"><Icon size={20} /></div>}
                      <div className="flex-1 min-w-0">
                        {breadcrumb && breadcrumb.length > 0 && (
                          <div className="flex items-center flex-wrap gap-0.5 mb-0.5">
                            {breadcrumb.map((crumb, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <ChevronRight size={10} className="text-muted-foreground/60 shrink-0" />}
                                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{crumb}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        <h2 className="text-lg font-bold text-foreground truncate">{title}</h2>
                      </div>
                      <HeaderActions isExpanded={true} />
                    </div>

                    {/* Body */}
                    <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden min-h-0">
                      {editing ? (
                        <>
                          <RichTextEditor
                            value={value}
                            onChange={onChange}
                            placeholder={placeholder}
                            className="flex-1 min-h-0"
                            autoFocus
                          />
                          <div className="flex gap-2 shrink-0">
                            <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={onClear}>{clearLabel}</Button>
                            <Button className="flex-1" onClick={onSave}>{saveLabel}</Button>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 overflow-y-auto">
                          {value ? (
                            <RichTextPreview html={value} className="text-base leading-relaxed" onNoteRef={handleNoteRef} />
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                              <Pencil size={32} className="opacity-30" />
                              <p className="text-sm">{placeholder ?? 'No note yet. Click the pencil to add one.'}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* ── Compact bottom sheet ── */
                <motion.div
                  key="compact"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-card rounded-t-3xl pb-8 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] border-t border-x border-border/60 pointer-events-auto"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {Icon && <div className="p-2 bg-primary/10 rounded-full text-primary shrink-0"><Icon size={20} /></div>}
                      <div className="min-w-0">
                        {breadcrumb && breadcrumb.length > 0 && (
                          <div className="flex items-center flex-wrap gap-0.5 mb-0.5">
                            {breadcrumb.map((crumb, i) => (
                              <React.Fragment key={i}>
                                {i > 0 && <ChevronRight size={10} className="text-muted-foreground/60 shrink-0" />}
                                <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{crumb}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        <h2 className="text-lg font-bold text-foreground truncate">{title}</h2>
                      </div>
                    </div>
                    <div className="-mr-2 shrink-0">
                      <HeaderActions isExpanded={false} />
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-6 space-y-4">
                    {editing ? (
                      <>
                        <RichTextEditor
                          value={value}
                          onChange={onChange}
                          placeholder={placeholder}
                          minHeight="7rem"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button variant="ghost" className="flex-1 text-muted-foreground" onClick={onClear}>{clearLabel}</Button>
                          <Button className="flex-1" onClick={onSave}>{saveLabel}</Button>
                        </div>
                      </>
                    ) : (
                      <div className="min-h-[7rem]">
                        {value ? (
                          <RichTextPreview html={value} className="text-sm leading-relaxed" onNoteRef={handleNoteRef} />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-28 gap-2 text-muted-foreground">
                            <Pencil size={24} className="opacity-30" />
                            <p className="text-xs">{placeholder ?? 'No note yet. Tap to add one.'}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>

      {/* Item note ref — full NoteEditorModal with edit+save+breadcrumb */}
      {notePreview?.itemPath && (
        <NoteEditorModal
          isOpen={!!notePreview}
          onClose={() => setNotePreview(null)}
          title={notePreview.title}
          icon={StickyNote}
          breadcrumb={notePreview.breadcrumb}
          value={notePreview.html ?? ''}
          onChange={(v) => setNotePreview(p => p ? { ...p, html: v } : null)}
          onClear={() => setNotePreview(p => p ? { ...p, html: '' } : null)}
          onSave={() => {
            if (notePreview?.itemPath) setNote(notePreview.itemPath as any, notePreview.html ?? '');
            setNotePreview(null);
          }}
          placeholder="No note yet."
          clearLabel="Clear"
          saveLabel="Save"
        />
      )}
    </>
  );
};

export const ConfirmModal = ({
  isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel", isDanger = false
}: any) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} align="center">
      <p className="text-muted-foreground mb-8 leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose}>{cancelText}</Button>
        <Button variant={isDanger ? "danger" : "primary"} className="flex-1" onClick={() => { onConfirm(); onClose(); }}>{confirmText}</Button>
      </div>
    </Modal>
  );
};
