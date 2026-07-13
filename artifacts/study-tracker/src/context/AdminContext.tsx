import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  collection, doc, getDoc, getDocs, setDoc,
  query, where, onSnapshot, addDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';

// Super admins from env var (cannot be removed)
const SUPER_ADMIN_EMAILS: string[] = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

export interface SharePermissions {
  editNotes: boolean;
  deleteNotes: boolean;
  downloadNotes: boolean;
  copyNotes: boolean;
  // Structural permissions (course-level)
  renameCourse: boolean;  // can the user rename this shared course?
  addItems: boolean;      // can the user add subjects/chapters/topics/etc.?
}

// Snapshot of a course's data embedded in the shareRequest at send-time so the
// recipient can copy it to their own account when they accept.
interface CourseSnapshot {
  studyData: Record<string, unknown>;
  notesJson: string; // JSON.stringify({ notes: Record<string,string>, overallNote: string })
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
  // Note share
  noteTitle?: string;
  noteHtml?: string;
  noteBreadcrumb?: string[];
  // Plain admin -> user message
  messageText?: string;
  // Common
  permissions: SharePermissions;
  durationValue: number;
  durationUnit: 'hours' | 'days' | 'months';
  status: 'pending' | 'accepted' | 'declined';
  sentAt: number;
  pendingExpiresAt: number; // auto-expire the pending notification
  acceptedAt?: number;
  actualExpiresAt?: number; // when access expires after acceptance
  seenAt?: number; // when the recipient opened/interacted with this notification
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
  loadingSentShares: boolean;
  updateSharePermissions: (shareId: string, permissions: SharePermissions) => Promise<void>;
  cancelShare: (shareId: string) => Promise<void>;
  pendingShares: ShareRequest[];
  acceptShare: (shareId: string) => Promise<void>;
  declineShare: (shareId: string) => Promise<void>;
  acceptedShares: ShareRequest[];
  markSeen: (shareId: string) => Promise<void>;
}

export type SendShareParams = Pick<ShareRequest,
  'toEmail' | 'type' | 'courseId' | 'courseName' | 'noteTitle' | 'noteHtml' | 'noteBreadcrumb' |
  'messageText' | 'permissions' | 'durationValue' | 'durationUnit'
>;

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

  // Track which syncedAt timestamps we've already applied so we don't re-run
  // the same sync on every snapshot update.
  const processedSyncRef = useRef<Map<string, number>>(new Map());

  // Track last-applied permissions per shareId so we detect changes and relay
  // them into the user's own sharedCourses doc (security rules block the admin
  // from writing there directly, so the relay runs client-side like the content sync).
  const processedPermissionsRef = useRef<Map<string, string>>(new Map());

  const adminEmails = [...new Set([...SUPER_ADMIN_EMAILS, ...firestoreAdminEmails])];
  const isAdmin = adminEmails.includes(userEmail);

  const now = Date.now();
  const pendingShares = allReceivedShares
    .filter(s => s.status === 'pending' && s.pendingExpiresAt > now)
    .sort((a, b) => b.sentAt - a.sentAt); // newest first
  const acceptedShares = allReceivedShares.filter(
    s => s.status === 'accepted' && (!s.actualExpiresAt || s.actualExpiresAt > now)
  );
  const sentShares = allSentShares;

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
        const courseSnapshot = data.courseSnapshot as { studyData?: Record<string, unknown>; notesJson?: string } | undefined;
        const syncStudyData = courseSnapshot?.studyData;
        const syncNotesJson = courseSnapshot?.notesJson;
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
            if (syncNotesJson) {
              try {
                const notesData = JSON.parse(syncNotesJson) as { overallNote: string; notes: Record<string, string> };
                await setDoc(
                  doc(db, 'users', uid, 'courseNotes', shareId),
                  { savedAt: Date.now(), overallNote: notesData.overallNote || '', notes: notesData.notes || {}, chunked: false },
                  { merge: false },
                );
              } catch { /* malformed JSON — skip notes */ }
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
                overallNote: syncStudyData.overallNote,
                notePagesIndex: syncStudyData.notePagesIndex,
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

        const snapshot: CourseSnapshot = {
          studyData: rawSd as Record<string, unknown>,
          notesJson: JSON.stringify({ notes: notesMap, overallNote }),
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

        // 4. Write shared-course metadata so permission checks can find it later
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
      sendShare, sentShares, loadingSentShares,
      updateSharePermissions, cancelShare,
      pendingShares, acceptShare, declineShare,
      acceptedShares, markSeen,
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
