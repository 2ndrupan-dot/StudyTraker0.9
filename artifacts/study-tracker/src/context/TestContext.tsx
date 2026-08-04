import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  collection, onSnapshot, setDoc, doc, deleteDoc, type Unsubscribe,
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

  const persistDeck = async (subjectId: string, cards: TestCard[]) => {
    // Reassign order values to keep them 0-indexed after mutations
    const ordered = cards.map((c, i) => ({ ...c, order: i }));
    // Optimistic local update
    setTestDecks(prev => ({ ...prev, [subjectId]: ordered }));
    await setDoc(deckRef(subjectId), { cards: ordered, updatedAt: Date.now() });
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
      setTestDecks(prev => {
        const next = { ...prev };
        delete next[subjectId];
        return next;
      });
      await deleteDoc(deckRef(subjectId));
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
