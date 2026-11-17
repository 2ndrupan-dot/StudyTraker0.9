interface CourseCacheRecord<T> {
  key: string;
  data: T;
  unsynced: boolean;
}

export interface LocalCourseSnapshot<T> {
  data: T;
  unsynced: boolean;
}

const DB_NAME = 'studytrack-local-cache';
const STORE_NAME = 'course-data';
const DB_VERSION = 1;

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local cache'));
    request.onblocked = () => reject(new Error('Local cache upgrade is blocked'));
  });
}

function readFromIndexedDb<T>(key: string): Promise<CourseCacheRecord<T> | null> {
  return openCacheDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as CourseCacheRecord<T> | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read local cache'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Could not read local cache'));
    };
  }));
}

function writeToIndexedDb<T>(record: CourseCacheRecord<T>): Promise<void> {
  return openCacheDb().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error('Could not save local cache'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? new Error('Local cache save was aborted'));
    };
  }));
}

function readLocalStorage<T>(key: string): LocalCourseSnapshot<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return {
      data: JSON.parse(raw) as T,
      unsynced: localStorage.getItem(`${key}__unsynced`) === '1',
    };
  } catch {
    return null;
  }
}

export async function readLocalCourseSnapshot<T>(key: string): Promise<LocalCourseSnapshot<T> | null> {
  const localStorageSnapshot = readLocalStorage<T>(key);
  try {
    const indexedDbRecord = await readFromIndexedDb<T>(key);
    if (!indexedDbRecord) return localStorageSnapshot;
    const localSavedAt = (localStorageSnapshot?.data as { savedAt?: number } | undefined)?.savedAt ?? 0;
    const indexedDbSavedAt = (indexedDbRecord.data as { savedAt?: number } | undefined)?.savedAt ?? 0;
    if (
      !localStorageSnapshot ||
      indexedDbSavedAt > localSavedAt ||
      (indexedDbSavedAt === localSavedAt && indexedDbRecord.unsynced)
    ) {
      return { data: indexedDbRecord.data, unsynced: indexedDbRecord.unsynced };
    }
  } catch (error) {
    console.warn('[StudyContext] IndexedDB local cache read failed:', error);
  }
  return localStorageSnapshot;
}

export async function writeLocalCourseSnapshot<T>(
  key: string,
  data: T,
  unsynced: boolean,
): Promise<void> {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    // Large rich-text notes can exceed the browser's localStorage quota.
    // Keep going: IndexedDB and Firestore are independent persistence paths.
    console.warn('[StudyContext] localStorage cache write failed; using IndexedDB:', error);
  }

  try {
    if (unsynced) localStorage.setItem(`${key}__unsynced`, '1');
    else localStorage.removeItem(`${key}__unsynced`);
  } catch (error) {
    console.warn('[StudyContext] Could not update local sync marker:', error);
  }

  try {
    await writeToIndexedDb({ key, data, unsynced });
  } catch (error) {
    // Firestore is still attempted even if both browser caches are unavailable.
    console.warn('[StudyContext] IndexedDB local cache write failed:', error);
  }
}
