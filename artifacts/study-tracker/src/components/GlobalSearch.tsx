import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Search, X, BookOpen, Layers, List, Lightbulb, Hash, StickyNote, FileText, FolderPlus, ChevronRight, NotebookPen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import type { Subject, TempNoteItem } from '@/lib/types';

type ResultKind = 'subject' | 'chapter' | 'topic' | 'subtopic' | 'concept' | 'point' | 'tempNote' | 'notePage' | 'overallNote';

interface NavTarget {
  kind: ResultKind;
  subjectId?: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string;
  conceptId?: string;
  pointId?: string;
}

interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  breadcrumb: string[];
  snippet?: string;
  href: string;
  Icon: React.ElementType;
  navTarget?: NavTarget;
}

const kindIcon: Record<ResultKind, React.ElementType> = {
  subject: BookOpen,
  chapter: FolderPlus,
  topic: Layers,
  subtopic: List,
  concept: Lightbulb,
  point: Hash,
  tempNote: StickyNote,
  notePage: FileText,
  overallNote: NotebookPen,
};

const kindColor: Record<ResultKind, string> = {
  subject: 'text-primary bg-primary/10',
  chapter: 'text-blue-600 bg-blue-500/10',
  topic: 'text-violet-600 bg-violet-500/10',
  subtopic: 'text-cyan-600 bg-cyan-500/10',
  concept: 'text-amber-600 bg-amber-500/10',
  point: 'text-green-600 bg-green-500/10',
  tempNote: 'text-rose-600 bg-rose-500/10',
  notePage: 'text-indigo-600 bg-indigo-500/10',
  overallNote: 'text-indigo-600 bg-indigo-500/10',
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const lowerT = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerT.indexOf(lowerQ);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300/60 text-foreground rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { subjects, tempNotes, notePagesIndex, overallNote } = useStudy();
  const { t, lang } = useLang();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const qLow = q.toLowerCase();
    const matches = (s?: string) => !!s && s.toLowerCase().includes(qLow);
    const matchesHtml = (html?: string) => !!html && stripHtml(html).toLowerCase().includes(qLow);
    const out: SearchResult[] = [];

    // Subjects + tree
    for (const subj of subjects) {
      const subjBread = [subj.title];
      if (matches(subj.title) || matchesHtml(subj.note)) {
        out.push({
          id: subj.id, kind: 'subject', title: subj.title, breadcrumb: [],
          snippet: matchesHtml(subj.note) ? stripHtml(subj.note!) : undefined,
          href: '/subjects', Icon: kindIcon.subject,
          navTarget: { kind: 'subject', subjectId: subj.id },
        });
      }
      for (const ch of subj.chapters) {
        if (matches(ch.title) || matchesHtml(ch.note)) {
          out.push({
            id: ch.id, kind: 'chapter', title: ch.title, breadcrumb: subjBread,
            snippet: matchesHtml(ch.note) ? stripHtml(ch.note!) : undefined,
            href: '/subjects', Icon: kindIcon.chapter,
            navTarget: { kind: 'chapter', subjectId: subj.id, chapterId: ch.id },
          });
        }
        const chBread = [...subjBread, ch.title];
        for (const tp of ch.topics) {
          if (matches(tp.title) || matchesHtml(tp.note)) {
            out.push({
              id: tp.id, kind: 'topic', title: tp.title, breadcrumb: chBread,
              snippet: matchesHtml(tp.note) ? stripHtml(tp.note!) : undefined,
              href: '/subjects', Icon: kindIcon.topic,
              navTarget: { kind: 'topic', subjectId: subj.id, chapterId: ch.id, topicId: tp.id },
            });
          }
          const tpBread = [...chBread, tp.title];
          for (const sub of tp.subtopics) {
            if (matches(sub.title) || matchesHtml(sub.note)) {
              out.push({
                id: sub.id, kind: 'subtopic', title: sub.title, breadcrumb: tpBread,
                snippet: matchesHtml(sub.note) ? stripHtml(sub.note!) : undefined,
                href: '/subjects', Icon: kindIcon.subtopic,
                navTarget: { kind: 'subtopic', subjectId: subj.id, chapterId: ch.id, topicId: tp.id, subtopicId: sub.id },
              });
            }
            const subBread = [...tpBread, sub.title];
            for (const c of sub.concepts) {
              if (matches(c.title) || matchesHtml(c.note)) {
                out.push({
                  id: c.id, kind: 'concept', title: c.title, breadcrumb: subBread,
                  snippet: matchesHtml(c.note) ? stripHtml(c.note!) : undefined,
                  href: '/subjects', Icon: kindIcon.concept,
                  navTarget: { kind: 'concept', subjectId: subj.id, chapterId: ch.id, topicId: tp.id, subtopicId: sub.id, conceptId: c.id },
                });
              }
              const cBread = [...subBread, c.title];
              for (const p of c.points) {
                if (matches(p.title) || matchesHtml(p.note)) {
                  out.push({
                    id: p.id, kind: 'point', title: p.title, breadcrumb: cBread,
                    snippet: matchesHtml(p.note) ? stripHtml(p.note!) : undefined,
                    href: '/subjects', Icon: kindIcon.point,
                    navTarget: { kind: 'point', subjectId: subj.id, chapterId: ch.id, topicId: tp.id, subtopicId: sub.id, conceptId: c.id, pointId: p.id },
                  });
                }
              }
            }
          }
        }
      }
    }

    // Temp notes (recurse)
    const walkTemp = (items: TempNoteItem[], crumbs: string[]) => {
      for (const it of items) {
        if (matches(it.text) || matchesHtml(it.note)) {
          out.push({
            id: it.id, kind: 'tempNote', title: it.text, breadcrumb: crumbs,
            snippet: matchesHtml(it.note) ? stripHtml(it.note!) : undefined,
            href: '/subjects', Icon: kindIcon.tempNote,
            navTarget: { kind: 'tempNote' },
          });
        }
        if (it.children?.length) walkTemp(it.children, [...crumbs, it.text.slice(0, 30)]);
      }
    };
    walkTemp(tempNotes, [t('tempNotes')]);

    // Note pages (titles only — body lives in separate docs)
    for (const np of notePagesIndex) {
      if (matches(np.title)) {
        out.push({
          id: np.id, kind: 'notePage', title: np.title || t('untitledPage'),
          breadcrumb: [t('notePagesTitle')],
          href: `/notes/${np.id}`, Icon: kindIcon.notePage,
          navTarget: { kind: 'notePage' },
        });
      }
    }

    // Overall note (Progress page)
    const overallPlain = stripHtml(overallNote);
    if (overallNote && overallPlain.toLowerCase().includes(qLow)) {
      out.push({
        id: 'overallNote', kind: 'overallNote',
        title: t('overallNotes'),
        breadcrumb: [t('progress')],
        snippet: overallPlain.slice(0, 120),
        href: '/progress', Icon: kindIcon.overallNote,
        navTarget: { kind: 'overallNote' },
      });
    }

    // Sort: prefer subjects/chapters before deeper levels, then by closeness of match
    const order: Record<ResultKind, number> = {
      subject: 0, chapter: 1, topic: 2, subtopic: 3, concept: 4, point: 5, tempNote: 1.5, notePage: 1.5, overallNote: 0.5,
    };
    out.sort((a, b) => {
      const ai = a.title.toLowerCase().indexOf(qLow);
      const bi = b.title.toLowerCase().indexOf(qLow);
      if (ai !== bi) return ai - bi;
      return order[a.kind] - order[b.kind];
    });

    return out.slice(0, 80);
  }, [query, subjects, tempNotes, notePagesIndex, overallNote, t]);

  const handleSelect = (r: SearchResult) => {
    onClose();
    // Store navigation intent for target page to auto-expand/open
    if (r.navTarget) {
      sessionStorage.setItem('study_nav_target', JSON.stringify({ ...r.navTarget, query: query.trim() }));
    }
    setLocation(r.href);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-3"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: -20, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -10, scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            style={{ maxHeight: '80vh' }}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
              <Search size={18} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="flex-1 bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground"
              />
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {query.trim().length < 2 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {t('searchHintNeed3')}
                </div>
              ) : results.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  {t('searchEmpty')}
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    {results.length} {t('searchResultsCount')}
                  </div>
                  <ul className="divide-y divide-border/40">
                    {results.map((r, idx) => {
                      const Icon = r.Icon;
                      return (
                        <li key={`${r.kind}-${r.id}-${idx}`}>
                          <button
                            type="button"
                            onClick={() => handleSelect(r)}
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-secondary/60 transition-colors"
                          >
                            <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${kindColor[r.kind]}`}>
                              <Icon size={15} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-foreground truncate">
                                {highlight(r.title, query.trim())}
                              </div>
                              {r.breadcrumb.length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground truncate">
                                  {r.breadcrumb.map((b, i) => (
                                    <React.Fragment key={i}>
                                      {i > 0 && <ChevronRight size={9} />}
                                      <span className="truncate max-w-[120px]">{b}</span>
                                    </React.Fragment>
                                  ))}
                                </div>
                              )}
                              {r.snippet && (
                                <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1 italic">
                                  {highlight(r.snippet, query.trim())}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-between">
              <span>{lang === 'bn' ? 'Esc চাপুন বন্ধ করতে' : 'Press Esc to close'}</span>
              <span>{t('searchInSubjects')} · {t('searchInTempNotes')} · {t('searchInPages')}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
