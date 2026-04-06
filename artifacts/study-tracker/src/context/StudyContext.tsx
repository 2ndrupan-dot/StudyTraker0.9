import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Subject, Chapter, Topic, Subtopic, Concept, Point, CourseSettings } from '@/lib/types';
import { useAuth } from './AuthContext';
import { addDays, formatISO } from 'date-fns';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { applyTimeAdjustment } from '@/lib/timeEngine';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

interface StudyData {
  subjects: Subject[];
  settings: CourseSettings;
  savedAt?: number;
}

interface StudyContextType {
  subjects: Subject[];
  settings: CourseSettings;
  dataLoaded: boolean;
  syncing: boolean;
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
  updateChapterMeta: (subjectId: string, chapterId: string, title: string, estimatedMinutes?: number) => void;
  addTopic: (subjectId: string, chapterId: string, topic: Omit<Topic, 'id' | 'completed' | 'subtopics'>) => void;
  deleteTopic: (subjectId: string, chapterId: string, topicId: string) => void;
  toggleTopicComplete: (subjectId: string, chapterId: string, topicId: string) => void;
  updateTopicMeta: (subjectId: string, chapterId: string, topicId: string, title: string, estimatedMinutes?: number) => void;
  addSubtopic: (subjectId: string, chapterId: string, topicId: string, subtopic: Omit<Subtopic, 'id' | 'completed' | 'concepts'>) => void;
  deleteSubtopic: (subjectId: string, chapterId: string, topicId: string, subtopicId: string) => void;
  toggleSubtopicComplete: (subjectId: string, chapterId: string, topicId: string, subtopicId: string) => void;
  updateSubtopicMeta: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, title: string, estimatedMinutes?: number) => void;
  addConcept: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, concept: Omit<Concept, 'id' | 'completed' | 'points'>) => void;
  deleteConcept: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string) => void;
  toggleConceptComplete: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string) => void;
  updateConceptMeta: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, title: string, estimatedMinutes?: number) => void;
  addPoint: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, point: Omit<Point, 'id' | 'completed'>) => void;
  deletePoint: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, pointId: string) => void;
  togglePointComplete: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, pointId: string) => void;
  updatePointMeta: (subjectId: string, chapterId: string, topicId: string, subtopicId: string, conceptId: string, pointId: string, title: string) => void;
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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [settings, setSettings] = useState<CourseSettings>({ courseTotalDays: null, dailyStudyHours: 3 });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  const localKey = (suffix: string) => user ? `@study_${suffix}_${user.email}` : null;

  // Load data from Firestore, comparing with localStorage to pick the freshest
  useEffect(() => {
    if (!user) {
      setSubjects([]);
      setSettings({ courseTotalDays: null, dailyStudyHours: 3 });
      setDataLoaded(false);
      isInitialLoad.current = true;
      return;
    }

    isInitialLoad.current = true;
    setDataLoaded(false);

    const docRef = doc(db, 'users', user.id, 'studyData', 'main');
    getDoc(docRef)
      .then(snap => {
        const fsData: StudyData | null = snap.exists()
          ? { subjects: snap.data().subjects || [], settings: snap.data().settings || {}, savedAt: snap.data().savedAt }
          : null;

        const lsRaw = localKey('data');
        const localData = lsRaw ? getLocalData(lsRaw) : null;

        // Also try legacy keys
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
          // Check if a scheduled reset is due (reset date has passed)
          if (loadedSettings.resetScheduled && loadedSettings.courseStartDate) {
            const startDate = new Date(loadedSettings.courseStartDate);
            startDate.setHours(0, 0, 0, 0);
            const now = new Date();
            if (now >= startDate) {
              const resetResult = doResetProgress(loadedSubjects, loadedSettings, user?.email);
              loadedSubjects = resetResult.subjects;
              loadedSettings.resetScheduled = false;
            }
          }
          setSubjects(loadedSubjects);
          setSettings(prev => ({ ...prev, ...loadedSettings }));
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
      })
      .catch(() => {
        const lsRaw = localKey('data');
        const localData = lsRaw ? getLocalData(lsRaw) : null;
        if (localData) {
          setSubjects(localData.subjects || []);
          setSettings(prev => ({ ...prev, ...localData.settings }));
        }
      })
      .finally(() => {
        setDataLoaded(true);
        setTimeout(() => { isInitialLoad.current = false; }, 100);
      });
  }, [user]);

  // Save data (debounced for Firestore, immediate for localStorage)
  const pendingSaveRef = useRef<{ subjects: Subject[]; settings: CourseSettings } | null>(null);

  const flushSave = async (subjectsToSave: Subject[], settingsToSave: CourseSettings) => {
    if (!user) return;
    const payload: StudyData = { subjects: subjectsToSave, settings: settingsToSave, savedAt: Date.now() };
    const lsKey = localKey('data');
    if (lsKey) localStorage.setItem(lsKey, JSON.stringify(payload));
    try {
      const docRef = doc(db, 'users', user.id, 'studyData', 'main');
      await setDoc(docRef, payload, { merge: false });
    } catch { /* localStorage backup already done */ }
    setSyncing(false);
  };

  useEffect(() => {
    if (!user || !dataLoaded || isInitialLoad.current) return;

    // Save to localStorage immediately (synchronous, always up to date)
    const payload: StudyData = { subjects, settings, savedAt: Date.now() };
    const lsKey = localKey('data');
    if (lsKey) localStorage.setItem(lsKey, JSON.stringify(payload));

    // Debounce the Firestore save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSyncing(true);
    pendingSaveRef.current = { subjects, settings };
    saveTimerRef.current = setTimeout(() => {
      const pending = pendingSaveRef.current;
      if (pending) flushSave(pending.subjects, pending.settings);
    }, 400);
  }, [subjects, settings, user, dataLoaded]);

  // Flush save immediately before page unload
  useEffect(() => {
    const handleUnload = () => {
      if (pendingSaveRef.current && user) {
        const { subjects: s, settings: st } = pendingSaveRef.current;
        const payload: StudyData = { subjects: s, settings: st, savedAt: Date.now() };
        const lsKey = `@study_data_${user.email}`;
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
    completed: s.chapters.length > 0 && s.chapters.every(ch => ch.completed),
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

  const updateChapterMeta = (subjId: string, chId: string, title: string, estimatedMinutes?: number) =>
    setSubjects(updateChapterFn(subjId, chId, ch => ({
      ...ch, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
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
          const allDone = newTopics.length > 0 && newTopics.every(t => t.completed);
          return { ...ch, topics: newTopics, completed: allDone };
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
        // Auto-complete chapter if all topics are done
        const allDone = newTopics.length > 0 && newTopics.every(t => t.completed);
        return { ...ch, topics: newTopics, completed: allDone };
      });
      return checkSubjectCompletion({ ...s, chapters: newChapters });
    }));
  };

  const updateTopicMeta = (subjId: string, chId: string, tId: string, title: string, estimatedMinutes?: number) =>
    setSubjects(updateTopicFn(subjId, chId, tId, t => ({
      ...t, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
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
          // Auto-complete topic if all subtopics are done
          const allSubsDone = newSubs.length > 0 && newSubs.every(sub => sub.completed);
          return { ...t, subtopics: newSubs, completed: t.completed || allSubsDone };
        });
        const allTopicsDone = newTopics.length > 0 && newTopics.every(t => t.completed);
        return { ...ch, topics: newTopics, completed: allTopicsDone };
      });
      return checkSubjectCompletion({ ...s, chapters: newChapters });
    }));
  };

  const updateSubtopicMeta = (subjId: string, chId: string, tId: string, subId: string, title: string, estimatedMinutes?: number) =>
    setSubjects(updateSubtopicFn(subjId, chId, tId, subId, sub => ({
      ...sub, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
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
      // Auto-complete subtopic if all concepts are done
      const allDone = newConcepts.length > 0 && newConcepts.every(c => c.completed);
      return { ...sub, concepts: newConcepts, completed: sub.completed || allDone };
    }));
  };

  const updateConceptMeta = (subjId: string, chId: string, tId: string, subId: string, cId: string, title: string, estimatedMinutes?: number) =>
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => ({
      ...c, title,
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
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
      const allDone = newPoints.length > 0 && newPoints.every(p => p.completed);
      return { ...c, points: newPoints, completed: allDone };
    }));
  };

  const updatePointMeta = (subjId: string, chId: string, tId: string, subId: string, cId: string, pId: string, title: string) =>
    setSubjects(updateConceptFn(subjId, chId, tId, subId, cId, c => ({
      ...c, points: c.points.map(p => p.id === pId ? { ...p, title } : p)
    })));

  return (
    <StudyContext.Provider value={{
      subjects, settings, dataLoaded, syncing,
      setCourseTotalDays, setDailyStudyHours, setCourseStartDate,
      addSubject, updateSubjectDays, deleteSubject, updateSubjectMeta,
      addChapter, deleteChapter, toggleChapterComplete, updateChapterMeta,
      addTopic, deleteTopic, toggleTopicComplete, updateTopicMeta,
      addSubtopic, deleteSubtopic, toggleSubtopicComplete, updateSubtopicMeta,
      addConcept, deleteConcept, toggleConceptComplete, updateConceptMeta,
      addPoint, deletePoint, togglePointComplete, updatePointMeta,
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
