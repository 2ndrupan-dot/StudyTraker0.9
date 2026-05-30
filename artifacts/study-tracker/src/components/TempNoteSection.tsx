import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Check, X, StickyNote, FileText } from 'lucide-react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { ConfirmModal, NoteEditorModal } from '@/components/ui';
import type { TempNoteItem } from '@/lib/types';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function findTempNote(items: TempNoteItem[], id: string): TempNoteItem | null {
  for (const it of items) {
    if (it.id === id) return it;
    const found = findTempNote(it.children || [], id);
    if (found) return found;
  }
  return null;
}

export function TempNoteSection() {
  const { tempNotes, addTempNote, updateTempNote, updateTempNoteContent, toggleTempNoteDone, deleteTempNote } = useStudy();
  const { t, lang } = useLang();
  const [collapsed, setCollapsed] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [text, setText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [noteModalId, setNoteModalId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const noteModalItem = noteModalId ? findTempNote(tempNotes, noteModalId) : null;

  const openNoteModal = (item: TempNoteItem) => {
    setNoteModalId(item.id);
    setNoteDraft(item.note || '');
  };

  const saveNoteModal = () => {
    if (!noteModalId) return;
    updateTempNoteContent(noteModalId, noteDraft);
    setNoteModalId(null);
    setNoteDraft('');
  };

  const submit = () => {
    if (!text.trim()) return;
    const id = addTempNote(text);
    setText('');
    setShowInput(false);
    if (id) {
      setNoteModalId(id);
      setNoteDraft('');
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 bg-card border border-border/60 rounded-2xl overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-secondary/30 transition-colors"
        >
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
            <StickyNote size={15} className="text-rose-600" />
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-foreground">{t('tempNotes')}</div>
            <div className="text-[10px] text-muted-foreground">{t('tempNotesDesc')}</div>
          </div>
          {tempNotes.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700">
              {tempNotes.length}
            </span>
          )}
          {collapsed ? <ChevronRight size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 border-t border-border/40 space-y-2">
                {showInput ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submit();
                          if (e.key === 'Escape') { setShowInput(false); setText(''); }
                        }}
                        placeholder={t('tempNotePlaceholder')}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button onClick={submit} className="px-2.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold" title="Add & open rich editor">
                        <Check size={14} />
                      </button>
                      <button onClick={() => { setShowInput(false); setText(''); }} className="px-2.5 py-2 rounded-xl bg-secondary text-muted-foreground text-xs font-bold">
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground px-1">
                      {lang === 'bn' ? 'শিরোনাম লিখুন — সেভ করলে নোট এডিটর খুলবে' : 'Enter title — rich editor opens on save'}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowInput(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-muted-foreground text-xs font-semibold hover:bg-secondary/40 transition-colors"
                  >
                    <Plus size={14} />
                    {t('addTempNote')}
                  </button>
                )}

                {tempNotes.length === 0 ? (
                  <p className="text-center text-[11px] text-muted-foreground py-2">{t('noTempNotes')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {tempNotes.map(n => (
                      <TempNoteRow
                        key={n.id}
                        item={n}
                        depth={0}
                        onToggle={toggleTempNoteDone}
                        onUpdate={updateTempNote}
                        onAddChild={addTempNote}
                        onDelete={(id) => setConfirmDelete(id)}
                        onEditNote={openNoteModal}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmModal
          isOpen={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete) deleteTempNote(confirmDelete);
            setConfirmDelete(null);
          }}
          title={t('deleteTempNote')}
          message={t('deleteTempNote')}
          confirmText={t('delete')}
          cancelText={t('cancel')}
          isDanger
        />
      </motion.div>

      <NoteEditorModal
        isOpen={!!noteModalId}
        onClose={() => { setNoteModalId(null); setNoteDraft(''); }}
        title={noteModalItem?.text || t('tempNotes')}
        icon={StickyNote}
        value={noteDraft}
        onChange={setNoteDraft}
        onClear={() => setNoteDraft('')}
        onSave={saveNoteModal}
        placeholder={t('notePlaceholder')}
        clearLabel={t('clearNote')}
        saveLabel={t('saveNote')}
      />
    </>
  );
}

interface RowProps {
  item: TempNoteItem;
  depth: number;
  onToggle: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
  onAddChild: (text: string, parentId: string) => string;
  onDelete: (id: string) => void;
  onEditNote: (item: TempNoteItem) => void;
}

function TempNoteRow({ item, depth, onToggle, onUpdate, onAddChild, onDelete, onEditNote }: RowProps) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [showChildInput, setShowChildInput] = useState(false);
  const [childText, setChildText] = useState('');
  const [expanded, setExpanded] = useState(false);

  const childCount = item.children?.length ?? 0;
  const toggle = () => { if (childCount > 0) setExpanded(e => !e); };
  const hasNote = !!item.note?.trim();
  const notePreview = hasNote ? stripHtml(item.note!).slice(0, 100) : '';

  const submitEdit = () => {
    if (draft.trim() && draft.trim() !== item.text) onUpdate(item.id, draft);
    setEditing(false);
  };
  const submitChild = () => {
    if (!childText.trim()) return;
    onAddChild(childText, item.id);
    setChildText('');
    setShowChildInput(false);
  };

  return (
    <li>
      <div
        className="group rounded-lg hover:bg-secondary/30 px-1.5 py-1"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggle(item.id)}
            className="w-4 h-4 rounded border-2 border-border flex items-center justify-center shrink-0 hover:border-primary transition-colors"
            style={{ backgroundColor: item.done ? 'var(--color-primary)' : 'transparent', borderColor: item.done ? 'var(--color-primary)' : undefined }}
          >
            {item.done && <Check size={10} className="text-primary-foreground" strokeWidth={3} />}
          </button>

          <button
            type="button"
            onClick={toggle}
            className={`shrink-0 text-muted-foreground transition-colors ${childCount > 0 ? 'hover:text-foreground' : 'pointer-events-none opacity-0'}`}
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>

          {editing ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitEdit();
                  if (e.key === 'Escape') { setEditing(false); setDraft(item.text); }
                }}
                className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs"
              />
              <button onClick={submitEdit} className="text-primary"><Check size={13} /></button>
              <button onClick={() => { setEditing(false); setDraft(item.text); }} className="text-muted-foreground"><X size={13} /></button>
            </div>
          ) : (
            <>
              <span
                onClick={toggle}
                className={`flex-1 text-xs leading-relaxed select-none ${childCount > 0 ? 'cursor-pointer' : ''} ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}
              >
                {item.text}
              </span>

              <div className="flex items-center gap-0.5 shrink-0">
                {childCount > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary leading-none mr-0.5">
                    {childCount}
                  </span>
                )}
                <button
                  onClick={() => onEditNote(item)}
                  title="Rich note content"
                  className={`p-1 rounded hover:bg-card ${hasNote ? 'text-rose-500' : 'text-muted-foreground hover:text-primary'}`}
                >
                  <FileText size={11} />
                </button>
                <button
                  onClick={() => setShowChildInput(s => !s)}
                  title={t('addSubItem')}
                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-primary"
                >
                  <Plus size={11} />
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-primary"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="p-1 rounded hover:bg-card text-muted-foreground hover:text-rose-600"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Note preview — click to open editor */}
        {hasNote && !editing && (
          <button
            onClick={() => onEditNote(item)}
            className="mt-0.5 ml-[26px] text-left w-full group/preview"
            title="Click to view/edit note"
          >
            <p className="text-[10px] text-muted-foreground line-clamp-2 italic group-hover/preview:text-foreground transition-colors">
              {notePreview}
            </p>
          </button>
        )}
      </div>

      {showChildInput && (
        <div className="flex items-center gap-1.5 mt-1" style={{ marginLeft: (depth + 1) * 16 + 8 }}>
          <input
            autoFocus
            value={childText}
            onChange={e => setChildText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitChild();
              if (e.key === 'Escape') { setShowChildInput(false); setChildText(''); }
            }}
            placeholder={t('addSubItem')}
            className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs"
          />
          <button onClick={submitChild} className="text-primary"><Check size={12} /></button>
          <button onClick={() => { setShowChildInput(false); setChildText(''); }} className="text-muted-foreground"><X size={12} /></button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && childCount > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden mt-0.5 space-y-0.5"
          >
            {item.children.map(child => (
              <TempNoteRow
                key={child.id}
                item={child}
                depth={depth + 1}
                onToggle={onToggle}
                onUpdate={onUpdate}
                onAddChild={onAddChild}
                onDelete={onDelete}
                onEditNote={onEditNote}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}
