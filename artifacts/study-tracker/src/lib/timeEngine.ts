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

// ─── Raw time estimates (with difficulty multiplier) ─────────────────────────

export function rawPoint(p: Point): number {
  const base = p.estimatedMinutes && p.estimatedMinutes > 0 ? p.estimatedMinutes : 5;
  const mult = DIFFICULTY_MULTIPLIERS[p.difficulty ?? 'easy'];
  return Math.round(base * mult);
}

export function rawConcept(c: Concept): number {
  if (c.points.length === 0) {
    const base = c.estimatedMinutes && c.estimatedMinutes > 0 ? c.estimatedMinutes : 15;
    const mult = DIFFICULTY_MULTIPLIERS[c.difficulty ?? 'easy'];
    return Math.round(base * mult);
  }
  return c.points.reduce((s, p) => s + rawPoint(p), 0);
}

export function rawSubtopic(sub: Subtopic): number {
  if (sub.concepts.length === 0) {
    const base = sub.estimatedMinutes && sub.estimatedMinutes > 0 ? sub.estimatedMinutes : 20;
    const mult = DIFFICULTY_MULTIPLIERS[sub.difficulty ?? 'easy'];
    return Math.round(base * mult);
  }
  return sub.concepts.reduce((s, c) => s + rawConcept(c), 0);
}

export function rawTopic(t: Topic): number {
  if (t.subtopics.length === 0) {
    const base = t.estimatedMinutes && t.estimatedMinutes > 0
      ? t.estimatedMinutes
      : t.totalMinutes > 0 ? t.totalMinutes : 30;
    const mult = DIFFICULTY_MULTIPLIERS[t.difficulty ?? 'easy'];
    return Math.round(base * mult);
  }
  return t.subtopics.reduce((s, sub) => s + rawSubtopic(sub), 0);
}

export function rawChapter(ch: Chapter): number {
  if (ch.topics.length === 0) {
    const base = ch.estimatedMinutes && ch.estimatedMinutes > 0
      ? ch.estimatedMinutes
      : ch.totalMinutes > 0 ? ch.totalMinutes : 45;
    const mult = DIFFICULTY_MULTIPLIERS[ch.difficulty ?? 'easy'];
    return Math.round(base * mult);
  }
  return ch.topics.reduce((s, t) => s + rawTopic(t), 0);
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
    if (subj.completed) return s;
    return s + subj.chapters
      .filter(ch => !ch.completed)
      .reduce((cs, ch) => cs + rawChapter(ch), 0);
  }, 0);
}

export function totalAdjustedMinutes(subjects: Subject[]): number {
  return subjects.reduce((s, subj) => {
    if (subj.completed) return s;
    return s + subj.chapters
      .filter(ch => !ch.completed)
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

// ─── Locked/Unlocked logic ───────────────────────────────────────────────────
// Topic-First Rule: subtopics unlock ONLY after topic itself is complete.

export function isChapterUnlocked(subj: Subject, chapterIndex: number): boolean {
  if (chapterIndex === 0) return true;
  for (let i = 0; i < chapterIndex; i++) {
    if (!subj.chapters[i].completed) return false;
  }
  return true;
}

export function isTopicUnlocked(chapter: Chapter, topicIndex: number): boolean {
  // First topic is always accessible within the chapter
  if (topicIndex === 0) return true;
  for (let i = 0; i < topicIndex; i++) {
    if (!chapter.topics[i].completed) return false;
  }
  return true;
}

// TOPIC-FIRST: subtopics only unlock after the parent topic is complete
export function isSubtopicUnlocked(topic: Topic, subtopicIndex: number): boolean {
  if (!topic.completed) return false; // Topic must be completed first (Topic-First rule)
  for (let i = 0; i < subtopicIndex; i++) {
    if (!topic.subtopics[i].completed) return false;
  }
  return true;
}

// Parent-first: concepts unlock only after the parent subtopic is complete
export function isConceptUnlocked(subtopic: Subtopic, conceptIndex: number): boolean {
  if (!subtopic.completed) return false;
  for (let i = 0; i < conceptIndex; i++) {
    if (!subtopic.concepts[i].completed) return false;
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

export function findNextItem(subjects: Subject[]): NextItem | null {
  for (const subj of subjects) {
    if (subj.completed) continue;
    for (const ch of subj.chapters) {
      if (ch.completed) continue;

      if (ch.topics.length === 0) {
        return {
          subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
          chapterId: ch.id, title: ch.title, breadcrumb: [],
          estimatedMins: adjChapter(ch),
        };
      }

      for (const t of ch.topics) {
        if (t.completed) continue;

        // Topic-First: if topic has subtopics and isn't complete, show topic as overview
        if (t.subtopics.length > 0 && !t.completed) {
          return {
            subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
            chapterId: ch.id, topicId: t.id, title: t.title, breadcrumb: [ch.title],
            estimatedMins: adjTopic(t),
          };
        }

        if (t.subtopics.length === 0) {
          return {
            subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
            chapterId: ch.id, topicId: t.id, title: t.title, breadcrumb: [ch.title],
            estimatedMins: adjTopic(t),
          };
        }

        for (const sub of t.subtopics) {
          if (sub.completed) continue;

          if (sub.concepts.length === 0) {
            return {
              subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
              chapterId: ch.id, topicId: t.id, subtopicId: sub.id,
              title: sub.title, breadcrumb: [ch.title, t.title],
              estimatedMins: adjSubtopic(sub),
            };
          }

          for (const c of sub.concepts) {
            if (c.completed) continue;

            if (c.points.length === 0) {
              return {
                subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
                chapterId: ch.id, topicId: t.id, subtopicId: sub.id, conceptId: c.id,
                title: c.title, breadcrumb: [ch.title, t.title, sub.title],
                estimatedMins: adjConcept(c),
              };
            }

            for (const p of c.points) {
              if (!p.completed) {
                return {
                  subjectId: subj.id, subjectTitle: subj.title, subjectColor: subj.color,
                  chapterId: ch.id, topicId: t.id, subtopicId: sub.id, conceptId: c.id, pointId: p.id,
                  title: p.title, breadcrumb: [ch.title, t.title, sub.title, c.title],
                  estimatedMins: adjPoint(p),
                };
              }
            }
          }
        }
      }
    }
  }
  return null;
}
