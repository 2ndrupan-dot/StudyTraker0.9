/**
 * Time Management Engine (client-side)
 *
 * Calculates adjusted times for all content items so that:
 *   total_available_time = daily_hours_per_day × target_days
 * matches total content time, with minimum limits enforced.
 *
 * Difficulty multipliers: easy=1x, medium=1.5x, hard=2x
 * Topic-First rule: subtopics unlock only after topic is complete
 */

import type { Subject, Chapter, Topic, Subtopic, Concept, Point } from './types';
import { MIN_TIMES, DIFFICULTY_MULTIPLIERS } from './types';

// "Weak" mark = student finds this hard → automatically allocate 30% more time
export const WEAK_MULTIPLIER = 1.3;
const weakBoost = (item: { weak?: boolean }) => (item.weak ? WEAK_MULTIPLIER : 1);

// ─── Raw time estimates (with difficulty + weak multiplier) ─────────────────

export function rawPoint(p: Point): number {
  const base = p.estimatedMinutes && p.estimatedMinutes > 0 ? p.estimatedMinutes : 5;
  const mult = DIFFICULTY_MULTIPLIERS[p.difficulty ?? 'easy'] * weakBoost(p);
  return Math.round(base * mult);
}

export function rawConcept(c: Concept): number {
  if (c.points.length === 0) {
    const base = c.estimatedMinutes && c.estimatedMinutes > 0 ? c.estimatedMinutes : 15;
    const mult = DIFFICULTY_MULTIPLIERS[c.difficulty ?? 'easy'] * weakBoost(c);
    return Math.round(base * mult);
  }
  const sum = c.points.reduce((s, p) => s + rawPoint(p), 0);
  return Math.round(sum * weakBoost(c));
}

export function rawSubtopic(sub: Subtopic): number {
  if (sub.concepts.length === 0) {
    const base = sub.estimatedMinutes && sub.estimatedMinutes > 0 ? sub.estimatedMinutes : 20;
    const mult = DIFFICULTY_MULTIPLIERS[sub.difficulty ?? 'easy'] * weakBoost(sub);
    return Math.round(base * mult);
  }
  const sum = sub.concepts.reduce((s, c) => s + rawConcept(c), 0);
  return Math.round(sum * weakBoost(sub));
}

export function rawTopic(t: Topic): number {
  if (t.subtopics.length === 0) {
    const base = t.estimatedMinutes && t.estimatedMinutes > 0
      ? t.estimatedMinutes
      : t.totalMinutes > 0 ? t.totalMinutes : 30;
    const mult = DIFFICULTY_MULTIPLIERS[t.difficulty ?? 'easy'] * weakBoost(t);
    return Math.round(base * mult);
  }
  const sum = t.subtopics.reduce((s, sub) => s + rawSubtopic(sub), 0);
  return Math.round(sum * weakBoost(t));
}

export function rawChapter(ch: Chapter): number {
  if (ch.topics.length === 0) {
    const base = ch.estimatedMinutes && ch.estimatedMinutes > 0
      ? ch.estimatedMinutes
      : ch.totalMinutes > 0 ? ch.totalMinutes : 45;
    const mult = DIFFICULTY_MULTIPLIERS[ch.difficulty ?? 'easy'] * weakBoost(ch);
    return Math.round(base * mult);
  }
  const sum = ch.topics.reduce((s, t) => s + rawTopic(t), 0);
  return Math.round(sum * weakBoost(ch));
}

export function rawSubject(subj: Subject): number {
  return subj.chapters.reduce((s, ch) => s + rawChapter(ch), 0);
}

// ─── Adjusted time getters (with fallback to raw) ───────────────────────────

export function adjPoint(p: Point): number {
  const v = p.adjustedMinutes ?? rawPoint(p);
  return Math.max(v, MIN_TIMES.point);
}

export function adjConcept(c: Concept): number {
  if (c.points.length === 0) {
    const v = c.adjustedMinutes ?? rawConcept(c);
    return Math.max(v, MIN_TIMES.concept);
  }
  return c.points.reduce((s, p) => s + adjPoint(p), 0);
}

export function adjSubtopic(sub: Subtopic): number {
  if (sub.concepts.length === 0) {
    const v = sub.adjustedMinutes ?? rawSubtopic(sub);
    return Math.max(v, MIN_TIMES.subtopic);
  }
  return sub.concepts.reduce((s, c) => s + adjConcept(c), 0);
}

export function adjTopic(t: Topic): number {
  if (t.subtopics.length === 0) {
    const v = t.adjustedMinutes ?? rawTopic(t);
    return Math.max(v, MIN_TIMES.topic);
  }
  return t.subtopics.reduce((s, sub) => s + adjSubtopic(sub), 0);
}

export function adjChapter(ch: Chapter): number {
  if (ch.topics.length === 0) {
    const v = ch.adjustedMinutes ?? rawChapter(ch);
    return Math.max(v, MIN_TIMES.chapter);
  }
  return ch.topics.reduce((s, t) => s + adjTopic(t), 0);
}

// ─── Total content time ──────────────────────────────────────────────────────

export function totalContentMinutes(subjects: Subject[]): number {
  return subjects.reduce((s, subj) => {
    return s + subj.chapters
      .filter(ch => !isChapterContentDone(ch))
      .reduce((cs, ch) => cs + rawChapter(ch), 0);
  }, 0);
}

export function totalAdjustedMinutes(subjects: Subject[]): number {
  return subjects.reduce((s, subj) => {
    return s + subj.chapters
      .filter(ch => !isChapterContentDone(ch))
      .reduce((cs, ch) => cs + adjChapter(ch), 0);
  }, 0);
}

// ─── Apply time adjustment ratio to all items ───────────────────────────────

export function applyTimeAdjustment(
  subjects: Subject[],
  dailyStudyHours: number,
  courseTotalDays: number | null
): Subject[] {
  if (!courseTotalDays || courseTotalDays <= 0 || dailyStudyHours <= 0) return subjects;

  const availableMinutes = dailyStudyHours * 60 * courseTotalDays;
  const contentMinutes = totalContentMinutes(subjects);

  if (contentMinutes <= 0) return subjects;

  const ratio = availableMinutes / contentMinutes;
  const clampedRatio = Math.min(Math.max(ratio, 0.3), 5.0);

  return subjects.map(subj => ({
    ...subj,
    chapters: subj.chapters.map(ch => ({
      ...ch,
      adjustedMinutes: ch.topics.length === 0
        ? Math.max(Math.round(rawChapter(ch) * clampedRatio), MIN_TIMES.chapter)
        : undefined,
      topics: ch.topics.map(t => ({
        ...t,
        adjustedMinutes: t.subtopics.length === 0
          ? Math.max(Math.round(rawTopic(t) * clampedRatio), MIN_TIMES.topic)
          : undefined,
        subtopics: t.subtopics.map(sub => ({
          ...sub,
          adjustedMinutes: sub.concepts.length === 0
            ? Math.max(Math.round(rawSubtopic(sub) * clampedRatio), MIN_TIMES.subtopic)
            : undefined,
          concepts: sub.concepts.map(c => ({
            ...c,
            adjustedMinutes: c.points.length === 0
              ? Math.max(Math.round(rawConcept(c) * clampedRatio), MIN_TIMES.concept)
              : undefined,
            points: c.points.map(p => ({
              ...p,
              adjustedMinutes: Math.max(Math.round(rawPoint(p) * clampedRatio), MIN_TIMES.point),
            })),
          })),
        })),
      })),
    })),
  }));
}

// ─── Adaptive pressure calculation ──────────────────────────────────────────

export interface AdaptivePressure {
  level: 'ahead' | 'ontrack' | 'behind' | 'critical';
  message_en: string;
  message_bn: string;
  extraTasksMinutes: number;
}

export function calculateAdaptivePressure(
  completedTodayMins: number,
  targetDailyMins: number,
  pendingCount: number
): AdaptivePressure {
  const ratio = targetDailyMins > 0 ? completedTodayMins / targetDailyMins : 1;

  if (pendingCount >= 5 || ratio < 0.4) {
    return {
      level: 'critical',
      message_en: 'You are significantly behind! Extra tasks added today.',
      message_bn: 'আপনি অনেক পিছিয়ে আছেন! আজ অতিরিক্ত কাজ যোগ করা হয়েছে।',
      extraTasksMinutes: Math.round(targetDailyMins * 0.4),
    };
  }
  if (pendingCount >= 2 || ratio < 0.75) {
    return {
      level: 'behind',
      message_en: 'You are behind schedule. Slightly more tasks today.',
      message_bn: 'আপনি একটু পিছিয়ে আছেন। আজ একটু বেশি কাজ দেওয়া হয়েছে।',
      extraTasksMinutes: Math.round(targetDailyMins * 0.2),
    };
  }
  if (ratio > 1.2 && pendingCount === 0) {
    return {
      level: 'ahead',
      message_en: "Great work! You're ahead of schedule. Keep it up!",
      message_bn: 'চমৎকার! আপনি এগিয়ে আছেন। এভাবে চালিয়ে যান!',
      extraTasksMinutes: 0,
    };
  }
  return {
    level: 'ontrack',
    message_en: "You're on track. Keep going!",
    message_bn: 'আপনি সঠিক পথে আছেন। এগিয়ে যান!',
    extraTasksMinutes: 0,
  };
}

// ─── Deep content completion helpers ──────────────────────────────────────────
// These check if ALL leaf-level items are done (not just the overview flag).

export function isConceptContentDone(c: Concept): boolean {
  if (c.points.length > 0) return c.completed && c.points.every(p => p.completed);
  return c.completed;
}

export function isSubtopicContentDone(sub: Subtopic): boolean {
  if (sub.concepts.length > 0) return sub.completed && sub.concepts.every(c => isConceptContentDone(c));
  return sub.completed;
}

export function isTopicContentDone(t: Topic): boolean {
  if (t.subtopics.length > 0) return t.completed && t.subtopics.every(sub => isSubtopicContentDone(sub));
  return t.completed;
}

export function isChapterContentDone(ch: Chapter): boolean {
  if (ch.topics.length > 0) return ch.completed && ch.topics.every(t => isTopicContentDone(t));
  return ch.completed;
}

// ─── Hierarchical progress helpers (Method 1: Overview 20% + Branches 80%) ───
// Any level with child branches allocates 20% weight to its own overview,
// and 80% distributed among its children. If an item has no children, its
// completion is 100% when its completed flag is set.

export function computePointProgress(p: Point): number {
  return p.completed ? 1 : 0;
}

export function computeConceptProgress(c: Concept): number {
  if (!c.points || c.points.length === 0) {
    return c.completed ? 1 : 0;
  }
  const overviewVal = c.completed ? 0.2 : 0;
  const pointsSum = c.points.reduce((sum, p) => sum + computePointProgress(p), 0);
  const branchesVal = 0.8 * (pointsSum / c.points.length);
  return overviewVal + branchesVal;
}

export function computeSubtopicProgress(sub: Subtopic): number {
  if (!sub.concepts || sub.concepts.length === 0) {
    return sub.completed ? 1 : 0;
  }
  const overviewVal = sub.completed ? 0.2 : 0;
  const conceptsSum = sub.concepts.reduce((sum, c) => sum + computeConceptProgress(c), 0);
  const branchesVal = 0.8 * (conceptsSum / sub.concepts.length);
  return overviewVal + branchesVal;
}

export function computeTopicProgress(t: Topic): number {
  if (!t.subtopics || t.subtopics.length === 0) {
    return t.completed ? 1 : 0;
  }
  const overviewVal = t.completed ? 0.2 : 0;
  const subsSum = t.subtopics.reduce((sum, sub) => sum + computeSubtopicProgress(sub), 0);
  const branchesVal = 0.8 * (subsSum / t.subtopics.length);
  return overviewVal + branchesVal;
}

export function computeChapterProgress(ch: Chapter): number {
  if (!ch.topics || ch.topics.length === 0) {
    return ch.completed ? 1 : 0;
  }
  const overviewVal = ch.completed ? 0.2 : 0;
  const topicsSum = ch.topics.reduce((sum, t) => sum + computeTopicProgress(t), 0);
  const branchesVal = 0.8 * (topicsSum / ch.topics.length);
  return overviewVal + branchesVal;
}

export function computeSubjectProgress(subj: Subject): number {
  if (!subj.chapters || subj.chapters.length === 0) {
    return subj.completed ? 1 : 0;
  }
  const chaptersSum = subj.chapters.reduce((sum, ch) => sum + computeChapterProgress(ch), 0);
  return chaptersSum / subj.chapters.length;
}

// ─── Granular overall progress ────────────────────────────────────────────────
// Method 1: Hierarchical Weighted Progress (Overview 20% + Branches 80%)
// Ticking the "overview" checkbox on ANY item at ANY level nudges the percentage,
// and completing each child branch steadily advances the progress. When all
// branches are finished, the item reaches 100% (Green).
export function computeGranularProgress(subjects: Subject[]): { completed: number; total: number; percent: number } {
  let total = 0, completed = 0;
  for (const subj of subjects) {
    total++; if (subj.completed) completed++;
    for (const ch of subj.chapters) {
      total++; if (ch.completed) completed++;
      for (const t of ch.topics) {
        total++; if (t.completed) completed++;
        for (const sub of t.subtopics) {
          total++; if (sub.completed) completed++;
          for (const c of sub.concepts) {
            total++; if (c.completed) completed++;
            for (const p of c.points) {
              total++; if (p.completed) completed++;
            }
          }
        }
      }
    }
  }

  if (subjects.length === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }

  const subjectProgressSum = subjects.reduce((sum, subj) => sum + computeSubjectProgress(subj), 0);
  const percent = Math.min(100, Math.max(0, (subjectProgressSum / subjects.length) * 100));

  return { completed, total, percent };
}

// Formats a progress percentage so every real change is visible — never
// rounds away a small bump (e.g. 1.5%, 1.05%, 2.6%, 3.1%), and for very tiny
// slices (a single item out of a huge tree) keeps adding decimal places
// until the value reads as non-zero (down to 0.001%). Trailing zero
// decimals are trimmed for a clean look (1.50 -> 1.5, 100.00 -> 100).
export function formatProgressPercent(percent: number): string {
  if (percent <= 0) return '0';
  let decimals = 2;
  let fixed = percent.toFixed(decimals);
  while (parseFloat(fixed) === 0 && decimals < 4) {
    decimals++;
    fixed = percent.toFixed(decimals);
  }
  if (fixed.includes('.')) {
    fixed = fixed.replace(/0+$/, '').replace(/\.$/, '');
  }
  return fixed;
}

// ─── Locked/Unlocked logic ───────────────────────────────────────────────────
// Topic-First Rule: subtopics unlock ONLY after topic itself is complete.

export function isChapterUnlocked(subj: Subject, chapterIndex: number): boolean {
  if (chapterIndex === 0) return true;
  for (let i = 0; i < chapterIndex; i++) {
    // A chapter only unlocks once the previous chapter is FULLY done (green),
    // not just overview-complete (saffron). Applies at every level.
    if (!isChapterContentDone(subj.chapters[i])) return false;
  }
  return true;
}

// Parent-first: topics unlock only after the parent chapter's own overview is complete
export function isTopicUnlocked(chapter: Chapter, topicIndex: number): boolean {
  if (!chapter.completed) return false; // Chapter must be completed first (Parent-First rule)
  for (let i = 0; i < topicIndex; i++) {
    if (!isTopicContentDone(chapter.topics[i])) return false;
  }
  return true;
}

// TOPIC-FIRST: subtopics only unlock after the parent topic's own overview is complete
export function isSubtopicUnlocked(topic: Topic, subtopicIndex: number): boolean {
  if (!topic.completed) return false; // Topic must be completed first (Topic-First rule)
  for (let i = 0; i < subtopicIndex; i++) {
    if (!isSubtopicContentDone(topic.subtopics[i])) return false;
  }
  return true;
}

// Parent-first: concepts unlock only after the parent subtopic's own overview is complete
export function isConceptUnlocked(subtopic: Subtopic, conceptIndex: number): boolean {
  if (!subtopic.completed) return false;
  for (let i = 0; i < conceptIndex; i++) {
    if (!isConceptContentDone(subtopic.concepts[i])) return false;
  }
  return true;
}

// Parent-first: points unlock only after the parent concept is complete
export function isPointUnlocked(concept: Concept, pointIndex: number): boolean {
  if (!concept.completed) return false;
  for (let i = 0; i < pointIndex; i++) {
    if (!concept.points[i].completed) return false;
  }
  return true;
}

// ─── "Continue Learning" next item ──────────────────────────────────────────

export interface NextItem {
  subjectId: string;
  subjectTitle: string;
  subjectColor: string;
  chapterId: string;
  topicId?: string;
  subtopicId?: string;
  conceptId?: string;
  pointId?: string;
  title: string;
  breadcrumb: string[];
  estimatedMins: number;
}

export function findNextItem(subjects: Subject[], excludeKeys?: Set<string>): NextItem | null {
  for (const subj of subjects) {
    if (subj.completed) continue;
    for (const ch of subj.chapters) {
      if (isChapterContentDone(ch)) continue;

      const chKey = `${subj.id}|${ch.id}`;
      if (!ch.completed && (!excludeKeys || !excludeKeys.has(chKey))) {
        return {
          subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
          chapterId: ch.id, title: ch.topics.length > 0 ? `[Overview] ${ch.title}` : ch.title, breadcrumb: [],
          estimatedMins: adjChapter(ch),
        };
      }

      // Chapter overview is in excludeKeys or not yet done — do NOT advance to next chapter
      if (!ch.completed) break;

      let topicLoopBroke = false;
      for (const t of ch.topics) {
        if (isTopicContentDone(t)) continue;

        const topKey = `${subj.id}|${ch.id}|${t.id}`;
        if (!t.completed && (!excludeKeys || !excludeKeys.has(topKey))) {
          return {
            subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
            chapterId: ch.id, topicId: t.id,
            title: t.subtopics.length > 0 ? `[Overview] ${t.title}` : t.title,
            breadcrumb: [ch.title],
            estimatedMins: adjTopic(t),
          };
        }

        // Topic overview excluded or not yet done — do NOT advance to next topic
        if (!t.completed) { topicLoopBroke = true; break; }

        let subtopicLoopBroke = false;
        for (const sub of t.subtopics) {
          if (isSubtopicContentDone(sub)) continue;

          const subKey = `${subj.id}|${ch.id}|${t.id}|${sub.id}`;
          if (!sub.completed && (!excludeKeys || !excludeKeys.has(subKey))) {
            return {
              subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
              chapterId: ch.id, topicId: t.id, subtopicId: sub.id,
              title: sub.concepts.length > 0 ? `[Overview] ${sub.title}` : sub.title,
              breadcrumb: [ch.title, t.title],
              estimatedMins: adjSubtopic(sub),
            };
          }

          // Subtopic overview excluded or not yet done — do NOT advance to next subtopic
          if (!sub.completed) { subtopicLoopBroke = true; break; }

          let conceptLoopBroke = false;
          for (const c of sub.concepts) {
            if (isConceptContentDone(c)) continue;

            const conKey = `${subj.id}|${ch.id}|${t.id}|${sub.id}|${c.id}`;
            if (!c.completed && (!excludeKeys || !excludeKeys.has(conKey))) {
              return {
                subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
                chapterId: ch.id, topicId: t.id, subtopicId: sub.id, conceptId: c.id,
                title: c.points.length > 0 ? `[Overview] ${c.title}` : c.title,
                breadcrumb: [ch.title, t.title, sub.title],
                estimatedMins: adjConcept(c),
              };
            }

            // Concept overview excluded or not yet done — do NOT advance to next concept
            if (!c.completed) { conceptLoopBroke = true; break; }

            let pointFound = false;
            for (const p of c.points) {
              const ptKey = `${subj.id}|${ch.id}|${t.id}|${sub.id}|${c.id}|${p.id}`;
              if (!p.completed && (!excludeKeys || !excludeKeys.has(ptKey))) {
                return {
                  subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
                  chapterId: ch.id, topicId: t.id, subtopicId: sub.id, conceptId: c.id, pointId: p.id,
                  title: p.title, breadcrumb: [ch.title, t.title, sub.title, c.title],
                  estimatedMins: adjPoint(p),
                };
              }
              // Point excluded → all remaining points in this concept are locked too
              if (!p.completed) { conceptLoopBroke = true; break; }
              pointFound = true;
            }
            if (conceptLoopBroke) break;
            void pointFound;
          }
          // If a concept wasn't fully done, the subtopic is still incomplete → stop
          if (conceptLoopBroke || !isSubtopicContentDone(sub)) { subtopicLoopBroke = true; break; }
        }
        // If a subtopic wasn't fully done, the topic is still incomplete → stop
        if (subtopicLoopBroke || !isTopicContentDone(t)) { topicLoopBroke = true; break; }
      }
      // If a topic wasn't fully done, the chapter is still incomplete → stop
      if (topicLoopBroke || !isChapterContentDone(ch)) break;
    }
  }
  return null;
}
