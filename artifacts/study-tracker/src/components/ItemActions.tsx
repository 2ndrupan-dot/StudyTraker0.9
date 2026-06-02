import React from 'react';
import { Star, AlertTriangle, StickyNote } from 'lucide-react';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import type { MarkPath } from '@/lib/types';

interface ItemActionsProps {
  path: MarkPath;
  important?: boolean;
  weak?: boolean;
  hasNote?: boolean;
  onOpenNote: (path: MarkPath, currentNote: string) => void;
  currentNote?: string;
  size?: 'sm' | 'md';
  /** When true the buttons are always visible (instead of fading in on hover) */
  alwaysVisible?: boolean;
}

export function ItemActions({
  path, important, weak, hasNote,
  onOpenNote, currentNote = '',
  size = 'md', alwaysVisible = false,
}: ItemActionsProps) {
  const { toggleImportant, toggleWeak } = useStudy();
  const { t } = useLang();

  const iconSize = size === 'sm' ? 11 : 13;
  const btn = 'p-1 rounded-md transition-all border border-transparent hover:bg-secondary/70 active:scale-95';
  const visibility = alwaysVisible
    ? ''
    : 'opacity-60 hover:opacity-100 group-hover/row:opacity-100 transition-opacity';

  return (
    <div className={`flex items-center gap-0.5 shrink-0 ${visibility}`}>
      <button
        onClick={e => { e.stopPropagation(); onOpenNote(path, currentNote); }}
        className={`${btn} ${hasNote ? 'text-amber-600 bg-amber-500/10 border-amber-300/50' : 'text-muted-foreground hover:text-amber-600'}`}
        title={hasNote ? t('editNote') : t('addNote')}
        aria-label={hasNote ? t('editNote') : t('addNote')}
      >
        <StickyNote size={iconSize} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); toggleImportant(path); }}
        className={`${btn} ${important ? 'text-yellow-600 bg-yellow-400/15 border-yellow-300/60' : 'text-muted-foreground hover:text-yellow-600'}`}
        title={important ? t('unmarkImportant') : t('markImportant')}
        aria-label={important ? t('unmarkImportant') : t('markImportant')}
      >
        <Star size={iconSize} fill={important ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); toggleWeak(path); }}
        className={`${btn} ${weak ? 'text-rose-600 bg-rose-500/10 border-rose-300/60' : 'text-muted-foreground hover:text-rose-600'}`}
        title={weak ? t('unmarkWeak') : t('markWeak')}
        aria-label={weak ? t('unmarkWeak') : t('markWeak')}
      >
        <AlertTriangle size={iconSize} fill={weak ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function MarksBadgeRow({
  important, weak, note,
  size = 'sm', onClickNote,
}: {
  important?: boolean;
  weak?: boolean;
  note?: string;
  size?: 'xs' | 'sm';
  onClickNote?: () => void;
}) {
  const { t } = useLang();
  if (!important && !weak && !note) return null;
  const px = size === 'xs' ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5';
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {important && (
        <span className={`flex items-center gap-0.5 ${px} rounded font-bold text-yellow-700 bg-yellow-400/20 border border-yellow-300/60`}>
          <Star size={size === 'xs' ? 8 : 9} fill="currentColor" />
        </span>
      )}
      {weak && (
        <span className={`flex items-center gap-0.5 ${px} rounded font-bold text-rose-700 bg-rose-500/15 border border-rose-300/60`}>
          <AlertTriangle size={size === 'xs' ? 8 : 9} fill="currentColor" />
        </span>
      )}
      {note && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClickNote?.(); }}
          className={`flex items-center gap-0.5 ${px} rounded font-bold text-amber-700 bg-amber-400/15 border border-amber-300/60 hover:bg-amber-400/25`}
        >
          <StickyNote size={size === 'xs' ? 8 : 9} />
          <span>{t('note')}</span>
        </button>
      )}
    </div>
  );
}
