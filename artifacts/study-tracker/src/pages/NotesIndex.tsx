import React, { useState, useRef, useEffect } from 'react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import { Plus, FileText, Trash2, Pencil, Check, X, StickyNote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmModal, NoteEditorModal } from '@/components/ui';
import type { NotePage } from '@/lib/types';

// NotePageMeta is not exported from types — derive from context return type
type NoteItem = ReturnType<typeof useStudy>['notePagesIndex'][number];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function NotesIndex() {
  const { notePagesIndex, createNotePage, renameNotePage, deleteNotePage, loadNotePage, saveNotePage } = useStudy();
  const { t, lang } = useLang();

  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const newTitleRef = useRef<HTMLInputElement>(null);

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Note editor modal
  const [noteModalId, setNoteModalId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [currentPage, setCurrentPage] = useState<NotePage | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);

  // Local cache: which note IDs have HTML content (populated after first open)
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isCreating) newTitleRef.current?.focus();
  }, [isCreating]);

  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    createNotePage(title);
    setNewTitle('');
    setIsCreating(false);
  };

  // Track the last requested note id to discard stale concurrent responses
  const openRequestRef = useRef<string | null>(null);

  const openNote = async (meta: NoteItem) => {
    if (noteLoading) return; // block rapid re-clicks
    openRequestRef.current = meta.id;
    setNoteLoading(true);
    try {
      const page = await loadNotePage(meta.id);
      // Discard if a different note was requested while this was loading
      if (openRequestRef.current !== meta.id) return;
      const resolved: NotePage = page ?? {
        id: meta.id,
        title: meta.title,
        elements: [],
        pageCount: 1,
        html: '',
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      };
      setCurrentPage(resolved);
      const html = resolved.html ?? '';
      setNoteDraft(html);
      setHtmlCache(prev => ({ ...prev, [meta.id]: html }));
      setNoteModalId(meta.id);
    } finally {
      setNoteLoading(false);
    }
  };

  const saveNote = async () => {
    if (!noteModalId || !currentPage) return;
    const updated: NotePage = { ...currentPage, html: noteDraft };
    await saveNotePage(updated);
    setHtmlCache(prev => ({ ...prev, [noteModalId]: noteDraft }));
    setNoteModalId(null);
    setNoteDraft('');
    setCurrentPage(null);
  };

  const closeNote = () => {
    setNoteModalId(null);
    setNoteDraft('');
    setCurrentPage(null);
  };

  const noteModalItem = notePagesIndex.find(n => n.id === noteModalId);

  return (
    <>
      <Layout>
        <div className="p-5 max-w-2xl">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <StickyNote size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">{t('notesTab')}</h1>
              <p className="text-[11px] text-muted-foreground">{t('notePagesEmpty').split('।')[0]}</p>
            </div>
          </motion.div>

          {/* Main card */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border/60 rounded-2xl overflow-hidden"
          >
            <div className="px-3 py-3 space-y-1">

              {/* "+ Add note" button */}
              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground text-xs font-semibold hover:bg-secondary/40 transition-colors"
                >
                  <Plus size={14} />
                  {t('addNote')}
                </button>
              ) : (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="space-y-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={newTitleRef}
                        type="text"
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreate();
                          if (e.key === 'Escape') { setIsCreating(false); setNewTitle(''); }
                        }}
                        placeholder={lang === 'bn' ? 'নোটের শিরোনাম লিখুন…' : 'Enter note title…'}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        onClick={handleCreate}
                        disabled={!newTitle.trim()}
                        className="px-2.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => { setIsCreating(false); setNewTitle(''); }}
                        className="px-2.5 py-2 rounded-xl bg-secondary text-muted-foreground text-xs font-bold"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground px-1">
                      {lang === 'bn' ? 'শিরোনাম দিন — তৈরি হলে নোট আইকনে ক্লিক করে লিখুন' : 'Enter title — click the note icon to add content'}
                    </p>
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Notes list */}
              {notePagesIndex.length === 0 && !isCreating ? (
                <p className="text-center text-[11px] text-muted-foreground py-4">
                  {lang === 'bn' ? 'এখনও কোনো নোট নেই।' : 'No notes yet.'}
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  <AnimatePresence>
                    {notePagesIndex.map(note => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        isEditing={editingId === note.id}
                        editDraft={draftTitle}
                        isLoadingNote={noteLoading && noteModalId === null}
                        hasContent={!!(htmlCache[note.id]?.trim())}
                        onEditDraftChange={setDraftTitle}
                        onOpenNote={() => openNote(note)}
                        onStartRename={() => { setEditingId(note.id); setDraftTitle(note.title); }}
                        onSaveRename={() => { renameNotePage(note.id, draftTitle); setEditingId(null); }}
                        onCancelRename={() => setEditingId(null)}
                        onDelete={() => setConfirmDelete(note.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      </Layout>

      {/* Note editor modal */}
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
      />

      {/* Delete confirm */}
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
    </>
  );
}

// ─── Single note row ──────────────────────────────────────────────────────────
interface NoteRowProps {
  note: NoteItem;
  isEditing: boolean;
  editDraft: string;
  isLoadingNote: boolean;
  hasContent: boolean;
  onEditDraftChange: (v: string) => void;
  onOpenNote: () => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

function NoteRow({
  note, isEditing, editDraft, hasContent,
  onEditDraftChange, onOpenNote, onStartRename, onSaveRename, onCancelRename, onDelete,
}: NoteRowProps) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="group"
    >
      <div className="rounded-lg hover:bg-secondary/30 px-1.5 py-1.5 border-l-2 border-border/40 ml-0.5">
        <div className="flex items-center gap-2">
          {/* Title / rename input */}
          {isEditing ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                autoFocus
                value={editDraft}
                onChange={e => onEditDraftChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveRename();
                  if (e.key === 'Escape') onCancelRename();
                }}
                className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs font-medium"
              />
              <button onClick={onSaveRename} className="text-primary p-0.5"><Check size={13} /></button>
              <button onClick={onCancelRename} className="text-muted-foreground p-0.5"><X size={13} /></button>
            </div>
          ) : (
            <span className="flex-1 text-xs font-medium text-foreground leading-relaxed select-none truncate">
              {note.title}
            </span>
          )}

          {/* Action icons */}
          {!isEditing && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={onOpenNote}
                title="Open note"
                className={`p-1 rounded hover:bg-card transition-colors ${hasContent ? 'text-rose-500' : 'text-muted-foreground hover:text-primary'}`}
              >
                <FileText size={12} />
              </button>
              <button
                onClick={onStartRename}
                title="Rename"
                className="p-1 rounded hover:bg-card text-muted-foreground hover:text-primary transition-colors"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={onDelete}
                title="Delete"
                className="p-1 rounded hover:bg-card text-muted-foreground hover:text-rose-600 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.li>
  );
}
