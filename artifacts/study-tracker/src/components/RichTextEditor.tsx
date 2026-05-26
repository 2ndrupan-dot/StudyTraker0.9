import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, RemoveFormatting, Palette, Highlighter,
  Link as LinkIcon,
} from 'lucide-react';

const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#111827' },
  { label: 'Gray', value: '#6B7280' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Orange', value: '#F97316' },
  { label: 'Yellow', value: '#EAB308' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Teal', value: '#14B8A6' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Purple', value: '#A855F7' },
  { label: 'Pink', value: '#EC4899' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: '' },
  { label: 'Yellow', value: '#FEF08A' },
  { label: 'Green', value: '#BBF7D0' },
  { label: 'Blue', value: '#BAE6FD' },
  { label: 'Pink', value: '#FBCFE8' },
  { label: 'Orange', value: '#FED7AA' },
  { label: 'Purple', value: '#E9D5FF' },
  { label: 'Red', value: '#FECACA' },
  { label: 'Teal', value: '#99F6E4' },
];

function ColorPopover({
  colors,
  onSelect,
  activeColor,
  icon: Icon,
  title,
}: {
  colors: { label: string; value: string }[];
  onSelect: (v: string) => void;
  activeColor?: string;
  icon: React.ElementType;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={title}
        onMouseDown={e => { e.preventDefault(); setOpen(o => !o); }}
        className={cn(
          'flex items-center justify-center w-7 h-7 rounded-lg transition-colors',
          open ? 'bg-primary/15 text-primary' : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
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
                'w-6 h-6 rounded-lg border-2 transition-transform hover:scale-110',
                activeColor === c.value ? 'border-primary' : 'border-transparent'
              )}
              style={{ backgroundColor: c.value || 'transparent' }}
            >
              {!c.value && (
                <span className="text-[9px] text-muted-foreground font-bold leading-none">✕</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
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

export function toSafeHtml(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('<')) return trimmed;
  return trimmed
    .split('\n')
    .map(line => line ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '<p></p>')
    .join('');
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  autoFocus?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  className,
  minHeight = '8rem',
  autoFocus = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
    ],
    content: toSafeHtml(value),
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? '' : editor.getHTML();
      onChange(html);
    },
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: 'rich-editor-content outline-none',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = toSafeHtml(value);
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (incoming !== current) {
      editor.commands.setContent(incoming, false);
    }
  }, [value]);

  if (!editor) return null;

  const activeTextColor = TEXT_COLORS.find(c => c.value && editor.isActive('textStyle', { color: c.value }))?.value;
  const activeHighlight = HIGHLIGHT_COLORS.find(c => c.value && editor.isActive('highlight', { color: c.value }))?.value;

  return (
    <div className={cn('flex flex-col rounded-xl border border-border/60 bg-background overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border/50 bg-secondary/40">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ColorPopover
          colors={TEXT_COLORS}
          onSelect={v => {
            if (v) editor.chain().focus().setColor(v).run();
            else editor.chain().focus().unsetColor().run();
          }}
          activeColor={activeTextColor}
          icon={Palette}
          title="Text Color"
        />
        <ColorPopover
          colors={HIGHLIGHT_COLORS}
          onSelect={v => {
            if (v) editor.chain().focus().setHighlight({ color: v }).run();
            else editor.chain().focus().unsetHighlight().run();
          }}
          activeColor={activeHighlight}
          icon={Highlighter}
          title="Highlight"
        />

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          <List size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
          <ListOrdered size={13} />
        </ToolbarBtn>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <ToolbarBtn
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title="Clear Formatting"
        >
          <RemoveFormatting size={13} />
        </ToolbarBtn>
      </div>

      {/* Editor */}
      <div
        className="flex-1 px-3 py-2.5 overflow-y-auto cursor-text"
        style={{ minHeight }}
        onClick={() => editor.commands.focus()}
      >
        {editor.isEmpty && (
          <p className="absolute pointer-events-none text-sm text-muted-foreground select-none">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function RichTextPreview({ html, className }: { html: string; className?: string }) {
  const safe = toSafeHtml(html);
  return (
    <div
      className={cn('rich-editor-content text-sm text-foreground', className)}
      dangerouslySetInnerHTML={{ __html: safe || '' }}
    />
  );
}
