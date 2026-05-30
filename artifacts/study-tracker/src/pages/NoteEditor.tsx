import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Type, Link as LinkIcon, Image as ImageIcon, FileText, Plus, Minus,
  Trash2, Copy, Check, Bold, Italic, AlignLeft, AlignCenter, AlignRight,
  ZoomIn, ZoomOut, Maximize2, Upload, ExternalLink, Save, X,
  Search, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useStudy, newId } from '@/context/StudyContext';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import type { NotePage, NoteElement, NoteElementType } from '@/lib/types';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { Button, Modal, Input } from '@/components/ui';

// A4 size at 96dpi (CSS pixels)
const A4_W = 794;
const A4_H = 1123;

export function NoteEditor() {
  const [, params] = useRoute('/notes/:id');
  const [, setLocation] = useLocation();
  const { t } = useLang();
  const { user } = useAuth();
  const { loadNotePage, saveNotePage, renameNotePage } = useStudy();

  const [page, setPage] = useState<NotePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  // Find-in-page search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIds, setMatchIds] = useState<string[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<number | null>(null);

  // Load page
  useEffect(() => {
    if (!params?.id) return;
    setLoading(true);
    loadNotePage(params.id).then(p => {
      if (p) {
        setPage(p);
        setTitleDraft(p.title);
      } else {
        setLocation('/notes');
      }
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  // Auto-save (debounced)
  useEffect(() => {
    if (!page || loading) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSavingState('saving');
    saveTimerRef.current = window.setTimeout(async () => {
      await saveNotePage(page);
      setSavingState('saved');
      window.setTimeout(() => setSavingState(s => s === 'saved' ? 'idle' : s), 1200);
    }, 600);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Keep title-rename in sync with index
  const commitTitle = () => {
    if (!page) return;
    const t = titleDraft.trim() || 'Untitled page';
    setPage({ ...page, title: t });
    renameNotePage(page.id, t);
    setTitleEditing(false);
  };

  const updatePage = (mut: (p: NotePage) => NotePage) =>
    setPage(p => p ? mut(p) : p);

  const updateElement = (id: string, patch: Partial<NoteElement>) => {
    updatePage(p => ({ ...p, elements: p.elements.map(e => e.id === id ? { ...e, ...patch } : e) }));
  };

  const addElement = (el: Omit<NoteElement, 'id'>) => {
    const newEl: NoteElement = { ...el, id: newId() };
    updatePage(p => ({ ...p, elements: [...p.elements, newEl] }));
    setSelectedId(newEl.id);
  };

  const removeElement = (id: string) => {
    updatePage(p => ({ ...p, elements: p.elements.filter(e => e.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateElement = (id: string) => {
    if (!page) return;
    const el = page.elements.find(e => e.id === id);
    if (!el) return;
    addElement({ ...el, x: el.x + 20, y: el.y + 20 });
  };

  const bringForward = (id: string) => {
    updatePage(p => {
      const el = p.elements.find(e => e.id === id);
      if (!el) return p;
      const others = p.elements.filter(e => e.id !== id);
      return { ...p, elements: [...others, el] };
    });
  };
  const sendBack = (id: string) => {
    updatePage(p => {
      const el = p.elements.find(e => e.id === id);
      if (!el) return p;
      const others = p.elements.filter(e => e.id !== id);
      return { ...p, elements: [el, ...others] };
    });
  };

  const addPage = () => updatePage(p => ({ ...p, pageCount: p.pageCount + 1 }));
  const removePage = () => updatePage(p => {
    if (p.pageCount <= 1) return p;
    // Remove elements that lie entirely within last page
    const cutoff = (p.pageCount - 1) * A4_H;
    const kept = p.elements.filter(e => e.y < cutoff);
    return { ...p, pageCount: p.pageCount - 1, elements: kept };
  });

  // ─── Add helpers ───────────────────────────────────────────────────────
  const addText = () => addElement({
    type: 'text', x: 60, y: 60, width: 320, height: 60,
    text: 'Type here…', fontSize: 16, fontWeight: 'normal', fontStyle: 'normal',
    color: '#111827', align: 'left',
  });

  const openAddLink = () => { setLinkUrl('https://'); setLinkLabel(''); setLinkModalOpen(true); };
  const submitLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    addElement({
      type: 'link', x: 60, y: 60, width: 240, height: 36,
      href: url, text: linkLabel.trim() || url, fontSize: 14, color: '#2563eb',
    });
    setLinkModalOpen(false);
  };

  const openAddPdf = () => { setPdfUrl(''); setPdfModalOpen(true); };
  const submitPdfUrl = () => {
    const url = pdfUrl.trim();
    if (!url) return;
    addElement({
      type: 'pdf', x: 60, y: 60, width: 480, height: 600, src: url,
    });
    setPdfModalOpen(false);
  };

  // ─── File uploads (image / pdf) ────────────────────────────────────────
  const uploadToStorage = async (file: File, kind: 'image' | 'pdf'): Promise<string> => {
    if (!user) throw new Error('Not signed in');
    const path = `users/${user.id}/notes/${page?.id ?? 'page'}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    try {
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      return await getDownloadURL(ref);
    } catch {
      // Fallback: data URL (works fully offline; image inlined into doc)
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
    }
  };

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    // Get natural dimensions
    const url = await uploadToStorage(file, 'image');
    const img = new window.Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      let w = Math.min(360, img.width);
      let h = w / ratio;
      addElement({ type: 'image', x: 60, y: 60, width: w, height: h, src: url });
    };
    img.onerror = () => addElement({ type: 'image', x: 60, y: 60, width: 240, height: 180, src: url });
    img.src = url;
  };

  const handlePdfFile = async (file: File) => {
    if (file.type !== 'application/pdf') return;
    const url = await uploadToStorage(file, 'pdf');
    addElement({ type: 'pdf', x: 60, y: 60, width: 480, height: 600, src: url });
  };

  // Paste image (Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      // If user is typing in an input/textarea/contentEditable, ignore
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Keyboard delete for selected element (when not editing text inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        removeElement(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Open find-in-page with Ctrl/Cmd+F
  useEffect(() => {
    const onFind = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(s => { if (!s) setSearchQuery(''); return !s; });
      }
    };
    window.addEventListener('keydown', onFind);
    return () => window.removeEventListener('keydown', onFind);
  }, []);

  // Pre-populate search if navigated here from Global Search
  useEffect(() => {
    const stored = sessionStorage.getItem('study_nav_target');
    if (!stored) return;
    try {
      const nav = JSON.parse(stored);
      if (nav.kind === 'notePage' && nav.query) {
        sessionStorage.removeItem('study_nav_target');
        setTimeout(() => { setSearchOpen(true); setSearchQuery(nav.query); }, 300);
      }
    } catch {}
  }, []); // eslint-disable-line

  // Compute match element IDs when query changes
  useEffect(() => {
    if (!searchQuery.trim() || !page) { setMatchIds([]); setMatchIdx(0); return; }
    const q = searchQuery.toLowerCase();
    const ids = page.elements
      .filter(el => el.type === 'text' && el.text?.toLowerCase().includes(q))
      .map(el => el.id);
    setMatchIds(ids);
    setMatchIdx(0);
  }, [searchQuery, page]);

  // Scroll canvas to current match
  useEffect(() => {
    if (!page || matchIds.length === 0 || !scrollContainerRef.current) return;
    const el = page.elements.find(e => e.id === matchIds[matchIdx]);
    if (!el) return;
    const scrollY = el.y * zoom;
    scrollContainerRef.current.scrollTo({ top: Math.max(0, scrollY - 120), behavior: 'smooth' });
  }, [matchIdx, matchIds]); // eslint-disable-line

  const goNextMatch = () => setMatchIdx(i => matchIds.length === 0 ? 0 : (i + 1) % matchIds.length);
  const goPrevMatch = () => setMatchIdx(i => matchIds.length === 0 ? 0 : (i - 1 + matchIds.length) % matchIds.length);

  if (loading || !page) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalH = page.pageCount * A4_H;
  const selected = page.elements.find(e => e.id === selectedId) || null;

  return (
    <div className="min-h-[100dvh] bg-secondary/40 flex flex-col">
      {/* ─── Top bar ─── */}
      <header className="sticky top-0 z-30 bg-card border-b border-border/60 px-3 py-2 flex items-center gap-2 shadow-sm">
        <button
          onClick={() => setLocation('/notes')}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
          aria-label={t('pageBack')}
        >
          <ArrowLeft size={18} />
        </button>

        {titleEditing ? (
          <div className="flex-1 flex items-center gap-1">
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') { setTitleDraft(page.title); setTitleEditing(false); }
              }}
              className="flex-1 max-w-md px-2 py-1 rounded-lg border border-border bg-background text-sm font-bold"
            />
            <button onClick={commitTitle} className="text-primary"><Check size={16} /></button>
            <button onClick={() => { setTitleDraft(page.title); setTitleEditing(false); }} className="text-muted-foreground"><X size={16} /></button>
          </div>
        ) : (
          <button
            onClick={() => setTitleEditing(true)}
            className="flex-1 text-left text-sm font-bold text-foreground truncate px-2 py-1 rounded-lg hover:bg-secondary/40"
          >
            {page.title}
          </button>
        )}

        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          {savingState === 'saving' && <><Save size={11} className="animate-pulse" /> {t('pageSaving')}</>}
          {savingState === 'saved' && <><Check size={11} className="text-green-600" /> {t('pageSaved')}</>}
        </span>
      </header>

      {/* ─── Toolbar ─── */}
      <div className="sticky top-[49px] z-20 bg-card/95 backdrop-blur border-b border-border/60 px-2 py-2 flex flex-wrap items-center gap-1 shadow-sm">
        <ToolBtn onClick={addText} icon={<Type size={14} />} label={t('addText')} />
        <ToolBtn onClick={openAddLink} icon={<LinkIcon size={14} />} label={t('addLink')} />
        <ToolBtn onClick={() => fileInputRef.current?.click()} icon={<ImageIcon size={14} />} label={t('addImage')} />
        <ToolBtn onClick={openAddPdf} icon={<FileText size={14} />} label={t('addPdf')} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            e.target.value = '';
          }}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handlePdfFile(file);
            e.target.value = '';
          }}
        />

        <div className="mx-1 w-px h-5 bg-border/60" />

        <ToolBtn onClick={addPage} icon={<Plus size={13} />} label={t('addPage')} />
        <ToolBtn onClick={removePage} icon={<Minus size={13} />} label={t('removePage')} disabled={page.pageCount <= 1} />

        <div className="mx-1 w-px h-5 bg-border/60" />

        <button
          onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
          aria-label="zoom out"
        ><ZoomOut size={14} /></button>
        <span className="text-[11px] font-bold text-foreground min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(2)))}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
          aria-label="zoom in"
        ><ZoomIn size={14} /></button>
        <button
          onClick={() => setZoom(1)}
          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
          aria-label="fit"
        ><Maximize2 size={13} /></button>
      </div>

      {/* ─── Selected element toolbar ─── */}
      {selected && (
        <div className="sticky top-[97px] z-20 bg-primary/5 backdrop-blur border-b border-border/40 px-2 py-1.5 flex flex-wrap items-center gap-1 text-xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground mr-1">{selected.type}</span>

          {selected.type === 'text' && (
            <>
              <input
                type="number"
                value={selected.fontSize ?? 16}
                onChange={e => updateElement(selected.id, { fontSize: parseInt(e.target.value) || 16 })}
                className="w-14 px-1.5 py-1 rounded-md border border-border bg-background text-[11px]"
                title={t('fontSize')}
                min={8}
                max={120}
              />
              <button
                onClick={() => updateElement(selected.id, { fontWeight: selected.fontWeight === 'bold' ? 'normal' : 'bold' })}
                className={`p-1.5 rounded-md ${selected.fontWeight === 'bold' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                title={t('bold')}
              ><Bold size={12} /></button>
              <button
                onClick={() => updateElement(selected.id, { fontStyle: selected.fontStyle === 'italic' ? 'normal' : 'italic' })}
                className={`p-1.5 rounded-md ${selected.fontStyle === 'italic' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                title={t('italic')}
              ><Italic size={12} /></button>
              <input
                type="color"
                value={selected.color || '#111827'}
                onChange={e => updateElement(selected.id, { color: e.target.value })}
                className="w-7 h-7 rounded-md border border-border cursor-pointer"
                title={t('color')}
              />
              {(['left', 'center', 'right'] as const).map(a => {
                const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    onClick={() => updateElement(selected.id, { align: a })}
                    className={`p-1.5 rounded-md ${(selected.align ?? 'left') === a ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                  ><Icon size={12} /></button>
                );
              })}
            </>
          )}

          {selected.type === 'link' && (
            <>
              <input
                type="text"
                placeholder={t('elementText')}
                value={selected.text ?? ''}
                onChange={e => updateElement(selected.id, { text: e.target.value })}
                className="px-2 py-1 rounded-md border border-border bg-background text-[11px] min-w-[120px]"
              />
              <input
                type="url"
                placeholder={t('elementLink')}
                value={selected.href ?? ''}
                onChange={e => updateElement(selected.id, { href: e.target.value })}
                className="px-2 py-1 rounded-md border border-border bg-background text-[11px] flex-1 min-w-[160px]"
              />
            </>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => bringForward(selected.id)}
              className="px-2 py-1 rounded-md hover:bg-secondary text-[10px]"
              title={t('bringToFront')}
            >↑</button>
            <button
              onClick={() => sendBack(selected.id)}
              className="px-2 py-1 rounded-md hover:bg-secondary text-[10px]"
              title={t('sendToBack')}
            >↓</button>
            <button
              onClick={() => duplicateElement(selected.id)}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              title={t('duplicateElement')}
            ><Copy size={12} /></button>
            <button
              onClick={() => removeElement(selected.id)}
              className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-600"
              title={t('deleteElement')}
            ><Trash2 size={12} /></button>
          </div>
        </div>
      )}

      {/* ─── Find-in-page bar ─── */}
      {searchOpen && (
        <div className="sticky top-[97px] z-30 bg-card/95 backdrop-blur border-b border-border/60 px-3 py-2 flex items-center gap-2 shadow-sm">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setMatchIds([]); }
              if (e.key === 'Enter') { e.shiftKey ? goPrevMatch() : goNextMatch(); }
            }}
            placeholder="Find in page…"
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
          {matchIds.length > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">{matchIdx + 1} / {matchIds.length}</span>
          )}
          {searchQuery.trim() && matchIds.length === 0 && (
            <span className="text-xs text-rose-500 whitespace-nowrap">No results</span>
          )}
          <button onClick={goPrevMatch} disabled={matchIds.length === 0} className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-40" title="Previous (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button onClick={goNextMatch} disabled={matchIds.length === 0} className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-40" title="Next (Enter)">
            <ChevronDown size={14} />
          </button>
          <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setMatchIds([]); setMatchIdx(0); }} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="Close (Esc)">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Canvas area ─── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-4 flex justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
      >
        <div
          ref={canvasRef}
          className="relative bg-white shadow-xl select-none"
          style={{
            width: A4_W,
            height: totalH,
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            marginBottom: (zoom - 1) * totalH, // compensate scale offset
          }}
          onClick={() => setSelectedId(null)}
        >
          {/* Page break dividers */}
          {Array.from({ length: page.pageCount - 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t-2 border-dashed border-border/60 pointer-events-none"
              style={{ top: (i + 1) * A4_H }}
            >
              <span className="absolute -top-2.5 right-2 px-1.5 py-0.5 rounded-full bg-card text-[8px] font-bold text-muted-foreground border border-border">
                Page {i + 2}
              </span>
            </div>
          ))}

          {/* Elements */}
          {page.elements.map(el => (
            <ElementBox
              key={el.id}
              element={el}
              isSelected={selectedId === el.id}
              isSearchMatch={matchIds.includes(el.id)}
              isCurrentMatch={matchIds[matchIdx] === el.id}
              canvasW={A4_W}
              canvasH={totalH}
              onSelect={(id) => setSelectedId(id)}
              onPatch={(patch) => updateElement(el.id, patch)}
            />
          ))}

          {page.elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-xs text-muted-foreground">{t('pasteImageHint')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Link modal ─── */}
      <Modal isOpen={linkModalOpen} onClose={() => setLinkModalOpen(false)} title={t('addLink')} icon={<LinkIcon size={18} />}>
        <div className="space-y-3">
          <Input
            placeholder={t('elementLink')}
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            autoFocus
          />
          <Input
            placeholder={t('elementText')}
            value={linkLabel}
            onChange={e => setLinkLabel(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLinkModalOpen(false)}>{t('cancel')}</Button>
            <Button variant="primary" className="flex-1" onClick={submitLink}>{t('save')}</Button>
          </div>
        </div>
      </Modal>

      {/* ─── PDF modal ─── */}
      <Modal isOpen={pdfModalOpen} onClose={() => setPdfModalOpen(false)} title={t('addPdf')} icon={<FileText size={18} />}>
        <div className="space-y-3">
          <Input
            placeholder={t('pdfUrl')}
            value={pdfUrl}
            onChange={e => setPdfUrl(e.target.value)}
            autoFocus
          />
          <Button
            variant="outline"
            className="w-full justify-center gap-2"
            onClick={() => { setPdfModalOpen(false); pdfInputRef.current?.click(); }}
          >
            <Upload size={14} />
            {t('uploadFile')}
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPdfModalOpen(false)}>{t('cancel')}</Button>
            <Button variant="primary" className="flex-1" onClick={submitPdfUrl} disabled={!pdfUrl.trim()}>{t('save')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ToolBtn({ onClick, icon, label, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-border/60 bg-card hover:bg-secondary text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Single element with drag + 8 resize handles ─────────────────────────
function ElementBox({
  element, isSelected, isSearchMatch, isCurrentMatch, canvasW, canvasH, onSelect, onPatch,
}: {
  element: NoteElement;
  isSelected: boolean;
  isSearchMatch?: boolean;
  isCurrentMatch?: boolean;
  canvasW: number;
  canvasH: number;
  onSelect: (id: string) => void;
  onPatch: (patch: Partial<NoteElement>) => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number; origX: number; origY: number; dir: string } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(element.id);
    if ((e.target as HTMLElement).dataset.handle) return; // resize handles handle their own
    if ((e.target as HTMLElement).dataset.notdrag) return; // links / contenteditable
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: element.x, origY: element.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const nx = clamp(d.origX + (e.clientX - d.startX), 0, canvasW - element.width);
      const ny = clamp(d.origY + (e.clientY - d.startY), 0, canvasH - element.height);
      onPatch({ x: nx, y: ny });
    }
    if (resizeRef.current) {
      const r = resizeRef.current;
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;
      let nx = element.x, ny = element.y, nw = element.width, nh = element.height;
      if (r.dir.includes('e')) nw = Math.max(40, r.origW + dx);
      if (r.dir.includes('s')) nh = Math.max(28, r.origH + dy);
      if (r.dir.includes('w')) {
        nw = Math.max(40, r.origW - dx);
        nx = r.origX + (r.origW - nw);
      }
      if (r.dir.includes('n')) {
        nh = Math.max(28, r.origH - dy);
        ny = r.origY + (r.origH - nh);
      }
      // Clamp inside canvas
      nx = clamp(nx, 0, canvasW - nw);
      ny = clamp(ny, 0, canvasH - nh);
      onPatch({ x: nx, y: ny, width: nw, height: nh });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    resizeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const startResize = (dir: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(element.id);
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      origW: element.width, origH: element.height,
      origX: element.x, origY: element.y, dir,
    };
    (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute touch-none ${
        isSelected ? 'ring-2 ring-primary z-30' :
        isCurrentMatch ? 'ring-2 ring-amber-500 bg-amber-100/30 z-20' :
        isSearchMatch ? 'ring-2 ring-amber-400/60 z-10' :
        'ring-1 ring-transparent hover:ring-border z-10'
      } cursor-move`}
      style={{ left: element.x, top: element.y, width: element.width, height: element.height }}
    >
      {/* Content */}
      <div className="w-full h-full overflow-hidden">
        {element.type === 'text' && (
          <div
            data-notdrag="1"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onPatch({ text: e.currentTarget.innerText })}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full h-full p-1 outline-none whitespace-pre-wrap break-words"
            style={{
              fontSize: element.fontSize ?? 16,
              fontWeight: element.fontWeight ?? 'normal',
              fontStyle: element.fontStyle ?? 'normal',
              color: element.color ?? '#111827',
              textAlign: element.align ?? 'left',
              lineHeight: 1.4,
            }}
          >
            {element.text}
          </div>
        )}

        {element.type === 'link' && (
          <a
            href={element.href}
            target="_blank"
            rel="noopener noreferrer"
            data-notdrag="1"
            onClick={(e) => e.preventDefault()}
            className="w-full h-full flex items-center gap-1 px-2 underline hover:opacity-80"
            style={{
              fontSize: element.fontSize ?? 14,
              color: element.color ?? '#2563eb',
            }}
          >
            <ExternalLink size={12} className="shrink-0" />
            <span className="truncate">{element.text || element.href}</span>
          </a>
        )}

        {element.type === 'image' && (
          <img
            src={element.src}
            alt=""
            draggable={false}
            className="w-full h-full object-contain pointer-events-none"
          />
        )}

        {element.type === 'pdf' && (
          <div className="w-full h-full bg-secondary border border-border/60 rounded">
            {isSelected ? (
              <iframe
                src={element.src}
                title="pdf"
                className="w-full h-full border-0"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground p-2">
                <FileText size={28} />
                <span className="text-[10px] font-bold uppercase">PDF</span>
                <span className="text-[10px] truncate max-w-full px-2">{element.src?.split('/').pop()}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize handles */}
      {isSelected && (
        <>
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map(dir => (
            <div
              key={dir}
              data-handle={dir}
              onPointerDown={startResize(dir)}
              className="absolute bg-primary border-2 border-white rounded-sm"
              style={{
                width: 10,
                height: 10,
                left: dir.includes('w') ? -5 : dir.includes('e') ? undefined : 'calc(50% - 5px)',
                right: dir.includes('e') ? -5 : undefined,
                top: dir.includes('n') ? -5 : dir.includes('s') ? undefined : 'calc(50% - 5px)',
                bottom: dir.includes('s') ? -5 : undefined,
                cursor: dir === 'n' || dir === 's' ? 'ns-resize'
                       : dir === 'e' || dir === 'w' ? 'ew-resize'
                       : dir === 'ne' || dir === 'sw' ? 'nesw-resize' : 'nwse-resize',
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }
