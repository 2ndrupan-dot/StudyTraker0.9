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
    : 'opacity-90 sm:opacity-70 sm:hover:opacity-100 group-hover/row:opacity-100 transition-opacity';

  return (
    <div className={`flex items-center gap-0.5 shrink-0 ${visibility}`}>
      <button
        onClick={e => { e.stopPropagation(); onOpenNote(path, currentNote); }}
        className={`${btn} ${hasNote ? 'text-amber-500 bg-amber-500/15 border-amber-400/50' : 'text-foreground/70 hover:text-amber-500 dark:text-slate-300 dark:hover:text-amber-400'}`}
        title={hasNote ? t('editNote') : t('addNote')}
        aria-label={hasNote ? t('editNote') : t('addNote')}
      >
        <StickyNote size={iconSize} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); toggleImportant(path); }}
        className={`${btn} ${important ? 'text-yellow-500 bg-yellow-400/20 border-yellow-400/60' : 'text-foreground/70 hover:text-yellow-500 dark:text-slate-300 dark:hover:text-yellow-400'}`}
        title={important ? t('unmarkImportant') : t('markImportant')}
        aria-label={important ? t('unmarkImportant') : t('markImportant')}
      >
        <Star size={iconSize} fill={important ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); toggleWeak(path); }}
        className={`${btn} ${weak ? 'text-rose-500 bg-rose-500/15 border-rose-400/60' : 'text-foreground/70 hover:text-rose-500 dark:text-slate-300 dark:hover:text-rose-400'}`}
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
  // flex-nowrap + shrink keeps all active badges on one line regardless of
  // how many are present, instead of wrapping to a second line.
  return (
    <div className="flex items-center gap-1 flex-nowrap overflow-x-auto no-scrollbar">
      {important && (
        <span className={`flex items-center gap-0.5 ${px} rounded font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-400/20 border border-yellow-300/60 dark:border-yellow-400/40 shrink-0`}>
          <Star size={size === 'xs' ? 8 : 9} fill="currentColor" />
        </span>
      )}
      {weak && (
        <span className={`flex items-center gap-0.5 ${px} rounded font-bold text-rose-600 dark:text-rose-400 bg-rose-500/15 border border-rose-300/60 dark:border-rose-400/40 shrink-0`}>
          <AlertTriangle size={size === 'xs' ? 8 : 9} fill="currentColor" />
        </span>
      )}
      {note && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClickNote?.(); }}
          className={`flex items-center gap-0.5 ${px} rounded font-bold text-amber-600 dark:text-amber-400 bg-amber-400/15 border border-amber-300/60 dark:border-amber-400/40 hover:bg-amber-400/25 shrink min-w-0`}
        >
          <StickyNote size={size === 'xs' ? 8 : 9} className="shrink-0" />
          <span className="truncate">{t('note')}</span>
        </button>
      )}
    </div>
  );
}
