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

// Card pastel accent gradients matching Test & Notes sections
export const CARD_ACCENTS = [
  'from-blue-500/20 to-blue-400/5 border-blue-200/60 dark:border-blue-800/40',
  'from-violet-500/20 to-violet-400/5 border-violet-200/60 dark:border-violet-800/40',
  'from-emerald-500/20 to-emerald-400/5 border-emerald-200/60 dark:border-emerald-800/40',
  'from-amber-500/20 to-amber-400/5 border-amber-200/60 dark:border-amber-800/40',
  'from-rose-500/20 to-rose-400/5 border-rose-200/60 dark:border-rose-800/40',
  'from-cyan-500/20 to-cyan-400/5 border-cyan-200/60 dark:border-cyan-800/40',
  'from-purple-500/20 to-purple-400/5 border-purple-200/60 dark:border-purple-800/40',
  'from-orange-500/20 to-orange-400/5 border-orange-200/60 dark:border-orange-800/40',
];

export const CARD_ICON_COLORS = [
  'text-blue-500', 'text-violet-500', 'text-emerald-500', 'text-amber-500',
  'text-rose-500', 'text-cyan-500', 'text-purple-500', 'text-orange-500',
];

export function getRandomColor(): string {
  return SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
}
