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

interface CourseContextType {
  courses: Course[];
  activeCourseId: string | null;
  activeCourse: Course | null;
  coursesLoaded: boolean;
  needsCourseCreation: boolean;
  createCourse: (name: string) => Promise<string>;
  switchCourse: (courseId: string) => void;
  renameCourse: (courseId: string, name: string) => Promise<void>;
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
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [coursesLoaded, setCoursesLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setCourses([]);
      setActiveCourseId(null);
      setCoursesLoaded(false);
      return;
    }

    setCoursesLoaded(false);

    const loadCourses = async () => {
      try {
        const colRef = collection(db, 'users', user.id, 'courses');
        const snap = await getDocs(colRef);
        const loaded: Course[] = snap.docs.map(d => d.data() as Course);
        loaded.sort((a, b) => a.createdAt - b.createdAt);
        setCourses(loaded);

        if (loaded.length > 0) {
          const storedId = getActiveCourseIdFromStorage(user.email);
          const validId = storedId && loaded.find(c => c.id === storedId) ? storedId : loaded[0].id;
          setActiveCourseId(validId);
          setActiveCourseIdInStorage(user.email, validId);
        } else {
          setActiveCourseId(null);
        }
      } catch {
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
        setCoursesLoaded(true);
      }
    };

    loadCourses();
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
      // Migrate existing data from legacy 'main' doc on first course creation
      if (courses.length === 0) {
        const legacyRef = doc(db, 'users', user.id, 'studyData', 'main');
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
          await setDoc(doc(db, 'users', user.id, 'studyData', id), legacySnap.data());
        }
        // Also migrate localStorage
        const legacyLsKey = `@study_data_${user.email}`;
        const legacyLsData = localStorage.getItem(legacyLsKey);
        if (legacyLsData) {
          localStorage.setItem(`@study_data_${id}_${user.email}`, legacyLsData);
        }
      }
    } catch { /* offline, save locally */ }

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

  const activeCourse = courses.find(c => c.id === activeCourseId) ?? null;
  const needsCourseCreation = coursesLoaded && courses.length === 0;

  return (
    <CourseContext.Provider value={{
      courses,
      activeCourseId,
      activeCourse,
      coursesLoaded,
      needsCourseCreation,
      createCourse,
      switchCourse,
      renameCourse,
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
