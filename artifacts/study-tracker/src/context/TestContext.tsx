import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  collection, onSnapshot, doc, getDocs, query, where, type Unsubscribe,
} from 'firebase/firestore';
import { setDoc, deleteDoc, updateDoc } from '@/lib/saveStatus';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { useCourse } from './CourseContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TestCard {
  id: string;
  title: string;
  question: string;
  answer: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface LocalTestRecoveryItem {
  key: string;
  title: string;
  subjectId: string;
  cardId: string;
  personal: boolean;
  collectionName: TestDeckCollection;
}

type TestDeckCollection = 'testDecks' | 'personalTestDecks' | 'extraTestDecks';

interface LocalTestDeckSnapshot {
  cards: TestCard[];
  baseCards: TestCard[];
  unsynced: boolean;
}

interface TestRecoveryCandidate {
  item: LocalTestRecoveryItem;
  cacheKey: string;
  card: TestCard;
}

interface TestContextValue {
  /** subjectId → sorted TestCard[] */
  testDecks: Record<string, TestCard[]>;
  /** Personal test cards for the active course; never shared with admins/recipients. */
  personalTestDecks: Record<string, TestCard[]>;
  /** Extra test cards are a separate private deck collection for each subject. */
  extraTestDecks: Record<string, TestCard[]>;
  testDecksLoaded: boolean;
  personalTestDecksLoaded: boolean;
  extraTestDecksLoaded: boolean;
  localTestRecoveryItems: LocalTestRecoveryItem[];
  restoreLocalTestCards: (keys: string[]) => Promise<boolean>;
  dismissLocalTestRecovery: (keys: string[]) => void;
  addTestCard: (subjectId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  updateTestCard: (subjectId: string, cardId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  deleteTestCard: (subjectId: string, cardId: string) => Promise<void>;
  reorderTestCards: (subjectId: string, fromIdx: number, toIdx: number) => Promise<void>;
  addPersonalTestCard: (subjectId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  updatePersonalTestCard: (subjectId: string, cardId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  deletePersonalTestCard: (subjectId: string, cardId: string) => Promise<void>;
  reorderPersonalTestCards: (subjectId: string, fromIdx: number, toIdx: number) => Promise<void>;
  addExtraTestCard: (subjectId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  updateExtraTestCard: (subjectId: string, cardId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  deleteExtraTestCard: (subjectId: string, cardId: string) => Promise<void>;
  reorderExtraTestCards: (subjectId: string, fromIdx: number, toIdx: number) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TestContext = createContext<TestContextValue | null>(null);

function testDeckCacheKey(userId: string, courseId: string, collectionName: TestDeckCollection, subjectId: string) {
  return `@study_testdeck_v1_${userId}_${courseId}_${collectionName}_${subjectId}`;
}

function readTestDeckCache(key: string): LocalTestDeckSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null') as LocalTestDeckSnapshot | null;
    if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.baseCards)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTestDeckCache(key: string, snapshot: LocalTestDeckSnapshot) {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[TestContext] Could not persist the local test-card copy:', error);
  }
}

function sameCardContent(a: TestCard | undefined, b: TestCard | undefined) {
  if (!a || !b) return a === b;
  return a.id === b.id &&
    a.title === b.title &&
    a.question === b.question &&
    a.answer === b.answer &&
    (a.order ?? 0) === (b.order ?? 0);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TestProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeCourseId } = useCourse();

  const [testDecks, setTestDecks] = useState<Record<string, TestCard[]>>({});
  const [personalTestDecks, setPersonalTestDecks] = useState<Record<string, TestCard[]>>({});
  const [extraTestDecks, setExtraTestDecks] = useState<Record<string, TestCard[]>>({});
  const [testDecksLoaded, setTestDecksLoaded] = useState(false);
  const [personalTestDecksLoaded, setPersonalTestDecksLoaded] = useState(false);
  const [extraTestDecksLoaded, setExtraTestDecksLoaded] = useState(false);
  const [localTestRecoveryItems, setLocalTestRecoveryItems] = useState<LocalTestRecoveryItem[]>([]);
  const recoveryCandidatesRef = useRef<Map<string, TestRecoveryCandidate>>(new Map());
  const cloudTestDecksRef = useRef<Record<string, TestCard[]>>({});
  const cloudPersonalTestDecksRef = useRef<Record<string, TestCard[]>>({});
  const cloudExtraTestDecksRef = useRef<Record<string, TestCard[]>>({});

  const publishRecoveryItems = () => {
    setLocalTestRecoveryItems([...recoveryCandidatesRef.current.values()].map(candidate => candidate.item));
  };

  const mergeUnsyncedDecks = (
    remoteDecks: Record<string, TestCard[]>,
    collectionName: TestDeckCollection,
    userId: string,
    courseId: string,
    hasPendingWrites: boolean,
  ) => {
    const mergedDecks = { ...remoteDecks };
    const collectionPrefix = `@study_testdeck_v1_${userId}_${courseId}_${collectionName}_`;
    const seenKeys = new Set<string>();
    const cacheKeys: string[] = [];
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(collectionPrefix)) cacheKeys.push(key);
      }
    } catch {
      return mergedDecks;
    }

    for (const cacheKey of cacheKeys) {
      const subjectId = cacheKey.slice(collectionPrefix.length);
      const snapshot = readTestDeckCache(cacheKey);
      if (!snapshot?.unsynced) continue;
      const remoteCards = remoteDecks[subjectId] ?? [];
      const remoteById = new Map(remoteCards.map(card => [card.id, card]));
      const baseById = new Map(snapshot.baseCards.map(card => [card.id, card]));
      const localChanges = snapshot.cards.filter(card =>
        !sameCardContent(card, baseById.get(card.id)),
      );
      const changedCards: TestCard[] = [];
      const mergedById = new Map(remoteCards.map(card => [card.id, card]));

      for (const localCard of localChanges) {
        const remoteCard = remoteById.get(localCard.id);
        if (sameCardContent(remoteCard, localCard)) {
          if (!hasPendingWrites) continue;
          // Firestore can echo a locally queued write before the server confirms
          // it. Keep it recoverable until a server-backed snapshot arrives.
        } else {
          const baseCard = baseById.get(localCard.id);
          const cloudChangedSinceRecovery = !sameCardContent(remoteCard, baseCard);
          // A different browser may have saved this same card since the local
          // edit. Treat that server-side change as resolved instead of keeping
          // an obsolete restore entry (and let the cloud version win).
          if (!hasPendingWrites && cloudChangedSinceRecovery) continue;
          changedCards.push(localCard);
        }
        // Keep the local copy visible while it is pending, but retain every
        // unrelated card which was already present in the remote deck.
        mergedById.set(localCard.id, localCard);
      }

      for (const card of snapshot.cards) {
        if (mergedById.has(card.id)) continue;
        const cloudChangedSinceRecovery = !sameCardContent(
          remoteById.get(card.id),
          baseById.get(card.id),
        );
        if (hasPendingWrites || !cloudChangedSinceRecovery) {
          mergedById.set(card.id, card);
        }
      }
      mergedDecks[subjectId] = [...mergedById.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const candidates = hasPendingWrites
        ? localChanges
        : changedCards;
      for (const card of candidates) {
        const key = `${collectionName}:${subjectId}:${card.id}`;
        seenKeys.add(key);
        recoveryCandidatesRef.current.set(key, {
          cacheKey,
          card,
          item: {
            key,
            title: card.title || 'Untitled card',
            subjectId,
            cardId: card.id,
            personal: collectionName !== 'testDecks',
            collectionName,
          },
        });
      }

      // Rebase the browser cache on every server-confirmed snapshot. This
      // removes cloud-resolved local edits while preserving unrelated edits
      // which are still waiting to be saved.
      if (!hasPendingWrites) {
        writeTestDeckCache(cacheKey, {
          cards: mergedDecks[subjectId],
          baseCards: remoteCards,
          unsynced: changedCards.length > 0,
        });
      }
    }

    const prefixKeys = [...recoveryCandidatesRef.current.entries()]
      .filter(([, candidate]) => candidate.item.collectionName === collectionName)
      .map(([key]) => key);
    for (const key of prefixKeys) {
      if (!seenKeys.has(key)) recoveryCandidatesRef.current.delete(key);
    }
    publishRecoveryItems();
    return mergedDecks;
  };

  // Keep a stable ref to activeCourseId so the relay closure always sees the latest value
  const activeCourseIdRef = useRef(activeCourseId);
  useEffect(() => { activeCourseIdRef.current = activeCourseId; }, [activeCourseId]);

  // Listen for instant test-deck updates from AdminContext live-sync relay.
  // This fires on the recipient's device after an admin edits cards in a shared
  // course — eliminates the page-reload that the Firestore round-trip would require.
  useEffect(() => {
    const handleTestLiveSync = (e: Event) => {
      const { shareId, testDecksMap } = (e as CustomEvent<{ shareId: string; testDecksMap: Record<string, unknown[]> }>).detail;
      if (shareId !== activeCourseIdRef.current) return;
      setTestDecks(prev => {
        const next = { ...prev };
        for (const [subjectId, cards] of Object.entries(testDecksMap)) {
          next[subjectId] = [...(cards as TestCard[])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        }
        return next;
      });
    };
    window.addEventListener('test-livesync', handleTestLiveSync);
    return () => window.removeEventListener('test-livesync', handleTestLiveSync);
  }, []);

  // Subscribe to Firestore testDecks collection for the active course
  useEffect(() => {
    setTestDecksLoaded(false);
    setPersonalTestDecksLoaded(false);
    setExtraTestDecksLoaded(false);
    recoveryCandidatesRef.current.clear();
    setLocalTestRecoveryItems([]);
    if (!user || !activeCourseId) {
      setTestDecks({});
      setPersonalTestDecks({});
      setExtraTestDecks({});
      cloudTestDecksRef.current = {};
      cloudPersonalTestDecksRef.current = {};
      cloudExtraTestDecksRef.current = {};
      recoveryCandidatesRef.current.clear();
      setLocalTestRecoveryItems([]);
      setTestDecksLoaded(true);
      setPersonalTestDecksLoaded(true);
      setExtraTestDecksLoaded(true);
      return;
    }

    const colRef = collection(db, 'users', user.id, 'courses', activeCourseId, 'testDecks');
    const unsub: Unsubscribe = onSnapshot(colRef, snap => {
      const decks: Record<string, TestCard[]> = {};
      snap.forEach(d => {
        const data = d.data();
        const cards: TestCard[] = Array.isArray(data.cards) ? data.cards : [];
        // Sort by order field for stable display
        decks[d.id] = [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
      cloudTestDecksRef.current = decks;
      setTestDecks(mergeUnsyncedDecks(
        decks,
        'testDecks',
        user.id,
        activeCourseId,
        snap.metadata.hasPendingWrites,
      ));
      setTestDecksLoaded(true);
    }, err => {
      console.error('[TestContext] snapshot error', err);
      cloudTestDecksRef.current = {};
      setTestDecks(mergeUnsyncedDecks({}, 'testDecks', user.id, activeCourseId, false));
      setTestDecksLoaded(true);
    });

    const personalColRef = collection(db, 'users', user.id, 'courses', activeCourseId, 'personalTestDecks');
    const personalUnsub: Unsubscribe = onSnapshot(personalColRef, snap => {
      const decks: Record<string, TestCard[]> = {};
      snap.forEach(d => {
        const data = d.data();
        const cards: TestCard[] = Array.isArray(data.cards) ? data.cards : [];
        decks[d.id] = [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
      cloudPersonalTestDecksRef.current = decks;
      setPersonalTestDecks(mergeUnsyncedDecks(
        decks,
        'personalTestDecks',
        user.id,
        activeCourseId,
        snap.metadata.hasPendingWrites,
      ));
      setPersonalTestDecksLoaded(true);
    }, err => {
      console.error('[TestContext] personal snapshot error', err);
      cloudPersonalTestDecksRef.current = {};
      setPersonalTestDecks(mergeUnsyncedDecks({}, 'personalTestDecks', user.id, activeCourseId, false));
      setPersonalTestDecksLoaded(true);
    });

    const extraColRef = collection(db, 'users', user.id, 'courses', activeCourseId, 'extraTestDecks');
    const extraUnsub: Unsubscribe = onSnapshot(extraColRef, snap => {
      const decks: Record<string, TestCard[]> = {};
      snap.forEach(d => {
        const data = d.data();
        const cards: TestCard[] = Array.isArray(data.cards) ? data.cards : [];
        decks[d.id] = [...cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
      cloudExtraTestDecksRef.current = decks;
      setExtraTestDecks(mergeUnsyncedDecks(
        decks,
        'extraTestDecks',
        user.id,
        activeCourseId,
        snap.metadata.hasPendingWrites,
      ));
      setExtraTestDecksLoaded(true);
    }, err => {
      console.error('[TestContext] extra test snapshot error', err);
      cloudExtraTestDecksRef.current = {};
      setExtraTestDecks(mergeUnsyncedDecks({}, 'extraTestDecks', user.id, activeCourseId, false));
      setExtraTestDecksLoaded(true);
    });

    return () => {
      unsub();
      personalUnsub();
      extraUnsub();
    };
  }, [user, activeCourseId]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const deckRef = (subjectId: string) => {
    if (!user || !activeCourseId) throw new Error('Not authenticated');
    return doc(db, 'users', user.id, 'courses', activeCourseId, 'testDecks', subjectId);
  };

  const personalDeckRef = (subjectId: string) => {
    if (!user || !activeCourseId) throw new Error('Not authenticated');
    return doc(db, 'users', user.id, 'courses', activeCourseId, 'personalTestDecks', subjectId);
  };

  const extraDeckRef = (subjectId: string) => {
    if (!user || !activeCourseId) throw new Error('Not authenticated');
    return doc(db, 'users', user.id, 'courses', activeCourseId, 'extraTestDecks', subjectId);
  };

  // ── Live-sync relay for test deck mutations ─────────────────────────────
  // When an admin modifies test cards, push the updated decks into every
  // accepted shareRequest for this course so recipients' AdminContext
  // onSnapshot fires and writes the new decks to their own collections.
  // Called fire-and-forget after every persistDeck / deleteTestCard.
  const relayTestDecksToShares = (courseId: string, updatedDecks: Record<string, TestCard[]>) => {
    if (!user) return;
    const adminUid = user.id;
    (async () => {
      try {
        const sharesQ = query(
          collection(db, 'shareRequests'),
          where('fromAdminUid', '==', adminUid),
        );
        const sharesSnap = await getDocs(sharesQ);
        if (sharesSnap.empty) return;

        const syncedAt = Date.now();
        for (const shareDoc of sharesSnap.docs) {
          const data = shareDoc.data();
          if (data.courseId !== courseId) continue;
          if (data.status !== 'accepted') continue;

          // Apply same subject-level filter as the main live-sync
          const sharedSubjectIds = data.sharedSubjectIds as string[] | undefined;
          const filteredDecks: Record<string, unknown[]> = {};
          for (const [sid, cards] of Object.entries(updatedDecks)) {
            if (!sharedSubjectIds || sharedSubjectIds.includes(sid)) {
              filteredDecks[sid] = cards;
            }
          }

          await updateDoc(doc(db, 'shareRequests', shareDoc.id), {
            'courseSnapshot.testDecksJson': JSON.stringify(filteredDecks),
            syncedAt,
          });
          console.log('[TestContext] 🃏 Test deck relay pushed to share', shareDoc.id);
        }
      } catch (err) {
        console.warn('[TestContext] Test deck relay failed (non-fatal):', err);
      }
    })();
  };

  const persistDeck = async (subjectId: string, cards: TestCard[]) => {
    // Reassign order values to keep them 0-indexed after mutations
    const ordered = cards.map((c, i) => ({ ...c, order: i }));
    const cacheKey = testDeckCacheKey(user!.id, activeCourseId!, 'testDecks', subjectId);
    const previousCache = readTestDeckCache(cacheKey);
    writeTestDeckCache(cacheKey, {
      cards: ordered,
      baseCards: previousCache?.unsynced ? previousCache.baseCards : (testDecks[subjectId] ?? []),
      unsynced: true,
    });
    // Optimistic local update
    const nextDecks = { ...testDecks, [subjectId]: ordered };
    setTestDecks(nextDecks);
    await setDoc(deckRef(subjectId), { cards: ordered, updatedAt: Date.now() });
    writeTestDeckCache(cacheKey, { cards: ordered, baseCards: ordered, unsynced: false });
    for (const key of recoveryCandidatesRef.current.keys()) {
      if (key.startsWith(`testDecks:${subjectId}:`)) recoveryCandidatesRef.current.delete(key);
    }
    publishRecoveryItems();
    cloudTestDecksRef.current = { ...cloudTestDecksRef.current, [subjectId]: ordered };
    // Relay updated decks to any accepted shares (admin only; no-op for regular users)
    const courseId = activeCourseIdRef.current;
    if (courseId) relayTestDecksToShares(courseId, nextDecks);
  };

  // ── Public API ─────────────────────────────────────────────────────────────

  const addTestCard = async (
    subjectId: string,
    data: Pick<TestCard, 'title' | 'question' | 'answer'>,
  ) => {
    const existing = testDecks[subjectId] ?? [];
    const newCard: TestCard = {
      id: uid(),
      title: data.title,
      question: data.question,
      answer: data.answer,
      order: existing.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await persistDeck(subjectId, [...existing, newCard]);
  };

  const updateTestCard = async (
    subjectId: string,
    cardId: string,
    data: Pick<TestCard, 'title' | 'question' | 'answer'>,
  ) => {
    const existing = testDecks[subjectId] ?? [];
    const updated = existing.map(c =>
      c.id === cardId ? { ...c, ...data, updatedAt: Date.now() } : c
    );
    await persistDeck(subjectId, updated);
  };

  const deleteTestCard = async (subjectId: string, cardId: string) => {
    const existing = testDecks[subjectId] ?? [];
    const filtered = existing.filter(c => c.id !== cardId);
    if (filtered.length === 0) {
      const nextDecks = { ...testDecks };
      delete nextDecks[subjectId];
      setTestDecks(nextDecks);
      await deleteDoc(deckRef(subjectId));
      // Relay the deletion (empty deck removed) to accepted shares
      const courseId = activeCourseIdRef.current;
      if (courseId) relayTestDecksToShares(courseId, nextDecks);
    } else {
      await persistDeck(subjectId, filtered);
    }
  };

  const reorderTestCards = async (subjectId: string, fromIdx: number, toIdx: number) => {
    const existing = [...(testDecks[subjectId] ?? [])];
    if (fromIdx === toIdx) return;
    const [moved] = existing.splice(fromIdx, 1);
    existing.splice(toIdx, 0, moved);
    await persistDeck(subjectId, existing);
  };

  const persistPersonalDeck = async (subjectId: string, cards: TestCard[]) => {
    const ordered = cards.map((c, i) => ({ ...c, order: i }));
    const cacheKey = testDeckCacheKey(user!.id, activeCourseId!, 'personalTestDecks', subjectId);
    const previousCache = readTestDeckCache(cacheKey);
    writeTestDeckCache(cacheKey, {
      cards: ordered,
      baseCards: previousCache?.unsynced ? previousCache.baseCards : (personalTestDecks[subjectId] ?? []),
      unsynced: true,
    });
    setPersonalTestDecks(prev => ({ ...prev, [subjectId]: ordered }));
    await setDoc(personalDeckRef(subjectId), { cards: ordered, updatedAt: Date.now() });
    writeTestDeckCache(cacheKey, { cards: ordered, baseCards: ordered, unsynced: false });
    for (const key of recoveryCandidatesRef.current.keys()) {
      if (key.startsWith(`personalTestDecks:${subjectId}:`)) recoveryCandidatesRef.current.delete(key);
    }
    publishRecoveryItems();
    cloudPersonalTestDecksRef.current = { ...cloudPersonalTestDecksRef.current, [subjectId]: ordered };
  };

  const persistExtraDeck = async (subjectId: string, cards: TestCard[]) => {
    const ordered = cards.map((card, index) => ({ ...card, order: index }));
    const cacheKey = testDeckCacheKey(user!.id, activeCourseId!, 'extraTestDecks', subjectId);
    const previousCache = readTestDeckCache(cacheKey);
    writeTestDeckCache(cacheKey, {
      cards: ordered,
      baseCards: previousCache?.unsynced ? previousCache.baseCards : (extraTestDecks[subjectId] ?? []),
      unsynced: true,
    });
    setExtraTestDecks(prev => ({ ...prev, [subjectId]: ordered }));
    await setDoc(extraDeckRef(subjectId), { cards: ordered, updatedAt: Date.now() });
    writeTestDeckCache(cacheKey, { cards: ordered, baseCards: ordered, unsynced: false });
    for (const key of recoveryCandidatesRef.current.keys()) {
      if (key.startsWith(`extraTestDecks:${subjectId}:`)) recoveryCandidatesRef.current.delete(key);
    }
    publishRecoveryItems();
    cloudExtraTestDecksRef.current = { ...cloudExtraTestDecksRef.current, [subjectId]: ordered };
  };

  const restoreLocalTestCards = async (keys: string[]): Promise<boolean> => {
    const selected = keys
      .map(key => recoveryCandidatesRef.current.get(key))
      .filter((value): value is TestRecoveryCandidate => !!value);
    if (selected.length === 0 || !user || !activeCourseId) return false;

    const groups = new Map<string, TestRecoveryCandidate[]>();
    selected.forEach(candidate => {
      const list = groups.get(candidate.cacheKey) ?? [];
      list.push(candidate);
      groups.set(candidate.cacheKey, list);
    });

    try {
      for (const [cacheKey, candidates] of groups) {
        const snapshot = readTestDeckCache(cacheKey);
        if (!snapshot) continue;
        const first = candidates[0];
        const collectionName = first.item.collectionName;
        const remoteDecks = collectionName === 'testDecks'
          ? cloudTestDecksRef.current
          : collectionName === 'personalTestDecks'
            ? cloudPersonalTestDecksRef.current
            : cloudExtraTestDecksRef.current;
        const remoteCards = remoteDecks[first.item.subjectId] ?? [];
        const cloudById = new Map(remoteCards.map(card => [card.id, card]));
        const selectedIds = new Set(candidates.map(candidate => candidate.item.cardId));
        const localById = new Map(snapshot.cards.map(card => [card.id, card]));

        // Restore only the selected card IDs, merging them into the current
        // cloud deck so unrelated cloud cards are never replaced or removed.
        for (const id of selectedIds) {
          const localCard = localById.get(id);
          if (localCard) cloudById.set(id, localCard);
        }
        const restoredCloudCards = [...cloudById.values()]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((card, index) => ({ ...card, order: index }));
        const ref = doc(db, 'users', user.id, 'courses', activeCourseId, collectionName, first.item.subjectId);
        await setDoc(ref, { cards: restoredCloudCards, updatedAt: Date.now() });

        const remainingLocalCards = new Map(restoredCloudCards.map(card => [card.id, card]));
        for (const card of snapshot.cards) {
          const baseCard = snapshot.baseCards.find(base => base.id === card.id);
          if (!selectedIds.has(card.id) && !sameCardContent(card, baseCard)) {
            remainingLocalCards.set(card.id, card);
          }
        }
        const nextCards = [...remainingLocalCards.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const hasOtherPendingChanges = nextCards.some(card => {
          const base = restoredCloudCards.find(candidate => candidate.id === card.id);
          return !sameCardContent(card, base);
        });
        writeTestDeckCache(cacheKey, {
          cards: nextCards,
          baseCards: restoredCloudCards,
          unsynced: hasOtherPendingChanges,
        });

        if (collectionName === 'personalTestDecks') {
          cloudPersonalTestDecksRef.current = { ...cloudPersonalTestDecksRef.current, [first.item.subjectId]: restoredCloudCards };
          setPersonalTestDecks(prev => ({ ...prev, [first.item.subjectId]: nextCards }));
        } else if (collectionName === 'extraTestDecks') {
          cloudExtraTestDecksRef.current = { ...cloudExtraTestDecksRef.current, [first.item.subjectId]: restoredCloudCards };
          setExtraTestDecks(prev => ({ ...prev, [first.item.subjectId]: nextCards }));
        } else {
          cloudTestDecksRef.current = { ...cloudTestDecksRef.current, [first.item.subjectId]: restoredCloudCards };
          setTestDecks(prev => ({ ...prev, [first.item.subjectId]: nextCards }));
          const courseId = activeCourseId;
          relayTestDecksToShares(courseId, { ...testDecks, [first.item.subjectId]: restoredCloudCards });
        }
      }

      selected.forEach(candidate => recoveryCandidatesRef.current.delete(candidate.item.key));
      publishRecoveryItems();
      return true;
    } catch (error) {
      console.error('[TestContext] Could not restore local test cards:', error);
      return false;
    }
  };

  const dismissLocalTestRecovery = (keys: string[]) => {
    const selected = keys
      .map(key => recoveryCandidatesRef.current.get(key))
      .filter((value): value is TestRecoveryCandidate => !!value);
    const groups = new Map<string, TestRecoveryCandidate[]>();
    selected.forEach(candidate => {
      const list = groups.get(candidate.cacheKey) ?? [];
      list.push(candidate);
      groups.set(candidate.cacheKey, list);
    });

    for (const [cacheKey, candidates] of groups) {
      const snapshot = readTestDeckCache(cacheKey);
      if (!snapshot) continue;
      const first = candidates[0];
      const remoteDecks = first.item.collectionName === 'testDecks'
        ? cloudTestDecksRef.current
        : first.item.collectionName === 'personalTestDecks'
          ? cloudPersonalTestDecksRef.current
          : cloudExtraTestDecksRef.current;
      const remoteCards = remoteDecks[first.item.subjectId] ?? [];
      const remoteById = new Map(remoteCards.map(card => [card.id, card]));
      const baseById = new Map(snapshot.baseCards.map(card => [card.id, card]));
      const selectedIds = new Set(candidates.map(candidate => candidate.item.cardId));
      const nextById = new Map(snapshot.cards.map(card => [card.id, card]));

      for (const id of selectedIds) {
        const cloudCard = remoteById.get(id);
        if (cloudCard) nextById.set(id, cloudCard);
        else if (!baseById.has(id)) nextById.delete(id);
        else nextById.set(id, baseById.get(id)!);
      }
      const nextCards = [...nextById.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const hasOtherPendingChanges = nextCards.some(card =>
        !sameCardContent(card, baseById.get(card.id)),
      );
      writeTestDeckCache(cacheKey, {
        cards: nextCards,
        baseCards: snapshot.baseCards,
        unsynced: hasOtherPendingChanges,
      });
      if (first.item.collectionName === 'personalTestDecks') {
        setPersonalTestDecks(prev => ({ ...prev, [first.item.subjectId]: nextCards }));
      } else if (first.item.collectionName === 'extraTestDecks') {
        setExtraTestDecks(prev => ({ ...prev, [first.item.subjectId]: nextCards }));
      } else {
        setTestDecks(prev => ({ ...prev, [first.item.subjectId]: nextCards }));
      }
    }

    selected.forEach(candidate => recoveryCandidatesRef.current.delete(candidate.item.key));
    publishRecoveryItems();
  };

  const addPersonalTestCard = async (
    subjectId: string,
    data: Pick<TestCard, 'title' | 'question' | 'answer'>,
  ) => {
    const existing = personalTestDecks[subjectId] ?? [];
    const now = Date.now();
    const newCard: TestCard = {
      id: uid(),
      title: data.title,
      question: data.question,
      answer: data.answer,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    };
    await persistPersonalDeck(subjectId, [...existing, newCard]);
  };

  const updatePersonalTestCard = async (
    subjectId: string,
    cardId: string,
    data: Pick<TestCard, 'title' | 'question' | 'answer'>,
  ) => {
    const existing = personalTestDecks[subjectId] ?? [];
    const updated = existing.map(c =>
      c.id === cardId ? { ...c, ...data, updatedAt: Date.now() } : c,
    );
    await persistPersonalDeck(subjectId, updated);
  };

  const deletePersonalTestCard = async (subjectId: string, cardId: string) => {
    const existing = personalTestDecks[subjectId] ?? [];
    const filtered = existing.filter(c => c.id !== cardId);
    if (filtered.length === 0) {
      const next = { ...personalTestDecks };
      delete next[subjectId];
      setPersonalTestDecks(next);
      await deleteDoc(personalDeckRef(subjectId));
    } else {
      await persistPersonalDeck(subjectId, filtered);
    }
  };

  const reorderPersonalTestCards = async (subjectId: string, fromIdx: number, toIdx: number) => {
    const existing = [...(personalTestDecks[subjectId] ?? [])];
    if (fromIdx === toIdx) return;
    const [moved] = existing.splice(fromIdx, 1);
    existing.splice(toIdx, 0, moved);
    await persistPersonalDeck(subjectId, existing);
  };

  const addExtraTestCard = async (
    subjectId: string,
    data: Pick<TestCard, 'title' | 'question' | 'answer'>,
  ) => {
    const existing = extraTestDecks[subjectId] ?? [];
    const now = Date.now();
    const newCard: TestCard = {
      id: uid(),
      title: data.title,
      question: data.question,
      answer: data.answer,
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    };
    await persistExtraDeck(subjectId, [...existing, newCard]);
  };

  const updateExtraTestCard = async (
    subjectId: string,
    cardId: string,
    data: Pick<TestCard, 'title' | 'question' | 'answer'>,
  ) => {
    const existing = extraTestDecks[subjectId] ?? [];
    const updated = existing.map(card =>
      card.id === cardId ? { ...card, ...data, updatedAt: Date.now() } : card,
    );
    await persistExtraDeck(subjectId, updated);
  };

  const deleteExtraTestCard = async (subjectId: string, cardId: string) => {
    const filtered = (extraTestDecks[subjectId] ?? []).filter(card => card.id !== cardId);
    if (filtered.length === 0) {
      setExtraTestDecks(prev => {
        const next = { ...prev };
        delete next[subjectId];
        return next;
      });
      await deleteDoc(extraDeckRef(subjectId));
      writeTestDeckCache(
        testDeckCacheKey(user!.id, activeCourseId!, 'extraTestDecks', subjectId),
        { cards: [], baseCards: [], unsynced: false },
      );
      cloudExtraTestDecksRef.current = { ...cloudExtraTestDecksRef.current };
      delete cloudExtraTestDecksRef.current[subjectId];
    } else {
      await persistExtraDeck(subjectId, filtered);
    }
  };

  const reorderExtraTestCards = async (subjectId: string, fromIdx: number, toIdx: number) => {
    const existing = [...(extraTestDecks[subjectId] ?? [])];
    if (fromIdx === toIdx) return;
    const [moved] = existing.splice(fromIdx, 1);
    existing.splice(toIdx, 0, moved);
    await persistExtraDeck(subjectId, existing);
  };

  return (
    <TestContext.Provider value={{
      testDecks, personalTestDecks, extraTestDecks,
      testDecksLoaded, personalTestDecksLoaded, extraTestDecksLoaded,
      localTestRecoveryItems, restoreLocalTestCards, dismissLocalTestRecovery,
      addTestCard, updateTestCard, deleteTestCard, reorderTestCards,
      addPersonalTestCard, updatePersonalTestCard, deletePersonalTestCard, reorderPersonalTestCards,
      addExtraTestCard, updateExtraTestCard, deleteExtraTestCard, reorderExtraTestCards,
    }}>
      {children}
    </TestContext.Provider>
  );
}

export function useTest() {
  const ctx = useContext(TestContext);
  if (!ctx) throw new Error('useTest must be used within TestProvider');
  return ctx;
}
