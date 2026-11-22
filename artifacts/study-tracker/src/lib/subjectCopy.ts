import { Subject, Chapter, Topic, Subtopic, Concept, Point } from './types';

export const COPIED_SUBJECT_STORAGE_KEY = '@study_copied_subject_v1';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/**
 * Checks whether any level of the subject tree (subject, chapters, topics, subtopics, concepts, points) has a note.
 */
export function hasAnyNotes(subj: Subject): boolean {
  if (subj.note && subj.note.trim()) return true;
  for (const ch of subj.chapters || []) {
    if (ch.note && ch.note.trim()) return true;
    for (const t of ch.topics || []) {
      if (t.note && t.note.trim()) return true;
      for (const st of t.subtopics || []) {
        if (st.note && st.note.trim()) return true;
        for (const c of st.concepts || []) {
          if (c.note && c.note.trim()) return true;
          for (const p of c.points || []) {
            if (p.note && p.note.trim()) return true;
          }
        }
      }
    }
  }
  return false;
}

/**
 * Clones an entire subject structure (all chapters, topics, subtopics, concepts, points)
 * with brand-new IDs and reset progress (completed: false, important: false, weak: false).
 * If withNotes is true, notes on every level are preserved.
 * If withNotes is false, notes are cleared (set to undefined).
 */
export function cloneSubjectTree(subj: Subject, options?: { withNotes?: boolean }): Subject {
  const withNotes = options?.withNotes ?? false;
  const newSubjId = genId();

  const cleanChapters: Chapter[] = (subj.chapters || []).map(ch => {
    const newChId = genId();
    const cleanTopics: Topic[] = (ch.topics || []).map(t => {
      const newTopicId = genId();
      const cleanSubtopics: Subtopic[] = (t.subtopics || []).map(st => {
        const newSubId = genId();
        const cleanConcepts: Concept[] = (st.concepts || []).map(c => {
          const newConceptId = genId();
          const cleanPoints: Point[] = (c.points || []).map(p => ({
            id: genId(),
            title: p.title,
            completed: false,
            difficulty: p.difficulty,
            note: withNotes ? (p.note || undefined) : undefined,
            important: false,
            weak: false,
          }));
          return {
            id: newConceptId,
            title: c.title,
            completed: false,
            estimatedMinutes: c.estimatedMinutes,
            adjustedMinutes: c.adjustedMinutes,
            difficulty: c.difficulty,
            points: cleanPoints,
            note: withNotes ? (c.note || undefined) : undefined,
            important: false,
            weak: false,
          };
        });
        return {
          id: newSubId,
          title: st.title,
          completed: false,
          estimatedMinutes: st.estimatedMinutes,
          adjustedMinutes: st.adjustedMinutes,
          difficulty: st.difficulty,
          concepts: cleanConcepts,
          note: withNotes ? (st.note || undefined) : undefined,
          important: false,
          weak: false,
        };
      });
      return {
        id: newTopicId,
        title: t.title,
        totalMinutes: t.totalMinutes,
        estimatedMinutes: t.estimatedMinutes,
        adjustedMinutes: t.adjustedMinutes,
        difficulty: t.difficulty,
        completed: false,
        subtopics: cleanSubtopics,
        note: withNotes ? (t.note || undefined) : undefined,
        important: false,
        weak: false,
      };
    });
    return {
      id: newChId,
      title: ch.title,
      totalMinutes: ch.totalMinutes,
      estimatedMinutes: ch.estimatedMinutes,
      adjustedMinutes: ch.adjustedMinutes,
      difficulty: ch.difficulty,
      completed: false,
      topics: cleanTopics,
      note: withNotes ? (ch.note || undefined) : undefined,
      important: false,
      weak: false,
    };
  });

  return {
    ...subj,
    id: newSubjId,
    completed: false,
    note: withNotes ? (subj.note || undefined) : undefined,
    important: false,
    weak: false,
    chapters: cleanChapters,
  };
}

export function cloneSubjectWithoutNotes(subj: Subject): Subject {
  return cloneSubjectTree(subj, { withNotes: false });
}

export function cloneSubjectWithNotes(subj: Subject): Subject {
  return cloneSubjectTree(subj, { withNotes: true });
}
