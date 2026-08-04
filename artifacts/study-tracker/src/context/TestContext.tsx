import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
  collection, onSnapshot, setDoc, doc, deleteDoc, getDocs, query, where, updateDoc, type Unsubscribe,
} from 'firebase/firestore';
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

interface TestContextValue {
  /** subjectId → sorted TestCard[] */
  testDecks: Record<string, TestCard[]>;
  testDecksLoaded: boolean;
  addTestCard: (subjectId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  updateTestCard: (subjectId: string, cardId: string, data: Pick<TestCard, 'title' | 'question' | 'answer'>) => Promise<void>;
  deleteTestCard: (subjectId: string, cardId: string) => Promise<void>;
  reorderTestCards: (subjectId: string, fromIdx: number, toIdx: number) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TestContext = createContext<TestContextValue | null>(null);

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TestProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeCourseId } = useCourse();

  const [testDecks, setTestDecks] = useState<Record<string, TestCard[]>>({});
  const [testDecksLoaded, setTestDecksLoaded] = useState(false);

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
    if (!user || !activeCourseId) {
      setTestDecks({});
      setTestDecksLoaded(true);
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
      setTestDecks(decks);
      setTestDecksLoaded(true);
    }, err => {
      console.error('[TestContext] snapshot error', err);
      setTestDecksLoaded(true);
    });

    return () => unsub();
  }, [user, activeCourseId]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const deckRef = (subjectId: string) => {
    if (!user || !activeCourseId) throw new Error('Not authenticated');
    return doc(db, 'users', user.id, 'courses', activeCourseId, 'testDecks', subjectId);
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
    // Optimistic local update
    const nextDecks = { ...testDecks, [subjectId]: ordered };
    setTestDecks(nextDecks);
    await setDoc(deckRef(subjectId), { cards: ordered, updatedAt: Date.now() });
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

  return (
    <TestContext.Provider value={{
      testDecks, testDecksLoaded,
      addTestCard, updateTestCard, deleteTestCard, reorderTestCards,
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
