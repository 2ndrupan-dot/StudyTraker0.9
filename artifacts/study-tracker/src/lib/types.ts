export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_MULTIPLIERS: Record<DifficultyLevel, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2,
};

// Common optional fields for all study levels
export interface MarkableItem {
  note?: string;
  important?: boolean;
  weak?: boolean;
}

export interface Point extends MarkableItem {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
}

export interface Concept extends MarkableItem {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  points: Point[];
}

export interface Subtopic extends MarkableItem {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  concepts: Concept[];
}

export interface Topic extends MarkableItem {
  id: string;
  title: string;
  totalMinutes: number;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  completed: boolean;
  subtopics: Subtopic[];
}

export interface Chapter extends MarkableItem {
  id: string;
  title: string;
  totalMinutes: number;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  completed: boolean;
  topics: Topic[];
}

export interface Subject extends MarkableItem {
  id: string;
  title: string;
  color: string;
  allocatedDays: number;
  manualDays: boolean;
  deadline: string;
  totalMinutes: number;
  completed: boolean;
  chapters: Chapter[];
}

export interface CourseSettings {
  courseTotalDays: number | null;
  dailyStudyHours: number;
  courseStartDate?: string;
  resetScheduled?: boolean;
}

// Minimum time limits per level (minutes)
export const MIN_TIMES = {
  point: 3,
  concept: 5,
  subtopic: 7,
  topic: 10,
  chapter: 15,
} as const;

// Levels used by mark / note APIs
export type MarkLevel = 'subject' | 'chapter' | 'topic' | 'subtopic' | 'concept' | 'point';

export interface MarkPath {
  subjectId: string;
  chapterId?: string;
  topicId?: string;
  subtopicId?: string;
  conceptId?: string;
  pointId?: string;
  level: MarkLevel;
}

// ─── Temp Note (hierarchical to-do, NOT synced to Today plan) ───────────────
export interface TempNoteItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  children: TempNoteItem[];
}

// ─── A4 Rich Note Pages ─────────────────────────────────────────────────────
export type NoteElementType = 'text' | 'link' | 'image' | 'pdf';

export interface NoteElement {
  id: string;
  type: NoteElementType;
  x: number;       // px on canvas (A4: 794 x 1123 @ 96dpi)
  y: number;
  width: number;
  height: number;
  // type-specific
  text?: string;          // text/link label
  href?: string;          // link URL
  src?: string;           // image / pdf data URL or storage URL
  fontSize?: number;      // text
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  align?: 'left' | 'center' | 'right';
  rotation?: number;      // degrees
}

export interface NotePage {
  id: string;
  title: string;
  elements: NoteElement[];
  pageCount: number;     // number of A4 pages stacked
  createdAt: number;
  updatedAt: number;
}
