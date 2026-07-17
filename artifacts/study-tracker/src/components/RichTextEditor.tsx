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
import { TextAlign } from '@tiptap/extension-text-align';
import { cn } from '@/lib/utils';
import { useLang } from '@/context/LangContext';
import { useStudy } from '@/context/StudyContext';
import { useAdmin } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';
import { Subject } from '@/lib/types';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, RemoveFormatting, Palette, Highlighter, ChevronDown,
  Undo2, Redo2, Table2, Plus, Trash2, ArrowRightToLine, ArrowDownToLine,
  ArrowLeftFromLine, ArrowUpFromLine, Link2, Unlink, FileText,
  ChevronLeft, ChevronRight, StickyNote,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  IndentIncrease, IndentDecrease,
  Library, X, FileDown, ChevronUp,
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

// ─── Normalize a URL so it always has a protocol before opening ───────────────
function normalizeHref(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed; // has protocol
  if (/^(mailto:|tel:)/i.test(trimmed)) return trimmed;              // mailto / tel
  return `https://${trimmed}`;                                        // bare hostname
}

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
              const anchor = (event.target as HTMLElement).closest('a');
              if (!anchor) return false;
              // Ctrl/Cmd+click → open the link in a new tab
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                const href = normalizeHref(anchor.getAttribute('href') ?? '');
                if (href) window.open(href, '_blank', 'noopener,noreferrer');
                return true;
              }
              // Regular click → prevent navigation so the cursor can be placed
              event.preventDefault();
              event.stopPropagation();
              return true;
            },
          },
        },
      }),
    ];
  },
}).configure({
  openOnClick: false,
  HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
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

// ─── Custom Indent extension ──────────────────────────────────────────────────
const INDENT_STEP = 30; // px per indent level

const Indent = Extension.create({
  name: 'indent',
  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        indent: {
          default: 0,
          parseHTML: (el: HTMLElement) => {
            const ml = el.style.marginLeft;
            if (!ml) return 0;
            const val = parseInt(ml, 10);
            return isNaN(val) ? 0 : Math.round(val / INDENT_STEP);
          },
          renderHTML: (attrs: Record<string, unknown>) => {
            const level = attrs.indent as number;
            if (!level || level <= 0) return {};
            return { style: `margin-left: ${level * INDENT_STEP}px` };
          },
        },
      },
    }];
  },
  addCommands() {
    const updateIndent = (delta: number) =>
      ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let changed = false;
        state.doc.nodesBetween(selection.from, selection.to, (node: any, pos: number) => {
          if ((this.options.types as string[]).includes(node.type.name)) {
            const current = (node.attrs.indent as number) ?? 0;
            const next = Math.max(0, Math.min(current + delta, 10));
            if (next !== current) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
              changed = true;
            }
            return false;
          }
          return true;
        });
        if (changed && dispatch) { dispatch(tr); return true; }
        return false;
      };
    return {
      indent: () => updateIndent(1),
      outdent: () => updateIndent(-1),
    } as any;
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name === 'listItem') return false;
        // Non-breaking spaces survive HTML serialisation and never collapse
        this.editor.commands.insertContent('\u00A0\u00A0\u00A0\u00A0');
        return true;
      },
      'Shift-Tab': () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name === 'listItem') return false;
        return (this.editor.commands as any).outdent();
      },
      // Space: convert to NBSP when at line start or after another space/NBSP
      ' ': () => {
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;

        // At the very beginning of a paragraph
        if ($from.parentOffset === 0) {
          this.editor.commands.insertContent('\u00A0');
          return true;
        }

        const nodeBefore = $from.nodeBefore;

        // Right after a hard break (<br> / Shift+Enter)
        if (nodeBefore && nodeBefore.type.name === 'hardBreak') {
          this.editor.commands.insertContent('\u00A0');
          return true;
        }

        // Right after a space or non-breaking space (consecutive spaces)
        if (nodeBefore && nodeBefore.isText) {
          const lastChar = (nodeBefore.text ?? '').slice(-1);
          if (lastChar === ' ' || lastChar === '\u00A0') {
            this.editor.commands.insertContent('\u00A0');
            return true;
          }
        }

        return false; // Regular space everywhere else
      },
    };
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
  onSelectPage, onSelectItemNote, onClose, coords,
}: {
  onSelectPage: (id: string, title: string) => void;
  onSelectItemNote: (title: string, html: string, itemPath: any) => void;
  onClose: () => void;
  coords: { top: number; left: number };
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
      style={{ top: coords.top, left: coords.left }}
      className="fixed z-[9999] bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden w-72"
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
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
          currentItems.map(item => {
            const handleNoteSelect = (e: React.MouseEvent | React.TouchEvent) => {
              e.preventDefault();
              e.stopPropagation();
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
            };
            return (
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
                <div
                  className="flex-1 min-w-0 overflow-x-auto"
                  style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                >
                  <span className="text-xs whitespace-nowrap">{item.title}</span>
                </div>
                {hasChildren(item) && (
                  <ChevronRight size={11} className="text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
              {item.note?.trim() && (
                <button
                  type="button"
                  onMouseDown={handleNoteSelect}
                  onTouchEnd={handleNoteSelect}
                  className="p-1.5 mr-1 rounded-lg hover:bg-amber-500/10 text-amber-500 shrink-0 transition-colors"
                  title="Insert note reference"
                >
                  <StickyNote size={11} />
                </button>
              )}
            </div>
            );
          })
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
    const href = normalizeHref(url.trim());
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
  const label = active ? t(active.tKey) : t('fontSizeNormal');

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const [alignRight, setAlignRight] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Popover is ~150px wide; flip to right-align if it would overflow viewport
      setAlignRight(rect.left + 150 > window.innerWidth - 8);
    }
    setOpen(o => !o);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onMouseDown={handleToggle}
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
        <div
          className={cn(
            'absolute top-full mt-1 z-50 bg-card border border-border/60 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1 min-w-[140px]',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
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

// ─── Subject Notes Compiler (admin-only) ──────────────────────────────────────

interface NoteSection {
  label: string;   // e.g. "Subject", "Chapter", "Topic", "Subtopic", "Concept", "Point"
  title: string;   // the item's own title
  html: string;    // the item's note HTML (may be empty string if only a structural heading)
  depth: number;
}

/** Returns true if this node or any of its descendants has a non-empty note */
function nodeHasAnyNote(item: any): boolean {
  if (typeof item.note === 'string' && item.note.trim()) return true;
  const kids: any[] =
    item.chapters ?? item.topics ?? item.subtopics ?? item.concepts ?? item.points ?? [];
  return kids.some(nodeHasAnyNote);
}

/** DFS traversal — always emits a heading for a level if it or any descendant
 *  has a note, so the hierarchy is never broken (e.g. Chapter A heading always
 *  appears before its topics even when the chapter itself has no note text). */
function collectNoteSections(subject: Subject): NoteSection[] {
  const sections: NoteSection[] = [];

  const add = (label: string, title: string, note: string | undefined, depth: number) => {
    sections.push({ label, title, html: (note ?? '').trim() ? note! : '', depth });
  };

  // Subject
  if (!nodeHasAnyNote(subject)) return sections;
  add('Subject', subject.title, subject.note, 0);

  for (const ch of (subject.chapters ?? [])) {
    if (!nodeHasAnyNote(ch)) continue;
    add('Chapter', ch.title, ch.note, 1);

    for (const tp of (ch.topics ?? [])) {
      if (!nodeHasAnyNote(tp)) continue;
      add('Topic', tp.title, tp.note, 2);

      for (const st of (tp.subtopics ?? [])) {
        if (!nodeHasAnyNote(st)) continue;
        add('Subtopic', st.title, st.note, 3);

        for (const co of (st.concepts ?? [])) {
          if (!nodeHasAnyNote(co)) continue;
          add('Concept', co.title, co.note, 4);

          for (const pt of (co.points ?? [])) {
            if (!pt.note?.trim()) continue;   // points have no children — skip if no note
            add('Point', pt.title, pt.note, 5);
          }
        }
      }
    }
  }

  return sections;
}

/** Build a single Tiptap-compatible HTML string from compiled sections — used
 *  both for the "Save as Note" feature and as an alternative to dangerouslySetInnerHTML. */
function sectionsToSaveHtml(sections: NoteSection[]): string {
  return sections.map(({ label, title, html }) => {
    const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const heading = `<p style="text-align:center"><strong>${label} : ${safeTitle}</strong></p>`;
    return html.trim() ? `${heading}${html}<p></p>` : `${heading}<p></p>`;
  }).join('');
}

function SubjectNotesCompilerModal({
  subjects,
  onClose,
}: {
  subjects: Subject[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { appContact } = useAdmin();
  const { createNotePage, saveNotePage, notePagesIndex } = useStudy();

  const [step, setStep] = useState<'pick' | 'view'>('pick');
  const [selected, setSelected] = useState<Subject | null>(null);
  const [sections, setSections] = useState<NoteSection[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleSelect = (subj: Subject) => {
    // Restore savedId if a compiled note for this subject already exists
    const pageTitle = `${subj.title} — All Notes`;
    const existing = notePagesIndex.find(p => p.title === pageTitle);
    setSavedId(existing?.id ?? null);
    setSelected(subj);
    setSections(collectNoteSections(subj));
    setStep('view');
  };

  // Save compiled notes — reuse existing note if one already exists for this subject
  const handleSaveAsNote = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const pageTitle = `${selected.title} — All Notes`;
      const existing = notePagesIndex.find(p => p.title === pageTitle);
      const id = existing ? existing.id : createNotePage(pageTitle);
      const now = Date.now();
      await saveNotePage({
        id,
        title: pageTitle,
        elements: [],
        pageCount: 1,
        html: sectionsToSaveHtml(sections),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      });
      setSavedId(id);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!selected) return;
    const safeTitle = selected.title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const now = new Date();
    const safeDate =
      now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ', ' + now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const safeWebsite = (appContact.website || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const websiteSpan = safeWebsite
      ? `<span>🌐 Website : <a href="${safeWebsite}">${safeWebsite}</a></span>` : '';
    const whatsAppSpan = appContact.whatsapp
      ? `<span>💬 WhatsApp : ${appContact.whatsapp}</span>` : '';
    const printedBySpan = user?.email
      ? `<span>🖨️ Printed by : ${user.email}</span>` : '';

    const footerInner =
      `<span>📝 Created by : StudyTrack team</span>${whatsAppSpan}${websiteSpan}${printedBySpan}`;
    const footerFieldCount = (footerInner.match(/<span/g) || []).length;
    const footerTextLength = footerInner.replace(/<[^>]+>/g, '').length;
    let footerFontSize = 12, footerGap = 24;
    if (footerFieldCount >= 4 || footerTextLength > 110) { footerFontSize = 9;  footerGap = 12; }
    else if (footerFieldCount >= 3 || footerTextLength > 80)  { footerFontSize = 10; footerGap = 16; }
    else if (footerTextLength > 55)                           { footerFontSize = 11; footerGap = 20; }

    const sectionsHtml = sections.length
      ? sections.map(({ label, title, html }) => {
          const safeT = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `
          <div class="note-section">
            <div class="section-heading">${label} : ${safeT}</div>
            ${html ? `<div class="section-body">${html}</div>` : ''}
          </div>`;
        }).join('')
      : '<p style="color:#9ca3af">No notes found in this subject.</p>';

    const pdfHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${safeTitle}</title>
<style>
  @page { size: A4; margin: 0 0 26px 0; }
  @page { @bottom-right { content: counter(page) " / " counter(pages); font-size:10px; color:#9ca3af;
    font-family:sans-serif; padding:4px 10px 0 0; } }
  * { box-sizing:border-box; margin:0; padding:0;
      -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  html,body { width:100%; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;
    color:#111; text-rendering:geometricPrecision; }
  *,p,span,li,td,th,h1,h2,h3,blockquote {
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif !important; }
  table.pdf-layout { width:100%; border-collapse:collapse; }
  thead { display:table-header-group; } tfoot { display:table-footer-group; } tbody { display:table-row-group; }
  .pdf-header-cell { height:44px; vertical-align:middle; font-size:12px; background:#f9fafb;
    border-bottom:1px solid #e5e7eb; padding:0 48px; }
  .pdf-header-spacer { height:24px; background:#fff; }
  .pdf-header-inner { display:flex; align-items:center; justify-content:space-between; height:100%; }
  .pdf-header-date { color:#6b7280; font-weight:400; }
  .pdf-header-title { color:#374151; font-weight:600; text-align:right; }
  .pdf-footer-cell { height:44px; vertical-align:middle; font-size:${footerFontSize}px;
    color:#6b7280; background:#f9fafb; border-top:1px solid #e5e7eb; overflow:hidden; }
  .pdf-footer-inner { display:flex; flex-wrap:nowrap; align-items:center; justify-content:center;
    gap:${footerGap}px; height:100%; white-space:nowrap; padding:0 10px; }
  .pdf-footer-inner span { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; flex-shrink:0; }
  .pdf-content-cell { padding:36px 48px 28px; }
  h1 { font-size:22px; font-weight:bold; margin-bottom:24px; padding-bottom:12px; border-bottom:2px solid #e5e7eb; }
  p { margin-bottom:10px; line-height:1.7; font-size:14px; }
  strong { font-weight:bold; } em { font-style:italic; } u { text-decoration:underline; }
  ul,ol { padding-left:22px; margin-bottom:10px; }
  li { margin-bottom:4px; font-size:14px; line-height:1.6; }
  h2 { font-size:18px; font-weight:bold; margin:20px 0 10px; }
  h3 { font-size:16px; font-weight:bold; margin:16px 0 8px; }
  a { color:#2563eb; text-decoration:underline; }
  .pdf-content-cell table { width:100%; border-collapse:collapse; margin-bottom:12px; }
  .pdf-content-cell th,.pdf-content-cell td { border:1px solid #d1d5db; padding:6px 10px; font-size:13px; }
  .pdf-content-cell th { background:#f9fafb; font-weight:bold; }
  mark { display:inline; border-radius:2px; padding:0 1px; }
  .note-section { margin-bottom:32px; }
  .section-heading { font-weight:bold; font-size:15px; text-align:center;
    margin-bottom:10px; padding-bottom:5px; border-bottom:1px solid #e5e7eb; color:#1e1b4b; }
  .section-body { font-size:14px; line-height:1.7; }
</style></head><body>
<table class="pdf-layout">
  <thead>
    <tr><td class="pdf-header-cell">
      <div class="pdf-header-inner">
        <span class="pdf-header-date">${safeDate}</span>
        <span class="pdf-header-title">${safeTitle} — All Notes</span>
      </div>
    </td></tr>
    <tr><td class="pdf-header-spacer"></td></tr>
  </thead>
  <tfoot>
    <tr><td class="pdf-footer-cell">
      <div class="pdf-footer-inner">${footerInner}</div>
    </td></tr>
  </tfoot>
  <tbody>
    <tr><td class="pdf-content-cell">
      <h1>${safeTitle} — All Notes</h1>
      ${sectionsHtml}
    </td></tr>
  </tbody>
</table>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(pdfHtml);
    win.document.close();
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); };
    win.addEventListener('load', () => {
      const fonts = (win.document as any).fonts as FontFaceSet | undefined;
      if (fonts) fonts.ready.then(doPrint); else setTimeout(doPrint, 200);
    });
    setTimeout(doPrint, 1500);
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[90vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Library size={18} className="text-primary" />
            <span className="font-semibold text-base text-foreground">
              {step === 'pick' ? 'সাবজেক্ট বাছাই করুন' : (selected?.title ?? 'Notes')}
            </span>
            {step === 'view' && sections.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({sections.length}টি সেকশন)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {step === 'view' && sections.length > 0 && (
              <>
                {/* Save as note */}
                {savedId ? (
                  <span className="text-xs text-emerald-600 font-medium px-2">✓ সেভ হয়েছে</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveAsNote}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-medium transition-colors disabled:opacity-50"
                    title="নোট হিসেবে সেভ করুন এবং পরে খুলুন"
                  >
                    <StickyNote size={12} />
                    {saving ? 'সেভ হচ্ছে…' : 'নোট হিসেবে সেভ'}
                  </button>
                )}
                {/* Download PDF */}
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                  title="PDF ডাউনলোড"
                >
                  <FileDown size={12} />
                  PDF
                </button>
                {/* Back */}
                <button
                  type="button"
                  onClick={() => { setStep('pick'); setSavedId(null); }}
                  className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="ফিরে যান"
                >
                  <ChevronUp size={15} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="বন্ধ করুন"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {step === 'pick' ? (
            <div className="p-4">
              {subjects.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  এই কোর্সে কোনো সাবজেক্ট নেই।
                </p>
              ) : (
                <div className="space-y-2">
                  {subjects.map(subj => (
                    <button
                      key={subj.id}
                      type="button"
                      onClick={() => handleSelect(subj)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                    >
                      {subj.color && (
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: subj.color }} />
                      )}
                      <span className="flex-1 font-medium text-sm text-foreground">{subj.title}</span>
                      <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5">
              {sections.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  এই সাবজেক্টে এখনো কোনো নোট নেই।
                </p>
              ) : (
                <div className="space-y-6">
                  {sections.map((sec, i) => (
                    <div key={i}>
                      {/* Centered bold heading with level label */}
                      <div className="font-bold text-center text-sm text-foreground mb-2 pb-2 border-b border-border/40">
                        {sec.label} : {sec.title}
                      </div>
                      {/* Note body — only shown if there's actual content */}
                      {sec.html && (
                        <div
                          className="rich-editor-content text-sm text-foreground leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: sec.html }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Save success footer ── */}
        {savedId && (
          <div className="px-5 py-3 border-t border-border/50 bg-emerald-500/5 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              ✓ নোট সেভ হয়েছে — Notes পেজ থেকে খুলতে পারবেন।
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
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
  maxHeight?: string;
  autoFocus?: boolean;
}

export function RichTextEditor({
  value, onChange,
  placeholder = 'Write something...',
  className, minHeight = '8rem', maxHeight, autoFocus = false,
}: RichTextEditorProps) {
  const { t } = useLang();
  const { settings, subjects } = useStudy();
  const { isAdmin } = useAdmin();
  const [, setTick] = useState(0);

  // Admin-only: Subject notes compiler modal
  const [showCompiler, setShowCompiler] = useState(false);

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
  const noteRefPickerRef = useRef<HTMLDivElement>(null); // trigger button wrapper
  const [noteRefCoords, setNoteRefCoords] = useState({ top: 0, left: 0 });

  const openNoteRefPicker = () => {
    if (!showNoteRefPicker && noteRefPickerRef.current) {
      const r = noteRefPickerRef.current.getBoundingClientRect();
      const POPOVER_W = 288; // w-72
      const clampedLeft = Math.min(r.left, window.innerWidth - POPOVER_W - 8);
      setNoteRefCoords({ top: r.bottom + 4, left: Math.max(8, clampedLeft) });
    }
    setShowNoteRefPicker(o => !o);
    setShowLinkPopover(false);
  };

  // Close popovers when clicking/touching anywhere outside them
  useEffect(() => {
    if (!showLinkPopover) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (showLinkPopover && !linkPopoverRef.current?.contains(t)) setShowLinkPopover(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLinkPopover]);

  const lastEditorHtmlRef = useRef(toSafeHtml(value));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Indent,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CustomLink,
      NoteRef,
      LinkSelectionHighlight,
    ],
    content: toSafeHtml(value),
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? '' : editor.getHTML();
      console.log('[RichTextEditor] onUpdate HTML:', html.substring(0, 400));
      lastEditorHtmlRef.current = toSafeHtml(html);
      onChange(html);
    },
    onTransaction: () => setTick(t => t + 1),
    autofocus: autoFocus,
    editorProps: { attributes: { class: 'rich-editor-content outline-none', spellcheck: 'false' } },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = toSafeHtml(value);
    if (incoming === lastEditorHtmlRef.current) return;
    lastEditorHtmlRef.current = incoming;
    editor.commands.setContent(incoming, false);
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
    <div
      className={cn('flex flex-col rounded-xl border border-border/60 bg-background overflow-hidden', className)}
      style={settings?.globalNoteSize ? { '--note-size': settings.globalNoteSize } as React.CSSProperties : undefined}
    >
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
            <>
              {/* Invisible overlay — catches any click/touch outside the picker */}
              {ReactDOM.createPortal(
                <div
                  className="fixed inset-0 z-[9998]"
                  onMouseDown={e => { e.preventDefault(); setShowNoteRefPicker(false); }}
                  onTouchStart={() => setShowNoteRefPicker(false)}
                />,
                document.body
              )}
              <NoteRefPicker
                onSelectPage={(id, title) => { insertNoteRef(id, title); setShowNoteRefPicker(false); }}
                onSelectItemNote={(title, html, itemPath) => { insertNoteRef('__item__', title, html, itemPath); setShowNoteRefPicker(false); }}
                onClose={() => setShowNoteRefPicker(false)}
                coords={noteRefCoords}
              />
            </>
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

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
          <AlignLeft size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Align Center">
          <AlignCenter size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
          <AlignRight size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({ textAlign: 'justify' })} title="Justify">
          <AlignJustify size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => (editor.commands as any).outdent()} active={false} title="Decrease Indent (Shift+Tab)">
          <IndentDecrease size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => (editor.commands as any).indent()} active={false} title="Increase Indent (Tab)">
          <IndentIncrease size={13} />
        </ToolbarBtn>

        {/* Admin-only: compile all notes from a subject */}
        {isAdmin && (
          <>
            <div className="w-px h-4 bg-border/60 mx-1" />
            <ToolbarBtn
              onClick={() => setShowCompiler(true)}
              active={showCompiler}
              title="Compile All Subject Notes (Admin)"
            >
              <Library size={13} />
            </ToolbarBtn>
          </>
        )}
      </div>

      {/* ── Editor area ── */}
      <div
        className="flex-1 px-3 py-2.5 overflow-y-auto cursor-text relative"
        style={{ minHeight, ...(maxHeight ? { maxHeight } : {}) }}
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

      {/* Admin-only: Subject notes compiler modal */}
      {isAdmin && showCompiler && (
        <SubjectNotesCompilerModal
          subjects={subjects}
          onClose={() => setShowCompiler(false)}
        />
      )}
    </div>
  );
}

// ─── Preview (read-only TipTap editor — exact same rendering as edit mode) ────
export function RichTextPreview({
  html, className, onNoteRef,
}: {
  html: string;
  className?: string;
  onNoteRef?: (noteId: string, noteTitle: string, noteHtml?: string, itemPath?: any) => void;
}) {
  const { settings } = useStudy();
  // Use a read-only TipTap editor so the preview renders identically to edit mode
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['paragraph', 'heading'] }),
      Indent,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CustomLink,
      NoteRef,
    ],
    content: toSafeHtml(html),
    editable: false,
    editorProps: {
      attributes: {
        class: cn('rich-editor-content text-sm text-foreground outline-none', className),
      },
    },
  });

  // Sync content when html prop changes
  useEffect(() => {
    if (!editor) return;
    const incoming = toSafeHtml(html);
    console.log('[RichTextPreview] received html:', incoming.substring(0, 600));
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (incoming !== current) {
      editor.commands.setContent(incoming, false);
    }
  }, [editor, html]);

  // Handle clicks on note-refs and links
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement;

    const handleClick = (e: MouseEvent) => {
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

      const link = (e.target as HTMLElement).closest('a');
      if (link) {
        const href = normalizeHref(link.getAttribute('href') || '');
        if (href && !href.startsWith('#')) {
          e.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [editor, onNoteRef]);

  return (
    <div style={settings?.globalNoteSize ? { '--note-size': settings.globalNoteSize } as React.CSSProperties : undefined}>
      <EditorContent editor={editor} />
    </div>
  );
}
