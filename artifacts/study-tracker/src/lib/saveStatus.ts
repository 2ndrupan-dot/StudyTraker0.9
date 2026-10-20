import { useSyncExternalStore } from 'react';
import {
  addDoc as firestoreAddDoc,
  deleteDoc as firestoreDeleteDoc,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  writeBatch as firestoreWriteBatch,
} from 'firebase/firestore';

export interface SaveFailure {
  id: string;
  label: string;
  message: string;
  failedAt: number;
  occurrences?: number;
}

interface SaveStatusSnapshot {
  pending: number;
  failures: SaveFailure[];
  lastSuccessAt: number | null;
}

const listeners = new Set<() => void>();
const pendingWrites = new Map<string, string>();
const FAILURE_STORAGE_KEY = '@study_save_failures';

function readStoredFailures(): SaveFailure[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FAILURE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SaveFailure =>
      item &&
      typeof item.id === 'string' &&
      typeof item.label === 'string' &&
      typeof item.message === 'string' &&
      typeof item.failedAt === 'number',
    );
  } catch {
    return [];
  }
}

let failureRecords: SaveFailure[] = readStoredFailures();
let lastSuccessAt: number | null = null;
let nextId = 0;
let snapshot: SaveStatusSnapshot = {
  pending: 0,
  failures: [],
  lastSuccessAt: null,
};

function publish() {
  snapshot = {
    pending: pendingWrites.size,
    failures: failureRecords,
    lastSuccessAt,
  };
  listeners.forEach(listener => listener());
}

function persistFailures() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FAILURE_STORAGE_KEY, JSON.stringify(failureRecords));
  } catch {
    // Keep failures in memory even when browser storage is unavailable or full.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function newId() {
  nextId += 1;
  return `${Date.now()}-${nextId}`;
}

export function beginSave(label = 'Cloud save') {
  const id = newId();
  pendingWrites.set(id, label);
  publish();
  return id;
}

export function completeSave(id: string) {
  if (!pendingWrites.delete(id)) return;
  lastSuccessAt = Date.now();
  publish();
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown };
    const code = typeof value.code === 'string' ? value.code : '';
    const message = typeof value.message === 'string' ? value.message : '';
    if (code && message && !message.includes(code)) return `${code}: ${message}`;
    if (code) return code;
    if (message) return message;
  }
  return (typeof error === 'string' ? error : 'Unknown error').slice(0, 1200);
}

export function failSave(id: string, error: unknown) {
  const label = pendingWrites.get(id);
  if (!label) return;
  pendingWrites.delete(id);
  const message = getErrorMessage(error);
  const existingIndex = failureRecords.findIndex(failure =>
    failure.label === label && failure.message === message,
  );
  if (existingIndex >= 0) {
    failureRecords = failureRecords.map((failure, index) =>
      index === existingIndex
        ? { ...failure, occurrences: (failure.occurrences ?? 1) + 1 }
        : failure,
    );
  } else {
    failureRecords = [
      ...failureRecords,
      { id, label, message, failedAt: Date.now(), occurrences: 1 },
    ];
  }
  persistFailures();
  publish();
}

export function dismissSaveFailure(id: string) {
  const next = failureRecords.filter(failure => failure.id !== id);
  if (next.length === failureRecords.length) return;
  failureRecords = next;
  persistFailures();
  publish();
}

export async function trackSave<T>(label: string, action: () => Promise<T>): Promise<T> {
  const id = beginSave(label);
  try {
    const result = await action();
    completeSave(id);
    return result;
  } catch (error) {
    failSave(id, error);
    throw error;
  }
}

export function useSaveStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function trackFirestoreWrite<T>(action: () => Promise<T>) {
  return trackSave('Cloud save', action);
}

export const setDoc: typeof firestoreSetDoc = ((...args: Parameters<typeof firestoreSetDoc>) =>
  trackFirestoreWrite(() => firestoreSetDoc(...args))) as typeof firestoreSetDoc;

export const updateDoc: typeof firestoreUpdateDoc = ((...args: Parameters<typeof firestoreUpdateDoc>) =>
  trackFirestoreWrite(() => firestoreUpdateDoc(...args))) as typeof firestoreUpdateDoc;

export const deleteDoc: typeof firestoreDeleteDoc = ((...args: Parameters<typeof firestoreDeleteDoc>) =>
  trackFirestoreWrite(() => firestoreDeleteDoc(...args))) as typeof firestoreDeleteDoc;

export const addDoc: typeof firestoreAddDoc = ((...args: Parameters<typeof firestoreAddDoc>) =>
  trackFirestoreWrite(() => firestoreAddDoc(...args))) as typeof firestoreAddDoc;

export const writeBatch: typeof firestoreWriteBatch = ((...args: Parameters<typeof firestoreWriteBatch>) => {
  const batch = firestoreWriteBatch(...args);
  const commit = batch.commit.bind(batch);
  return new Proxy(batch, {
    get(target, property, receiver) {
      if (property === 'commit') {
        return () => trackFirestoreWrite(() => commit());
      }
      return Reflect.get(target, property, receiver);
    },
  });
}) as typeof firestoreWriteBatch;
