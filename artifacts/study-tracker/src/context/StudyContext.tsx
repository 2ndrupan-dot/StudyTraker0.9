import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Subject, Chapter, Topic, Subtopic, Concept, Point, CourseSettings, MarkLevel, MarkPath, TempNoteItem, NotePage, NoteElement } from '@/lib/types';
import { useAuth } from './AuthContext';
import { useCourse } from './CourseContext';
import { addDays, formatISO } from 'date-fns';
import { nowIST, addDaysIST, toDateStrIST } from '@/lib/istTime';
import { doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, collection, writeBatch, query, where, updateDoc, type CollectionReference, type DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Firestore document size limit — documents above this are split across a
// "chunks" subcollection instead of relying on Firebase Storage (which
// requires the paid Blaze plan; this app targets the free Spark plan).
const FIRESTORE_NOTE_LIMIT = 800_000; // 800 KB (Firestore hard limit is 1 MB)

/** Real UTF-8 byte length, reused below for bin-packing chunk sizes. */
// (byteSize is defined further below; declared here only in comments to avoid
// forward-reference confusion — see the real definition near the other helpers.)

/** Delete every document in a "chunks" subcollection. Used both to clean up
 *  stale chunks when data shrinks back under the size limit, and as the first
 *  step before writing a fresh set of chunks (indices may not line up 1:1
 *  between saves as content grows/shrinks). */
async function clearChunks(colRef: CollectionReference): Promise<void> {
  const snap = await getDocs(colRef);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

/** Split a string value that alone exceeds `limit` bytes into ordered parts.
 *  Encodes each part's key as `${key}\u0001${index}\u0001${total}` so the
 *  reader can group and reassemble them in order. Values under the limit are
 *  returned as a single untouched [key, value] pair. */
function splitLargeValue(key: string, value: string, limit: number): Array<[string, string]> {
  if (byteSize(value) <= limit) return [[key, value]];
  const parts: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + limit);
    while (end > start && byteSize(value.slice(start, end)) > limit) {
      end = start + Math.max(1, Math.floor((end - start) / 2));
    }
    parts.push(value.slice(start, end));
    start = end;
  }
  return parts.map((p, i) => [`${key}\u0001${i}\u0001${parts.length}`, p]);
}

/** Greedily bin-pack [key, value] string entries into chunk objects that each
 *  stay under `limit` bytes when JSON-serialised. */
function packEntries(entries: Array<[string, string]>, limit: number): Array<Record<string, string>> {
  const chunks: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  let currentSize = 2; // "{}"
  for (const [k, v] of entries) {
    const entrySize = byteSize(JSON.stringify(k)) + byteSize(JSON.stringify(v)) + 1;
    if (Object.keys(current).length > 0 && currentSize + entrySize > limit) {
      chunks.push(current);
      current = {};
      currentSize = 2;
    }
    current[k] = v;
    currentSize += entrySize;
  }
  if (Object.keys(current).length > 0) chunks.push(current);
  return chunks;
}

/** Reverse of splitLargeValue + packEntries: merges all chunk entries back
 *  into a single flat map, rejoining any split values in order. */
function reassembleEntries(entries: Array<[string, string]>): Record<string, string> {
  const groups = new Map<string, Array<{ index: number; value: string }>>();
  const direct: Record<string, string> = {};
  for (const [k, v] of entries) {
    const parts = k.split('\u0001');
    if (parts.length === 3) {
      const base = parts[0];
      if (!groups.has(base)) groups.set(base, []);
      groups.get(base)!.push({ index: Number(parts[1]), value: v });
    } else {
      direct[k] = v;
    }
  }
  groups.forEach((parts, base) => {
    parts.sort((a, b) => a.index - b.index);
    direct[base] = parts.map(p => p.value).join('');
  });
  return direct;
}

/** Write a set of pre-packed chunk objects to `colRef`, replacing whatever was
 *  there before (so a shrinking chunk count never leaves stale trailing docs).
 *
 *  Entries are stored as an ARRAY of {k, v} pairs rather than a map keyed by
 *  the raw entry key. Firestore rejects any field name (at any nesting level,
 *  including map keys) matching `__.*__` as reserved — and some note keys
 *  (e.g. an "overall notes" entry keyed literally "__overall__") collide with
 *  that pattern. Arrays have no such restriction since entries aren't field
 *  names, so this sidesteps the problem entirely regardless of what the key
 *  looks like. */
async function writeChunks(colRef: CollectionReference, chunks: Array<Record<string, string>>): Promise<void> {
  await clearChunks(colRef);
  const batch = writeBatch(db);
  chunks.forEach((data, i) => {
    const pairs = Object.entries(data).map(([k, v]) => ({ k, v }));
    batch.set(doc(colRef, String(i)), { data: pairs });
  });
  await batch.commit();
}

/** Read all chunk docs (ordered by numeric index) and flatten into entries. */
async function readChunkEntries(colRef: CollectionReference): Promise<Array<[string, string]>> {
  const snap = await getDocs(colRef);
  const sorted = snap.docs.slice().sort((a, b) => Number(a.id) - Number(b.id));
  const entries: Array<[string, string]> = [];
  for (const d of sorted) {
    const raw = d.data().data;
    if (Array.isArray(raw)) {
      // New array-based format: [{k, v}, ...].
      for (const pair of raw as Array<{ k: string; v: string }>) entries.push([pair.k, pair.v]);
    } else if (raw && typeof raw === 'object') {
      // Legacy map-based format from before this fix — still readable so
      // previously saved chunks don't break.
      entries.push(...Object.entries(raw as Record<string, string>));
    }
  }
  return entries;
}

/** Bin-pack a NoteElement array into chunk arrays that each stay under `limit`
 *  bytes when JSON-serialised (elements themselves are not split further). */
function packElements(elements: NoteElement[], limit: number): NoteElement[][] {
  const chunks: NoteElement[][] = [];
  let current: NoteElement[] = [];
  let currentSize = 2;
  for (const el of elements) {
    const elSize = byteSize(JSON.stringify(el)) + 1;
    if (current.length > 0 && currentSize + elSize > limit) {
      chunks.push(current);
      current = [];
      currentSize = 2;
    }
    current.push(el);
    currentSize += elSize;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

/** Write element chunks to `colRef`, replacing any previous chunk docs. */
async function writeElementChunks(colRef: CollectionReference, chunks: NoteElement[][]): Promise<void> {
  await clearChunks(colRef);
  const batch = writeBatch(db);
  chunks.forEach((elements, i) => batch.set(doc(colRef, String(i)), { elements }));
  await batch.commit();
}

/** Read all element chunk docs (ordered by numeric index) and flatten. */
async function readElementChunks(colRef: CollectionReference): Promise<NoteElement[]> {
  const snap = await getDocs(colRef);
  const sorted = snap.docs.slice().sort((a, b) => Number(a.id) - Number(b.id));
  const elements: NoteElement[] = [];
  for (const d of sorted) elements.push(...((d.data().elements || []) as NoteElement[]));
  return elements;
}

/**
 * Firestore rejects documents that contain `undefined` values or `NaN` numbers.
 * This helper deep-cleans a NotePage so it's always safe to write.
 */
function sanitizeForFirestore(page: NotePage): NotePage {
  const cleanNum = (v: number | undefined, fallback = 0): number =>
    typeof v === 'number' && isFinite(v) ? v : fallback;

  const cleanElements = (page.elements ?? []).map(el => {
    const out: Record<string, unknown> = {
      id: el.id,
      type: el.type,
      x: cleanNum(el.x),
      y: cleanNum(el.y),
      width: cleanNum(el.width, 100),
      height: cleanNum(el.height, 40),
    };
    if (el.text !== undefined)       out.text       = el.text;
    if (el.href !== undefined)       out.href       = el.href;
    if (el.src !== undefined)        out.src        = el.src;
    if (el.fontSize !== undefined)   out.fontSize   = cleanNum(el.fontSize, 14);
    if (el.fontWeight !== undefined) out.fontWeight = el.fontWeight;
    if (el.fontStyle !== undefined)  out.fontStyle  = el.fontStyle;
    if (el.color !== undefined)      out.color      = el.color;
    if (el.align !== undefined)      out.align      = el.align;
    if (el.rotation !== undefined)   out.rotation   = cleanNum(el.rotation, 0);
    return out;
  });

  const clean: Record<string, unknown> = {
    id: page.id,
    title: page.title ?? 'Untitled',
    elements: cleanElements,
    pageCount: cleanNum(page.pageCount, 1),
    createdAt: cleanNum(page.createdAt, Date.now()),
    updatedAt: cleanNum(page.updatedAt, Date.now()),
  };
  if (page.html !== undefined)   clean.html   = page.html;
  if (page.chunked !== undefined) {
    clean.chunked = page.chunked;
    clean.chunkCount = page.chunkCount ?? 0;
  }
  return clean as unknown as NotePage;
}
import { applyTimeAdjustment, isChapterContentDone, isTopicContentDone, isSubtopicContentDone, isConceptContentDone } from '@/lib/timeEngine';
import type { DifficultyLevel } from '@/lib/types';

// ── Completion-map helpers for shared-course structural sync ─────────────────
// When admin pushes a structure update to a user who already accepted the course,
// we preserve the user's own completion progress and only apply structural changes.

/** Walk the user's subjects tree and record id → completed for every node. */
function buildCompletionMap(nodes: unknown[], map: Map<string, boolean> = new Map()): Map<string, boolean> {
  const childKeys = ['chapters', 'topics', 'subtopics', 'concepts', 'points'];
  for (const n of nodes as Record<string, unknown>[]) {
    if (typeof n.id === 'string') map.set(n.id, !!n.completed);
    for (const key of childKeys) {
      if (Array.isArray(n[key])) buildCompletionMap(n[key] as unknown[], map);
    }
  }
  return map;
}

/** Apply the completion map to admin's new structure.
 *  Nodes that existed in the user's tree keep their completed status.
 *  Brand-new nodes (not in the map) start as incomplete (false). */
function applyCompletionMap(nodes: unknown[], map: Map<string, boolean>): unknown[] {
  const childKeys = ['chapters', 'topics', 'subtopics', 'concepts', 'points'];
  return (nodes as Record<string, unknown>[]).map(n => {
    const result: Record<string, unknown> = {
      ...n,
      completed: map.has(n.id as string) ? map.get(n.id as string) : false,
    };
    for (const key of childKeys) {
      if (Array.isArray(n[key])) result[key] = applyCompletionMap(n[key] as unknown[], map);
    }
    return result;
  });
}
// ──────────────────────────────────────────────────────────────────────────────

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
export const newId = uid;

/** Real UTF-8 byte length of a string. Firestore's document size limit is
 *  measured in bytes, but Bengali (and other non-Latin) text is 3 bytes per
 *  character in UTF-8 while only 1 UTF-16 code unit in JS string `.length` —
 *  using `.length` as a proxy for byte size silently undercounts by up to 3x
 *  and lets oversized documents slip past the Storage-offload check. */
const byteSize = (s: string): number => new TextEncoder().encode(s).length;

// ─── Note-separation helpers ──────────────────────────────────────────────────
// Rich-text note content can be very large (the HTML generated by Tiptap wraps
// every run in <span style="font-size:…">, inflating a 900-word note to >100 KB).
// Storing many notes inside one Firestore document easily exceeds the 1 MB limit,
// causing silent "invalid-argument" failures.  We solve this by saving note HTML
// to a separate "courseNotes/{courseId}" document and stripping it from the main
// "studyData/{courseId}" document before every Firestore write.

/** Remove all `note` fields from the subjects tree and temp-notes, collecting
 *  them in a flat map keyed by the item's own id.  Returns the stripped copies
 *  and the map — does NOT mutate the originals. */
function extractNotes(
  subjects: Subject[],
  tempNotes: TempNoteItem[],
): { subjects: Subject[]; tempNotes: TempNoteItem[]; notes: Record<string, string> } {
  const notes: Record<string, string> = {};

  const stripPt  = (pt:  Point):    Point    => { if (pt.note)  notes[`pt:${pt.id}`]  = pt.note;  return { ...pt,  note: undefined }; };
  const stripCon = (con: Concept):  Concept  => { if (con.note) notes[`con:${con.id}`] = con.note; return { ...con, note: undefined, points:   (con.points   || []).map(stripPt) }; };
  const stripST  = (st:  Subtopic): Subtopic => { if (st.note)  notes[`st:${st.id}`]  = st.note;  return { ...st,  note: undefined, concepts: (st.concepts  || []).map(stripCon) }; };
  const stripT   = (t:   Topic):    Topic    => { if (t.note)   notes[`t:${t.id}`]    = t.note;   return { ...t,   note: undefined, subtopics:(t.subtopics  || []).map(stripST) }; };
  const stripC   = (c:   Chapter):  Chapter  => { if (c.note)   notes[`c:${c.id}`]    = c.note;   return { ...c,   note: undefined, topics:   (c.topics    || []).map(stripT) }; };
  const stripS   = (s:   Subject):  Subject  => { if (s.note)   notes[`s:${s.id}`]    = s.note;   return { ...s,   note: undefined, chapters: (s.chapters  || []).map(stripC) }; };

  function stripTN(items: TempNoteItem[]): TempNoteItem[] {
    return items.map(item => {
      if (item.note) notes[`tn:${item.id}`] = item.note;
      return { ...item, note: undefined, children: stripTN(item.children || []) };
    });
  }

  return { subjects: subjects.map(stripS), tempNotes: stripTN(tempNotes), notes };
}

/** Merge note HTML back from a flat map into stripped subjects / temp-notes. */
function mergeNotes(
  subjects: Subject[],
  tempNotes: TempNoteItem[],
  notes: Record<string, string>,
): { subjects: Subject[]; tempNotes: TempNoteItem[] } {
  const g = (key: string, fallback?: string) => notes[key] ?? fallback;

  const mergePt  = (pt:  Point):    Point    => ({ ...pt,  note: g(`pt:${pt.id}`,   pt.note)  });
  const mergeCon = (con: Concept):  Concept  => ({ ...con, note: g(`con:${con.id}`, con.note), points:   (con.points   || []).map(mergePt) });
  const mergeST  = (st:  Subtopic): Subtopic => ({ ...st,  note: g(`st:${st.id}`,  st.note),  concepts: (st.concepts  || []).map(mergeCon) });
  const mergeT   = (t:   Topic):    Topic    => ({ ...t,   note: g(`t:${t.id}`,    t.note),   subtopics:(t.subtopics  || []).map(mergeST) });
  const mergeC   = (c:   Chapter):  Chapter  => ({ ...c,   note: g(`c:${c.id}`,    c.note),   topics:   (c.topics    || []).map(mergeT) });
  const mergeS   = (s:   Subject):  Subject  => ({ ...s,   note: g(`s:${s.id}`,    s.note),   chapters: (s.chapters  || []).map(mergeC) });

  function mergeTN(items: TempNoteItem[]): TempNoteItem[] {
    return items.map(item => ({ ...item, note: g(`tn:${item.id}`, item.note), children: mergeTN(item.children || []) }));
  }

  return { subjects: subjects.map(mergeS), tempNotes: mergeTN(tempNotes) };
}

interface NotePageMeta {
  id: string;
  title: string;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface StudyData {
  subjects: Subject[];
  settings: CourseSettings;
  tempNotes?: TempNoteItem[];
  overallNote?: string;
  notePagesIndex?: NotePageMeta[];
  savedAt?: number;
}

interface StudyContextType {
  subjects: Subject[];
  settings: CourseSettings;
  dataLoaded: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'failed';
  syncError: string | null;
  online: boolean;
  setNote: (path: MarkPath, note: string) => void;
  toggleImportant: (path: MarkPath) => void;
  toggleWeak: (path: MarkPath) => void;
  setCourseTotalDays: (days: number) => void;
  setDailyStudyHours: (hours: number) => void;
  setCourseStartDate: (date: string) => void;
  setTimezone: (tz: string) => void;
  addSubject: (subject: Omit<Subject, 'id' | 'completed' | 'chapters'>) => void;
  updateSubjectDays: (subjectId: string, days: number) => void;
  deleteSubject: (subjectId: string) => void;
  updateSubjectMeta: (subjectId: string, title: string) => void;
  addChapter: (subjectId: string, chapter: Omit<Chapter, 'id' | 'completed' | 'topics'>) => void;
  deleteChapter: (subjectId: string, chapterId: string) => void;
  toggleChapterComplete: (subjectId: string, chapterId: string) => void;
  updateChapterMeta: (subjectId: string, chapterId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => void;
  addTopic: (subjectId: string, chapterId: string, topic: Omit<Topic, 'id' | 'completed' | 'subtopics'>) => void;
  deleteTopic: (subjectId: string, chapterId: string, topicId: string) => void;
  toggleTopicComplete: (subjectId: string, chapterId: string, topicId: string) => void;
  updateTopicMeta: (subjectId: string, chapterId: string, topicId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => void;
  addSubtopic: (subjectId: string, chapterId: string, topicId: string, subtopic: Omit<Subtopic, 'id' | 'completed' | 'concepts'>) => void;
  deleteSubtopic: (subjectId: string, chapterId: string, topicId: string, subtopicId: string) => void;
  toggleSubtopicComplete: (subjectId: string, chapterId: string, topicId: string, subtopicId: string) => void;
  updateSubtopicMeta: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => void;
  addConcept: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, concept: Omit<Concept, 'id' | 'completed' | 'points'>) => void;
  deleteConcept: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string) => void;
  toggleConceptComplete: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string) => void;
  updateConceptMeta: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => void;
  addPoint: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, point: Omit<Point, 'id' | 'completed'>) => void;
  deletePoint: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, pointId: string) => void;
  togglePointComplete: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, pointId: string) => void;
  updatePointMeta: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, pointId: string, title: string, difficulty?: DifficultyLevel) => void;

  resetSubjectProgress: (subjectId: string) => void;

  reorderSubjects: (fromIdx: number, toIdx: number) => void;
  reorderChapters: (subjectId: string, fromIdx: number, toIdx: number) => void;
  reorderTopics: (subjectId: string, chapterId: string, fromIdx: number, toIdx: number) => void;
  reorderSubtopics: (subjectId: string, chapterId: string, topicId: string, fromIdx: number, toIdx: number) => void;
  reorderConcepts: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, fromIdx: number, toIdx: number) => void;
  reorderPoints: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, fromIdx: number, toIdx: number) => void;

  // Temp Notes (hierarchical to-do)
  tempNotes: TempNoteItem[];
  addTempNote: (text: string, parentId?: string | null, noteHtml?: string) => string;
  updateTempNote: (id: string, text: string) => void;
  updateTempNoteContent: (id: string, noteHtml: string) => void;
  toggleTempNoteDone: (id: string) => void;
  deleteTempNote: (id: string) => void;

  // Overall Note (progress page)
  overallNote: string;
  setOverallNote: (note: string) => void;

  // A4 Note pages
  notePagesIndex: NotePageMeta[];
  createNotePage: (title?: string) => string;
  renameNotePage: (id: string, title: string) => void;
  deleteNotePage: (id: string) => Promise<void>;
  loadNotePage: (id: string) => Promise<NotePage | null>;
  saveNotePage: (page: NotePage) => Promise<void>;
  reorderNotePages: (fromIdx: number, toIdx: number) => void;
}

const StudyContext = createContext<StudyContextType | undefined>(undefined);

function getLocalData(key: string): StudyData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as StudyData;
  } catch {
    return null;
  }
}

function doResetProgress(subjs: Subject[], currentSettings: CourseSettings, userEmail: string | undefined, courseId?: string): { subjects: Subject[]; settings: CourseSettings } {
  const resetSubjects = subjs.map(s => ({
    ...s,
    completed: false,
    chapters: s.chapters.map(ch => ({
      ...ch,
      completed: false,
      topics: ch.topics.map(t => ({
        ...t,
        completed: false,
        subtopics: t.subtopics.map(sub => ({
          ...sub,
          completed: false,
          concepts: sub.concepts.map(c => ({
            ...c,
            completed: false,
            points: c.points.map(p => ({ ...p, completed: false })),
          })),
        })),
      })),
    })),
  }));
  const resetSettings: CourseSettings = { ...currentSettings, resetScheduled: false };
  if (userEmail) {
    try {
      // Clear current-format keys (course-specific)
      if (courseId) {
        localStorage.removeItem(`@study_today_plan_v3_${userEmail}_${courseId}`);
        localStorage.setItem(`@study_pending_v3_${userEmail}_${courseId}`, '[]');
        localStorage.setItem(`@study_revisions_v2_${userEmail}_${courseId}`, '[]');
      }
      // Also clear old-format keys for backward compatibility
      ['today_plan_v2', 'pending_v2', 'revisions_v1'].forEach(k => {
        localStorage.removeItem(`@study_${k}_${userEmail}`);
      });
    } catch { /* ignore */ }
  }
  return { subjects: resetSubjects, settings: resetSettings };
}

// NOTE: this used to compare `firestore.savedAt` against `local.savedAt` with
// plain `>` — but those two timestamps can come from the clocks of two
// *different* devices (Firestore's value was written by whichever device
// saved last; local's value was written by THIS device). Client clocks drift
// (minutes to hours) across phones/browsers, so that comparison would
// silently keep serving a stale local cache forever on a device whose clock
// merely lags another device's — which is exactly the "completed on the app
// but not showing on the website" symptom. We now decide using
// `preferLocal` (whether THIS device has a local edit it knows Firestore
// hasn't confirmed yet — see `hasUnsyncedEditRef` / the `*_unsynced` flag),
// never by comparing two devices' clocks against each other.
function pickNewerData(firestore: StudyData | null, local: StudyData | null, preferLocal: boolean): StudyData | null {
  if (!firestore && !local) return null;
  if (!firestore) return local;
  if (!local) return firestore;
  return preferLocal ? local : firestore;
}

export function StudyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeCourseId } = useCourse();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [settings, setSettings] = useState<CourseSettings>({ courseTotalDays: null, dailyStudyHours: 3 });
  const [tempNotes, setTempNotes] = useState<TempNoteItem[]>([]);
  const [overallNote, setOverallNoteState] = useState<string>('');
  const [notePagesIndex, setNotePagesIndex] = useState<NotePageMeta[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Track online / offline transitions
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);
  const lastSavedAt = useRef<number>(0);
  // Prevents the save-useEffect from echo-saving data that just arrived from a
  // remote onSnapshot. Without this, every incoming remote update would be
  // immediately re-saved to Firestore with a new timestamp, creating a sync loop.
  const skipNextSaveRef = useRef(false);
  // True while this device has a local edit not yet confirmed written to
  // Firestore (mirrors the `${lsKey}__unsynced` localStorage flag, kept as a
  // ref too for synchronous checks inside the onSnapshot callback).
  const hasUnsyncedEditRef = useRef(false);

  // Always-current refs so flushSave never captures stale closures
  const userRef = useRef(user);
  const activeCourseIdRef = useRef(activeCourseId);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { activeCourseIdRef.current = activeCourseId; }, [activeCourseId]);

  const localKey = (suffix: string) => (user && activeCourseId) ? `@study_${suffix}_${activeCourseId}_${user.email}` : null;

  // Listen for instant live-sync events dispatched by AdminContext when the admin
  // pushes an update to a shared course.  This bypasses the Firestore onSnapshot
  // round-trip (which has a hasPendingWrites guard that delays the update by one
  // server round-trip) and updates the UI immediately.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        shareId: string;
        subjects?: unknown[];
        settings?: Record<string, unknown>;
        tempNotes?: unknown[];
        overallNote?: string;
        notePagesIndex?: unknown[];
        notesMap?: Record<string, string>;
      };
      // Only apply if the active course is the one that was synced
      if (detail.shareId !== activeCourseIdRef.current) return;
      // Prevent the save-useEffect from echoing this update back to Firestore
      skipNextSaveRef.current = true;
      // `detail.subjects`/`detail.tempNotes` are "structural only" — note content
      // for a shared course lives in the separate courseNotes doc, not embedded
      // in the synced subjects tree. Merge `notesMap` back in here (mirrors the
      // withNotesDoc/mergeNotes path used on the normal Firestore-load path) so
      // this instant event never wipes out a note that was just added — without
      // this, the note would flash in briefly (from the Firestore onSnapshot
      // merge) and then disappear again the moment this event applied.
      let nextSubjects = detail.subjects as Subject[] | undefined;
      let nextTempNotes = detail.tempNotes as TempNoteItem[] | undefined;
      if (detail.notesMap && (nextSubjects || nextTempNotes)) {
        const merged = mergeNotes(nextSubjects || [], nextTempNotes || [], detail.notesMap);
        if (nextSubjects) nextSubjects = merged.subjects;
        if (nextTempNotes) nextTempNotes = merged.tempNotes;
      }
      if (nextSubjects)          setSubjects(nextSubjects);
      if (detail.settings)       setSettings(prev => ({ ...prev, ...detail.settings }));
      if (nextTempNotes)         setTempNotes(nextTempNotes);
      if (detail.overallNote !== undefined) setOverallNoteState(detail.overallNote);
      if (detail.notePagesIndex) setNotePagesIndex(detail.notePagesIndex as NotePage[]);
    };
    window.addEventListener('study-livesync', handler);
    return () => window.removeEventListener('study-livesync', handler);
  }, []); // eslint-disable-line — uses activeCourseIdRef (always-current ref) and stable setters

  // Load data from Firestore and listen for real-time changes from other devices
  useEffect(() => {
    if (!user || !activeCourseId) {
      setSubjects([]);
      setSettings({ courseTotalDays: null, dailyStudyHours: 3 });
      setTempNotes([]);
      setOverallNoteState('');
      setNotePagesIndex([]);
      setDataLoaded(false);
      isInitialLoad.current = true;
      return;
    }

    isInitialLoad.current = true;
    setSubjects([]);
    setSettings({ courseTotalDays: null, dailyStudyHours: 3 });
    setTempNotes([]);
    setOverallNoteState('');
    setNotePagesIndex([]);
    setDataLoaded(false);

    const docRef = doc(db, 'users', user.id, 'studyData', activeCourseId);
    const notesDocRef = doc(db, 'users', user.id, 'courseNotes', activeCourseId);
    let isFirstSnapshot = true;

    // Lifecycle guard: once the effect cleans up (course/user change or unmount),
    // any in-flight async work that resolves later must not apply state.
    let active = true;
    // Monotonic counter: each snapshot increments this; async continuations check
    // that their seq is still the latest before applying state, so out-of-order
    // resolutions from slow Firestore reads are discarded automatically.
    let seq = 0;

    // ── Cold-start safety net ────────────────────────────────────────────────
    // On a freshly opened app (especially mobile, right after the device's
    // network/radio reconnects), Firestore's realtime channel can take a long
    // time to establish before it fires either the success or the error
    // callback below — the UI would otherwise show the loading skeleton
    // indefinitely until the user manually refreshes. If neither callback has
    // resolved the first load within a short window, fall back to whatever we
    // already have in localStorage so the app always becomes usable; the
    // onSnapshot listener keeps running in the background and will silently
    // reconcile with Firestore the moment it does connect.
    const staleLoadTimer = setTimeout(() => {
      if (!active || !isFirstSnapshot) return;
      isFirstSnapshot = false;
      const lsRaw = localKey('data');
      const localData = lsRaw ? getLocalData(lsRaw) : null;
      if (localData) {
        setSubjects(localData.subjects || []);
        setSettings(prev => ({ ...prev, ...localData.settings }));
        setTempNotes(localData.tempNotes || []);
        setOverallNoteState(localData.overallNote || '');
        setNotePagesIndex(localData.notePagesIndex || []);
        lastSavedAt.current = localData.savedAt ?? 0;
      }
      setDataLoaded(true);
      setTimeout(() => { isInitialLoad.current = false; }, 200);
    }, 6000);

    /** Fetch the companion "courseNotes" document and merge its note content
     *  back into the given StudyData.  If the doc doesn't exist (old-format data
     *  that was saved before the note-separation change), the subjects already
     *  carry embedded notes and are returned unchanged. */
    // Notes recovered from the companion doc (and/or the legacy "main" self-heal
    // fallback) for the CURRENT snapshot. Populated by withNotesDoc and re-applied
    // after picking the freshest data source (see below) so a stale localStorage
    // cache — saved back when this course's notes were still missing — can never
    // silently discard notes that were just recovered from Firestore.
    let recoveredNotesMap: Record<string, string> | null = null;
    let recoveredOverallNote: string | null = null;

    const withNotesDoc = async (data: StudyData): Promise<StudyData> => {
      if (!(data as any).hasNotesDoc) return data; // old format — notes already embedded
      try {
        let notesSnap = await getDoc(notesDocRef);
        let sourceIsLegacyMain = false;

        // Self-heal path: courses created via the old single-course → multi-course
        // migration copied "studyData/main" to "studyData/{newCourseId}" (with
        // hasNotesDoc: true carried over) but historically did NOT copy the
        // companion "courseNotes/main" document to "courseNotes/{newCourseId}".
        // If that happened, the notes doc for THIS course id is missing even
        // though the real note content still exists, untouched, under the old
        // "main" id. Fall back to it, and copy it forward so this only needs
        // to self-heal once per course.
        if (!notesSnap.exists() && activeCourseId !== 'main') {
          const legacyNotesRef = doc(db, 'users', user.id, 'courseNotes', 'main');
          const legacySnap = await getDoc(legacyNotesRef);
          if (legacySnap.exists()) {
            notesSnap = legacySnap;
            sourceIsLegacyMain = true;
          }
        }

        if (!notesSnap.exists()) return data;
        const nd = notesSnap.data() as { overallNote?: string; notes?: Record<string, string>; chunked?: boolean };
        let notesMap = nd.notes || {};
        let overallNoteVal = nd.overallNote || '';
        const sourceChunksColRef = sourceIsLegacyMain
          ? collection(doc(db, 'users', user.id, 'courseNotes', 'main'), 'chunks')
          : collection(notesDocRef, 'chunks');
        // Once the flat notes map itself outgrows the Firestore document limit,
        // it's split across a "chunks" subcollection — read and reassemble it.
        if (nd.chunked) {
          const entries = await readChunkEntries(sourceChunksColRef);
          const merged = reassembleEntries(entries);
          overallNoteVal = merged['__overall__'] || '';
          delete merged['__overall__'];
          notesMap = merged;
        }

        // Copy the recovered legacy doc (and its chunks, if any) forward onto
        // this course's own notesDocRef so the fallback above is only needed
        // once — subsequent loads read it directly, no legacy lookup required.
        if (sourceIsLegacyMain) {
          setDoc(notesDocRef, nd).catch(() => {});
          if (nd.chunked) {
            (async () => {
              try {
                const entries = await getDocs(sourceChunksColRef);
                for (const chunkDoc of entries.docs) {
                  await setDoc(doc(collection(notesDocRef, 'chunks'), chunkDoc.id), chunkDoc.data());
                }
              } catch { /* best-effort self-heal; fallback path still works next time */ }
            })();
          }
        }

        recoveredNotesMap = notesMap;
        recoveredOverallNote = overallNoteVal;

        const { subjects, tempNotes } = mergeNotes(
          data.subjects,
          data.tempNotes || [],
          notesMap,
        );
        return { ...data, subjects, tempNotes, overallNote: overallNoteVal };
      } catch {
        return data; // offline — return what we have; notes will load from localStorage
      }
    };

    // ── Real-time listener — fires immediately on mount (initial load)
    //    and again whenever any device writes to this document ──
    // The callback itself is kept SYNCHRONOUS so Firestore can handle errors
    // normally.  Async work (fetching the notes companion doc) is delegated to
    // an inner async function guarded by `active` + `seq` so out-of-order
    // resolutions and post-cleanup state updates are both safe to discard.
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        const mySeq = ++seq; // capture snapshot's position before any await

        const snapData = snap.data();
        const fsDataRaw: (StudyData & { hasNotesDoc?: boolean }) | null =
          snap.exists() && snapData
            ? {
                subjects: snapData.subjects || [],
                settings: snapData.settings || {},
                tempNotes: snapData.tempNotes || [],
                overallNote: snapData.overallNote || '',
                notePagesIndex: snapData.notePagesIndex || [],
                savedAt: snapData.savedAt,
                hasNotesDoc: snapData.hasNotesDoc || false,
              }
            : null;

        if (isFirstSnapshot) {
          // ── Initial load: pick the freshest between Firestore and localStorage ──
          isFirstSnapshot = false;
          clearTimeout(staleLoadTimer);

          if (!fsDataRaw) {
            if (active) {
              setDataLoaded(true);
              setTimeout(() => { isInitialLoad.current = false; }, 200);
            }
            return;
          }

          // Kick off async notes-doc merge; guard with active + seq before applying.
          (async () => {
            const fsData = await withNotesDoc(fsDataRaw);
            if (!active || mySeq !== seq) return; // stale or unmounted — discard

            const lsRaw = localKey('data');
            const localData = lsRaw ? getLocalData(lsRaw) : null;
            // Did THIS device make an edit that was never confirmed written to
            // Firestore (app closed mid-debounce, or while offline)? Only in
            // that case should the local cache be allowed to win over Firestore.
            const localUnsynced = lsRaw ? localStorage.getItem(`${lsRaw}__unsynced`) === '1' : false;
            hasUnsyncedEditRef.current = localUnsynced;

            let legacySubjects: Subject[] | null = null;
            let legacySettings: CourseSettings | null = null;
            if (!localData) {
              try {
                const ls = localStorage.getItem(`@study_subjects_${user.email}`);
                const lc = localStorage.getItem(`@study_course_${user.email}`);
                if (ls) legacySubjects = JSON.parse(ls);
                if (lc) legacySettings = JSON.parse(lc);
              } catch { /* ignore */ }
            }

            let best = pickNewerData(fsData, localData, localUnsynced);

            // If a companion-doc / legacy-main self-heal recovered notes above,
            // re-apply them onto whichever source won the freshness comparison.
            // This matters because a stale localStorage cache — saved back when
            // this course's notes doc was still missing — carries a `savedAt`
            // that can be newer than (or equal to) Firestore's, so it can win
            // `pickNewerData` and would otherwise silently discard notes that
            // were just recovered from the legacy "courseNotes/main" doc.
            // mergeNotes only fills in blanks (falls back to the existing note
            // when a key is absent), so this never clobbers newer local edits.
            if (best && recoveredNotesMap) {
              const { subjects, tempNotes } = mergeNotes(
                best.subjects || [],
                best.tempNotes || [],
                recoveredNotesMap,
              );
              best = {
                ...best,
                subjects,
                tempNotes,
                overallNote: best.overallNote || recoveredOverallNote || '',
              };
            }

            // Anchor lastSavedAt to the freshest timestamp we know about.
            // The save-useEffect will push this forward immediately whenever
            // the user makes an edit, so server snapshots arriving before our
            // own save is acknowledged can never overwrite user-added data.
            lastSavedAt.current = best?.savedAt ?? fsData.savedAt ?? 0;

            if (best) {
              const loadedSettings = { ...best.settings } as CourseSettings;
              let loadedSubjects = best.subjects || [];
              if (loadedSettings.resetScheduled && loadedSettings.courseStartDate) {
                const startDate = new Date(loadedSettings.courseStartDate);
                startDate.setHours(0, 0, 0, 0);
                if (new Date() >= startDate) {
                  const resetResult = doResetProgress(loadedSubjects, loadedSettings, user?.email, activeCourseId);
                  loadedSubjects = resetResult.subjects;
                  loadedSettings.resetScheduled = false;
                }
              }
              setSubjects(loadedSubjects);
              setSettings(prev => ({ ...prev, ...loadedSettings }));
              setTempNotes(best.tempNotes || []);
              setOverallNoteState(best.overallNote || '');
              setNotePagesIndex(best.notePagesIndex || []);
            } else if (legacySubjects) {
              const migrated = legacySubjects.map((s: any) => ({
                ...s,
                chapters: (s.topics || s.chapters || []).map((ch: any) => ({
                  id: ch.id,
                  title: ch.title,
                  totalMinutes: ch.totalMinutes || 0,
                  completed: ch.completed || false,
                  topics: (ch.subtopics || ch.topics || []).map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    totalMinutes: 0,
                    completed: t.completed || false,
                    subtopics: t.subtopics || [],
                  })),
                })),
              }));
              setSubjects(migrated);
              if (legacySettings) setSettings(prev => ({ ...prev, ...legacySettings }));
            }

            setDataLoaded(true);
            // Delay so React finishes batching all setState calls above before
            // the save-useEffect can run (prevents saving empty [] subjects on load)
            setTimeout(() => { isInitialLoad.current = false; }, 200);
          })();
        } else {
          // ── Real-time update from another device ──
          // Skip if it's our own pending write, or if THIS device has a local
          // edit that hasn't been confirmed written to Firestore yet (in the
          // ~400ms debounce window before flushSave even starts). We used to
          // also skip whenever `fsDataRaw.savedAt <= lastSavedAt.current` —
          // but those two timestamps can be Date.now() from two *different*
          // devices' clocks, so any clock drift made this device permanently
          // ignore a genuinely newer remote update (e.g. a chapter completed
          // on another device never showing up here). Gate purely on this
          // device's own state instead.
          if (!fsDataRaw) return;
          if (snap.metadata.hasPendingWrites) return;
          if (hasUnsyncedEditRef.current) return;

          // Kick off async notes-doc merge; guard with active + seq before applying.
          (async () => {
            const fsData = await withNotesDoc(fsDataRaw);
            if (!active || mySeq !== seq) return; // stale or unmounted — discard

            // Mark that the next save-useEffect run should NOT echo this back to
            // Firestore — applying remote data must never create a save loop.
            // Also update lastSavedAt to the remote timestamp so any stale server
            // snapshots arriving after this are ignored.
            lastSavedAt.current = fsData.savedAt ?? 0;
            skipNextSaveRef.current = true;

            setSubjects(fsData.subjects || []);
            setSettings(prev => ({ ...prev, ...fsData.settings }));
            setTempNotes(fsData.tempNotes || []);
            setOverallNoteState(fsData.overallNote || '');
            setNotePagesIndex(fsData.notePagesIndex || []);
          })();
        }
      },
      () => {
        // Firestore error (offline / permission denied) — fall back to localStorage
        if (!isFirstSnapshot) return;
        isFirstSnapshot = false;
        clearTimeout(staleLoadTimer);
        if (!active) return;
        const lsRaw = localKey('data');
        const localData = lsRaw ? getLocalData(lsRaw) : null;
        if (localData) {
          setSubjects(localData.subjects || []);
          setSettings(prev => ({ ...prev, ...localData.settings }));
          setTempNotes(localData.tempNotes || []);
          setOverallNoteState(localData.overallNote || '');
          setNotePagesIndex(localData.notePagesIndex || []);
        }
        setDataLoaded(true);
        setTimeout(() => { isInitialLoad.current = false; }, 200);
      },
    );

    return () => {
      active = false; // prevent any in-flight async work from applying state
      clearTimeout(staleLoadTimer);
      unsubscribe();
    };
  }, [user, activeCourseId]);

  // Save data (debounced for Firestore, immediate for localStorage)
  const pendingSaveRef = useRef<{ subjects: Subject[]; settings: CourseSettings; tempNotes: TempNoteItem[]; overallNote: string; notePagesIndex: NotePageMeta[] } | null>(null);

  const flushSave = async (
    subjectsToSave: Subject[],
    settingsToSave: CourseSettings,
    tempNotesToSave: TempNoteItem[],
    overallNoteToSave: string,
    notePagesIndexToSave: NotePageMeta[],
  ) => {
    // Use refs so this always has the latest user/courseId regardless of closure age
    const currentUser = userRef.current;
    const currentCourseId = activeCourseIdRef.current;
    if (!currentUser || !currentCourseId) return;
    // Never save an empty subjects array — guard against accidental reset
    if (subjectsToSave.length === 0) return;
    const savedAt = Date.now();
    lastSavedAt.current = savedAt;
    const lsKey = `@study_data_${currentCourseId}_${currentUser.email}`;
    const payload: StudyData = {
      subjects: subjectsToSave,
      settings: settingsToSave,
      tempNotes: tempNotesToSave,
      overallNote: overallNoteToSave,
      notePagesIndex: notePagesIndexToSave,
      savedAt,
    };
    // localStorage always gets the full payload (no size limit)
    localStorage.setItem(lsKey, JSON.stringify(payload));
    try {
      const docRef = doc(db, 'users', currentUser.id, 'studyData', currentCourseId);
      const notesDocRef = doc(db, 'users', currentUser.id, 'courseNotes', currentCourseId);

      // Extract all rich-text note content from subjects and tempNotes so the main
      // Firestore document stays well under the 1 MB limit.  The notes are saved to
      // a separate "courseNotes/{courseId}" document and merged back on load.
      const { subjects: strippedSubjects, tempNotes: strippedTempNotes, notes } =
        extractNotes(subjectsToSave, tempNotesToSave);

      const mainPayload = JSON.parse(JSON.stringify({
        subjects: strippedSubjects,
        settings: settingsToSave,
        tempNotes: strippedTempNotes,
        overallNote: '',          // moved to the notes doc
        notePagesIndex: notePagesIndexToSave,
        savedAt,
        hasNotesDoc: true,        // tells the loader to fetch the companion doc
      }));

      // The flat notes map (all subject/chapter/topic/... notes for this course
      // combined) can itself grow past Firestore's 1 MB document limit as the
      // user accumulates notes over time. Once it does, offload the whole map to
      // Firebase Storage (no size ceiling there) and keep only a URL reference in
      // the courseNotes document — mirrors how oversized individual note pages
      // are already routed to Storage.
      const notesData = { overallNote: overallNoteToSave, notes };

      // Safety guard: never let an in-memory state that is *missing* notes
      // (empty overallNote + empty notes map) silently overwrite note content
      // that already exists in Firestore. This is the underlying condition
      // that let earlier bugs (a flawed course migration, then a stale local
      // cache winning a freshness comparison) permanently destroy notes even
      // though the in-memory "empty" state was itself just a symptom of
      // something else going wrong upstream. Closing it here means that
      // *class* of bug — not just the specific ones already fixed — can no
      // longer cause permanent data loss: worst case, a save is skipped once
      // and retried on the next edit, instead of real notes being wiped out.
      const incomingHasNotes =
        !!notesData.overallNote || Object.values(notesData.notes).some((v) => !!v);
      let skipNotesWrite = false;
      if (!incomingHasNotes) {
        try {
          const existingNotesSnap = await getDoc(notesDocRef);
          if (existingNotesSnap.exists()) {
            const existing = existingNotesSnap.data() as {
              overallNote?: string;
              notes?: Record<string, string>;
              chunked?: boolean;
              chunkCount?: number;
            };
            const existingHasNotes =
              !!existing.overallNote ||
              (existing.notes && Object.values(existing.notes).some((v) => !!v)) ||
              (!!existing.chunked && (existing.chunkCount || 0) > 0);
            if (existingHasNotes) {
              skipNotesWrite = true;
              console.warn(
                '[StudyContext] Skipped saving an empty notes payload over existing non-empty notes — ' +
                'this looks like a transient in-memory state, not an intentional clear.',
              );
            }
          }
        } catch {
          // If we can't check, fall through to the normal write below rather
          // than blocking the save entirely.
        }
      }

      if (!skipNotesWrite) {
        const notesDataSize = byteSize(JSON.stringify(notesData));
        const notesChunksRef = collection(notesDocRef, 'chunks');
        let notesPayload: Record<string, unknown>;
        if (notesDataSize > FIRESTORE_NOTE_LIMIT) {
          const rawEntries: Array<[string, string]> = [];
          if (notesData.overallNote) rawEntries.push(['__overall__', notesData.overallNote]);
          for (const [k, v] of Object.entries(notesData.notes)) if (v) rawEntries.push([k, v]);
          const splitEntries = rawEntries.flatMap(([k, v]) => splitLargeValue(k, v, FIRESTORE_NOTE_LIMIT));
          const chunks = packEntries(splitEntries, FIRESTORE_NOTE_LIMIT);
          await writeChunks(notesChunksRef, chunks);
          notesPayload = { savedAt, overallNote: '', notes: {}, chunked: true, chunkCount: chunks.length };
        } else {
          await clearChunks(notesChunksRef);
          notesPayload = JSON.parse(JSON.stringify({ savedAt, ...notesData, chunked: false }));
        }

        // Write courseNotes FIRST, then studyData.  Sequential (not concurrent) so
        // another device that receives the studyData snapshot can always getDoc the
        // companion notes doc and find it already committed.  If we wrote both with
        // Promise.all, a listener on another device could receive the main snapshot
        // before courseNotes was committed and load stale (empty) notes.
        await setDoc(notesDocRef, notesPayload, { merge: false });
      }
      await setDoc(docRef, mainPayload, { merge: false });

      // ── Live-sync: relay update through shareRequests ────────────────────
      // Security rules prevent the admin from writing directly to another user's
      // studyData/courseNotes collections.  Instead, we write the updated course
      // data into each accepted shareRequests document (admin CAN write those
      // because fromAdminUid == auth.uid).  The recipient's client has an
      // onSnapshot on shareRequests and will detect the new syncedAt timestamp,
      // then apply the data to their own collections themselves.
      //
      // Query only by fromAdminUid (single equality → no composite index needed).
      try {
        const sharesQ = query(
          collection(db, 'shareRequests'),
          where('fromAdminUid', '==', currentUser.id),
        );
        const sharesSnap = await getDocs(sharesQ);
        console.log(`[LiveSync] Admin save for course "${currentCourseId}" — found ${sharesSnap.size} sent share(s) total`);
        const syncedAt = Date.now();
        let syncCount = 0;
        for (const shareDoc of sharesSnap.docs) {
          const shareData = shareDoc.data();
          if (shareData.courseId !== currentCourseId) continue;
          if (shareData.status !== 'accepted') continue;
          syncCount++;

          // Overwrite courseSnapshot in-place (dot-notation → no extra fields added,
          // document size stays stable) and bump syncedAt as the change signal.
          // The recipient's AdminContext listener detects the new syncedAt via
          // onSnapshot and applies the update to their own Firestore docs.
          const syncPayload: Record<string, unknown> = {
            'courseSnapshot.studyData': mainPayload,
            syncedAt,
          };
          if (!skipNotesWrite) {
            syncPayload['courseSnapshot.notesJson'] = JSON.stringify(notesData);
          }
          await updateDoc(doc(db, 'shareRequests', shareDoc.id), syncPayload);
          console.log(`[LiveSync] ✅ Relay pushed to shareRequest "${shareDoc.id}" — syncedAt=${syncedAt}`);
        }
        if (syncCount === 0) console.warn(`[LiveSync] ⚠️ No accepted shares found for course "${currentCourseId}"`);
      } catch (syncErr) {
        console.error('[LiveSync] ❌ Relay write failed:', syncErr);
      }
      // ─────────────────────────────────────────────────────────────────────

      // Firestore now has this edit — clear the "unsynced" marker so a future
      // load on this device trusts Firestore instead of this local cache.
      const lsKeyForFlag = localKey('data');
      if (lsKeyForFlag) localStorage.removeItem(`${lsKeyForFlag}__unsynced`);
      hasUnsyncedEditRef.current = false;
      setSyncStatus('success');
      setTimeout(() => setSyncStatus(s => s === 'success' ? 'idle' : s), 2500);
    } catch (err) {
      console.error('[StudyContext] Firestore save failed:', err);
      setSyncStatus('failed');
      setTimeout(() => setSyncStatus(s => s === 'failed' ? 'idle' : s), 4000);
    }
  };

  useEffect(() => {
    if (!user || !dataLoaded) return;
    if (isInitialLoad.current) {
      // The save-effect can't run yet, but a server snapshot may have set
      // skipNextSaveRef during the boot window. Clear it here so the very
      // first user edit after load isn't silently swallowed.
      skipNextSaveRef.current = false;
      return;
    }
    if (subjects.length === 0) return;

    // Remote update arrived via onSnapshot — persist to localStorage so it
    // survives a reload, but do NOT echo it back to Firestore (that would
    // create an infinite save loop between devices).
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      const lsKey = localKey('data');
      // Use lastSavedAt.current (= the remote savedAt, set in onSnapshot) so the
      // localStorage entry keeps the original timestamp — not a fresh Date.now().
      const remotePayload: StudyData = { subjects, settings, tempNotes, overallNote, notePagesIndex, savedAt: lastSavedAt.current };
      if (lsKey) localStorage.setItem(lsKey, JSON.stringify(remotePayload));
      return;
    }

    // User-initiated change — save to localStorage immediately, then debounce
    // the Firestore write.  Push lastSavedAt forward right now so any stale
    // server snapshot arriving during the 400 ms debounce window is ignored.
    const payload: StudyData = { subjects, settings, tempNotes, overallNote, notePagesIndex, savedAt: Date.now() };
    const lsKey = localKey('data');
    if (lsKey) {
      localStorage.setItem(lsKey, JSON.stringify(payload));
      // Mark this edit as not-yet-confirmed-in-Firestore. Cleared by flushSave
      // once the write succeeds. If the app is closed/killed before that, this
      // flag survives (it's in localStorage) so the next load on THIS device
      // knows to prefer its own cache over Firestore instead of guessing from
      // timestamps that may have been set by a different device's clock.
      localStorage.setItem(`${lsKey}__unsynced`, '1');
    }
    lastSavedAt.current = payload.savedAt!;
    hasUnsyncedEditRef.current = true;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncStatus('syncing');
    pendingSaveRef.current = { subjects, settings, tempNotes, overallNote, notePagesIndex };
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const pending = pendingSaveRef.current;
      if (pending) flushSave(pending.subjects, pending.settings, pending.tempNotes, pending.overallNote, pending.notePagesIndex);
    }, 400);
  }, [subjects, settings, tempNotes, overallNote, notePagesIndex, user, dataLoaded, activeCourseId]);

  // Flush save immediately before page unload
  useEffect(() => {
    const handleUnload = () => {
      if (pendingSaveRef.current && user && activeCourseId) {
        const { subjects: s, settings: st, tempNotes: tn, overallNote: on, notePagesIndex: np } = pendingSaveRef.current;
        const payload: StudyData = { subjects: s, settings: st, tempNotes: tn, overallNote: on, notePagesIndex: np, savedAt: Date.now() };
        const lsKey = `@study_data_${activeCourseId}_${user.email}`;
        localStorage.setItem(lsKey, JSON.stringify(payload));
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [user]);

  // ─── Calculation helpers ───────────────────────────────────────────────
  const calculateWeight = (subj: Subject) => {
    if (!subj.chapters || subj.chapters.length === 0) return 1;
    let w = 0;
    subj.chapters.forEach(ch => {
      w += 1;
      ch.topics.forEach(t => {
        w += 0.5;
        t.subtopics.forEach(sub => {
          w += 0.25;
          sub.concepts.forEach(() => { w += 0.1; });
        });
      });
    });
    return w;
  };

  const redistributeDays = (curr: Subject[], courseDays: number | null): Subject[] => {
    if (!courseDays) return curr;
    const today = new Date();
    let manualSum = 0, autoWeightSum = 0;
    curr.forEach(s => {
      if (s.manualDays) manualSum += s.allocatedDays;
      else autoWeightSum += calculateWeight(s);
    });
    const pool = Math.max(0, courseDays - manualSum);
    return curr.map(s => {
      if (s.manualDays) return { ...s, deadline: formatISO(addDays(today, s.allocatedDays)) };
      const w = calculateWeight(s);
      const allocated = autoWeightSum > 0 ? Math.round((w / autoWeightSum) * pool) : 0;
      return { ...s, allocatedDays: allocated, deadline: formatISO(addDays(today, allocated)) };
    });
  };

  const redistributeMinutes = (subj: Subject): Subject => {
    if (!subj.chapters || subj.chapters.length === 0) return subj;
    const totalW = calculateWeight(subj);
    const updatedChapters = subj.chapters.map(ch => {
      const chW = 1 + ch.topics.length * 0.5;
      return { ...ch, totalMinutes: Math.round((chW / totalW) * subj.totalMinutes) };
    });
    return { ...subj, chapters: updatedChapters };
  };

  const checkSubjectCompletion = (s: Subject): Subject => ({
    ...s,
    completed: s.chapters.length > 0 && s.chapters.every(ch => isChapterContentDone(ch)),
  });

  // ─── Immutable update helpers ──────────────────────────────────────────
  const updateSubjectFn = (subjId: string, updater: (s: Subject) => Subject) =>
    (prev: Subject[]) => prev.map(s => s.id === subjId ? updater(s) : s);

  const updateChapterFn = (subjId: string, chId: string, updater: (ch: Chapter) => Chapter) =>
    updateSubjectFn(subjId, s => ({ ...s, chapters: s.chapters.map(ch => ch.id === chId ? updater(ch) : ch) }));

  const updateTopicFn = (subjId: string, chId: string, tId: string, updater: (t: Topic) => Topic) =>
    updateChapterFn(subjId, chId, ch => ({ ...ch, topics: ch.topics.map(t => t.id === tId ? updater(t) : t) }));

  const updateSubtopicFn = (subjId: string, chId: string, tId: string, subId: string, updater: (sub: Subtopic) => Subtopic) =>
    updateTopicFn(subjId, chId, tId, t => ({ ...t, subtopics: t.subtopics.map(sub => sub.id === subId ? updater(sub) : sub) }));

  const updateConceptFn = (subjId: string, chId: string, tId: string, subId: string, cId: string, updater: (c: Concept) => Concept) =>
    updateSubtopicFn(subjId, chId, tId, subId, sub => ({ ...sub, concepts: sub.concepts.map(c => c.id === cId ? updater(c) : c) }));

  // ─── Subject methods ───────────────────────────────────────────────────
  const setCourseTotalDays = (days: number) => {
    setSettings(prev => ({ ...prev, courseTotalDays: days }));
    setSubjects(curr => {
      const redistributed = redistributeDays(curr, days);
      return applyTimeAdjustment(redistributed, settings.dailyStudyHours, days);
    });
  };

  const setDailyStudyHours = (hours: number) => {
    setSettings(prev => ({ ...prev, dailyStudyHours: hours }));
    setSubjects(curr => applyTimeAdjustment(curr, hours, settings.courseTotalDays));
  };

  const setTimezone = (tz: string) => {
    setSettings(prev => ({ ...prev, timezone: tz }));
  };

  const setCourseStartDate = (date: string) => {
    // Immediately reset all subjects and clear today/pending/revision data
    setSubjects(prev => {
      const { subjects: resetSubjs } = doResetProgress(prev, settings, user?.email ?? undefined, activeCourseId ?? undefined);
      return resetSubjs;
    });
    setSettings(prev => ({ ...prev, courseStartDate: date, resetScheduled: false }));

    // Sync cleared today data to Firestore so other devices also reset
    if (user?.id && activeCourseId) {
      setDoc(
        doc(db, 'users', user.id, 'todayData', activeCourseId),
        { plan: { date: '', tasks: [] }, pending: [], revisions: [] },
        { merge: false },
      ).catch(e => console.warn('[setCourseStartDate] Firestore todayData reset failed:', e));
    }
  };

  const addSubject = (data: Omit<Subject, 'id' | 'completed' | 'chapters'>) => {
    const newSubject: Subject = { ...data, id: uid(), completed: false, chapters: [] };
    setSubjects(prev => redistributeDays([...prev, newSubject], settings.courseTotalDays));
  };

  const updateSubjectDays = (subjId: string, days: number) => {
    setSubjects(prev => redistributeDays(
      prev.map(s => s.id === subjId ? { ...s, allocatedDays: days, manualDays: true } : s),
      settings.courseTotalDays
    ));
  };

  // ─── Revision helpers ──────────────────────────────────────────────────
  const purgeRevisions = (prefix: string) => {
    if (!user?.email || !activeCourseId) return;
    const email = user.email;
    const courseId = activeCourseId;
    const revK = `@study_revisions_v2_${email}_${courseId}`;
    let filtered: any[] = [];
    try {
      const raw = localStorage.getItem(revK);
      const all: any[] = raw ? JSON.parse(raw) : [];
      filtered = all.filter((r: any) => {
        const key = String(r.taskKey ?? '');
        return key !== prefix && !key.startsWith(prefix + '|');
      });
      localStorage.setItem(revK, JSON.stringify(filtered));
    } catch { return; }
    if (user?.id) {
      setDoc(
        doc(db, 'users', user.id, 'todayData', courseId),
        { revisions: filtered },
        { merge: true },
      ).catch(e => console.warn('[purgeRevisions] Firestore sync failed:', e));
    }
  };

  const patchRevisions = (updateFn: (r: any) => any) => {
    if (!user?.email || !activeCourseId) return;
    const email = user.email;
    const courseId = activeCourseId;
    const revK = `@study_revisions_v2_${email}_${courseId}`;
    let updated: any[] = [];
    try {
      const raw = localStorage.getItem(revK);
      const all: any[] = raw ? JSON.parse(raw) : [];
      updated = all.map(updateFn);
      localStorage.setItem(revK, JSON.stringify(updated));
    } catch { return; }
    if (user?.id) {
      setDoc(
        doc(db, 'users', user.id, 'todayData', courseId),
        { revisions: updated },
        { merge: true },
      ).catch(e => console.warn('[patchRevisions] Firestore sync failed:', e));
    }
  };

  // ─── Revision scheduling from Subject section ──────────────────────────
  // Called when a completion checkbox is toggled in the Subject tree.
  // Mirrors the same localStorage + Firestore dual-write pattern used by
  // purgeRevisions / patchRevisions above, so Today.tsx picks up the change
  // immediately via its onSnapshot listener.
  const SUBJECT_REVISION_DAYS = 5; // days until first revision after completing
  const SUBJECT_MIN_MINS = 3;       // minimum revisionMins

  const addRevisionFromSubject = (
    taskKey: string,
    mainTitle: string,
    subjectTitle: string,
    subjectColor: string,
    breadcrumb: string[],
    level: string,
    estimatedMins: number,
  ) => {
    if (!user?.email || !activeCourseId) return;
    const email = user.email;
    const courseId = activeCourseId;
    const revK = `@study_revisions_v2_${email}_${courseId}`;
    const scheduledDate = toDateStrIST(addDaysIST(nowIST(settings.timezone), SUBJECT_REVISION_DAYS));
    const id = `${taskKey}_rev_s0_${scheduledDate}`;
    let entries: any[] = [];
    try {
      const raw = localStorage.getItem(revK);
      entries = raw ? JSON.parse(raw) : [];
    } catch { return; }
    // Don't duplicate an existing active revision for this key
    if (entries.some((r: any) => r.taskKey === taskKey && !r.done)) return;
    if (entries.some((r: any) => r.id === id)) return;
    const entry = {
      id, taskKey, mainTitle, subjectTitle, subjectColor, breadcrumb, level,
      scheduledDate,
      revisionMins: Math.max(Math.round(estimatedMins * 0.5), SUBJECT_MIN_MINS),
      stage: 0,
      done: false,
    };
    const merged = [...entries, entry];
    try { localStorage.setItem(revK, JSON.stringify(merged)); } catch { return; }
    if (user?.id) {
      setDoc(doc(db, 'users', user.id, 'todayData', courseId), { revisions: merged }, { merge: true })
        .catch(e => console.warn('[addRevisionFromSubject] Firestore sync failed:', e));
    }
  };

  const removeRevisionFromSubject = (taskKey: string) => {
    if (!user?.email || !activeCourseId) return;
    const email = user.email;
    const courseId = activeCourseId;
    const revK = `@study_revisions_v2_${email}_${courseId}`;
    let entries: any[] = [];
    try {
      const raw = localStorage.getItem(revK);
      entries = raw ? JSON.parse(raw) : [];
    } catch { return; }
    // Remove only non-done revisions for this exact taskKey
    const filtered = entries.filter((r: any) => !(r.taskKey === taskKey && !r.done));
    if (filtered.length === entries.length) return; // nothing changed
    try { localStorage.setItem(revK, JSON.stringify(filtered)); } catch { return; }
    if (user?.id) {
      setDoc(doc(db, 'users', user.id, 'todayData', courseId), { revisions: filtered }, { merge: true })
        .catch(e => console.warn('[removeRevisionFromSubject] Firestore sync failed:', e));
    }
  };

  const deleteSubject = (subjId: string) => {
    setSubjects(prev => redistributeDays(prev.filter(s => s.id !== subjId), settings.courseTotalDays));
    purgeRevisions(subjId);
  };

  const updateSubjectMeta = (subjId: string, title: string) => {
    setSubjects(prev => prev.map(s => s.id === subjId ? { ...s, title } : s));
    patchRevisions(r => {
      const key = String(r.taskKey ?? '');
      if (!key.startsWith(subjId + '|')) return r;
      return { ...r, subjectTitle: title };
    });
  };

  const resetSubjectProgress = (subjId: string) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return {
        ...s,
        completed: false,
        chapters: s.chapters.map(ch => ({
          ...ch,
          completed: false,
          topics: ch.topics.map(t => ({
            ...t,
            completed: false,
            subtopics: t.subtopics.map(sub => ({
              ...sub,
              completed: false,
              concepts: sub.concepts.map(c => ({
                ...c,
                completed: false,
                points: c.points.map(p => ({ ...p, completed: false })),
              })),
            })),
          })),
        })),
      };
    }));

    // Clear / filter today plan, pending, and revisions for this subject
    // using the current course-specific localStorage keys, then sync to Firestore
    if (user?.email && activeCourseId) {
      const email = user.email;
      const courseId = activeCourseId;
      const pKey   = `@study_today_plan_v3_${email}_${courseId}`;
      const pendK  = `@study_pending_v3_${email}_${courseId}`;
      const revK   = `@study_revisions_v2_${email}_${courseId}`;

      let filteredPlanTasks: any[] = [];
      let planDate = '';
      let filteredPend: any[] = [];
      let filteredRev: any[] = [];

      try {
        // Filter today's plan — remove tasks belonging to this subject
        const planRaw = localStorage.getItem(pKey);
        if (planRaw) {
          const parsed = JSON.parse(planRaw) as { date: string; tasks: any[] };
          planDate = parsed.date ?? '';
          filteredPlanTasks = Array.isArray(parsed.tasks)
            ? parsed.tasks.filter((t: any) => t.subjectId !== subjId)
            : [];
          localStorage.setItem(pKey, JSON.stringify({ date: planDate, tasks: filteredPlanTasks }));
        }

        // Filter pending items belonging to this subject
        const pendRaw = localStorage.getItem(pendK);
        filteredPend = pendRaw
          ? (JSON.parse(pendRaw) as any[]).filter((t: any) => t.task?.subjectId !== subjId)
          : [];
        localStorage.setItem(pendK, JSON.stringify(filteredPend));

        // Filter revisions belonging to this subject
        // RevisionEntry.id format: "${task.key}_rev_${days}" where task.key starts with "${subjectId}|"
        const revRaw = localStorage.getItem(revK);
        filteredRev = revRaw
          ? (JSON.parse(revRaw) as any[]).filter(
              (r: any) => !String(r.id ?? '').startsWith(subjId + '|'),
            )
          : [];
        localStorage.setItem(revK, JSON.stringify(filteredRev));
      } catch { /* ignore */ }

      // Sync to Firestore so other devices also reflect the reset immediately
      if (user?.id) {
        setDoc(
          doc(db, 'users', user.id, 'todayData', courseId),
          {
            plan: { date: planDate, tasks: filteredPlanTasks },
            pending: filteredPend,
            revisions: filteredRev,
          },
          { merge: false },
        ).catch(e => console.warn('[resetSubjectProgress] Firestore todayData sync failed:', e));
      }
    }
  };

  const reorderNotePages = (fromIdx: number, toIdx: number) => {
    setNotePagesIndex(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  // ─── Reorder methods ───────────────────────────────────────────────────
  const reorderSubjects = (fromIdx: number, toIdx: number) => {
    setSubjects(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const reorderChapters = (subjId: string, fromIdx: number, toIdx: number) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const chs = [...s.chapters];
      const [moved] = chs.splice(fromIdx, 1);
      chs.splice(toIdx, 0, moved);
      return { ...s, chapters: chs };
    }));
  };

  const reorderTopics = (subjId: string, chId: string, fromIdx: number, toIdx: number) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return { ...s, chapters: s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        const tops = [...ch.topics];
        const [moved] = tops.splice(fromIdx, 1);
        tops.splice(toIdx, 0, moved);
        return { ...ch, topics: tops };
      }) };
    }));
  };

  const reorderSubtopics = (subjId: string, chId: string, tId: string, fromIdx: number, toIdx: number) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return { ...s, chapters: s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        return { ...ch, topics: ch.topics.map(t => {
          if (t.id !== tId) return t;
          const subs = [...t.subtopics];
          const [moved] = subs.splice(fromIdx, 1);
          subs.splice(toIdx, 0, moved);
          return { ...t, subtopics: subs };
        }) };
      }) };
    }));
  };

  const reorderConcepts = (subjId: string, chId: string, tId: string, subId: string, fromIdx: number, toIdx: number) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return { ...s, chapters: s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        return { ...ch, topics: ch.topics.map(t => {
          if (t.id !== tId) return t;
          return { ...t, subtopics: t.subtopics.map(sub => {
            if (sub.id !== subId) return sub;
            const cons = [...sub.concepts];
            const [moved] = cons.splice(fromIdx, 1);
            cons.splice(toIdx, 0, moved);
            return { ...sub, concepts: cons };
          }) };
        }) };
      }) };
    }));
  };

  const reorderPoints = (subjId: string, chId: string, tId: string, subId: string, cId: string, fromIdx: number, toIdx: number) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return { ...s, chapters: s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        return { ...ch, topics: ch.topics.map(t => {
          if (t.id !== tId) return t;
          return { ...t, subtopics: t.subtopics.map(sub => {
            if (sub.id !== subId) return sub;
            return { ...sub, concepts: sub.concepts.map(c => {
              if (c.id !== cId) return c;
              const pts = [...c.points];
              const [moved] = pts.splice(fromIdx, 1);
              pts.splice(toIdx, 0, moved);
              return { ...c, points: pts };
            }) };
          }) };
        }) };
      }) };
    }));
  };

  // ─── Chapter methods ───────────────────────────────────────────────────
  const addChapter = (subjId: string, data: Omit<Chapter, 'id' | 'completed' | 'topics'>) => {
    setSubjects(prev => {
      const updated = prev.map(s => {
        if (s.id !== subjId) return s;
        const newChapter: Chapter = { ...data, id: uid(), completed: false, topics: [] };
        return redistributeMinutes({ ...s, completed: false, chapters: [...s.chapters, newChapter] });
      });
      return redistributeDays(updated, settings.courseTotalDays);
    });
  };

  const deleteChapter = (subjId: string, chId: string) => {
    setSubjects(prev => {
      const updated = prev.map(s => {
        if (s.id !== subjId) return s;
        return checkSubjectCompletion(redistributeMinutes({ ...s, chapters: s.chapters.filter(ch => ch.id !== chId) }));
      });
      return redistributeDays(updated, settings.courseTotalDays);
    });
    purgeRevisions(`${subjId}|${chId}`);
  };

  const toggleChapterComplete = (subjId: string, chId: string) => {
    const subj = subjects.find(s => s.id === subjId);
    const ch = subj?.chapters.find(c => c.id === chId);
    const wasComplete = ch?.completed ?? false;
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const updatedChapters = s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        // Manual completion: only toggle this chapter, do NOT cascade to children
        return { ...ch, completed: !ch.completed };
      });
      return checkSubjectCompletion({ ...s, chapters: updatedChapters });
    }));
    if (subj && ch) {
      const taskKey = `${subjId}|${chId}`;
      if (!wasComplete) {
        addRevisionFromSubject(taskKey, ch.title, subj.title, subj.color, [], 'chapter',
          ch.adjustedMinutes ?? ch.estimatedMinutes ?? ch.totalMinutes ?? 0);
      } else {
        removeRevisionFromSubject(taskKey);
      }
    }
  };

  const updateChapterMeta = (subjId: string, chId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => {
    setSubjects(updateChapterFn(subjId, chId, ch => ({
      ...ch, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));
    const chapterKey = `${subjId}|${chId}`;
    patchRevisions(r => {
      const key = String(r.taskKey ?? '');
      if (key === chapterKey) return { ...r, mainTitle: title };
      if (key.startsWith(chapterKey + '|')) {
        const bc = Array.isArray(r.breadcrumb) ? [...r.breadcrumb] : [];
        bc[0] = title;
        return { ...r, breadcrumb: bc };
      }
      return r;
    });
  };

  // ─── Topic methods ─────────────────────────────────────────────────────
  const addTopic = (subjId: string, chId: string, data: Omit<Topic, 'id' | 'completed' | 'subtopics'>) => {
    setSubjects(prev => {
      const updated = prev.map(s => {
        if (s.id !== subjId) return s;
        const newChapters = s.chapters.map(ch => {
          if (ch.id !== chId) return ch;
          const newTopic: Topic = { ...data, id: uid(), completed: false, subtopics: [] };
          return { ...ch, completed: false, topics: [...ch.topics, newTopic] };
        });
        return redistributeMinutes({ ...s, completed: false, chapters: newChapters });
      });
      return redistributeDays(updated, settings.courseTotalDays);
    });
  };

  const deleteTopic = (subjId: string, chId: string, tId: string) => {
    setSubjects(prev => {
      const updated = prev.map(s => {
        if (s.id !== subjId) return s;
        const newChapters = s.chapters.map(ch => {
          if (ch.id !== chId) return ch;
          const newTopics = ch.topics.filter(t => t.id !== tId);
          return { ...ch, topics: newTopics };
        });
        return checkSubjectCompletion(redistributeMinutes({ ...s, chapters: newChapters }));
      });
      return redistributeDays(updated, settings.courseTotalDays);
    });
    purgeRevisions(`${subjId}|${chId}|${tId}`);
  };

  const toggleTopicComplete = (subjId: string, chId: string, tId: string) => {
    const subj = subjects.find(s => s.id === subjId);
    const ch = subj?.chapters.find(c => c.id === chId);
    const topic = ch?.topics.find(t => t.id === tId);
    const wasComplete = topic?.completed ?? false;
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const newChapters = s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        const newTopics = ch.topics.map(t => {
          if (t.id !== tId) return t;
          // Manual completion: only toggle this topic, do NOT cascade to subtopics (Topic-First rule)
          return { ...t, completed: !t.completed };
        });
        // ch.completed = chapter overview flag (manual only, not auto-set from topics)
        return { ...ch, topics: newTopics };
      });
      return checkSubjectCompletion({ ...s, chapters: newChapters });
    }));
    if (subj && ch && topic) {
      const taskKey = `${subjId}|${chId}|${tId}`;
      if (!wasComplete) {
        addRevisionFromSubject(taskKey, topic.title, subj.title, subj.color, [ch.title], 'topic',
          topic.adjustedMinutes ?? topic.estimatedMinutes ?? topic.totalMinutes ?? 0);
      } else {
        removeRevisionFromSubject(taskKey);
      }
    }
  };

  const updateTopicMeta = (subjId: string, chId: string, tId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => {
    setSubjects(updateTopicFn(subjId, chId, tId, t => ({
      ...t, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));
    const topicKey = `${subjId}|${chId}|${tId}`;
    patchRevisions(r => {
      const key = String(r.taskKey ?? '');
      if (key === topicKey) return { ...r, mainTitle: title };
      if (key.startsWith(topicKey + '|')) {
        const bc = Array.isArray(r.breadcrumb) ? [...r.breadcrumb] : [];
        bc[1] = title;
        return { ...r, breadcrumb: bc };
      }
      return r;
    });
  };

  // ─── Subtopic methods ──────────────────────────────────────────────────
  const addSubtopic = (subjId: string, chId: string, tId: string, data: Omit<Subtopic, 'id' | 'completed' | 'concepts'>) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const newChapters = s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        return {
          ...ch, completed: false,
          topics: ch.topics.map(t => {
            if (t.id !== tId) return t;
            const newSub: Subtopic = { ...data, id: uid(), completed: false, concepts: [] };
            return { ...t, completed: false, subtopics: [...t.subtopics, newSub] };
          })
        };
      });
      return redistributeMinutes({ ...s, completed: false, chapters: newChapters });
    }));
  };

  const deleteSubtopic = (subjId: string, chId: string, tId: string, subId: string) => {
    setSubjects(updateSubjectFn(subjId, s => {
      const newChapters = s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        return { ...ch, topics: ch.topics.map(t => {
          if (t.id !== tId) return t;
          const newSubs = t.subtopics.filter(sub => sub.id !== subId);
          return { ...t, subtopics: newSubs, completed: newSubs.length > 0 && newSubs.every(sub => sub.completed) };
        })};
      });
      return checkSubjectCompletion({ ...s, chapters: newChapters });
    }));
    purgeRevisions(`${subjId}|${chId}|${tId}|${subId}`);
  };

  const toggleSubtopicComplete = (subjId: string, chId: string, tId: string, subId: string) => {
    const subj = subjects.find(s => s.id === subjId);
    const ch = subj?.chapters.find(c => c.id === chId);
    const topic = ch?.topics.find(t => t.id === tId);
    const sub = topic?.subtopics.find(s => s.id === subId);
    const wasComplete = sub?.completed ?? false;
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const newChapters = s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        const newTopics = ch.topics.map(t => {
          if (t.id !== tId) return t;
          const newSubs = t.subtopics.map(sub => {
            if (sub.id !== subId) return sub;
            // Manual completion: only toggle this subtopic, do NOT cascade to concepts
            return { ...sub, completed: !sub.completed };
          });
          // Auto-complete topic only when overview done AND ALL subtopics content done
          const topicDone = t.completed && newSubs.length > 0 && newSubs.every(sub => isSubtopicContentDone(sub));
          return { ...t, subtopics: newSubs, completed: topicDone };
        });
        // ch.completed = chapter overview flag (manual only)
        return { ...ch, topics: newTopics };
      });
      return checkSubjectCompletion({ ...s, chapters: newChapters });
    }));
    if (subj && ch && topic && sub) {
      const taskKey = `${subjId}|${chId}|${tId}|${subId}`;
      if (!wasComplete) {
        addRevisionFromSubject(taskKey, sub.title, subj.title, subj.color, [ch.title, topic.title], 'subtopic',
          sub.adjustedMinutes ?? sub.estimatedMinutes ?? 0);
      } else {
        removeRevisionFromSubject(taskKey);
      }
    }
  };

  const updateSubtopicMeta = (subjId: string, chId: string, tId: string, subId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => {
    setSubjects(updateSubtopicFn(subjId, chId, tId, subId, sub => ({
      ...sub, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));
    const subtopicKey = `${subjId}|${chId}|${tId}|${subId}`;
    patchRevisions(r => {
      const key = String(r.taskKey ?? '');
      if (key === subtopicKey) return { ...r, mainTitle: title };
      if (key.startsWith(subtopicKey + '|')) {
        const bc = Array.isArray(r.breadcrumb) ? [...r.breadcrumb] : [];
        bc[2] = title;
        return { ...r, breadcrumb: bc };
      }
      return r;
    });
  };

  // ─── Concept methods ───────────────────────────────────────────────────
  const addConcept = (subjId: string, chId: string, tId: string, subId: string, data: Omit<Concept, 'id' | 'completed' | 'points'>) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return {
        ...s, completed: false,
        chapters: s.chapters.map(ch => {
          if (ch.id !== chId) return ch;
          return {
            ...ch, completed: false,
            topics: ch.topics.map(t => {
              if (t.id !== tId) return t;
              return {
                ...t, completed: false,
                subtopics: t.subtopics.map(sub => {
                  if (sub.id !== subId) return sub;
                  const newConcept: Concept = { ...data, id: uid(), completed: false, points: [] };
                  return { ...sub, completed: false, concepts: [...sub.concepts, newConcept] };
                })
              };
            })
          };
        })
      };
    }));
  };

  const deleteConcept = (subjId: string, chId: string, tId: string, subId: string, cId: string) => {
    setSubjects(updateSubtopicFn(subjId, chId, tId, subId, sub => {
      const newConcepts = sub.concepts.filter(c => c.id !== cId);
      return { ...sub, concepts: newConcepts, completed: newConcepts.length > 0 && newConcepts.every(c => c.completed) };
    }));
    purgeRevisions(`${subjId}|${chId}|${tId}|${subId}|${cId}`);
  };

  const toggleConceptComplete = (subjId: string, chId: string, tId: string, subId: string, cId: string) => {
    const subj = subjects.find(s => s.id === subjId);
    const ch = subj?.chapters.find(c => c.id === chId);
    const topic = ch?.topics.find(t => t.id === tId);
    const sub = topic?.subtopics.find(s => s.id === subId);
    const concept = sub?.concepts.find(c => c.id === cId);
    const wasComplete = concept?.completed ?? false;
    setSubjects(updateSubtopicFn(subjId, chId, tId, subId, sub => {
      const newConcepts = sub.concepts.map(c => {
        if (c.id !== cId) return c;
        // Manual completion: only toggle this concept, do NOT cascade to points
        return { ...c, completed: !c.completed };
      });
      // Auto-complete subtopic only when overview done AND ALL concepts content done
      const subDone = sub.completed && newConcepts.length > 0 && newConcepts.every(c => isConceptContentDone(c));
      return { ...sub, concepts: newConcepts, completed: subDone };
    }));
    if (subj && ch && topic && sub && concept) {
      const taskKey = `${subjId}|${chId}|${tId}|${subId}|${cId}`;
      if (!wasComplete) {
        addRevisionFromSubject(taskKey, concept.title, subj.title, subj.color, [ch.title, topic.title, sub.title], 'concept',
          concept.adjustedMinutes ?? concept.estimatedMinutes ?? 0);
      } else {
        removeRevisionFromSubject(taskKey);
      }
    }
  };

  const updateConceptMeta = (subjId: string, chId: string, tId: string, subId: string, cId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) => {
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => ({
      ...c, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));
    const conceptKey = `${subjId}|${chId}|${tId}|${subId}|${cId}`;
    patchRevisions(r => {
      const key = String(r.taskKey ?? '');
      if (key === conceptKey) return { ...r, mainTitle: title };
      if (key.startsWith(conceptKey + '|')) {
        const bc = Array.isArray(r.breadcrumb) ? [...r.breadcrumb] : [];
        bc[3] = title;
        return { ...r, breadcrumb: bc };
      }
      return r;
    });
  };

  // ─── Point methods ─────────────────────────────────────────────────────
  const addPoint = (subjId: string, chId: string, tId: string, subId: string, cId: string, data: Omit<Point, 'id' | 'completed'>) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      return {
        ...s, completed: false,
        chapters: s.chapters.map(ch => {
          if (ch.id !== chId) return ch;
          return {
            ...ch, completed: false,
            topics: ch.topics.map(t => {
              if (t.id !== tId) return t;
              return {
                ...t, completed: false,
                subtopics: t.subtopics.map(sub => {
                  if (sub.id !== subId) return sub;
                  return {
                    ...sub, completed: false,
                    concepts: sub.concepts.map(c => {
                      if (c.id !== cId) return c;
                      const newPoint: Point = { ...data, id: uid(), completed: false };
                      return { ...c, completed: false, points: [...c.points, newPoint] };
                    })
                  };
                })
              };
            })
          };
        })
      };
    }));
  };

  const deletePoint = (subjId: string, chId: string, tId: string, subId: string, cId: string, pId: string) => {
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => {
      const newPoints = c.points.filter(p => p.id !== pId);
      return { ...c, points: newPoints, completed: newPoints.length > 0 && newPoints.every(p => p.completed) };
    }));
    purgeRevisions(`${subjId}|${chId}|${tId}|${subId}|${cId}|${pId}`);
  };

  const togglePointComplete = (subjId: string, chId: string, tId: string, subId: string, cId: string, pId: string) => {
    const subj = subjects.find(s => s.id === subjId);
    const ch = subj?.chapters.find(c => c.id === chId);
    const topic = ch?.topics.find(t => t.id === tId);
    const sub = topic?.subtopics.find(s => s.id === subId);
    const concept = sub?.concepts.find(c => c.id === cId);
    const point = concept?.points.find(p => p.id === pId);
    const wasComplete = point?.completed ?? false;
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => {
      const newPoints = c.points.map(p => p.id === pId ? { ...p, completed: !p.completed } : p);
      // Auto-complete concept only when overview done AND all points done
      const conceptDone = c.completed && newPoints.length > 0 && newPoints.every(p => p.completed);
      return { ...c, points: newPoints, completed: conceptDone };
    }));
    if (subj && ch && topic && sub && concept && point) {
      const taskKey = `${subjId}|${chId}|${tId}|${subId}|${cId}|${pId}`;
      if (!wasComplete) {
        addRevisionFromSubject(taskKey, point.title, subj.title, subj.color,
          [ch.title, topic.title, sub.title, concept.title], 'point',
          point.adjustedMinutes ?? point.estimatedMinutes ?? 0);
      } else {
        removeRevisionFromSubject(taskKey);
      }
    }
  };

  const updatePointMeta = (subjId: string, chId: string, tId: string, subId: string, cId: string, pId: string, title: string, difficulty?: DifficultyLevel) => {
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => ({
      ...c, points: c.points.map(p => p.id === pId ? { ...p, title, ...(difficulty !== undefined ? { difficulty } : {}) } : p)
    })));
    const pointKey = `${subjId}|${chId}|${tId}|${subId}|${cId}|${pId}`;
    patchRevisions(r => {
      if (String(r.taskKey ?? '') === pointKey) return { ...r, mainTitle: title };
      return r;
    });
  };

  // ─── Note / Important / Weak ───────────────────────────────────────────
  // Generic patcher: mutates only the targeted node based on path.level
  const applyMarkPatch = (path: MarkPath, patch: Partial<{ note: string; important: boolean; weak: boolean }>) => {
    const sId = path.subjectId;
    const cleanedPatch: any = {};
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
      const v = patch[k];
      // Drop empty notes, drop false flags so the doc stays small
      if (k === 'note') {
        if (v && (v as string).trim().length > 0) cleanedPatch.note = (v as string).trim();
        else cleanedPatch.note = undefined;
      } else {
        if (v) cleanedPatch[k] = true;
        else cleanedPatch[k] = undefined;
      }
    }
    const merge = <T extends object>(o: T): T => {
      const out: any = { ...o };
      for (const k of Object.keys(cleanedPatch)) {
        if (cleanedPatch[k] === undefined) delete out[k];
        else out[k] = cleanedPatch[k];
      }
      return out as T;
    };

    if (path.level === 'subject') {
      setSubjects(updateSubjectFn(sId, s => merge(s)));
      return;
    }
    if (path.level === 'chapter' && path.chapterId) {
      setSubjects(updateChapterFn(sId, path.chapterId, ch => merge(ch)));
      return;
    }
    if (path.level === 'topic' && path.chapterId && path.topicId) {
      setSubjects(updateTopicFn(sId, path.chapterId, path.topicId, t => merge(t)));
      return;
    }
    if (path.level === 'subtopic' && path.chapterId && path.topicId && path.subtopicId) {
      setSubjects(updateSubtopicFn(sId, path.chapterId, path.topicId, path.subtopicId, sub => merge(sub)));
      return;
    }
    if (path.level === 'concept' && path.chapterId && path.topicId && path.subtopicId && path.conceptId) {
      setSubjects(updateConceptFn(sId, path.chapterId, path.topicId, path.subtopicId, path.conceptId, c => merge(c)));
      return;
    }
    if (path.level === 'point' && path.chapterId && path.topicId && path.subtopicId && path.conceptId && path.pointId) {
      setSubjects(updateConceptFn(sId, path.chapterId, path.topicId, path.subtopicId, path.conceptId, c => ({
        ...c,
        points: c.points.map(p => p.id === path.pointId ? merge(p) : p),
      })));
      return;
    }
  };

  const getMarkable = (path: MarkPath): { note?: string; important?: boolean; weak?: boolean } | null => {
    const subj = subjects.find(s => s.id === path.subjectId);
    if (!subj) return null;
    if (path.level === 'subject') return subj;
    const ch = subj.chapters.find(c => c.id === path.chapterId);
    if (!ch) return null;
    if (path.level === 'chapter') return ch;
    const tp = ch.topics.find(t => t.id === path.topicId);
    if (!tp) return null;
    if (path.level === 'topic') return tp;
    const sub = tp.subtopics.find(s => s.id === path.subtopicId);
    if (!sub) return null;
    if (path.level === 'subtopic') return sub;
    const con = sub.concepts.find(c => c.id === path.conceptId);
    if (!con) return null;
    if (path.level === 'concept') return con;
    const pt = con.points.find(p => p.id === path.pointId);
    return pt ?? null;
  };

  const setNote = (path: MarkPath, note: string) => {
    applyMarkPatch(path, { note });
  };
  const toggleImportant = (path: MarkPath) => {
    const cur = getMarkable(path);
    applyMarkPatch(path, { important: !cur?.important });
  };
  const toggleWeak = (path: MarkPath) => {
    const cur = getMarkable(path);
    applyMarkPatch(path, { weak: !cur?.weak });
  };

  // ─── Temp Notes (hierarchical to-do, not synced to Today plan) ───────
  const mapTempTree = (
    items: TempNoteItem[],
    fn: (n: TempNoteItem) => TempNoteItem | null,
  ): TempNoteItem[] => {
    const out: TempNoteItem[] = [];
    for (const it of items) {
      const mapped = fn({ ...it, children: mapTempTree(it.children || [], fn) });
      if (mapped) out.push(mapped);
    }
    return out;
  };

  const addTempNote = (text: string, parentId?: string | null, noteHtml?: string): string => {
    const id = uid();
    const newNote: TempNoteItem = {
      id,
      text: text.trim(),
      ...(noteHtml ? { note: noteHtml } : {}),
      done: false,
      createdAt: Date.now(),
      children: [],
    };
    if (!newNote.text) return '';
    if (!parentId) {
      setTempNotes(prev => [newNote, ...prev]);
      return id;
    }
    setTempNotes(prev => mapTempTree(prev, n =>
      n.id === parentId ? { ...n, children: [newNote, ...(n.children || [])] } : n
    ));
    return id;
  };

  const updateTempNoteContent = (id: string, noteHtml: string) => {
    setTempNotes(prev => mapTempTree(prev, n =>
      n.id === id ? { ...n, note: noteHtml } : n
    ));
  };

  const updateTempNote = (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTempNotes(prev => mapTempTree(prev, n =>
      n.id === id ? { ...n, text: trimmed } : n
    ));
  };

  const toggleTempNoteDone = (id: string) => {
    setTempNotes(prev => mapTempTree(prev, n =>
      n.id === id ? { ...n, done: !n.done } : n
    ));
  };

  const deleteTempNote = (id: string) => {
    setTempNotes(prev => mapTempTree(prev, n => n.id === id ? null : n));
  };

  // ─── Overall Note (Progress page) ───────────────────────────────────────
  const setOverallNote = (note: string) => {
    setOverallNoteState(note);
  };

  // ─── A4 Note Pages (each page stored as a separate Firestore doc) ────
  // Serial write queue — ensures notePages Firestore writes happen one at a time,
  // preventing a large note's pending write from blocking a subsequent note's write.
  // Serial write queue — all notePages Firestore writes run one at a time.
  const noteWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Latest pending data per page. When a save is already queued for a page,
  // subsequent saves just update this map instead of adding another queue entry.
  // The queued job reads from here at execution time, so it always writes the
  // most recent version and the queue never accumulates duplicate writes.
  const noteWritePendingRef = useRef<Map<string, NotePage>>(new Map());
  // Pages deleted while a save was queued — those saves are skipped.
  const deletedNotePageIds = useRef<Set<string>>(new Set());

  const notePageDocRef = (id: string) =>
    user ? doc(db, 'users', user.id, 'notePages', id) : null;

  const localPageKey = (id: string) =>
    user ? `@study_notepage_${user.email}_${id}` : null;

  const createNotePage = (title?: string): string => {
    const id = uid();
    const now = Date.now();
    const meta: NotePageMeta = {
      id,
      title: title?.trim() || 'Untitled page',
      pageCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    setNotePagesIndex(prev => [meta, ...prev]);
    // Save empty page doc
    const emptyPage: NotePage = { ...meta, elements: [] };
    const lk = localPageKey(id);
    if (lk) localStorage.setItem(lk, JSON.stringify(emptyPage));
    const ref = notePageDocRef(id);
    if (ref) setDoc(ref, emptyPage).catch(() => {});
    return id;
  };

  const renameNotePage = (id: string, title: string) => {
    const trimmed = title.trim() || 'Untitled page';
    setNotePagesIndex(prev => prev.map(p =>
      p.id === id ? { ...p, title: trimmed, updatedAt: Date.now() } : p
    ));
    // Update doc title
    const lk = localPageKey(id);
    if (lk) {
      try {
        const cur = JSON.parse(localStorage.getItem(lk) || 'null') as NotePage | null;
        if (cur) localStorage.setItem(lk, JSON.stringify({ ...cur, title: trimmed, updatedAt: Date.now() }));
      } catch {}
    }
    const ref = notePageDocRef(id);
    if (ref) setDoc(ref, { title: trimmed, updatedAt: Date.now() }, { merge: true }).catch(() => {});
  };

  const deleteNotePage = async (id: string): Promise<void> => {
    // Mark deleted immediately so any queued save for this page is skipped.
    deletedNotePageIds.current.add(id);
    setNotePagesIndex(prev => prev.filter(p => p.id !== id));
    const lk = localPageKey(id);
    if (lk) localStorage.removeItem(lk);
    // Route the Firestore delete through the same queue so it is strictly ordered
    // after any in-progress write for this page, preventing a resurrection race.
    noteWriteQueueRef.current = noteWriteQueueRef.current.then(async () => {
      const ref = notePageDocRef(id);
      if (ref) {
        try { await deleteDoc(ref); } catch { /* ignore offline */ }
      }
      // Clean up the tombstone once the delete has been processed.
      deletedNotePageIds.current.delete(id);
    });
  };

  const loadNotePage = async (id: string): Promise<NotePage | null> => {
    const lk = localPageKey(id);
    let local: NotePage | null = null;
    if (lk) {
      try { local = JSON.parse(localStorage.getItem(lk) || 'null'); } catch { local = null; }
    }
    const ref = notePageDocRef(id);
    if (!ref) return local;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() as NotePage;
        let elements = d.elements || [];
        // If elements were split across a "chunks" subcollection, reassemble them.
        if (d.chunked) {
          elements = await readElementChunks(collection(ref, 'chunks'));
        }
        const remote: NotePage = {
          id: d.id ?? id,
          title: d.title ?? 'Untitled page',
          elements,
          pageCount: d.pageCount ?? 1,
          html: d.html,
          chunked: d.chunked,
          chunkCount: d.chunkCount,
          createdAt: d.createdAt ?? Date.now(),
          updatedAt: d.updatedAt ?? Date.now(),
        };
        // Pick newest
        if (!local || (remote.updatedAt ?? 0) >= (local.updatedAt ?? 0)) {
          if (lk) localStorage.setItem(lk, JSON.stringify(remote));
          return remote;
        }
        return local;
      }
    } catch { /* offline */ }
    return local;
  };

  const saveNotePage = async (page: NotePage): Promise<void> => {
    const updated: NotePage = { ...page, updatedAt: Date.now() };
    const pageId = page.id;

    // 1. Save to localStorage immediately so the caller can show "Saved" right away.
    const lk = localPageKey(pageId);
    if (lk) localStorage.setItem(lk, JSON.stringify(updated));

    // 2. Update in-memory index (also triggers the main studyData debounce save).
    setNotePagesIndex(prev => prev.map(p =>
      p.id === pageId
        ? { ...p, title: updated.title, pageCount: updated.pageCount, updatedAt: updated.updatedAt }
        : p
    ));

    const ref = notePageDocRef(pageId);
    if (!ref) return;

    // 3. Deduplicated queue: if a write for this page is already pending, just
    //    update the pending data map — the already-queued job will pick up the
    //    latest version at execution time.  This collapses rapid autosave calls
    //    (every 600 ms while typing) into a single Firestore write per "burst",
    //    preventing the queue from growing unbounded on large notes.
    const alreadyPending = noteWritePendingRef.current.has(pageId);
    noteWritePendingRef.current.set(pageId, updated);

    if (!alreadyPending) {
      noteWriteQueueRef.current = noteWriteQueueRef.current.then(async () => {
        // Read the LATEST data at execution time (not the stale closure value).
        const latestData = noteWritePendingRef.current.get(pageId);
        noteWritePendingRef.current.delete(pageId);

        if (!latestData) return;
        if (deletedNotePageIds.current.has(pageId)) return;

        setSyncStatus('syncing');
        setSyncError(null);
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            // Sanitize before any size check — removes NaN/undefined that Firestore rejects.
            const cleaned = sanitizeForFirestore(latestData);

            // Check serialised size before writing to Firestore.
            // If the document would exceed ~800 KB, split the elements array
            // across a "chunks" subcollection instead (no Storage dependency).
            const serialised = JSON.stringify(cleaned);
            const serialisedSize = byteSize(serialised);
            const pageChunksRef = collection(ref, 'chunks');
            let firestorePayload: NotePage;
            if (serialisedSize > FIRESTORE_NOTE_LIMIT && user) {
              console.info('[saveNotePage] Note too large for Firestore (%d KB), splitting into chunks', Math.round(serialisedSize / 1024));
              const chunks = packElements(cleaned.elements || [], FIRESTORE_NOTE_LIMIT);
              await writeElementChunks(pageChunksRef, chunks);
              firestorePayload = sanitizeForFirestore({
                ...cleaned,
                chunked: true,
                chunkCount: chunks.length,
                elements: [],   // cleared from Firestore doc — stored in chunks subcollection
              });
            } else {
              await clearChunks(pageChunksRef);
              firestorePayload = { ...cleaned, chunked: false };
            }
            await setDoc(ref, firestorePayload);
            setSyncStatus('success');
            setSyncError(null);
            setTimeout(() => setSyncStatus(s => s === 'success' ? 'idle' : s), 2500);
            return; // success
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code ?? 'unknown';
            const msg = (err as { message?: string })?.message ?? '';
            if (attempt < 3) {
              // Exponential backoff: 800 ms → 1 600 ms
              await new Promise(r => setTimeout(r, 800 * Math.pow(2, attempt - 1)));
            } else {
              setSyncStatus('failed');
              setSyncError(code !== 'unknown' ? code : (msg.slice(0, 60) || null));
              setTimeout(() => setSyncStatus(s => s === 'failed' ? 'idle' : s), 6000);
              console.error('[saveNotePage] Firestore write failed after 3 attempts', { pageId, code, msg, err });
            }
          }
        }
      });
    }
  };

  return (
    <StudyContext.Provider value={{
      subjects, settings, dataLoaded, syncStatus, syncError, online,
      setNote, toggleImportant, toggleWeak,
      setCourseTotalDays, setDailyStudyHours, setCourseStartDate, setTimezone,
      addSubject, updateSubjectDays, deleteSubject, updateSubjectMeta, resetSubjectProgress,
      reorderSubjects, reorderChapters, reorderTopics, reorderSubtopics, reorderConcepts, reorderPoints,
      addChapter, deleteChapter, toggleChapterComplete, updateChapterMeta,
      addTopic, deleteTopic, toggleTopicComplete, updateTopicMeta,
      addSubtopic, deleteSubtopic, toggleSubtopicComplete, updateSubtopicMeta,
      addConcept, deleteConcept, toggleConceptComplete, updateConceptMeta,
      addPoint, deletePoint, togglePointComplete, updatePointMeta,
      tempNotes, addTempNote, updateTempNote, updateTempNoteContent, toggleTempNoteDone, deleteTempNote,
      overallNote, setOverallNote,
      notePagesIndex, createNotePage, renameNotePage, deleteNotePage, loadNotePage, saveNotePage, reorderNotePages,
    }}>
      {children}
    </StudyContext.Provider>
  );
}

export function useStudy() {
  const context = useContext(StudyContext);
  if (!context) throw new Error('useStudy must be used within StudyProvider');
  return context;
}
