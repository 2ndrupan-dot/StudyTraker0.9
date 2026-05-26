import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Subject, Chapter, Topic, Subtopic, Concept, Point, CourseSettings, MarkLevel, MarkPath, TempNoteItem, NotePage } from '@/lib/types';
import { useAuth } from './AuthContext';
import { useCourse } from './CourseContext';
import { addDays, formatISO } from 'date-fns';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { applyTimeAdjustment, isChapterContentDone, isTopicContentDone, isSubtopicContentDone, isConceptContentDone } from '@/lib/timeEngine';
import type { DifficultyLevel } from '@/lib/types';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
export const newId = uid;

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
  syncing: boolean;
  online: boolean;
  setNote: (path: MarkPath, note: string) => void;
  toggleImportant: (path: MarkPath) => void;
  toggleWeak: (path: MarkPath) => void;
  setCourseTotalDays: (days: number) => void;
  setDailyStudyHours: (hours: number) => void;
  setCourseStartDate: (date: string) => void;
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
  addTempNote: (text: string, parentId?: string | null) => void;
  updateTempNote: (id: string, text: string) => void;
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

function doResetProgress(subjs: Subject[], currentSettings: CourseSettings, userEmail: string | undefined): { subjects: Subject[]; settings: CourseSettings } {
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
      ['today_plan_v2', 'pending_v2', 'revisions_v1'].forEach(k => {
        localStorage.removeItem(`@study_${k}_${userEmail}`);
      });
    } catch { /* ignore */ }
  }
  return { subjects: resetSubjects, settings: resetSettings };
}

function pickNewerData(firestore: StudyData | null, local: StudyData | null): StudyData | null {
  if (!firestore && !local) return null;
  if (!firestore) return local;
  if (!local) return firestore;
  const fsTime = firestore.savedAt ?? 0;
  const lcTime = local.savedAt ?? 0;
  return lcTime > fsTime ? local : firestore;
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
  const [syncing, setSyncing] = useState(false);
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

  // Always-current refs so flushSave never captures stale closures
  const userRef = useRef(user);
  const activeCourseIdRef = useRef(activeCourseId);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { activeCourseIdRef.current = activeCourseId; }, [activeCourseId]);

  const localKey = (suffix: string) => (user && activeCourseId) ? `@study_${suffix}_${activeCourseId}_${user.email}` : null;

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
    let isFirstSnapshot = true;

    // ── Real-time listener — fires immediately on mount (initial load)
    //    and again whenever any device writes to this document ──
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        const fsData: StudyData | null = snap.exists()
          ? {
              subjects: snap.data().subjects || [],
              settings: snap.data().settings || {},
              tempNotes: snap.data().tempNotes || [],
              overallNote: snap.data().overallNote || '',
              notePagesIndex: snap.data().notePagesIndex || [],
              savedAt: snap.data().savedAt,
            }
          : null;

        if (isFirstSnapshot) {
          // ── Initial load: pick the freshest between Firestore and localStorage ──
          isFirstSnapshot = false;

          if (!fsData) {
            setDataLoaded(true);
            setTimeout(() => { isInitialLoad.current = false; }, 200);
            return;
          }

          const lsRaw = localKey('data');
          const localData = lsRaw ? getLocalData(lsRaw) : null;

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

          const best = pickNewerData(fsData, localData);

          if (best) {
            const loadedSettings = { ...best.settings } as CourseSettings;
            let loadedSubjects = best.subjects || [];
            if (loadedSettings.resetScheduled && loadedSettings.courseStartDate) {
              const startDate = new Date(loadedSettings.courseStartDate);
              startDate.setHours(0, 0, 0, 0);
              if (new Date() >= startDate) {
                const resetResult = doResetProgress(loadedSubjects, loadedSettings, user?.email);
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
        } else {
          // ── Real-time update from another device ──
          // Skip if this snapshot was triggered by our own save (savedAt matches)
          if (!fsData) return;
          if (fsData.savedAt && fsData.savedAt === lastSavedAt.current) return;

          setSubjects(fsData.subjects || []);
          setSettings(prev => ({ ...prev, ...fsData.settings }));
          setTempNotes(fsData.tempNotes || []);
          setOverallNoteState(fsData.overallNote || '');
          setNotePagesIndex(fsData.notePagesIndex || []);
        }
      },
      () => {
        // Firestore error (offline / permission denied) — fall back to localStorage
        if (!isFirstSnapshot) return;
        isFirstSnapshot = false;
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

    return () => unsubscribe();
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
    localStorage.setItem(lsKey, JSON.stringify(payload));
    try {
      const docRef = doc(db, 'users', currentUser.id, 'studyData', currentCourseId);
      await setDoc(docRef, payload, { merge: false });
    } catch { /* localStorage backup already done */ }
    setSyncing(false);
  };

  useEffect(() => {
    if (!user || !dataLoaded || isInitialLoad.current) return;
    // Never save an accidental empty reset
    if (subjects.length === 0) return;

    const payload: StudyData = { subjects, settings, tempNotes, overallNote, notePagesIndex, savedAt: Date.now() };
    const lsKey = localKey('data');
    if (lsKey) localStorage.setItem(lsKey, JSON.stringify(payload));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncing(true);
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

  const setCourseStartDate = (date: string) => {
    setSettings(prev => ({ ...prev, courseStartDate: date, resetScheduled: true }));
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

  const deleteSubject = (subjId: string) =>
    setSubjects(prev => redistributeDays(prev.filter(s => s.id !== subjId), settings.courseTotalDays));

  const updateSubjectMeta = (subjId: string, title: string) =>
    setSubjects(prev => prev.map(s => s.id === subjId ? { ...s, title } : s));

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
    // Clear today's plan so it regenerates fresh; filter pending & revisions for this subject
    if (user?.email) {
      try {
        localStorage.removeItem(`@study_today_plan_v2_${user.email}`);
        const pendRaw = localStorage.getItem(`@study_pending_v2_${user.email}`);
        if (pendRaw) {
          const pend = JSON.parse(pendRaw);
          const filtered = Array.isArray(pend) ? pend.filter((t: any) => t.subjectId !== subjId) : [];
          localStorage.setItem(`@study_pending_v2_${user.email}`, JSON.stringify(filtered));
        }
        const revRaw = localStorage.getItem(`@study_revisions_v1_${user.email}`);
        if (revRaw) {
          const rev = JSON.parse(revRaw);
          const filtered = Array.isArray(rev) ? rev.filter((r: any) => r.subjectId !== subjId) : [];
          localStorage.setItem(`@study_revisions_v1_${user.email}`, JSON.stringify(filtered));
        }
      } catch { /* ignore */ }
    }
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
  };

  const toggleChapterComplete = (subjId: string, chId: string) => {
    setSubjects(prev => prev.map(s => {
      if (s.id !== subjId) return s;
      const updatedChapters = s.chapters.map(ch => {
        if (ch.id !== chId) return ch;
        // Manual completion: only toggle this chapter, do NOT cascade to children
        return { ...ch, completed: !ch.completed };
      });
      return checkSubjectCompletion({ ...s, chapters: updatedChapters });
    }));
  };

  const updateChapterMeta = (subjId: string, chId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) =>
    setSubjects(updateChapterFn(subjId, chId, ch => ({
      ...ch, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));

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
  };

  const toggleTopicComplete = (subjId: string, chId: string, tId: string) => {
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
  };

  const updateTopicMeta = (subjId: string, chId: string, tId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) =>
    setSubjects(updateTopicFn(subjId, chId, tId, t => ({
      ...t, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));

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
  };

  const toggleSubtopicComplete = (subjId: string, chId: string, tId: string, subId: string) => {
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
  };

  const updateSubtopicMeta = (subjId: string, chId: string, tId: string, subId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) =>
    setSubjects(updateSubtopicFn(subjId, chId, tId, subId, sub => ({
      ...sub, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));

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
  };

  const toggleConceptComplete = (subjId: string, chId: string, tId: string, subId: string, cId: string) => {
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
  };

  const updateConceptMeta = (subjId: string, chId: string, tId: string, subId: string, cId: string, title: string, estimatedMinutes?: number, difficulty?: DifficultyLevel) =>
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => ({
      ...c, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    })));

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
  };

  const togglePointComplete = (subjId: string, chId: string, tId: string, subId: string, cId: string, pId: string) => {
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => {
      const newPoints = c.points.map(p => p.id === pId ? { ...p, completed: !p.completed } : p);
      // Auto-complete concept only when overview done AND all points done
      const conceptDone = c.completed && newPoints.length > 0 && newPoints.every(p => p.completed);
      return { ...c, points: newPoints, completed: conceptDone };
    }));
  };

  const updatePointMeta = (subjId: string, chId: string, tId: string, subId: string, cId: string, pId: string, title: string, difficulty?: DifficultyLevel) =>
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => ({
      ...c, points: c.points.map(p => p.id === pId ? { ...p, title, ...(difficulty !== undefined ? { difficulty } : {}) } : p)
    })));

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

  const addTempNote = (text: string, parentId?: string | null) => {
    const newNote: TempNoteItem = {
      id: uid(),
      text: text.trim(),
      done: false,
      createdAt: Date.now(),
      children: [],
    };
    if (!newNote.text) return;
    if (!parentId) {
      // newest first
      setTempNotes(prev => [newNote, ...prev]);
      return;
    }
    setTempNotes(prev => mapTempTree(prev, n =>
      n.id === parentId ? { ...n, children: [newNote, ...(n.children || [])] } : n
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
    setNotePagesIndex(prev => prev.filter(p => p.id !== id));
    const lk = localPageKey(id);
    if (lk) localStorage.removeItem(lk);
    const ref = notePageDocRef(id);
    if (ref) {
      try { await deleteDoc(ref); } catch { /* ignore */ }
    }
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
        const remote: NotePage = {
          id: d.id ?? id,
          title: d.title ?? 'Untitled page',
          elements: d.elements || [],
          pageCount: d.pageCount ?? 1,
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
    const lk = localPageKey(page.id);
    if (lk) localStorage.setItem(lk, JSON.stringify(updated));
    // Update index meta
    setNotePagesIndex(prev => prev.map(p =>
      p.id === page.id
        ? { ...p, title: updated.title, pageCount: updated.pageCount, updatedAt: updated.updatedAt }
        : p
    ));
    const ref = notePageDocRef(page.id);
    if (ref) {
      try { await setDoc(ref, updated); } catch { /* offline – local saved */ }
    }
  };

  return (
    <StudyContext.Provider value={{
      subjects, settings, dataLoaded, syncing, online,
      setNote, toggleImportant, toggleWeak,
      setCourseTotalDays, setDailyStudyHours, setCourseStartDate,
      addSubject, updateSubjectDays, deleteSubject, updateSubjectMeta, resetSubjectProgress,
      reorderSubjects, reorderChapters, reorderTopics, reorderSubtopics, reorderConcepts, reorderPoints,
      addChapter, deleteChapter, toggleChapterComplete, updateChapterMeta,
      addTopic, deleteTopic, toggleTopicComplete, updateTopicMeta,
      addSubtopic, deleteSubtopic, toggleSubtopicComplete, updateSubtopicMeta,
      addConcept, deleteConcept, toggleConceptComplete, updateConceptMeta,
      addPoint, deletePoint, togglePointComplete, updatePointMeta,
      tempNotes, addTempNote, updateTempNote, toggleTempNoteDone, deleteTempNote,
      overallNote, setOverallNote,
      notePagesIndex, createNotePage, renameNotePage, deleteNotePage, loadNotePage, saveNotePage,
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
