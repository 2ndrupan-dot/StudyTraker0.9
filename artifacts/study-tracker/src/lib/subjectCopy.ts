import { Subject, Chapter, Topic, Subtopic, Concept, Point } from './types';

export const COPIED_SUBJECT_STORAGE_KEY = '@study_copied_subject_v1';

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/**
 * Clones an entire subject structure (all chapters, topics, subtopics, concepts, points)
 * with brand-new IDs, completion reset to false, and WITHOUT any notes.
 */
export function cloneSubjectWithoutNotes(subj: Subject): Subject {
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
            note: undefined,
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
            note: undefined,
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
          note: undefined,
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
        note: undefined,
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
      note: undefined,
      important: false,
      weak: false,
    };
  });

  return {
    ...subj,
    id: newSubjId,
    completed: false,
    note: undefined,
    important: false,
    weak: false,
    chapters: cleanChapters,
  };
}
