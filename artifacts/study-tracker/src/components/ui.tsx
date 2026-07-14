import React from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, Pencil, Eye, FileText, ExternalLink, StickyNote, ChevronRight, FileDown, Search, ChevronUp, ChevronDown, Copy, CheckCheck } from 'lucide-react';
import { RichTextEditor, RichTextPreview } from '@/components/RichTextEditor';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { useLocation } from 'wouter';

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' }>(
  ({ className, variant = 'primary', style, ...props }, ref) => {
    const variants = {
      primary: 'text-white shadow-lg hover:opacity-90 hover:shadow-xl',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      outline: 'border-2 border-border bg-transparent hover:bg-secondary/50',
      ghost: 'bg-transparent hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
      danger: 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground',
    };
    const gradientStyle = variant === 'primary'
      ? { background: 'linear-gradient(135deg, hsl(243 88% 62%) 0%, hsl(263 80% 58%) 100%)', ...style }
      : style;
    return (
      <button
        ref={ref}
        style={gradientStyle}
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
                "w-full pointer-events-auto",
                align === 'bottom'
                  ? "rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
                  : "rounded-3xl shadow-2xl p-[1.5px]"
              )}
              style={align !== 'bottom' ? {
                background: 'linear-gradient(135deg, hsl(243 88% 62%), hsl(263 80% 58%), hsl(326 80% 58%))'
              } : undefined}
              onClick={e => e.stopPropagation()}
            >
              <div className={cn(
                "w-full bg-card flex flex-col overflow-hidden",
                align === 'bottom'
                  ? "rounded-t-3xl pb-8 border-t-[2px] border-x-[2px] border-indigo-500/70"
                  : "rounded-[calc(1.5rem-1.5px)] max-h-[85vh]"
              )}>
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

// Returns the title of the item itself (not its ancestors)
function getItemOwnTitle(subjects: any[], path: any): string {
  const s = subjects.find((x: any) => x.id === path.subjectId);
  if (!s) return '';
  if (path.level === 'subject') return s.title;
  const c = s.chapters?.find((x: any) => x.id === path.chapterId);
  if (!c) return '';
  if (path.level === 'chapter') return c.title;
  const t = c.topics?.find((x: any) => x.id === path.topicId);
  if (!t) return '';
  if (path.level === 'topic') return t.title;
  const st = t.subtopics?.find((x: any) => x.id === path.subtopicId);
  if (!st) return '';
  if (path.level === 'subtopic') return st.title;
  const co = st.concepts?.find((x: any) => x.id === path.conceptId);
  if (!co) return '';
  if (path.level === 'concept') return co.title;
  const pt = co.points?.find((x: any) => x.id === path.pointId);
  return pt?.title || '';
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

// ─── Find-in-note search bar (highlights + scrolls to matches) ───────────────
function SearchBar({
  searchQuery, setSearchQuery, matchCount, matchIdx, goNextMatch, goPrevMatch, closeSearch,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  matchCount: number;
  matchIdx: number;
  goNextMatch: () => void;
  goPrevMatch: () => void;
  closeSearch: () => void;
}) {
  const { t } = useLang();
  return (
    <div className="bg-card/95 backdrop-blur border-b border-border/50 px-4 py-2 flex items-center gap-2 shrink-0">
      <Search size={14} className="text-muted-foreground shrink-0" />
      <input
        autoFocus
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') closeSearch();
          if (e.key === 'Enter') { e.shiftKey ? goPrevMatch() : goNextMatch(); }
        }}
        placeholder={t('findInNote')}
        className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground min-w-0"
      />
      {matchCount > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{matchIdx + 1} / {matchCount}</span>
      )}
      {searchQuery.trim() && matchCount === 0 && (
        <span className="text-xs text-rose-500 whitespace-nowrap">{t('noSearchResults')}</span>
      )}
      <button onClick={goPrevMatch} disabled={matchCount === 0} className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-40" title="Previous (Shift+Enter)">
        <ChevronUp size={14} />
      </button>
      <button onClick={goNextMatch} disabled={matchCount === 0} className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-40" title="Next (Enter)">
        <ChevronDown size={14} />
      </button>
      <button onClick={closeSearch} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="Close (Esc)">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Note Editor Modal (Rich Text — expand to A4 full-screen) ────────────────
export const NoteEditorModal = ({
  isOpen, onClose, value, onChange, onClear, onSave,
  title, placeholder, clearLabel, saveLabel, icon: Icon, breadcrumb, notePath, copyAllowed,
  downloadAllowed, editAllowed,
  pdfUserEmail, pdfIsAdmin, pdfIsShared, pdfWhatsApp, pdfWebsite,
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
  /** When provided, the PDF download uses the actual item title instead of the generic modal title */
  notePath?: any;
  /** When false, the copy button is hidden (used for shared content permission enforcement) */
  copyAllowed?: boolean;
  /** When false, the download-as-PDF button is hidden (shared content permission enforcement) */
  downloadAllowed?: boolean;
  /** When false, the edit/pencil button is hidden (shared content permission enforcement) */
  editAllowed?: boolean;
  // PDF footer context — determines what appears at the bottom of downloaded PDFs
  pdfUserEmail?: string;
  pdfIsAdmin?: boolean;
  pdfIsShared?: boolean;
  pdfWhatsApp?: string;
  pdfWebsite?: string;
}) => {
  const { setNote, subjects } = useStudy();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Find-in-note search (highlights matches inside the rendered preview and
  // auto-scrolls to them, like Ctrl+F in a PDF viewer)
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [matchCount, setMatchCount] = React.useState(0);
  const [matchIdx, setMatchIdx] = React.useState(0);
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const marksRef = React.useRef<HTMLElement[]>([]);

  const clearHighlights = React.useCallback(() => {
    // Unwrap any highlight marks still attached to a live DOM tree — whether
    // that's the current previewContainerRef or a now-detached preview from
    // a previous render (e.g. after switching to edit mode). Always drop
    // marksRef afterwards so detached nodes are never held onto.
    marksRef.current.forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    });
    const container = previewContainerRef.current;
    if (container) {
      container.querySelectorAll('mark.search-hl').forEach(mark => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      });
    }
    marksRef.current = [];
  }, []);

  const runHighlight = React.useCallback((query: string) => {
    const container = previewContainerRef.current;
    clearHighlights();
    if (!container || !query.trim()) { setMatchCount(0); setMatchIdx(0); return; }
    const q = query.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);
    const marks: HTMLElement[] = [];
    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const lower = text.toLowerCase();
      if (!lower.includes(q)) return;
      const frag = document.createDocumentFragment();
      let cursor = 0;
      let pos = lower.indexOf(q);
      while (pos !== -1) {
        frag.appendChild(document.createTextNode(text.slice(cursor, pos)));
        const mark = document.createElement('mark');
        mark.className = 'search-hl';
        mark.textContent = text.slice(pos, pos + q.length);
        frag.appendChild(mark);
        marks.push(mark);
        cursor = pos + q.length;
        pos = lower.indexOf(q, cursor);
      }
      frag.appendChild(document.createTextNode(text.slice(cursor)));
      textNode.parentNode?.replaceChild(frag, textNode);
    });
    marksRef.current = marks;
    setMatchCount(marks.length);
    setMatchIdx(0);
  }, [clearHighlights]);

  // Re-run search whenever the query changes or the preview becomes visible
  React.useEffect(() => {
    if (!searchOpen || editing) return;
    const timer = window.setTimeout(() => runHighlight(searchQuery), 30);
    return () => window.clearTimeout(timer);
  }, [searchOpen, editing, searchQuery, value, expanded, runHighlight]);

  // Highlight the active match and scroll it into view
  React.useEffect(() => {
    marksRef.current.forEach((mark, i) => mark.classList.toggle('search-hl-active', i === matchIdx));
    const current = marksRef.current[matchIdx];
    if (current) current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchIdx, matchCount]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    clearHighlights();
    setMatchCount(0);
    setMatchIdx(0);
  };
  const goNextMatch = () => setMatchIdx(i => matchCount === 0 ? 0 : (i + 1) % matchCount);
  const goPrevMatch = () => setMatchIdx(i => matchCount === 0 ? 0 : (i - 1 + matchCount) % matchCount);

  // Resolve the display title: prefer the actual item name from the subjects tree
  // when notePath is available, so the modal header shows "Chapter X" not "Edit note".
  const displayTitle = React.useMemo(() => {
    if (!notePath) return title;
    const itemTitle = getItemOwnTitle(subjects, notePath);
    return itemTitle || title;
  }, [notePath, subjects, title]);

  // Note-ref preview state (for clicking note links inside the preview)
  const [notePreview, setNotePreview] = React.useState<{
    id: string; title: string; html?: string; itemPath?: any; breadcrumb?: string[];
  } | null>(null);

  // Reset both states when modal closes
  React.useEffect(() => {
    if (!isOpen) { setExpanded(false); setEditing(false); setNotePreview(null); closeSearch(); }
  }, [isOpen]); // eslint-disable-line

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

  const handleDownloadPdf = () => {
    const safeTitle = displayTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const now = new Date();
    const safeDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ', ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // Build dynamic PDF footer based on who is downloading and whether note is shared
    const safeWebsite = (pdfWebsite || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const websiteSpan = safeWebsite
      ? `<span>🌐 Website : <a href="${safeWebsite}">${safeWebsite}</a></span>`
      : '';
    let footerInner: string;
    if (pdfIsAdmin) {
      // Admin downloading any note
      footerInner = `<span>📝 Created by : StudyTrack team</span>`
        + (pdfWhatsApp ? `<span>💬 WhatsApp : ${pdfWhatsApp}</span>` : '')
        + websiteSpan;
    } else if (pdfIsShared) {
      // Normal user downloading an admin-shared note
      footerInner = `<span>📝 Created by : StudyTrack team</span>`
        + (pdfWhatsApp ? `<span>💬 WhatsApp : ${pdfWhatsApp}</span>` : '')
        + websiteSpan
        + (pdfUserEmail ? `<span>🖨️ Printed by : ${pdfUserEmail}</span>` : '');
    } else {
      // Normal user downloading their own note
      footerInner = `<span>📝 Created by : ${pdfUserEmail || 'StudyTrack team'}</span>`
        + websiteSpan;
    }
    if (!footerInner.trim()) footerInner = `<span>📝 Created by : StudyTrack team</span>`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <style>
    /* Force all background colours and text colours to print — essential for
       highlights (Tiptap <mark style="background-color:…">) and coloured text
       (<span style="color:…">) to appear correctly in the saved PDF. */
    /* margin:0 suppresses ALL browser-native headers/footers (date, URL, page#, title).
       thead/tfoot table trick makes header+footer repeat natively on every printed page
       without content ever overlapping them. */
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important; }
    html, body { width: 100%; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; }

    /* ── Layout table ── */
    table.pdf-layout { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tbody { display: table-row-group; }

    /* ── Header cell ── */
    .pdf-header-cell {
      height: 44px;
      vertical-align: middle;
      font-size: 12px;
      font-family: sans-serif;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      padding: 0 48px;
    }
    /* Spacer row inside thead — repeats on every page, adds gap between header border and content */
    .pdf-header-spacer { height: 24px; background: #fff; }
    .pdf-header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 100%;
    }
    .pdf-header-date {
      color: #6b7280;
      font-weight: 400;
    }
    .pdf-header-title {
      color: #374151;
      font-weight: 600;
      text-align: right;
    }

    /* ── Footer cell ── */
    .pdf-footer-cell {
      height: 44px;
      vertical-align: middle;
      font-size: 12px;
      color: #6b7280;
      font-family: sans-serif;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .pdf-footer-inner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      height: 100%;
    }
    .pdf-footer-inner span { display: flex; align-items: center; gap: 5px; }

    /* ── Content cell ── */
    .pdf-content-cell { padding: 36px 48px 28px; }

    /* ── Content typography ── */
    h1 { font-size: 22px; font-weight: bold; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; }
    p { margin-bottom: 10px; line-height: 1.7; font-size: 14px; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    u { text-decoration: underline; }
    s { text-decoration: line-through; }
    ul, ol { padding-left: 22px; margin-bottom: 10px; }
    li { margin-bottom: 4px; font-size: 14px; line-height: 1.6; }
    h2 { font-size: 18px; font-weight: bold; margin: 20px 0 10px; }
    h3 { font-size: 16px; font-weight: bold; margin: 16px 0 8px; }
    a { color: #2563eb; text-decoration: underline; }
    /* content tables — scoped class to avoid conflicting with pdf-layout */
    .pdf-content-cell table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .pdf-content-cell th,
    .pdf-content-cell td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 13px; }
    .pdf-content-cell th { background: #f9fafb; font-weight: bold; }
    blockquote { border-left: 3px solid #d1d5db; padding-left: 14px; color: #6b7280; margin-bottom: 10px; }
    mark { display: inline; border-radius: 2px; padding: 0 1px; }
    span[data-note-id] {
      display: inline;
      color: #4d79f5;
      background: rgba(77, 121, 245, 0.12);
      border: 1px solid rgba(77, 121, 245, 0.28);
      padding: 1px 7px;
      border-radius: 5px;
      font-size: 0.88em;
      font-weight: 500;
      font-family: sans-serif;
    }
  </style>
</head>
<body>
<table class="pdf-layout">
  <thead>
    <tr><td class="pdf-header-cell">
      <div class="pdf-header-inner">
        <span class="pdf-header-date">${safeDate}</span>
        <span class="pdf-header-title">${safeTitle}</span>
      </div>
    </td></tr>
    <tr><td class="pdf-header-spacer"></td></tr>
  </thead>
  <tfoot>
    <tr><td class="pdf-footer-cell">
      <div class="pdf-footer-inner">
        ${footerInner}
      </div>
    </td></tr>
  </tfoot>
  <tbody>
    <tr><td class="pdf-content-cell">
      <h1>${safeTitle}</h1>
      ${value || '<p style="color:#9ca3af">No content yet.</p>'}
    </td></tr>
  </tbody>
</table>
</body>
</html>`;

    // Open a blank window and write HTML directly — avoids blob: URL appearing
    // in the browser's native print footer.
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();

    win.addEventListener('load', () => {
      win.focus();
      setTimeout(() => win.print(), 150);
    });
    // Safety fallback — some browsers fire load before resources settle.
    setTimeout(() => { win.focus(); win.print(); }, 800);
  };

  const handleCopy = React.useCallback(async () => {
    try {
      const htmlBlob = new Blob([value], { type: 'text/html' });
      const plainText = previewContainerRef.current?.innerText || '';
      const plainBlob = new Blob([plainText], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': plainBlob }),
      ]);
    } catch {
      try {
        await navigator.clipboard.writeText(previewContainerRef.current?.innerText || '');
      } catch { /* ignore */ }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  // Shared header action buttons (pencil/eye + expand/minimize + close)
  const HeaderActions = ({ isExpanded }: { isExpanded: boolean }) => (
    <div className="flex items-center gap-1 shrink-0">
      {/* Copy note */}
      {copyAllowed !== false && (
        <button
          onClick={handleCopy}
          className={cn(
            "p-2 rounded-full transition-colors",
            copied
              ? "text-green-600 bg-green-500/10"
              : "text-muted-foreground hover:bg-secondary"
          )}
          title={copied ? "Copied!" : "Copy note"}
        >
          {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
        </button>
      )}

      {/* Download as PDF */}
      {downloadAllowed !== false && (
        <button
          onClick={handleDownloadPdf}
          className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
          title="Download as PDF"
        >
          <FileDown size={16} />
        </button>
      )}

      {/* Find in note */}
      <button
        onClick={() => {
          if (searchOpen) { closeSearch(); return; }
          if (editing) setEditing(false);
          setSearchOpen(true);
        }}
        className={cn(
          "p-2 rounded-full transition-colors",
          searchOpen
            ? "text-primary bg-primary/10 hover:bg-primary/20"
            : "text-muted-foreground hover:bg-secondary"
        )}
        title="Search in note"
      >
        <Search size={16} />
      </button>

      {/* Toggle edit / view */}
      {editAllowed !== false && (
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
      )}

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
              animate={{ opacity: expanded ? 1 : 0.01 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className={cn("fixed inset-0 z-50 transition-colors", expanded ? "bg-black/50" : "")}
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
                        <h2 className="text-lg font-bold text-foreground truncate">{displayTitle}</h2>
                      </div>
                      <HeaderActions isExpanded={true} />
                    </div>

                    {/* Find-in-note bar */}
                    {searchOpen && !editing && (
                      <SearchBar
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        matchCount={matchCount}
                        matchIdx={matchIdx}
                        goNextMatch={goNextMatch}
                        goPrevMatch={goPrevMatch}
                        closeSearch={closeSearch}
                      />
                    )}

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
                        <div className="flex-1 overflow-y-auto" ref={previewContainerRef}>
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
                  className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto bg-card rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)] border-t border-x border-border/60 pointer-events-auto flex flex-col"
                  style={{ maxHeight: '85vh' }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header — always visible, never pushed off-screen */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
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
                        <h2 className="text-lg font-bold text-foreground truncate">{displayTitle}</h2>
                      </div>
                    </div>
                    <div className="-mr-2 shrink-0">
                      <HeaderActions isExpanded={false} />
                    </div>
                  </div>

                  {/* Find-in-note bar */}
                  {searchOpen && !editing && (
                    <SearchBar
                      searchQuery={searchQuery}
                      setSearchQuery={setSearchQuery}
                      matchCount={matchCount}
                      matchIdx={matchIdx}
                      goNextMatch={goNextMatch}
                      goPrevMatch={goPrevMatch}
                      closeSearch={closeSearch}
                    />
                  )}

                  {/* Body — scrollable so header stays visible */}
                  <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-8 space-y-4" ref={editing ? undefined : previewContainerRef}>
                    {editing ? (
                      <>
                        <RichTextEditor
                          value={value}
                          onChange={onChange}
                          placeholder={placeholder}
                          minHeight="7rem"
                          maxHeight="45vh"
                          autoFocus
                        />
                        <div className="flex gap-2 shrink-0">
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
