import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Course {
  id: string;
  name: string;
  createdAt: number;
}

export interface DeletedCourse extends Course {
  deletedAt: number; // unix ms — expires after 1 year
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface CourseContextType {
  courses: Course[];
  deletedCourses: DeletedCourse[];
  activeCourseId: string | null;
  activeCourse: Course | null;
  coursesLoaded: boolean;
  needsCourseCreation: boolean;
  createCourse: (name: string) => Promise<string>;
  switchCourse: (courseId: string) => void;
  renameCourse: (courseId: string, name: string) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  restoreCourse: (courseId: string) => Promise<void>;
  permanentlyDeleteCourse: (courseId: string) => Promise<void>;
}

const CourseContext = createContext<CourseContextType | undefined>(undefined);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

function getActiveCourseIdFromStorage(email: string): string | null {
  try {
    return localStorage.getItem(`@study_activeCourse_${email}`);
  } catch {
    return null;
  }
}

function setActiveCourseIdInStorage(email: string, courseId: string) {
  try {
    localStorage.setItem(`@study_activeCourse_${email}`, courseId);
  } catch { /* ignore */ }
}

function clearTodayPlanForUser(email: string, courseId: string) {
  try {
    ['today_plan_v2', 'pending_v2', 'revisions_v1'].forEach(k => {
      localStorage.removeItem(`@study_${k}_${email}_${courseId}`);
      localStorage.removeItem(`@study_${k}_${email}`);
    });
  } catch { /* ignore */ }
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [deletedCourses, setDeletedCourses] = useState<DeletedCourse[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [coursesLoaded, setCoursesLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setCourses([]);
      setDeletedCourses([]);
      setActiveCourseId(null);
      setCoursesLoaded(false);
      return;
    }

    setCoursesLoaded(false);

    // Lifecycle guard: once this effect cleans up (user change/unmount), any
    // in-flight async work resolving later must not apply state.
    let active = true;
    let resolved = false;

    // ── Cold-start safety net ────────────────────────────────────────────────
    // On a freshly opened app (especially mobile, right after the device's
    // network/radio reconnects), Firestore's getDocs() can hang for a long
    // time before resolving or rejecting — there is no built-in timeout.
    // Without a fallback, coursesLoaded (and therefore activeCourseId) would
    // never be set, leaving the Today page stuck on its loading skeleton
    // forever, until the user manually reloads. If the real fetch hasn't
    // resolved within a short window, fall back to whatever we already have
    // cached in localStorage so the app always becomes usable; the real
    // fetch keeps running in the background and will silently reconcile
    // (via the `active`/`resolved` guards below) the moment it does resolve.
    const staleLoadTimer = setTimeout(() => {
      if (!active || resolved) return;
      resolved = true;
      const storedId = getActiveCourseIdFromStorage(user.email);
      const storedCoursesRaw = localStorage.getItem(`@study_coursesList_${user.email}`);
      let cachedCourses: Course[] = [];
      if (storedCoursesRaw) {
        try { cachedCourses = JSON.parse(storedCoursesRaw); } catch { /* ignore */ }
      }
      setCourses(cachedCourses);
      if (storedId && cachedCourses.find(c => c.id === storedId)) {
        setActiveCourseId(storedId);
      } else if (cachedCourses.length > 0) {
        setActiveCourseId(cachedCourses[0].id);
      }
      setCoursesLoaded(true);
    }, 6000);

    const loadCourses = async () => {
      try {
        // Load active courses
        const colRef = collection(db, 'users', user.id, 'courses');
        const snap = await getDocs(colRef);
        if (!active) return; // unmounted/user changed — discard
        const loaded: Course[] = snap.docs.map(d => d.data() as Course);
        loaded.sort((a, b) => a.createdAt - b.createdAt);
        setCourses(loaded);

        // Load deleted courses — filter out anything older than 1 year
        const now = Date.now();
        const delColRef = collection(db, 'users', user.id, 'deletedCourses');
        const delSnap = await getDocs(delColRef);
        const deletedLoaded: DeletedCourse[] = delSnap.docs
          .map(d => d.data() as DeletedCourse)
          .filter(c => now - c.deletedAt < ONE_YEAR_MS);

        // Purge expired ones from Firestore
        const expired = delSnap.docs.filter(d => {
          const c = d.data() as DeletedCourse;
          return now - c.deletedAt >= ONE_YEAR_MS;
        });
        for (const expDoc of expired) {
          const c = expDoc.data() as DeletedCourse;
          deleteDoc(doc(db, 'users', user.id, 'deletedCourses', c.id)).catch(() => {});
          deleteDoc(doc(db, 'users', user.id, 'studyData', c.id)).catch(() => {});
          deleteDoc(doc(db, 'users', user.id, 'todayData', c.id)).catch(() => {});
        }

        deletedLoaded.sort((a, b) => b.deletedAt - a.deletedAt);
        if (!active) return; // unmounted/user changed — discard
        setDeletedCourses(deletedLoaded);
        saveCoursesList(loaded, user.email);

        if (loaded.length > 0) {
          const storedId = getActiveCourseIdFromStorage(user.email);
          const validId = storedId && loaded.find(c => c.id === storedId) ? storedId : loaded[0].id;
          setActiveCourseId(validId);
          setActiveCourseIdInStorage(user.email, validId);
        } else {
          setActiveCourseId(null);
        }
      } catch {
        if (!active) return; // unmounted/user changed — discard
        const storedId = getActiveCourseIdFromStorage(user.email);
        if (storedId) {
          setActiveCourseId(storedId);
          const storedCoursesRaw = localStorage.getItem(`@study_coursesList_${user.email}`);
          if (storedCoursesRaw) {
            try {
              setCourses(JSON.parse(storedCoursesRaw));
            } catch { /* ignore */ }
          }
        }
      } finally {
        if (active) {
          resolved = true;
          clearTimeout(staleLoadTimer);
          setCoursesLoaded(true);
        }
      }
    };

    loadCourses();

    return () => {
      active = false; // prevent any in-flight async work from applying state
      clearTimeout(staleLoadTimer);
    };
  }, [user]);

  const saveCoursesList = (list: Course[], email: string) => {
    try {
      localStorage.setItem(`@study_coursesList_${email}`, JSON.stringify(list));
    } catch { /* ignore */ }
  };

  const createCourse = async (name: string): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    const id = uid();
    const course: Course = { id, name: name.trim(), createdAt: Date.now() };

    try {
      await setDoc(doc(db, 'users', user.id, 'courses', id), course);
      if (courses.length === 0) {
        const legacyRef = doc(db, 'users', user.id, 'studyData', 'main');
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          await setDoc(doc(db, 'users', user.id, 'studyData', id), legacySnap.data());

          // The old single-course document may reference a companion
          // "courseNotes/main" document (hasNotesDoc: true) holding all rich
          // text notes. That companion doc is keyed by course id, so it must
          // be migrated to "courseNotes/{id}" too — otherwise the notes
          // silently vanish: studyData copies over fine (structure/settings),
          // but the loader looks for courseNotes/{id}, finds nothing, and the
          // subjects show up with empty notes even though the real note
          // content still exists untouched under courseNotes/main.
          const legacyNotesRef = doc(db, 'users', user.id, 'courseNotes', 'main');
          const legacyNotesSnap = await getDoc(legacyNotesRef);
          if (legacyNotesSnap.exists()) {
            const notesData = legacyNotesSnap.data();
            await setDoc(doc(db, 'users', user.id, 'courseNotes', id), notesData);

            // If the notes map itself was too large for one document, its
            // content lives in a "chunks" subcollection under the notes doc —
            // copy those chunk documents over as well.
            if (notesData?.chunked) {
              const legacyChunksSnap = await getDocs(
                collection(db, 'users', user.id, 'courseNotes', 'main', 'chunks')
              );
              for (const chunkDoc of legacyChunksSnap.docs) {
                await setDoc(
                  doc(db, 'users', user.id, 'courseNotes', id, 'chunks', chunkDoc.id),
                  chunkDoc.data()
                );
              }
            }
          }
        }
        const legacyLsKey = `@study_data_${user.email}`;
        const legacyLsData = localStorage.getItem(legacyLsKey);
        if (legacyLsData) {
          localStorage.setItem(`@study_data_${id}_${user.email}`, legacyLsData);
        }
      }
    } catch { /* offline */ }

    const updated = [...courses, course];
    setCourses(updated);
    saveCoursesList(updated, user.email);
    setActiveCourseId(id);
    setActiveCourseIdInStorage(user.email, id);
    return id;
  };

  const switchCourse = (courseId: string) => {
    if (!user) return;
    const found = courses.find(c => c.id === courseId);
    if (!found) return;
    clearTodayPlanForUser(user.email, courseId);
    setActiveCourseId(courseId);
    setActiveCourseIdInStorage(user.email, courseId);
  };

  const renameCourse = async (courseId: string, name: string) => {
    if (!user) return;
    const updated = courses.map(c => c.id === courseId ? { ...c, name: name.trim() } : c);
    setCourses(updated);
    saveCoursesList(updated, user.email);
    try {
      await setDoc(doc(db, 'users', user.id, 'courses', courseId), { name: name.trim() }, { merge: true });
    } catch { /* offline */ }
  };

  /** Soft-delete: move course to trash. Study data is preserved. */
  const deleteCourse = async (courseId: string) => {
    if (!user) return;
    if (courses.length <= 1) throw new Error('Cannot delete the only course');

    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    const deletedCourse: DeletedCourse = { ...course, deletedAt: Date.now() };

    // Move to deleted list in state
    const updated = courses.filter(c => c.id !== courseId);
    setCourses(updated);
    saveCoursesList(updated, user.email);
    setDeletedCourses(prev => [deletedCourse, ...prev]);

    if (activeCourseId === courseId) {
      const next = updated[0];
      setActiveCourseId(next.id);
      setActiveCourseIdInStorage(user.email, next.id);
    }

    // Firestore: remove from courses, add to deletedCourses (studyData kept intact)
    try {
      await deleteDoc(doc(db, 'users', user.id, 'courses', courseId));
      await setDoc(doc(db, 'users', user.id, 'deletedCourses', courseId), deletedCourse);
    } catch { /* offline */ }
  };

  /** Restore a soft-deleted course back to active courses. */
  const restoreCourse = async (courseId: string) => {
    if (!user) return;
    const deleted = deletedCourses.find(c => c.id === courseId);
    if (!deleted) return;

    const { deletedAt: _deletedAt, ...course } = deleted;
    const restored: Course = course;

    const updatedDeleted = deletedCourses.filter(c => c.id !== courseId);
    setDeletedCourses(updatedDeleted);
    const updatedCourses = [...courses, restored].sort((a, b) => a.createdAt - b.createdAt);
    setCourses(updatedCourses);
    saveCoursesList(updatedCourses, user.email);

    try {
      await setDoc(doc(db, 'users', user.id, 'courses', courseId), restored);
      await deleteDoc(doc(db, 'users', user.id, 'deletedCourses', courseId));
    } catch { /* offline */ }
  };

  /** Permanently delete a trashed course and all its data. */
  const permanentlyDeleteCourse = async (courseId: string) => {
    if (!user) return;

    setDeletedCourses(prev => prev.filter(c => c.id !== courseId));

    try {
      await deleteDoc(doc(db, 'users', user.id, 'deletedCourses', courseId));
      await deleteDoc(doc(db, 'users', user.id, 'studyData', courseId));
      await deleteDoc(doc(db, 'users', user.id, 'todayData', courseId));
    } catch { /* offline */ }

    try {
      localStorage.removeItem(`@study_data_${courseId}_${user.email}`);
      ['today_plan_v2', 'pending_v2', 'revisions_v1'].forEach(k => {
        localStorage.removeItem(`@study_${k}_${user.email}_${courseId}`);
      });
    } catch { /* ignore */ }
  };

  const activeCourse = courses.find(c => c.id === activeCourseId) ?? null;
  const needsCourseCreation = coursesLoaded && courses.length === 0;

  return (
    <CourseContext.Provider value={{
      courses,
      deletedCourses,
      activeCourseId,
      activeCourse,
      coursesLoaded,
      needsCourseCreation,
      createCourse,
      switchCourse,
      renameCourse,
      deleteCourse,
      restoreCourse,
      permanentlyDeleteCourse,
    }}>
      {children}
    </CourseContext.Provider>
  );
}

export function useCourse() {
  const context = useContext(CourseContext);
  if (!context) throw new Error('useCourse must be used within CourseProvider');
  return context;
}
