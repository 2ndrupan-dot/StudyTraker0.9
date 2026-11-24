import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Simple ID generator for offline entities
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Subject Color Palette
export const SUBJECT_COLORS = [
  '#4F6EF7', // Blue
  '#14B8A6', // Teal
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#22C55E', // Green
  '#F97316', // Orange
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

// Ultra-light pastel accent cards matching Progress metric insights (/8 bg, /20 border)
export const CARD_ACCENTS = [
  'bg-blue-500/8 border-blue-500/20 dark:border-blue-500/30 dark:bg-blue-500/10',
  'bg-violet-500/8 border-violet-500/20 dark:border-violet-500/30 dark:bg-violet-500/10',
  'bg-emerald-500/8 border-emerald-500/20 dark:border-emerald-500/30 dark:bg-emerald-500/10',
  'bg-amber-500/8 border-amber-500/20 dark:border-amber-500/30 dark:bg-amber-500/10',
  'bg-rose-500/8 border-rose-500/20 dark:border-rose-500/30 dark:bg-rose-500/10',
  'bg-cyan-500/8 border-cyan-500/20 dark:border-cyan-500/30 dark:bg-cyan-500/10',
  'bg-purple-500/8 border-purple-500/20 dark:border-purple-500/30 dark:bg-purple-500/10',
  'bg-orange-500/8 border-orange-500/20 dark:border-orange-500/30 dark:bg-orange-500/10',
];

export const CARD_ICON_COLORS = [
  'text-blue-500', 'text-violet-500', 'text-emerald-500', 'text-amber-500',
  'text-rose-500', 'text-cyan-500', 'text-purple-500', 'text-orange-500',
];

export function getRandomColor(): string {
  return SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
}
