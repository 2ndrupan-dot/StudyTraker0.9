import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent, Extension, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { cn } from '@/lib/utils';
import { useLang } from '@/context/LangContext';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, RemoveFormatting, Palette, Highlighter, ChevronDown,
  Undo2, Redo2,
} from 'lucide-react';

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

// ─── Active state helpers (check both cursor marks AND stored/pending marks) ──

/**
 * Returns true if the mark is active on the selection OR queued as a stored
 * mark (i.e. the user toggled it at an empty cursor before typing).
 */
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

/** Get the fontSize from stored marks (pending mark before typing). */
function getStoredFontSize(editor: Editor): string | null {
  const stored = editor.view.state.storedMarks;
  if (!stored) return null;
  const ts = stored.find(m => m.type.name === 'textStyle');
  return (ts?.attrs?.fontSize as string) ?? null;
}

/** Get active text color considering stored marks too. */
function getActiveColor(editor: Editor): string | null {
  const fromActive = TEXT_COLORS.find(c => c.value && editor.isActive('textStyle', { color: c.value }))?.value ?? null;
  if (fromActive) return fromActive;
  const stored = editor.view.state.storedMarks;
  if (!stored) return null;
  const ts = stored.find(m => m.type.name === 'textStyle');
  return (ts?.attrs?.color as string) ?? null;
}

/** Get active highlight color considering stored marks too. */
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

// ─── Font Size Dropdown ───────────────────────────────────────────────────────
function FontSizeSelect({
  editor,
  t,
}: {
  editor: Editor;
  t: (key: any) => string;
}) {
  const { open, setOpen, ref } = usePopover();

  // Check both selection-active AND stored-pending font size
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
          {/* Default / clear */}
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
  // Re-render counter driven by editor transactions so stored marks are always fresh
  const [, setTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: toSafeHtml(value),
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
    // Fire a re-render on every transaction (including storedMarks changes)
    onTransaction: () => setTick(t => t + 1),
    autofocus: autoFocus,
    editorProps: { attributes: { class: 'rich-editor-content outline-none' } },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = toSafeHtml(value);
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (incoming !== current) editor.commands.setContent(incoming, false);
  }, [value]);

  if (!editor) return null;

  // Derive active states (selection + stored/pending marks)
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

        {/* Font size */}
        <FontSizeSelect editor={editor} t={t} />

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Text formatting */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()}      active={isBold}   title="Bold"><Bold size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()}    active={isItalic} title="Italic"><Italic size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={isUnder}  title="Underline"><UnderlineIcon size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()}    active={isStrike} title="Strikethrough"><Strikethrough size={13} /></ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Color & Highlight */}
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

        {/* Lists */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={editor.isActive('bulletList')}  title="Bullet List"><List size={13} /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List"><ListOrdered size={13} /></ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Clear */}
        <ToolbarBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear Formatting">
          <RemoveFormatting size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Undo / Redo */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().undo().run()}
          active={false}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().redo().run()}
          active={false}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={13} />
        </ToolbarBtn>
      </div>

      {/* ── Editor area ── */}
      <div
        className="flex-1 px-3 py-2.5 overflow-y-auto cursor-text relative"
        style={{ minHeight }}
        onClick={() => editor.commands.focus()}
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
export function RichTextPreview({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn('rich-editor-content text-sm text-foreground', className)}
      dangerouslySetInnerHTML={{ __html: toSafeHtml(html) }}
    />
  );
}
