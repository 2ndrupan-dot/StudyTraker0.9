import React, { useState, useRef, useEffect } from 'react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import { Plus, FileText, Trash2, Pencil, Check, X, StickyNote, Loader2, ArrowUpDown, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

// NotePageMeta is not exported from types — derive from context return type
type NoteItem = ReturnType<typeof useStudy>['notePagesIndex'][number];

// ─── Sortable wrapper for a single note card ─────────────────────────────────
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

// ─── Main component ───────────────────────────────────────────────────────────
export function NotesIndex() {
  const { notePagesIndex, createNotePage, renameNotePage, deleteNotePage, loadNotePage, saveNotePage, reorderNotePages } = useStudy();
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
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);

  // Local cache: which note IDs have HTML content (populated after first open)
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>({});

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIdx = notePagesIndex.findIndex(n => n.id === active.id);
    const toIdx   = notePagesIndex.findIndex(n => n.id === over.id);
    if (fromIdx !== -1 && toIdx !== -1) reorderNotePages(fromIdx, toIdx);
  };

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
    if (noteLoading) return;
    openRequestRef.current = meta.id;
    setNoteLoading(true);
    setLoadingNoteId(meta.id);
    try {
      const page = await loadNotePage(meta.id);
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
      setLoadingNoteId(null);
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
  const noteCount = notePagesIndex.length;

  return (
    <>
      <Layout>
        <div className="p-5 max-w-2xl mx-auto">

          {/* ── Header ── */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-6 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 shadow-sm">
                <StickyNote size={20} className="text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground leading-tight">{t('notesTab')}</h1>
                {noteCount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {lang === 'bn' ? `${noteCount}টি নোট` : `${noteCount} note${noteCount !== 1 ? 's' : ''}`}
                  </p>
                )}
              </div>
            </div>

            {/* Header action buttons */}
            {!isCreating && (
              <div className="flex items-center gap-2">
                {noteCount > 1 && (
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => setReorderMode(v => !v)}
                    className={`p-2 rounded-xl border transition-colors shadow-sm ${
                      reorderMode
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:text-primary'
                    }`}
                    title={reorderMode ? 'Reorder বন্ধ করুন' : 'Reorder করুন'}
                  >
                    <ArrowUpDown size={15} />
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:opacity-90 transition-opacity"
                >
                  <Plus size={14} />
                  {t('addNote')}
                </motion.button>
              </div>
            )}
          </motion.div>

          {/* ── Create input ── */}
          <AnimatePresence>
            {isCreating && (
              <motion.div
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-4 overflow-hidden"
              >
                <div className="bg-card border border-border/70 rounded-2xl p-4 shadow-sm">
                  <p className="text-[11px] font-medium text-muted-foreground mb-2">
                    {lang === 'bn' ? 'নতুন নোটের শিরোনাম' : 'New note title'}
                  </p>
                  <div className="flex items-center gap-2">
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
                      className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={handleCreate}
                      disabled={!newTitle.trim()}
                      className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => { setIsCreating(false); setNewTitle(''); }}
                      className="px-3 py-2 rounded-xl bg-secondary text-muted-foreground text-xs hover:bg-secondary/70 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Empty state ── */}
          {noteCount === 0 && !isCreating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="flex flex-col items-center justify-center py-20 gap-4"
            >
              <div className="w-16 h-16 rounded-3xl bg-primary/8 flex items-center justify-center">
                <StickyNote size={32} className="text-primary/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground/60">
                  {lang === 'bn' ? 'এখনও কোনো নোট নেই' : 'No notes yet'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {lang === 'bn' ? 'উপরের বাটনে ক্লিক করে নোট তৈরি করুন' : 'Click the button above to create a note'}
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Notes list ── */}
          {noteCount > 0 && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext items={notePagesIndex.map(n => n.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  <AnimatePresence>
                    {notePagesIndex.map((note, idx) => (
                      <SortableNoteCard key={note.id} id={note.id} reorderMode={reorderMode}>
                        {handle => (
                          <NoteCard
                            note={note}
                            index={idx}
                            isEditing={editingId === note.id}
                            editDraft={draftTitle}
                            isLoadingThis={loadingNoteId === note.id}
                            hasContent={!!(htmlCache[note.id]?.trim())}
                            reorderMode={reorderMode}
                            dragHandle={handle}
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
        </div>
      </Layout>

      {/* ── Note editor modal ── */}
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

      {/* ── Delete confirm ── */}
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

const ICON_COLORS = [
  'text-blue-500',
  'text-violet-500',
  'text-emerald-500',
  'text-amber-500',
  'text-rose-500',
  'text-cyan-500',
];

function NoteCard({
  note, index, isEditing, editDraft, isLoadingThis, hasContent,
  reorderMode, dragHandle,
  onEditDraftChange, onOpenNote, onStartRename, onSaveRename, onCancelRename, onDelete,
}: NoteCardProps) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const iconColor = ICON_COLORS[index % ICON_COLORS.length];

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.2, delay: 0.03 * Math.min(index, 6) }}
    >
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
            <div className="flex-1 flex items-center gap-1.5">
              <input
                autoFocus
                value={editDraft}
                onChange={e => onEditDraftChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveRename();
                  if (e.key === 'Escape') onCancelRename();
                }}
                className="flex-1 px-2.5 py-1.5 rounded-xl border border-border bg-white dark:bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button onClick={onSaveRename} className="text-primary p-1 rounded-lg hover:bg-white/50 transition-colors">
                <Check size={14} />
              </button>
              <button onClick={onCancelRename} className="text-muted-foreground p-1 rounded-lg hover:bg-white/50 transition-colors">
                <X size={14} />
              </button>
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

          {/* Action icons — hidden in reorder mode */}
          {!isEditing && !reorderMode && (
            <div className="flex items-center gap-0.5 shrink-0">
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={onStartRename}
                title="Rename"
                className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
              >
                <Pencil size={13} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={onDelete}
                title="Delete"
                className="p-1.5 rounded-xl hover:bg-white/70 dark:hover:bg-white/10 text-muted-foreground hover:text-rose-600 transition-colors"
              >
                <Trash2 size={13} />
              </motion.button>
            </div>
          )}

          {/* Drag handle — shown only in reorder mode */}
          {!isEditing && dragHandle}
        </div>
      </div>
    </motion.li>
  );
}
