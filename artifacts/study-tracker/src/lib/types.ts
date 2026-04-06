export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_MULTIPLIERS: Record<DifficultyLevel, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2,
};

export interface Point {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
}

export interface Concept {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  points: Point[];
}

export interface Subtopic {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  concepts: Concept[];
}

export interface Topic {
  id: string;
  title: string;
  totalMinutes: number;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  completed: boolean;
  subtopics: Subtopic[];
}

export interface Chapter {
  id: string;
  title: string;
  totalMinutes: number;
  estimatedMinutes?: number;
  adjustedMinutes?: number;
  difficulty?: DifficultyLevel;
  completed: boolean;
  topics: Topic[];
}

export interface Subject {
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
