import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  collection, doc, getDoc, getDocs, setDoc,
  query, where, onSnapshot, addDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { collectAllIds, filterSubjectsByIds, filterNotesMapByIds } from '@/lib/courseShare';

// Super admins from env var (cannot be removed)
const SUPER_ADMIN_EMAILS: string[] = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export interface NoteShareItem {
  title: string;
  html: string;
  breadcrumb: string[];
}

export interface SharePermissions {
  editNotes: boolean;
  deleteNotes: boolean;
  downloadNotes: boolean;
  copyNotes: boolean;
  // Structural permissions (course-level)
  renameCourse: boolean;  // can the user rename this shared course?
  addItems: boolean;      // can the user add subjects/chapters/topics/etc.?
  // Device-level content protection while viewing this shared course.
  takeScreenshot: boolean;  // can the user take screenshots / screen-record?
  selectCopyText: boolean;  // can the user select & copy text on the page?
}

// Snapshot of a course's data embedded in the shareRequest at send-time so the
// recipient can copy it to their own account when they accept.
interface CourseSnapshot {
  studyData: Record<string, unknown>;
  notesJson: string; // JSON.stringify({ notes: Record<string,string>, overallNote: string })
  testDecksJson?: string; // JSON.stringify(Record<subjectId, TestCard[]>)
}

export interface ShareRequest {
  id: string;
  fromAdminUid: string;
  fromAdminEmail: string;
  fromAdminName: string;
  toEmail: string;
  type: 'course' | 'note' | 'message';
  // Course share
  courseId?: string;
  courseName?: string;
  // Embedded course data (set by sendShare, read by acceptShare)
  courseSnapshot?: CourseSnapshot;
  // Subject-level selection for course shares. When the course has subjects,
  // only the ids listed here are included in courseSnapshot. Absent/undefined
  // means "whole course" (courses with no subjects, or shares created before
  // this field existed).
  sharedSubjectIds?: string[];
  // Note share (single note — legacy field set, still written for the
  // first note so old display code / old records keep working)
  noteTitle?: string;
  noteHtml?: string;
  noteBreadcrumb?: string[];
  // Note share — one or more notes selected together and sent as one card.
  // When present (length >= 1) this is the source of truth for note shares;
  // the singular noteTitle/noteHtml/noteBreadcrumb above are kept in sync
  // with notes[0] for backward compatibility with older display code.
  notes?: NoteShareItem[];
  // Plain admin -> user message
  messageText?: string;
  // Common
  permissions: SharePermissions;
  durationValue: number;
  durationUnit: 'hours' | 'days' | 'months';
  status: 'pending' | 'accepted' | 'declined' | 'trashed';
  sentAt: number;
  pendingExpiresAt: number; // auto-expire the pending notification
  acceptedAt?: number;
  actualExpiresAt?: number; // when access expires after acceptance
  acceptedByUid?: string; // recipient's uid, set once they accept
  seenAt?: number; // when the recipient opened/interacted with this notification
  syncedAt?: number;
  // Manual-delete trash (admin only). Only set when the admin explicitly
  // deletes a card — never set by automatic expiry, which just removes the
  // document outright.
  trashedAt?: number;
  trashedFromStatus?: 'pending' | 'accepted' | 'declined';
}

interface AdminContextType {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  adminEmails: string[];
  loadingAdmins: boolean;
  addAdmin: (email: string) => Promise<void>;
  removeAdmin: (email: string) => Promise<void>;
  sendShare: (params: SendShareParams) => Promise<void>;
  sentShares: ShareRequest[];
  trashedShares: ShareRequest[];
  loadingSentShares: boolean;
  updateSharePermissions: (shareId: string, permissions: SharePermissions) => Promise<void>;
  cancelShare: (shareId: string) => Promise<void>;
  pendingShares: ShareRequest[];
  acceptShare: (shareId: string) => Promise<void>;
  declineShare: (shareId: string) => Promise<void>;
  acceptedShares: ShareRequest[];
  markSeen: (shareId: string) => Promise<void>;
  extendShare: (shareId: string, addValue: number, addUnit: 'hours' | 'days' | 'months') => Promise<void>;
  getCourseSubjectsForShare: (courseId: string) => Promise<{ id: string; title: string }[]>;
  addSubjectsToShare: (shareId: string, additionalSubjectIds: string[]) => Promise<void>;
  trashShare: (shareId: string) => Promise<void>;
  restoreShare: (shareId: string) => Promise<void>;
  permanentlyDeleteShare: (shareId: string) => Promise<void>;
  appContact: AppContact;
  saveContactSettings: (c: Partial<AppContact>) => Promise<void>;
}

export type SendShareParams = Pick<ShareRequest,
  'toEmail' | 'type' | 'courseId' | 'courseName' | 'noteTitle' | 'noteHtml' | 'noteBreadcrumb' |
  'notes' | 'messageText' | 'permissions' | 'durationValue' | 'durationUnit' | 'sharedSubjectIds'
>;

export interface AppContact {
  whatsapp: string;
  website: string;
  supportLink: string;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

function durationToMs(value: number, unit: 'hours' | 'days' | 'months'): number {
  if (unit === 'hours') return value * 60 * 60 * 1000;
  if (unit === 'days') return value * 24 * 60 * 60 * 1000;
  return value * 30 * 24 * 60 * 60 * 1000;
}

// ─── Chunk helpers (mirrors the pattern in StudyContext) ──────────────────────
/** Read all chunk docs from a chunks subcollection and flatten into [k,v] entries. */
async function readChunkEntries(
  chunksColRef: ReturnType<typeof collection>
): Promise<Array<[string, string]>> {
  const snap = await getDocs(chunksColRef);
  const sorted = snap.docs.slice().sort((a, b) => Number(a.id) - Number(b.id));
  const entries: Array<[string, string]> = [];
  for (const d of sorted) {
    const raw = d.data().data;
    if (Array.isArray(raw)) {
      for (const pair of raw as Array<{ k: string; v: string }>) entries.push([pair.k, pair.v]);
    } else if (raw && typeof raw === 'object') {
      entries.push(...Object.entries(raw as Record<string, string>));
    }
  }
  return entries;
}

/** Reassemble split/chunked entries back into a single flat map. */
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

// ── Progress-stripping helper ─────────────────────────────────────────────────
// Recursively sets completed:false on every node in the subjects tree so the
// share recipient always starts with zero progress regardless of what the admin
// had already studied before sending the share.
function stripProgress(nodes: unknown[]): unknown[] {
  const childKeys = ['chapters', 'topics', 'subtopics', 'concepts', 'points'];
  return (nodes as Record<string, unknown>[]).map(n => {
    const result: Record<string, unknown> = { ...n, completed: false };
    for (const key of childKeys) {
      if (Array.isArray(n[key])) result[key] = stripProgress(n[key] as unknown[]);
    }
    return result;
  });
}
// ── Completion-map helpers (mirrors StudyContext) ─────────────────────────────
// Used by the live-sync receiver to preserve the user's own progress when the
// admin pushes a structural update.

function buildCompletionMap(nodes: unknown[], map: Map<string, boolean> = new Map()): Map<string, boolean> {
  const childKeys = ['chapters', 'topics', 'subtopics', 'concepts', 'points'];
  for (const n of nodes as Record<string, unknown>[]) {
    if (n.id) map.set(n.id as string, !!(n.completed));
    for (const key of childKeys) {
      if (Array.isArray(n[key])) buildCompletionMap(n[key] as unknown[], map);
    }
  }
  return map;
}

function applyCompletionMap(nodes: unknown[], map: Map<string, boolean>): unknown[] {
  const childKeys = ['chapters', 'topics', 'subtopics', 'concepts', 'points'];
  return (nodes as Record<string, unknown>[]).map(n => {
    const result: Record<string, unknown> = {
      ...n,
      completed: n.id ? (map.get(n.id as string) ?? false) : false,
    };
    for (const key of childKeys) {
      if (Array.isArray(n[key])) result[key] = applyCompletionMap(n[key] as unknown[], map);
    }
    return result;
  });
}
// ──────────────────────────────────────────────────────────────────────────────

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userEmail = user?.email?.toLowerCase() || '';
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(userEmail);

  const [firestoreAdminEmails, setFirestoreAdminEmails] = useState<string[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [allSentShares, setAllSentShares] = useState<ShareRequest[]>([]);
  const [loadingSentShares, setLoadingSentShares] = useState(false);
  const [allReceivedShares, setAllReceivedShares] = useState<ShareRequest[]>([]);
  const [appContact, setAppContact] = useState<AppContact>({ whatsapp: '', website: '', supportLink: '' });

  // Track which syncedAt timestamps we've already applied so we don't re-run
  // the same sync on every snapshot update.
  const processedSyncRef = useRef<Map<string, number>>(new Map());

  // Track last-applied permissions per shareId so we detect changes and relay
  // them into the user's own sharedCourses doc (security rules block the admin
  // from writing there directly, so the relay runs client-side like the content sync).
  const processedPermissionsRef = useRef<Map<string, string>>(new Map());

  // Tracks accepted course shares by shareId so we can detect when admin
  // permanently deletes one and cascade-clean the user's own course collections.
  // Key = shareId, Value = share type ('course' | 'note' | 'message').
  const acceptedSharesTrackingRef = useRef<Map<string, string>>(new Map());

  const adminEmails = [...new Set([...SUPER_ADMIN_EMAILS, ...firestoreAdminEmails])];
  const isAdmin = adminEmails.includes(userEmail);

  // Ticks once a minute purely to re-evaluate the expiry filters below (the
  // live per-row countdown UIs manage their own 1s tick independently — this
  // is just enough to make expired cards drop out of these lists reasonably
  // promptly without re-rendering everything every second).
  const [expiryTick, setExpiryTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setExpiryTick(v => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const pendingShares = allReceivedShares
    .filter(s => s.status === 'pending' && s.pendingExpiresAt > now)
    .sort((a, b) => b.sentAt - a.sentAt); // newest first
  const acceptedShares = allReceivedShares.filter(
    s => s.status === 'accepted' && (!s.actualExpiresAt || s.actualExpiresAt > now)
  );
  const sentShares = allSentShares.filter(s => s.status !== 'trashed');
  const trashedShares = allSentShares.filter(s => s.status === 'trashed');
  void expiryTick; // referenced only to satisfy the linter about the dependency

  // ── Auto-expiry purge ────────────────────────────────────────────────────
  // Automatic expiry is a hard delete (never goes to trash — that's reserved
  // for admin-initiated manual deletes). Runs from both sides (admin's sent
  // list and the recipient's received list) so a share is cleaned up whether
  // or not the admin is currently online; deletes are best-effort/idempotent.
  useEffect(() => {
    const nowMs = Date.now();
    for (const s of allSentShares) {
      if (s.status === 'trashed') continue;
      const expired = (s.status === 'pending' && s.pendingExpiresAt <= nowMs)
        || (s.status === 'accepted' && s.actualExpiresAt !== undefined && s.actualExpiresAt <= nowMs);
      if (expired) deleteDoc(doc(db, 'shareRequests', s.id)).catch(() => {});
    }
  }, [allSentShares, expiryTick]);

  useEffect(() => {
    const nowMs = Date.now();
    for (const s of allReceivedShares) {
      if (s.status === 'trashed') continue;
      const expired = (s.status === 'pending' && s.pendingExpiresAt <= nowMs)
        || (s.status === 'accepted' && s.actualExpiresAt !== undefined && s.actualExpiresAt <= nowMs);
      if (expired) deleteDoc(doc(db, 'shareRequests', s.id)).catch(() => {});
    }
  }, [allReceivedShares, expiryTick]);

  // Load contact settings from Firestore (live, updates all users in real-time)
  useEffect(() => {
    const ref = doc(db, 'adminConfig', 'contactInfo');
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const d = snap.data();
        setAppContact({ whatsapp: d.whatsapp || '', website: d.website || '', supportLink: d.supportLink || '' });
      }
    }, () => {});
    return () => unsub();
  }, []);

  // Load admin list from Firestore
  useEffect(() => {
    const ref = doc(db, 'adminConfig', 'adminList');
    const unsub = onSnapshot(ref, snap => {
      setFirestoreAdminEmails(
        snap.exists() ? (snap.data().emails || []).map((e: string) => e.toLowerCase()) : []
      );
      setLoadingAdmins(false);
    }, () => setLoadingAdmins(false));
    return () => unsub();
  }, []);

  // Load sent shares (admin)
  useEffect(() => {
    if (!user || !isAdmin) { setAllSentShares([]); return; }
    setLoadingSentShares(true);
    const q = query(collection(db, 'shareRequests'), where('fromAdminUid', '==', user.id));
    const unsub = onSnapshot(q, snap => {
      const shares = snap.docs.map(d => ({ id: d.id, ...d.data() } as ShareRequest));
      setAllSentShares(shares.sort((a, b) => b.sentAt - a.sentAt));
      setLoadingSentShares(false);
    }, () => setLoadingSentShares(false));
    return () => unsub();
  }, [user?.id, isAdmin]); // eslint-disable-line

  // Load received shares (user as recipient) + apply live-sync updates from admin
  useEffect(() => {
    if (!user?.email || !user?.id) { setAllReceivedShares([]); return; }
    const uid = user.id;
    const q = query(collection(db, 'shareRequests'), where('toEmail', '==', user.email.toLowerCase()));
    const unsub = onSnapshot(q, snap => {
      // 1. Update UI state
      setAllReceivedShares(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShareRequest)));

      // 1b. Cascade cleanup: when admin permanently deletes a shareRequest that the
      //     user had already accepted, the doc disappears from this snapshot. We
      //     detect the disappearance here (user has write permission to their own
      //     sub-collections) and delete the cloned course data. A page reload is
      //     triggered so the course immediately disappears from My Courses — the
      //     same UX as accepting a share (which also reloads). This also covers
      //     auto-expiry, since expiry deletes the shareRequest doc the same way.
      const tracking = acceptedSharesTrackingRef.current;
      const currentIds = new Set(snap.docs.map(d => d.id));
      let courseWasRemoved = false;
      for (const [trackedShareId, trackedType] of tracking) {
        if (!currentIds.has(trackedShareId)) {
          // Share was deleted by admin (or expired) — remove user's copy of the course data.
          if (trackedType === 'course') {
            deleteDoc(doc(db, 'users', uid, 'courses', trackedShareId)).catch(() => {});
            deleteDoc(doc(db, 'users', uid, 'studyData', trackedShareId)).catch(() => {});
            deleteDoc(doc(db, 'users', uid, 'courseNotes', trackedShareId)).catch(() => {});
            deleteDoc(doc(db, 'users', uid, 'sharedCourses', trackedShareId)).catch(() => {});
            courseWasRemoved = true;
          }
          tracking.delete(trackedShareId);
        }
      }
      // Reload the page once (after a short delay so Firestore writes can settle)
      // so the removed course disappears from My Courses immediately — mirrors
      // the reload that happens when a share is accepted.
      if (courseWasRemoved) {
        setTimeout(() => window.location.reload(), 800);
      }
      // Update tracking map: record any share the user has ever accepted so that
      // future snapshots can detect permanent deletion and trigger cleanup.
      // We track by acceptedByUid (not status) so that trashed shares — which were
      // accepted before being moved to trash — stay in the map and trigger cleanup
      // when the admin permanently deletes them from the Trash list.
      for (const shareDoc of snap.docs) {
        const data = shareDoc.data() as ShareRequest;
        if (data.acceptedByUid) {
          tracking.set(shareDoc.id, data.type);
        }
        // Never remove from tracking here — removal only happens above when the
        // doc is confirmed gone (which triggers the actual cleanup).
      }

      // 2. Process any pending live-sync updates from the admin.
      //    Content updates: courseSnapshot.studyData + syncedAt written by admin into
      //    the shareRequest (admin can write there; user cannot write to admin's
      //    studyData directly due to security rules).
      //    Permission updates: permissions field in the same shareRequest doc; admin
      //    cannot write to user's sharedCourses directly, so the relay runs here.
      const processedMap = processedSyncRef.current;
      const permissionsMap = processedPermissionsRef.current;

      for (const shareDoc of snap.docs) {
        const data = shareDoc.data() as Record<string, unknown>;
        if (data.status !== 'accepted') continue;

        // ── Permission relay ──────────────────────────────────────────────────
        // Admin writes permissions to shareRequests (allowed). We mirror them to
        // the user's own sharedCourses doc so CourseContext's onSnapshot picks up
        // the change immediately.
        const newPermissions = data.permissions as Record<string, unknown> | undefined;
        if (newPermissions) {
          const newPermJson = JSON.stringify(newPermissions);
          const lastPermJson = permissionsMap.get(shareDoc.id) ?? null;
          if (lastPermJson !== newPermJson) {
            permissionsMap.set(shareDoc.id, newPermJson);
            // Intentionally fire-and-forget; failure is safe (will retry next snapshot)
            setDoc(
              doc(db, 'users', uid, 'sharedCourses', shareDoc.id),
              { permissions: newPermissions },
              { merge: true },
            ).catch(() => {});
          }
        }

        // ── Content relay ─────────────────────────────────────────────────────
        const syncedAt = data.syncedAt as number | undefined;
        if (!syncedAt) continue;
        const lastProcessed = processedMap.get(shareDoc.id) ?? 0;
        if (syncedAt <= lastProcessed) continue;

        // Mark as processed immediately to prevent double-processing
        processedMap.set(shareDoc.id, syncedAt);

        // Admin overwrites courseSnapshot in-place (dot-notation update),
        // so read the latest data from there.
        const courseSnapshot = data.courseSnapshot as { studyData?: Record<string, unknown>; notesJson?: string; testDecksJson?: string } | undefined;
        const syncStudyData = courseSnapshot?.studyData;
        const syncNotesJson = courseSnapshot?.notesJson;
        const syncTestDecksJson = courseSnapshot?.testDecksJson;
        if (!syncStudyData) continue;

        // Run async in the background — do not block the snapshot handler
        (async () => {
          try {
            const shareId = shareDoc.id;

            // Fetch the user's current studyData to preserve their progress
            const userDataSnap = await getDoc(doc(db, 'users', uid, 'studyData', shareId));
            const userSubjects: unknown[] = userDataSnap.exists()
              ? ((userDataSnap.data().subjects as unknown[] | undefined) ?? [])
              : [];

            // Merge: keep the admin's new structure but restore user's completed flags
            const completionMap = buildCompletionMap(userSubjects);
            const mergedSubjects = applyCompletionMap(
              (syncStudyData.subjects as unknown[] | undefined) ?? [],
              completionMap,
            );

            // Write merged studyData to user's own collection (persists across refreshes)
            await setDoc(
              doc(db, 'users', uid, 'studyData', shareId),
              { ...syncStudyData, subjects: mergedSubjects, savedAt: Date.now() },
              { merge: false },
            );

            // Write notes if provided
            let liveSyncNotesMap: Record<string, string> | undefined;
            let liveSyncOverallNote: string | undefined = syncStudyData.overallNote as string | undefined;
            if (syncNotesJson) {
              try {
                const notesData = JSON.parse(syncNotesJson) as { overallNote: string; notes: Record<string, string> };
                await setDoc(
                  doc(db, 'users', uid, 'courseNotes', shareId),
                  { savedAt: Date.now(), overallNote: notesData.overallNote || '', notes: notesData.notes || {}, chunked: false },
                  { merge: false },
                );
                // Keep the note map so the CustomEvent below can merge it into the
                // subjects tree before applying — the studyData snapshot alone is
                // "structural only" (notes live in the separate courseNotes doc),
                // so without this the UI would briefly flash the newly synced note
                // (from the Firestore onSnapshot merge) and then wipe it out again
                // (from this event applying note-less subjects on top).
                liveSyncNotesMap = notesData.notes || {};
                liveSyncOverallNote = notesData.overallNote || liveSyncOverallNote;
              } catch { /* malformed JSON — skip notes */ }
            }

            // Write test decks if provided — overwrite each deck doc so the user
            // always sees the admin's latest cards. New decks are added, removed
            // decks are left in place (harmless orphans) to avoid losing data.
            if (syncTestDecksJson) {
              try {
                const testDecksMap = JSON.parse(syncTestDecksJson) as Record<string, unknown[]>;
                const deckWritePromises = Object.entries(testDecksMap).map(([subjectId, cards]) =>
                  setDoc(
                    doc(db, 'users', uid, 'courses', shareId, 'testDecks', subjectId),
                    { cards, updatedAt: Date.now() },
                  )
                );
                await Promise.all(deckWritePromises);
              } catch { /* best-effort — test deck sync failure is non-fatal */ }
            }

            // Also dispatch a synchronous window event so StudyContext can update
            // the UI instantly without waiting for the Firestore onSnapshot chain
            // (which has a hasPendingWrites guard that adds a round-trip delay).
            window.dispatchEvent(new CustomEvent('study-livesync', {
              detail: {
                shareId,
                subjects: mergedSubjects,
                settings: syncStudyData.settings,
                tempNotes: syncStudyData.tempNotes,
                overallNote: liveSyncOverallNote,
                notePagesIndex: syncStudyData.notePagesIndex,
                notesMap: liveSyncNotesMap,
              },
            }));

            console.log('[AdminContext] Live-sync applied for share', shareId, 'syncedAt', syncedAt);
          } catch (err) {
            console.error('[AdminContext] Failed to apply live-sync for share', shareDoc.id, err);
            // Reset so we retry on next snapshot
            processedMap.delete(shareDoc.id);
          }
        })();
      }
    }, () => {});
    return () => unsub();
  }, [user?.email, user?.id]); // eslint-disable-line

  const addAdmin = async (email: string) => {
    const e = email.trim().toLowerCase();
    const ref = doc(db, 'adminConfig', 'adminList');
    const snap = await getDoc(ref);
    const existing: string[] = snap.exists() ? (snap.data().emails || []) : [];
    if (!existing.includes(e)) {
      await setDoc(ref, { emails: [...existing, e] }, { merge: true });
    }
  };

  const saveContactSettings = async (c: Partial<AppContact>) => {
    await setDoc(doc(db, 'adminConfig', 'contactInfo'), c, { merge: true });
  };

  const removeAdmin = async (email: string) => {
    const e = email.trim().toLowerCase();
    if (SUPER_ADMIN_EMAILS.includes(e)) return;
    const ref = doc(db, 'adminConfig', 'adminList');
    const snap = await getDoc(ref);
    const existing: string[] = snap.exists() ? (snap.data().emails || []) : [];
    await setDoc(ref, { emails: existing.filter(x => x !== e) }, { merge: true });
  };

  const sendShare = async (params: SendShareParams) => {
    if (!user) return;
    const ts = Date.now();
    const pendingExpiresAt = ts + durationToMs(params.durationValue, params.durationUnit);
    const payload: Record<string, unknown> = {
      ...params,
      toEmail: params.toEmail.toLowerCase(),
      fromAdminUid: user.id,
      fromAdminEmail: user.email,
      fromAdminName: user.name,
      status: 'pending',
      sentAt: ts,
      pendingExpiresAt,
    };

    // When a note share carries a `notes` array, mirror the first entry into
    // the legacy singular fields so any older display code that still reads
    // noteTitle/noteHtml/noteBreadcrumb keeps working.
    if (params.type === 'note' && params.notes && params.notes.length > 0) {
      payload.noteTitle = params.notes[0].title;
      payload.noteHtml = params.notes[0].html;
      payload.noteBreadcrumb = params.notes[0].breadcrumb;
    }

    // For course shares: embed a snapshot of the course data so the recipient
    // can copy it to their own account when they accept. Best-effort — the share
    // still goes through even if reading the snapshot fails.
    if (params.type === 'course' && params.courseId) {
      try {
        const sdRef = doc(db, 'users', user.id, 'studyData', params.courseId);
        const sdSnap = await getDoc(sdRef);
        const rawSd = sdSnap.exists() ? sdSnap.data() : {};

        // Read courseNotes (handles both chunked and non-chunked formats)
        let notesMap: Record<string, string> = {};
        let overallNote = '';
        if (rawSd.hasNotesDoc) {
          const ndRef = doc(db, 'users', user.id, 'courseNotes', params.courseId);
          const ndSnap = await getDoc(ndRef);
          if (ndSnap.exists()) {
            const nd = ndSnap.data() as {
              overallNote?: string;
              notes?: Record<string, string>;
              chunked?: boolean;
            };
            if (nd.chunked) {
              const chunksCol = collection(
                db, 'users', user.id, 'courseNotes', params.courseId, 'chunks'
              );
              const entries = await readChunkEntries(chunksCol);
              const merged = reassembleEntries(entries);
              overallNote = merged['__overall__'] || '';
              delete merged['__overall__'];
              notesMap = merged;
            } else {
              notesMap = nd.notes || {};
              overallNote = nd.overallNote || '';
            }
          }
        }

        // Subject-level selection: if the admin picked specific subjects
        // (course has subjects and didn't choose "select all"), narrow both
        // the subjects tree and the notes map down to just those ids before
        // embedding the snapshot.
        let studyDataForSnapshot = rawSd as Record<string, unknown>;
        if (params.sharedSubjectIds && Array.isArray(rawSd.subjects)) {
          const filteredSubjects = filterSubjectsByIds(rawSd.subjects as unknown[], params.sharedSubjectIds);
          const idSet = collectAllIds(filteredSubjects);
          studyDataForSnapshot = { ...rawSd, subjects: filteredSubjects };
          notesMap = filterNotesMapByIds(notesMap, idSet);
        }

        // Strip library-compiler notes (privateNote=true) before embedding the
        // snapshot — they are admin-only and must never reach shared courses.
        if (Array.isArray(studyDataForSnapshot.notePagesIndex)) {
          studyDataForSnapshot = {
            ...studyDataForSnapshot,
            notePagesIndex: (studyDataForSnapshot.notePagesIndex as Array<{ privateNote?: boolean }>)
              .filter(p => !p.privateNote),
          };
        }

        // Read test decks for the course (subcollection: courses/{courseId}/testDecks)
        let testDecksMap: Record<string, unknown[]> = {};
        try {
          const decksColRef = collection(db, 'users', user.id, 'courses', params.courseId, 'testDecks');
          const decksSnap = await getDocs(decksColRef);
          decksSnap.forEach(d => {
            const data = d.data();
            const cards: unknown[] = Array.isArray(data.cards) ? data.cards : [];
            // If subject-level filtering is active, only include decks for selected subjects
            if (!params.sharedSubjectIds || params.sharedSubjectIds.includes(d.id)) {
              testDecksMap[d.id] = cards;
            }
          });
        } catch { /* best-effort — missing test decks are not fatal */ }

        const snapshot: CourseSnapshot = {
          studyData: studyDataForSnapshot,
          notesJson: JSON.stringify({ notes: notesMap, overallNote }),
          testDecksJson: JSON.stringify(testDecksMap),
        };
        payload.courseSnapshot = snapshot;
      } catch {
        // Best-effort — the share is still sent without the snapshot
      }
    }

    // Firestore rejects `undefined` field values — strip them out.
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }
    await addDoc(collection(db, 'shareRequests'), payload);
  };

  const updateSharePermissions = async (shareId: string, permissions: SharePermissions) => {
    await updateDoc(doc(db, 'shareRequests', shareId), { permissions });
    // Also propagate to the recipient's sharedCourses doc so the live
    // onSnapshot listener in CourseContext picks up the change immediately.
    try {
      const snap = await getDoc(doc(db, 'shareRequests', shareId));
      const acceptedByUid = snap.data()?.acceptedByUid as string | undefined;
      if (acceptedByUid) {
        await updateDoc(
          doc(db, 'users', acceptedByUid, 'sharedCourses', shareId),
          { permissions },
        );
      }
    } catch { /* best-effort — don't block the admin UI */ }
  };

  const cancelShare = async (shareId: string) => {
    await updateDoc(doc(db, 'shareRequests', shareId), { status: 'declined' });
  };

  // ── Extend or reduce duration (admin only, before expiry) ─────────────────
  // `deltaValue` may be negative to reduce the remaining time instead of
  // extending it. The result is clamped so it never drops below "now" —
  // reducing far enough simply expires the share immediately.
  const extendShare = async (shareId: string, deltaValue: number, deltaUnit: 'hours' | 'days' | 'months') => {
    const share = allSentShares.find(s => s.id === shareId);
    if (!share) return;
    const deltaMs = durationToMs(Math.abs(deltaValue), deltaUnit) * (deltaValue < 0 ? -1 : 1);
    if (share.status === 'accepted' && share.actualExpiresAt) {
      const newExpiry = Math.max(Date.now(), share.actualExpiresAt + deltaMs);
      await updateDoc(doc(db, 'shareRequests', shareId), { actualExpiresAt: newExpiry });
      if (share.acceptedByUid) {
        await setDoc(
          doc(db, 'users', share.acceptedByUid, 'sharedCourses', shareId),
          { actualExpiresAt: newExpiry },
          { merge: true },
        ).catch(() => {});
      }
    } else if (share.status === 'pending') {
      const newExpiry = Math.max(Date.now(), share.pendingExpiresAt + deltaMs);
      await updateDoc(doc(db, 'shareRequests', shareId), { pendingExpiresAt: newExpiry });
    }
  };

  // ── Subject-level incremental sharing ─────────────────────────────────────
  /** Fetch the top-level subjects (id + title) for one of the admin's own
   *  courses, used to render the subject-picker in the Share wizard. */
  const getCourseSubjectsForShare = async (courseId: string): Promise<{ id: string; title: string }[]> => {
    if (!user) return [];
    try {
      const sdSnap = await getDoc(doc(db, 'users', user.id, 'studyData', courseId));
      if (!sdSnap.exists()) return [];
      const subjects = (sdSnap.data().subjects as Array<{ id: string; title: string }> | undefined) || [];
      return subjects.map(s => ({ id: s.id, title: s.title }));
    } catch {
      return [];
    }
  };

  /** Add more subjects to an already-sent (still-active) course share. Reuses
   *  the existing content-sync channel (courseSnapshot + syncedAt) so the
   *  recipient picks up the addition through the same live-sync path used for
   *  ordinary note/structure edits — no separate propagation code needed. */
  const addSubjectsToShare = async (shareId: string, additionalSubjectIds: string[]) => {
    if (!user) return;
    const share = allSentShares.find(s => s.id === shareId);
    if (!share || share.type !== 'course' || !share.courseId) return;

    const mergedIds = Array.from(new Set([...(share.sharedSubjectIds || []), ...additionalSubjectIds]));

    const sdSnap = await getDoc(doc(db, 'users', user.id, 'studyData', share.courseId));
    if (!sdSnap.exists()) return;
    const rawSd = sdSnap.data();
    const filteredSubjects = filterSubjectsByIds((rawSd.subjects as unknown[]) || [], mergedIds);
    const idSet = collectAllIds(filteredSubjects);

    let notesMap: Record<string, string> = {};
    let overallNote = '';
    if (rawSd.hasNotesDoc) {
      const ndSnap = await getDoc(doc(db, 'users', user.id, 'courseNotes', share.courseId));
      if (ndSnap.exists()) {
        const nd = ndSnap.data() as { overallNote?: string; notes?: Record<string, string>; chunked?: boolean };
        if (nd.chunked) {
          const entries = await readChunkEntries(collection(db, 'users', user.id, 'courseNotes', share.courseId, 'chunks'));
          const merged = reassembleEntries(entries);
          overallNote = merged['__overall__'] || '';
          delete merged['__overall__'];
          notesMap = merged;
        } else {
          notesMap = nd.notes || {};
          overallNote = nd.overallNote || '';
        }
      }
    }
    notesMap = filterNotesMapByIds(notesMap, idSet);

    const studyDataForSnapshot = { ...rawSd, subjects: filteredSubjects };
    await updateDoc(doc(db, 'shareRequests', shareId), {
      sharedSubjectIds: mergedIds,
      courseSnapshot: {
        studyData: studyDataForSnapshot,
        notesJson: JSON.stringify({ notes: notesMap, overallNote }),
      },
      syncedAt: Date.now(),
    });
  };

  // ── Manual delete → trash → restore / permanent delete ────────────────────
  const trashShare = async (shareId: string) => {
    const share = allSentShares.find(s => s.id === shareId);
    if (!share) return;
    await updateDoc(doc(db, 'shareRequests', shareId), {
      status: 'trashed',
      trashedAt: Date.now(),
      trashedFromStatus: share.status === 'accepted' ? 'accepted'
        : share.status === 'declined' ? 'declined'
        : 'pending',
    });
  };

  const restoreShare = async (shareId: string) => {
    const share = allSentShares.find(s => s.id === shareId);
    if (!share || share.status !== 'trashed') return;
    await updateDoc(doc(db, 'shareRequests', shareId), {
      status: share.trashedFromStatus || 'declined',
      trashedAt: null,
      trashedFromStatus: null,
    });
  };

  const permanentlyDeleteShare = async (shareId: string) => {
    // Always delete the shareRequest document first — this is the source of truth
    // for notifications (pending) and is what the admin has write permission to.
    // User-side cleanup (courses, studyData, etc.) is handled by the recipient's
    // own onSnapshot listener (see "cascade cleanup" block below) which fires when
    // it detects the shareRequest has disappeared from their received-shares query.
    await deleteDoc(doc(db, 'shareRequests', shareId));
  };

  const acceptShare = async (shareId: string) => {
    const share = pendingShares.find(s => s.id === shareId);
    if (!share || !user) return;
    const ts = Date.now();
    const actualExpiresAt = ts + durationToMs(share.durationValue, share.durationUnit);

    // For course shares with an embedded snapshot: copy the course data into the
    // user's own Firestore collections so it appears in their course list and they
    // can study it just like any other course.
    if (share.type === 'course' && share.courseId && share.courseSnapshot) {
      try {
        const snapshot = share.courseSnapshot;
        // Use the shareId as the new courseId so it is always unique and traceable
        const newCourseId = shareId;
        const courseName = share.courseName || 'Shared Course';

        // 1. Write the course entry (appears in course switcher)
        //    Append "(Shared)" so it's visually distinct if a same-named course exists.
        const displayName = courseName.endsWith(' (Shared)') ? courseName : `${courseName} (Shared)`;
        await setDoc(doc(db, 'users', user.id, 'courses', newCourseId), {
          id: newCourseId,
          name: displayName,
          createdAt: ts,
        });

        // 2. Write the study data (subjects tree without note HTML)
        //    Always set hasNotesDoc: true so StudyContext loads notes from courseNotes.
        const sdToWrite: Record<string, unknown> = {
          ...snapshot.studyData,
          // Strip the admin's completion progress so the recipient always
          // receives a fresh course with zero progress of their own.
          subjects: stripProgress((snapshot.studyData.subjects as unknown[] | undefined) ?? []),
          hasNotesDoc: true,
          savedAt: ts,
        };
        await setDoc(doc(db, 'users', user.id, 'studyData', newCourseId), sdToWrite);

        // 3. Write the notes (HTML content for every item)
        let parsedNotes: { notes: Record<string, string>; overallNote: string } = {
          notes: {},
          overallNote: '',
        };
        if (snapshot.notesJson) {
          try {
            parsedNotes = JSON.parse(snapshot.notesJson);
          } catch { /* keep empty */ }
        }
        await setDoc(doc(db, 'users', user.id, 'courseNotes', newCourseId), {
          notes: parsedNotes.notes || {},
          overallNote: parsedNotes.overallNote || '',
        });

        // 4. Write test decks (MCQ/quiz cards) so the Test section is available
        if (snapshot.testDecksJson) {
          try {
            const testDecksMap = JSON.parse(snapshot.testDecksJson) as Record<string, unknown[]>;
            const deckWritePromises = Object.entries(testDecksMap).map(([subjectId, cards]) =>
              setDoc(
                doc(db, 'users', user.id, 'courses', newCourseId, 'testDecks', subjectId),
                { cards, updatedAt: ts },
              )
            );
            await Promise.all(deckWritePromises);
          } catch { /* best-effort — test decks not critical for course access */ }
        }

        // 5. Write shared-course metadata so permission checks can find it later
        await setDoc(doc(db, 'users', user.id, 'sharedCourses', newCourseId), {
          shareId,
          courseId: newCourseId,
          originalCourseId: share.courseId,
          courseName,
          fromAdminName: share.fromAdminName,
          fromAdminEmail: share.fromAdminEmail,
          permissions: share.permissions,
          acceptedAt: ts,
          actualExpiresAt,
        });
      } catch {
        // If the course copy fails, still mark the share accepted — the user
        // at least acknowledges the notification. They can re-request if needed.
      }
    }

    await updateDoc(doc(db, 'shareRequests', shareId), {
      status: 'accepted',
      acceptedAt: ts,
      actualExpiresAt,
      acceptedByUid: user.id,   // stored so admin can later push permission/data updates
    });
  };

  const declineShare = async (shareId: string) => {
    await updateDoc(doc(db, 'shareRequests', shareId), { status: 'declined' });
  };

  const markSeen = async (shareId: string) => {
    const share = allReceivedShares.find(s => s.id === shareId);
    if (!share || share.seenAt) return; // already seen, avoid redundant writes
    await updateDoc(doc(db, 'shareRequests', shareId), { seenAt: Date.now() });
  };

  return (
    <AdminContext.Provider value={{
      isAdmin, isSuperAdmin, adminEmails, loadingAdmins,
      addAdmin, removeAdmin,
      sendShare, sentShares, trashedShares, loadingSentShares,
      updateSharePermissions, cancelShare,
      pendingShares, acceptShare, declineShare,
      acceptedShares, markSeen,
      extendShare, getCourseSubjectsForShare, addSubjectsToShare,
      trashShare, restoreShare, permanentlyDeleteShare,
      appContact, saveContactSettings,
    }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
