import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useEditor, EditorContent, Extension, Editor } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Link } from '@tiptap/extension-link';
import { cn } from '@/lib/utils';
import { useLang } from '@/context/LangContext';
import { useStudy } from '@/context/StudyContext';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, RemoveFormatting, Palette, Highlighter, ChevronDown,
  Undo2, Redo2, Table2, Plus, Trash2, ArrowRightToLine, ArrowDownToLine,
  ArrowLeftFromLine, ArrowUpFromLine, Link2, Unlink, FileText,
  ChevronLeft, ChevronRight, StickyNote,
} from 'lucide-react';

// ─── NoteRef inline node (atomic chip — cursor cannot enter) ──────────────────
const NoteRef = Node.create({
  name: 'noteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      'data-note-id':    { default: null },
      'data-note-title': { default: null },
      'data-note-html':  { default: null },
      'data-item-path':  { default: null },
    };
  },
  parseHTML() {
    return [{
      tag: 'span[data-note-id]',
      getAttrs: (el) => {
        const h = el as HTMLElement;
        return {
          'data-note-id':    h.getAttribute('data-note-id'),
          'data-note-title': h.getAttribute('data-note-title'),
          'data-note-html':  h.getAttribute('data-note-html'),
          'data-item-path':  h.getAttribute('data-item-path'),
        };
      },
    }];
  },
  renderHTML({ node }) {
    const id    = node.attrs['data-note-id'];
    const title = node.attrs['data-note-title'] || 'Note';
    const emoji = id === '__item__' ? '📝' : '📄';
    return ['span', mergeAttributes({ class: 'note-ref', contenteditable: 'false' }, {
      'data-note-id':    node.attrs['data-note-id'],
      'data-note-title': node.attrs['data-note-title'],
      'data-note-html':  node.attrs['data-note-html'],
      'data-item-path':  node.attrs['data-item-path'],
    }), `${emoji} ${title}`];
  },
});

// ─── Custom Link extension (with openOnClick: false + Space exits link) ──────
const CustomLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-note-id': { default: null },
    };
  },
  addKeyboardShortcuts() {
    return {
      Space: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        const linkMarkType = state.schema.marks.link;
        if (!linkMarkType) return false;
        // Are we inside a link?
        const inLink = linkMarkType.isInSet($from.marks());
        if (!inLink) return false;
        // Is the next position also inside the same link? (not at end yet)
        const nodeAfter = $from.nodeAfter;
        if (nodeAfter && linkMarkType.isInSet(nodeAfter.marks)) return false;
        // At the end of a link — insert a space outside the link mark
        return this.editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) {
            const pos = selection.from;
            tr.insertText(' ', pos, pos);
            tr.removeMark(pos, pos + 1, linkMarkType);
            const newStoredMarks = (state.storedMarks ?? []).filter(m => m.type !== linkMarkType);
            tr.setStoredMarks(newStoredMarks);
          }
          return true;
        });
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('preventLinkNavigate'),
        props: {
          handleDOMEvents: {
            click: (_view, event) => {
              if ((event.target as HTMLElement).closest('a')) {
                event.preventDefault();
                event.stopPropagation();
                return true;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
}).configure({
  openOnClick: false,
  HTMLAttributes: {},
});

// ─── Custom FontSize extension ────────────────────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize || null,
          renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

// ─── Active state helpers ─────────────────────────────────────────────────────
function isActiveOrStored(editor: Editor, markName: string, attrs?: Record<string, unknown>): boolean {
  if (editor.isActive(markName, attrs)) return true;
  const stored = editor.view.state.storedMarks;
  if (!stored) return false;
  return stored.some(mark => {
    if (mark.type.name !== markName) return false;
    if (!attrs) return true;
    return Object.entries(attrs).every(([k, v]) => mark.attrs[k] === v);
  });
}

function getStoredFontSize(editor: Editor): string | null {
  const stored = editor.view.state.storedMarks;
  if (!stored) return null;
  const ts = stored.find(m => m.type.name === 'textStyle');
  return (ts?.attrs?.fontSize as string) ?? null;
}

function getActiveColor(editor: Editor): string | null {
  const fromActive = TEXT_COLORS.find(c => c.value && editor.isActive('textStyle', { color: c.value }))?.value ?? null;
  if (fromActive) return fromActive;
  const stored = editor.view.state.storedMarks;
  if (!stored) return null;
  const ts = stored.find(m => m.type.name === 'textStyle');
  return (ts?.attrs?.color as string) ?? null;
}

function getActiveHighlight(editor: Editor): string | null {
  const fromActive = HIGHLIGHT_COLORS.find(c => c.value && editor.isActive('highlight', { color: c.value }))?.value ?? null;
  if (fromActive) return fromActive;
  const stored = editor.view.state.storedMarks;
  if (!stored) return null;
  const h = stored.find(m => m.type.name === 'highlight');
  return (h?.attrs?.color as string) ?? null;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const FONT_SIZE_VALUES = [
  { tKey: 'fontSizeSmall'  as const, value: '11px' },
  { tKey: 'fontSizeNormal' as const, value: '14px' },
  { tKey: 'fontSizeMedium' as const, value: '17px' },
  { tKey: 'fontSizeLarge'  as const, value: '21px' },
  { tKey: 'fontSizeXLarge' as const, value: '26px' },
];

const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black',   value: '#111827' },
  { label: 'Gray',    value: '#6B7280' },
  { label: 'Red',     value: '#EF4444' },
  { label: 'Orange',  value: '#F97316' },
  { label: 'Yellow',  value: '#EAB308' },
  { label: 'Green',   value: '#22C55E' },
  { label: 'Teal',    value: '#14B8A6' },
  { label: 'Blue',    value: '#3B82F6' },
  { label: 'Indigo',  value: '#6366F1' },
  { label: 'Purple',  value: '#A855F7' },
  { label: 'Pink',    value: '#EC4899' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None',   value: '' },
  { label: 'Yellow', value: '#FEF08A' },
  { label: 'Green',  value: '#BBF7D0' },
  { label: 'Blue',   value: '#BAE6FD' },
  { label: 'Pink',   value: '#FBCFE8' },
  { label: 'Orange', value: '#FED7AA' },
  { label: 'Purple', value: '#E9D5FF' },
  { label: 'Red',    value: '#FECACA' },
  { label: 'Teal',   value: '#99F6E4' },
];

// ─── Shared click-outside hook ────────────────────────────────────────────────
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return { open, setOpen, ref };
}

// ─── Note Ref Picker (hierarchical, like NoteSearchModal) ────────────────────
function NoteRefPicker({
  onSelectPage, onSelectItemNote, onClose, coords, pickerRef,
}: {
  onSelectPage: (id: string, title: string) => void;
  onSelectItemNote: (title: string, html: string, itemPath: any) => void;
  onClose: () => void;
  coords: { top: number; left: number };
  pickerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { subjects, notePagesIndex } = useStudy();
  const { t } = useLang();

  type Level = 'subjects' | 'chapters' | 'topics' | 'subtopics' | 'concepts' | 'points';
  const [level, setLevel] = useState<Level>('subjects');
  const [selSubject, setSelSubject] = useState<any>(null);
  const [selChapter, setSelChapter] = useState<any>(null);
  const [selTopic, setSelTopic] = useState<any>(null);
  const [selSubtopic, setSelSubtopic] = useState<any>(null);
  const [selConcept, setSelConcept] = useState<any>(null);

  const goBack = () => {
    if (level === 'points')         { setSelConcept(null);  setLevel('concepts'); }
    else if (level === 'concepts')  { setSelSubtopic(null); setLevel('subtopics'); }
    else if (level === 'subtopics') { setSelTopic(null);    setLevel('topics'); }
    else if (level === 'topics')    { setSelChapter(null);  setLevel('chapters'); }
    else if (level === 'chapters')  { setSelSubject(null);  setLevel('subjects'); }
  };

  const currentItems: any[] =
    level === 'subjects'  ? subjects
    : level === 'chapters'  ? (selSubject?.chapters ?? [])
    : level === 'topics'    ? (selChapter?.topics ?? [])
    : level === 'subtopics' ? (selTopic?.subtopics ?? [])
    : level === 'concepts'  ? (selSubtopic?.concepts ?? [])
    : level === 'points'    ? (selConcept?.points ?? [])
    : [];

  const hasChildren = (item: any) => {
    if (level === 'subjects')  return (item.chapters?.length ?? 0) > 0;
    if (level === 'chapters')  return (item.topics?.length ?? 0) > 0;
    if (level === 'topics')    return (item.subtopics?.length ?? 0) > 0;
    if (level === 'subtopics') return (item.concepts?.length ?? 0) > 0;
    if (level === 'concepts')  return (item.points?.length ?? 0) > 0;
    return false;
  };

  const drillInto = (item: any) => {
    if (level === 'subjects')       { setSelSubject(item);  setLevel('chapters'); }
    else if (level === 'chapters')  { setSelChapter(item);  setLevel('topics'); }
    else if (level === 'topics')    { setSelTopic(item);    setLevel('subtopics'); }
    else if (level === 'subtopics') { setSelSubtopic(item); setLevel('concepts'); }
    else if (level === 'concepts')  { setSelConcept(item);  setLevel('points'); }
  };

  const levelLabel: Record<Level, string> = {
    subjects: 'Subjects', chapters: 'Chapters', topics: 'Topics',
    subtopics: 'Subtopics', concepts: 'Concepts', points: 'Points',
  };

  const breadcrumbs = [
    selSubject?.title, selChapter?.title, selTopic?.title, selSubtopic?.title, selConcept?.title,
  ].filter(Boolean);

  return ReactDOM.createPortal(
    <div
      ref={pickerRef}
      style={{ top: coords.top, left: coords.left }}
      className="fixed z-[9999] bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden w-72"
    >
      {/* Header */}
      <div className="px-3 pt-2 pb-1.5 border-b border-border/40">
        {level !== 'subjects' && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); goBack(); }}
            className="flex items-center gap-1 text-[11px] text-primary mb-1 hover:underline"
          >
            <ChevronLeft size={11} /> Back
          </button>
        )}
        {breadcrumbs.length > 0 ? (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-wrap">
            {breadcrumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={9} />}
                <span className={i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}>{c}</span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Note Reference</p>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {/* A4 note pages (root level only) */}
        {level === 'subjects' && notePagesIndex.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('a4NotePages')}
            </p>
            {notePagesIndex.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); onSelectPage(p.id, p.title || 'Untitled'); onClose(); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors text-left"
              >
                <FileText size={11} className="text-primary shrink-0" />
                <span className="truncate">{p.title || 'Untitled page'}</span>
              </button>
            ))}
            <div className="border-t border-border/30 my-1" />
          </>
        )}

        {/* Level label */}
        <p className="px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          {levelLabel[level]}
        </p>

        {/* Items */}
        {currentItems.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground text-center">Nothing here.</p>
        ) : (
          currentItems.map(item => (
            <div key={item.id} className="flex items-center hover:bg-secondary/60 transition-colors group">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); if (hasChildren(item)) drillInto(item); }}
                onTouchEnd={e => { if (hasChildren(item)) { e.preventDefault(); drillInto(item); } }}
                className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0"
                disabled={!hasChildren(item)}
              >
                {level === 'subjects' && item.color && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                )}
                {level !== 'subjects' && selSubject?.color && (
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selSubject.color }} />
                )}
                <span className="text-xs truncate">{item.title}</span>
                {hasChildren(item) && (
                  <ChevronRight size={11} className="text-muted-foreground ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
              {item.note?.trim() && (
                <button
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault();
                    const path: any = { level: level.slice(0, -1) as any };
                    if (selSubject)  path.subjectId  = selSubject.id;
                    if (selChapter)  path.chapterId  = selChapter.id;
                    if (selTopic)    path.topicId    = selTopic.id;
                    if (selSubtopic) path.subtopicId = selSubtopic.id;
                    if (selConcept)  path.conceptId  = selConcept.id;
                    if (level === 'subjects') { path.subjectId = item.id; path.level = 'subject'; }
                    else if (level === 'chapters') path.chapterId  = item.id;
                    else if (level === 'topics')   path.topicId    = item.id;
                    else if (level === 'subtopics') path.subtopicId = item.id;
                    else if (level === 'concepts')  path.conceptId  = item.id;
                    else if (level === 'points')    path.pointId    = item.id;
                    onSelectItemNote(item.title, item.note, path);
                    onClose();
                  }}
                  className="p-1.5 mr-1 rounded-lg hover:bg-amber-500/10 text-amber-500 shrink-0 transition-colors"
                  title="Insert note reference"
                >
                  <StickyNote size={11} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Link Popover (external URL) ──────────────────────────────────────────────
function LinkPopover({
  editor, onClose, initialEmpty, initialText, initialFrom, initialTo,
}: {
  editor: Editor;
  onClose: () => void;
  initialEmpty: boolean;
  initialText: string;
  initialFrom: number;
  initialTo: number;
}) {
  const { t } = useLang();
  const currentHref = editor.getAttributes('link').href || '';
  const isEditingExisting = !!currentHref && !currentHref.startsWith('note://');
  const [url, setUrl] = useState(isEditingExisting ? currentHref : '');
  const [label, setLabel] = useState(initialText);

  const submit = () => {
    const href = url.trim();
    if (!href) {
      if (isEditingExisting) {
        editor.chain().focus().setTextSelection({ from: initialFrom, to: initialTo }).unsetLink().run();
      }
      onClose();
      return;
    }
    if (initialEmpty) {
      const text = label.trim() || href;
      editor.commands.insertContent(
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
      );
    } else if (label.trim() && label.trim() !== initialText) {
      editor.chain().focus()
        .setTextSelection({ from: initialFrom, to: initialTo })
        .insertContent(`<a href="${href}" target="_blank" rel="noopener noreferrer">${label.trim()}</a>`)
        .run();
    } else {
      editor.chain().focus()
        .setTextSelection({ from: initialFrom, to: initialTo })
        .setLink({ href })
        .run();
    }
    onClose();
  };

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border/60 rounded-xl shadow-xl p-3 w-64">
      <input
        autoFocus
        placeholder={t('linkUrlPlaceholder')}
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background mb-2 outline-none focus:border-primary"
      />
      <input
        placeholder={t('linkTextOptional')}
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background mb-2 outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onClose(); }}
          className="flex-1 text-xs py-1.5 rounded-lg bg-secondary text-muted-foreground hover:bg-secondary/70 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); submit(); }}
          className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t('insertLink')}
        </button>
      </div>
      {editor.isActive('link') && (
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault();
            editor.chain().focus().unsetLink().run();
            onClose();
          }}
          className="w-full mt-2 text-xs py-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
        >
          {t('removeLink')}
        </button>
      )}
    </div>
  );
}

// ─── Table Popover ────────────────────────────────────────────────────────────
function TableMenu({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = usePopover();
  const inTable = editor.isActive('table');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title="Table"
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
          open || inTable
            ? 'bg-primary/15 text-primary'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
        )}
      >
        <Table2 size={14} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden min-w-[180px]">
          {!inTable ? (
            <button
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary transition-colors"
            >
              <Plus size={14} /> Insert table (3×3)
            </button>
          ) : (
            <>
              <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/40">Columns</p>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                <ArrowLeftFromLine size={13} /> Add column left
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                <ArrowRightToLine size={13} /> Add column right
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 size={13} /> Delete column
              </button>

              <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-y border-border/40">Rows</p>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                <ArrowUpFromLine size={13} /> Add row above
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                <ArrowDownToLine size={13} /> Add row below
              </button>
              <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 size={13} /> Delete row
              </button>

              <div className="border-t border-border/40">
                <button type="button" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run(); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 size={13} /> Delete table
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Font Size Dropdown ───────────────────────────────────────────────────────
function FontSizeSelect({ editor, t }: { editor: Editor; t: (key: any) => string }) {
  const { open, setOpen, ref } = usePopover();

  const activeSizeFromSelection = FONT_SIZE_VALUES.find(s =>
    editor.isActive('textStyle', { fontSize: s.value })
  );
  const storedSize = getStoredFontSize(editor);
  const activeSizeFromStored = storedSize ? FONT_SIZE_VALUES.find(s => s.value === storedSize) : null;
  const active = activeSizeFromSelection ?? activeSizeFromStored ?? null;
  const label = active ? t(active.tKey) : t('fontSize');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={t('fontSize')}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        className={cn(
          'flex items-center gap-0.5 h-7 px-2 rounded-lg text-xs font-semibold transition-colors',
          open || active
            ? 'bg-primary/15 text-primary'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
        )}
      >
        {label}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden min-w-[110px]">
          <button
            type="button"
            onMouseDown={e => {
              e.preventDefault();
              editor.chain().focus().unsetFontSize().run();
              setOpen(false);
            }}
            className={cn(
              'w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors',
              !active ? 'text-primary font-bold bg-primary/5' : 'text-muted-foreground'
            )}
          >
            {t('fontSizeDefault')}
          </button>
          {FONT_SIZE_VALUES.map(s => (
            <button
              key={s.value}
              type="button"
              onMouseDown={e => {
                e.preventDefault();
                editor.chain().focus().setFontSize(s.value).run();
                setOpen(false);
              }}
              className={cn(
                'w-full text-left px-3 py-2 hover:bg-secondary transition-colors',
                active?.value === s.value
                  ? 'text-primary font-bold bg-primary/5'
                  : 'text-foreground'
              )}
              style={{ fontSize: s.value }}
            >
              {t(s.tKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Color Popover ────────────────────────────────────────────────────────────
function ColorPopover({
  colors, onSelect, activeColor, icon: Icon, title,
}: {
  colors: { label: string; value: string }[];
  onSelect: (v: string) => void;
  activeColor?: string | null;
  icon: React.ElementType;
  title: string;
}) {
  const { open, setOpen, ref } = usePopover();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={title}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        className={cn(
          'relative flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
          open || activeColor
            ? 'bg-primary/15 text-primary'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon size={14} />
        {activeColor && (
          <span
            className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white"
            style={{ backgroundColor: activeColor }}
          />
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border/60 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1 min-w-[140px]">
          {colors.map(c => (
            <button
              key={c.value || 'none'}
              type="button"
              title={c.label}
              onMouseDown={e => { e.preventDefault(); onSelect(c.value); setOpen(false); }}
              className={cn(
                'w-6 h-6 rounded-lg border-2 transition-transform hover:scale-110 flex items-center justify-center',
                activeColor === c.value ? 'border-primary' : 'border-transparent'
              )}
              style={{ backgroundColor: c.value || 'transparent' }}
            >
              {!c.value && <span className="text-[9px] text-muted-foreground font-bold">✕</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toolbar Button ───────────────────────────────────────────────────────────
function ToolbarBtn({
  onClick, active, title, children,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded-lg transition-colors text-sm font-bold',
        active
          ? 'bg-primary/15 text-primary'
          : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
export function toSafeHtml(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('<')) return trimmed;
  return trimmed
    .split('\n')
    .map(line => line
      ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : '<p></p>'
    )
    .join('');
}

// ─── Main Editor ──────────────────────────────────────────────────────────────
interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  autoFocus?: boolean;
}

export function RichTextEditor({
  value, onChange,
  placeholder = 'Write something...',
  className, minHeight = '8rem', autoFocus = false,
}: RichTextEditorProps) {
  const { t } = useLang();
  const [, setTick] = useState(0);

  // Link popover
  const [showLinkPopover, setShowLinkPopover] = useState(false);
  const linkPopoverRef = useRef<HTMLDivElement>(null);
  const [linkSelection, setLinkSelection] = useState<{ empty: boolean; text: string; from: number; to: number }>({ empty: true, text: '', from: 0, to: 0 });

  // Decoration ref — stores the range to visually highlight while the link popover is open
  const linkHighlightRef = useRef<{ from: number; to: number } | null>(null);
  const LinkSelectionHighlight = useMemo(() => {
    const ref = linkHighlightRef;
    return Extension.create({
      name: 'linkSelectionHighlight',
      addProseMirrorPlugins() {
        return [new Plugin({
          key: new PluginKey('linkSelectionHighlight'),
          props: {
            decorations(state) {
              const range = ref.current;
              if (!range || range.from >= range.to) return DecorationSet.empty;
              const size = state.doc.content.size;
              const from = Math.max(1, Math.min(range.from, size));
              const to = Math.max(1, Math.min(range.to, size));
              if (from >= to) return DecorationSet.empty;
              return DecorationSet.create(state.doc, [
                Decoration.inline(from, to, {
                  style: 'background-color: rgb(99 102 241 / 0.25); border-radius: 2px;',
                }),
              ]);
            },
          },
        })];
      },
    });
  }, []);

  // Note ref picker
  const [showNoteRefPicker, setShowNoteRefPicker] = useState(false);
  const noteRefPickerRef = useRef<HTMLDivElement>(null);       // trigger button wrapper
  const noteRefPickerPortalRef = useRef<HTMLDivElement>(null); // portal content
  const [noteRefCoords, setNoteRefCoords] = useState({ top: 0, left: 0 });

  const openNoteRefPicker = () => {
    if (!showNoteRefPicker && noteRefPickerRef.current) {
      const r = noteRefPickerRef.current.getBoundingClientRect();
      setNoteRefCoords({ top: r.bottom + 4, left: r.left });
    }
    setShowNoteRefPicker(o => !o);
    setShowLinkPopover(false);
  };

  // Close popovers when clicking/touching anywhere outside them
  useEffect(() => {
    if (!showLinkPopover && !showNoteRefPicker) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const t = (e instanceof TouchEvent ? e.touches[0]?.target : e.target) as Node | null;
      if (!t) return;
      if (showLinkPopover && !linkPopoverRef.current?.contains(t)) setShowLinkPopover(false);
      if (showNoteRefPicker &&
          !noteRefPickerRef.current?.contains(t) &&
          !noteRefPickerPortalRef.current?.contains(t)) {
        setShowNoteRefPicker(false);
      }
    };
    document.addEventListener('mousedown', handler as EventListener);
    document.addEventListener('touchstart', handler as EventListener, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler as EventListener);
      document.removeEventListener('touchstart', handler as EventListener);
    };
  }, [showLinkPopover, showNoteRefPicker]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CustomLink,
      NoteRef,
      LinkSelectionHighlight,
    ],
    content: toSafeHtml(value),
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    onTransaction: () => setTick(t => t + 1),
    autofocus: autoFocus,
    editorProps: { attributes: { class: 'rich-editor-content outline-none', spellcheck: 'false' } },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = toSafeHtml(value);
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (incoming !== current) editor.commands.setContent(incoming, false);
  }, [value]);

  // When the link popover is dismissed (click-outside), clear the decoration highlight
  useEffect(() => {
    if (showLinkPopover) return;
    if (!editor || !linkHighlightRef.current) return;
    linkHighlightRef.current = null;
    editor.view.dispatch(editor.state.tr.setMeta('clearLinkHighlight', true));
  }, [showLinkPopover]);

  if (!editor) return null;

  // Close link popover and clear the selection highlight decoration
  const closeLinkPopover = () => {
    linkHighlightRef.current = null;
    editor.view.dispatch(editor.state.tr.setMeta('clearLinkHighlight', true));
    setShowLinkPopover(false);
  };

  // Insert a note-ref node (atomic chip — cursor cannot enter)
  const insertNoteRef = (id: string, title: string, noteHtml?: string, itemPath?: any) => {
    editor.chain().focus().insertContent({
      type: 'noteRef',
      attrs: {
        'data-note-id':    id,
        'data-note-title': title,
        'data-note-html':  noteHtml !== undefined ? encodeURIComponent(noteHtml) : null,
        'data-item-path':  itemPath ? JSON.stringify(itemPath) : null,
      },
    }).run();
  };

  const isBold      = isActiveOrStored(editor, 'bold');
  const isItalic    = isActiveOrStored(editor, 'italic');
  const isUnder     = isActiveOrStored(editor, 'underline');
  const isStrike    = isActiveOrStored(editor, 'strike');
  const activeColor = getActiveColor(editor);
  const activeHL    = getActiveHighlight(editor);

  return (
    <div className={cn('flex flex-col rounded-xl border border-border/60 bg-background overflow-hidden', className)}>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border/50 bg-secondary/40">

        <FontSizeSelect editor={editor} t={t} />

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()}      active={isBold}   title="Bold"><Bold size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()}    active={isItalic} title="Italic"><Italic size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={isUnder}  title="Underline"><UnderlineIcon size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()}    active={isStrike} title="Strikethrough"><Strikethrough size={13} /></ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ColorPopover
          colors={TEXT_COLORS}
          onSelect={v => v ? editor.chain().focus().setColor(v).run() : editor.chain().focus().unsetColor().run()}
          activeColor={activeColor}
          icon={Palette}
          title="Text Color"
        />
        <ColorPopover
          colors={HIGHLIGHT_COLORS}
          onSelect={v => v ? editor.chain().focus().setHighlight({ color: v }).run() : editor.chain().focus().unsetHighlight().run()}
          activeColor={activeHL}
          icon={Highlighter}
          title="Highlight"
        />

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive('bulletList')}  title="Bullet List"><List size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List"><ListOrdered size={13} /></ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <TableMenu editor={editor} />

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* External URL link */}
        <div className="relative" ref={linkPopoverRef}>
          <ToolbarBtn
            onClick={() => {
              const { from, to, empty } = editor.state.selection;
              const text = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
              setLinkSelection({ empty, text, from, to });
              if (!empty) {
                linkHighlightRef.current = { from, to };
                editor.view.dispatch(editor.state.tr.setMeta('setLinkHighlight', true));
              }
              setShowLinkPopover(o => !o);
              setShowNoteRefPicker(false);
            }}
            active={editor.isActive('link')}
            title={t('insertLink')}
          >
            <Link2 size={13} />
          </ToolbarBtn>
          {showLinkPopover && (
            <LinkPopover
              editor={editor}
              onClose={closeLinkPopover}
              initialEmpty={linkSelection.empty}
              initialText={linkSelection.text}
              initialFrom={linkSelection.from}
              initialTo={linkSelection.to}
            />
          )}
        </div>

        {/* Internal note ref link */}
        <div className="relative" ref={noteRefPickerRef}>
          <ToolbarBtn
            onClick={openNoteRefPicker}
            active={false}
            title={t('insertNoteRef')}
          >
            <FileText size={13} />
          </ToolbarBtn>
          {showNoteRefPicker && (
            <NoteRefPicker
              onSelectPage={(id, title) => { insertNoteRef(id, title); setShowNoteRefPicker(false); }}
              onSelectItemNote={(title, html, itemPath) => { insertNoteRef('__item__', title, html, itemPath); setShowNoteRefPicker(false); }}
              onClose={() => setShowNoteRefPicker(false)}
              coords={noteRefCoords}
              pickerRef={noteRefPickerPortalRef}
            />
          )}
        </div>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting">
          <RemoveFormatting size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="Undo (Ctrl+Z)">
          <Undo2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="Redo (Ctrl+Y)">
          <Redo2 size={13} />
        </ToolbarBtn>
      </div>

      {/* ── Editor area ── */}
      <div
        className="flex-1 px-3 py-2.5 overflow-y-auto cursor-text relative"
        style={{ minHeight }}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          // Clicking outside ProseMirror (in padding) — collapse selection
          if (!t.closest('.ProseMirror')) {
            setShowLinkPopover(false);
            setShowNoteRefPicker(false);
            setTimeout(() => {
              if (!editor.state.selection.empty) {
                editor.commands.setTextSelection(editor.state.selection.anchor);
              }
            }, 0);
          }
        }}
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('a') || t.closest('[data-note-id]')) {
            e.preventDefault();
            e.stopPropagation();
          }
          editor.commands.focus();
        }}
      >
        {editor.isEmpty && (
          <p className="absolute pointer-events-none text-sm text-muted-foreground select-none top-2.5 left-3">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ─── Preview (read-only) ──────────────────────────────────────────────────────
export function RichTextPreview({
  html, className, onNoteRef,
}: {
  html: string;
  className?: string;
  onNoteRef?: (noteId: string, noteTitle: string, noteHtml?: string, itemPath?: any) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      // Handle note-ref spans
      const noteEl = (e.target as HTMLElement).closest('[data-note-id]');
      if (noteEl) {
        e.preventDefault();
        e.stopPropagation();
        const noteId = noteEl.getAttribute('data-note-id') || '';
        const noteTitle = noteEl.getAttribute('data-note-title') || '';
        const noteHtmlEncoded = noteEl.getAttribute('data-note-html');
        const noteHtml = noteHtmlEncoded ? decodeURIComponent(noteHtmlEncoded) : undefined;
        const itemPathStr = noteEl.getAttribute('data-item-path');
        const itemPath = itemPathStr ? (() => { try { return JSON.parse(itemPathStr); } catch { return undefined; } })() : undefined;
        onNoteRef?.(noteId, noteTitle, noteHtml, itemPath);
        return;
      }

      // Handle regular links — open in new tab
      const link = (e.target as HTMLElement).closest('a');
      if (link) {
        const href = link.getAttribute('href') || '';
        if (href && !href.startsWith('#')) {
          e.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [onNoteRef]);

  return (
    <div
      ref={containerRef}
      className={cn('rich-editor-content text-sm text-foreground', className)}
      dangerouslySetInnerHTML={{ __html: toSafeHtml(html) }}
    />
  );
}
