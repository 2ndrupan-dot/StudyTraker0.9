import { useSyncExternalStore } from 'react';
import {
  addDoc as firestoreAddDoc,
  deleteDoc as firestoreDeleteDoc,
  doc as firestoreDoc,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  writeBatch as firestoreWriteBatch,
} from 'firebase/firestore';

type RetryAction = () => Promise<unknown>;

export interface SaveFailure {
  id: string;
  label: string;
  message: string;
  failedAt: number;
  occurrences?: number;
  retry?: RetryAction;
  resourceKey?: string;
}

interface SaveStatusSnapshot {
  pending: number;
  failures: SaveFailure[];
  lastSuccessAt: number | null;
}

const listeners = new Set<() => void>();
const pendingWrites = new Map<string, {
  label: string;
  retry?: RetryAction;
  resourceKey?: string;
  showProgress: boolean;
}>();
const latestRetryActions = new Map<string, RetryAction>();
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
    pending: [...pendingWrites.values()].filter(write => write.showProgress).length,
    failures: failureRecords,
    lastSuccessAt,
  };
  listeners.forEach(listener => listener());
}

function persistFailures() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FAILURE_STORAGE_KEY, JSON.stringify(failureRecords.map(({
      id, label, message, failedAt, occurrences, resourceKey,
    }) => ({ id, label, message, failedAt, occurrences, resourceKey }))));
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

export function beginSave(
  label = 'Cloud save',
  retry?: RetryAction,
  resourceKey?: string,
  showProgress = true,
) {
  const id = newId();
  pendingWrites.set(id, { label, retry, resourceKey, showProgress });
  publish();
  return id;
}

function cleanupRetryAction(resourceKey?: string) {
  if (!resourceKey) return;
  const stillUsed = [...pendingWrites.values()].some(write => write.resourceKey === resourceKey)
    || failureRecords.some(failure => failure.resourceKey === resourceKey);
  if (!stillUsed) latestRetryActions.delete(resourceKey);
}

export function completeSave(id: string) {
  const write = pendingWrites.get(id);
  if (!write) return;
  pendingWrites.delete(id);
  if (write.showProgress) lastSuccessAt = Date.now();
  cleanupRetryAction(write.resourceKey);
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
  const pendingWrite = pendingWrites.get(id);
  if (!pendingWrite) return;
  pendingWrites.delete(id);
  const { label, retry } = pendingWrite;
  const message = getErrorMessage(error);
  const existingIndex = failureRecords.findIndex(failure =>
    failure.label === label &&
    failure.message === message &&
    failure.resourceKey === pendingWrite.resourceKey,
  );
  if (existingIndex >= 0) {
    failureRecords = failureRecords.map((failure, index) =>
      index === existingIndex
        ? { ...failure, retry, resourceKey: pendingWrite.resourceKey, occurrences: (failure.occurrences ?? 1) + 1 }
        : failure,
    );
  } else {
    failureRecords = [
      ...failureRecords,
      {
        id,
        label,
        message,
        failedAt: Date.now(),
        occurrences: 1,
        retry,
        resourceKey: pendingWrite.resourceKey,
      },
    ];
  }
  persistFailures();
  publish();
}

export function dismissSaveFailure(id: string) {
  const removed = failureRecords.find(failure => failure.id === id);
  const next = failureRecords.filter(failure => failure.id !== id);
  if (next.length === failureRecords.length) return;
  failureRecords = next;
  cleanupRetryAction(removed?.resourceKey);
  persistFailures();
  publish();
}

export async function retrySaveFailure(id: string): Promise<boolean> {
  const failure = failureRecords.find(item => item.id === id);
  if (!failure?.retry) return false;

  // Hide the failed state while the same operation is being attempted again.
  // Keep the old persisted record until the retry settles, so a page refresh
  // during the request cannot silently erase the failure.
  failureRecords = failureRecords.filter(item => item.id !== id);
  publish();
  const retryId = beginSave(failure.label, failure.retry, failure.resourceKey, true);
  try {
    await failure.retry();
    completeSave(retryId);
    persistFailures();
    return true;
  } catch (error) {
    failSave(retryId, error);
    return false;
  }
}

export async function trackSave<T>(
  label: string,
  action: () => Promise<T>,
  resourceKey?: string,
  showProgress = true,
): Promise<T> {
  if (resourceKey) {
    latestRetryActions.set(resourceKey, action);
    let reboundFailure = false;
    failureRecords = failureRecords.map(failure => {
      if (failure.resourceKey !== resourceKey || failure.retry) return failure;
      reboundFailure = true;
      return {
        ...failure,
        retry: () => latestRetryActions.get(resourceKey)?.() ?? action(),
      };
    });
    if (reboundFailure) publish();
  }
  const retry = resourceKey
    ? () => latestRetryActions.get(resourceKey)?.() ?? action()
    : action;
  const id = beginSave(label, retry, resourceKey, showProgress);
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

function getResourceKey(ref: unknown): string | undefined {
  if (!ref || typeof ref !== 'object') return undefined;
  const path = (ref as { path?: unknown }).path;
  return typeof path === 'string' ? `firestore:${path}` : undefined;
}

function trackFirestoreWrite<T>(
  action: () => Promise<T>,
  resourceKey?: string,
  showProgress = true,
) {
  return trackSave('Cloud save', action, resourceKey, showProgress);
}

export const setDoc: typeof firestoreSetDoc = ((...args: Parameters<typeof firestoreSetDoc>) =>
  trackFirestoreWrite(() => firestoreSetDoc(...args), getResourceKey(args[0]))) as typeof firestoreSetDoc;

export const updateDoc: typeof firestoreUpdateDoc = ((...args: Parameters<typeof firestoreUpdateDoc>) =>
  trackFirestoreWrite(() => firestoreUpdateDoc(...args), getResourceKey(args[0]))) as typeof firestoreUpdateDoc;

export const deleteDoc: typeof firestoreDeleteDoc = ((...args: Parameters<typeof firestoreDeleteDoc>) =>
  trackFirestoreWrite(() => firestoreDeleteDoc(...args), getResourceKey(args[0]))) as typeof firestoreDeleteDoc;

// Background reconciliation and page-load maintenance still retain failures
// for the user, but shouldn't show Syncing/Saved as if they had just edited.
export const setDocQuietly: typeof firestoreSetDoc = ((...args: Parameters<typeof firestoreSetDoc>) =>
  trackFirestoreWrite(() => firestoreSetDoc(...args), getResourceKey(args[0]), false)) as typeof firestoreSetDoc;

export const updateDocQuietly: typeof firestoreUpdateDoc = ((...args: Parameters<typeof firestoreUpdateDoc>) =>
  trackFirestoreWrite(() => firestoreUpdateDoc(...args), getResourceKey(args[0]), false)) as typeof firestoreUpdateDoc;

export const deleteDocQuietly: typeof firestoreDeleteDoc = ((...args: Parameters<typeof firestoreDeleteDoc>) =>
  trackFirestoreWrite(() => firestoreDeleteDoc(...args), getResourceKey(args[0]), false)) as typeof firestoreDeleteDoc;

export const addDoc: typeof firestoreAddDoc = ((...args: Parameters<typeof firestoreAddDoc>) => {
  const [collectionRef, data] = args;
  // Fix the document ID before the first attempt. Retrying addDoc directly
  // could create a second document if the first commit succeeded but its
  // acknowledgement was lost.
  const ref = firestoreDoc(collectionRef);
  return trackFirestoreWrite(async () => {
    await firestoreSetDoc(ref, data);
    return ref;
  }, getResourceKey(ref));
}) as typeof firestoreAddDoc;

export const addDocQuietly: typeof firestoreAddDoc = ((...args: Parameters<typeof firestoreAddDoc>) => {
  const [collectionRef, data] = args;
  const ref = firestoreDoc(collectionRef);
  return trackFirestoreWrite(async () => {
    await firestoreSetDoc(ref, data);
    return ref;
  }, getResourceKey(ref), false);
}) as typeof firestoreAddDoc;

function createTrackedWriteBatch(
  args: Parameters<typeof firestoreWriteBatch>,
  showProgress: boolean,
) {
  const batch = firestoreWriteBatch(...args);
  const operations: Array<{ method: 'set' | 'update' | 'delete'; args: unknown[] }> = [];
  let isFirstAttempt = true;

  const retryableCommit = () => {
    if (isFirstAttempt) {
      isFirstAttempt = false;
      return batch.commit();
    }
    const retryBatch = firestoreWriteBatch(...args);
    for (const operation of operations) {
      const method = retryBatch[operation.method] as (...writeArgs: never[]) => unknown;
      method.apply(retryBatch, operation.args as never[]);
    }
    return retryBatch.commit();
  };

  return new Proxy(batch, {
    get(target, property, receiver) {
      if (property === 'commit') {
        return () => trackSave('Cloud save', retryableCommit, undefined, showProgress);
      }
      if (property === 'set' || property === 'update' || property === 'delete') {
        const method = Reflect.get(target, property, target);
        return (...writeArgs: unknown[]) => {
          operations.push({ method: property, args: writeArgs });
          const result = method.apply(target, writeArgs);
          return result === target ? receiver : result;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

export const writeBatch: typeof firestoreWriteBatch = ((...args: Parameters<typeof firestoreWriteBatch>) =>
  createTrackedWriteBatch(args, true)) as typeof firestoreWriteBatch;

export const writeBatchQuietly: typeof firestoreWriteBatch = ((...args: Parameters<typeof firestoreWriteBatch>) =>
  createTrackedWriteBatch(args, false)) as typeof firestoreWriteBatch;
