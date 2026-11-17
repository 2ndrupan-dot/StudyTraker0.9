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

export function getRandomColor(): string {
  return SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)];
}
