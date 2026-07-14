import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LangProvider } from "./context/LangContext";
import { CourseProvider, useCourse } from "./context/CourseContext";
import { StudyProvider } from "./context/StudyContext";
import { Auth } from "./pages/Auth";
import { Today } from "./pages/Today";
import { Subjects } from "./pages/Subjects";
import { Progress } from "./pages/Progress";
import { NotesIndex } from "./pages/NotesIndex";
import { NoteEditor } from "./pages/NoteEditor";
import { CreateCoursePage } from "./pages/CreateCoursePage";
import { AdminPanel } from "./pages/AdminPanel";
import { PWAUpdater } from "./components/PWAUpdater";
import { PWAInstallProvider } from "./context/PWAInstallContext";
import { SplashScreen } from "./components/SplashScreen";
import { AdminProvider } from "./context/AdminContext";
import { ContentProtectionGuard } from "./components/ContentProtectionGuard";
import { BookOpen } from "lucide-react";

// Branded full-screen loader shown whenever auth/course data is still being
// fetched (e.g. right after a page reload). Replaces the old near-white
// skeleton so a reload never reads as a blank/broken white page — it always
// shows the app's own colors plus a spinner, on both mobile and desktop.
function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gradient-hero">
      <div className="relative">
        <div className="absolute inset-0 rounded-3xl bg-white/30 blur-xl scale-110" />
        <div className="relative w-16 h-16 bg-white/20 backdrop-blur-sm shadow-2xl rounded-3xl flex items-center justify-center border border-white/40">
          <BookOpen size={32} className="text-white drop-shadow-lg" />
        </div>
      </div>
      <div className="mt-6 w-8 h-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const { needsCourseCreation, coursesLoaded } = useCourse();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user && location !== '/auth') {
      setLocation('/auth');
    }
  }, [user, loading, location, setLocation]);

  if (loading || !coursesLoaded) {
    return <LoadingScreen />;
  }

  if (!user) return null;

  if (needsCourseCreation) {
    return <CreateCoursePage />;
  }

  return <Component />;
}

// ── Route persistence: remember last visited page across PWA reloads ──────────
const LAST_ROUTE_KEY = '@study_last_route';
const RESTORABLE_ROUTES = ['/today', '/subjects', '/progress'];

function RouteTracker() {
  const { user } = useAuth();
  const [location] = useLocation();
  useEffect(() => {
    // Reset scroll on every route change so sticky section headers (Today,
    // Subjects, Progress, Notes) always start recalculated from the top
    // instead of inheriting a stale offset that makes content appear to
    // slide under the header.
    window.scrollTo(0, 0);
  }, [location]);
  useEffect(() => {
    if (user && RESTORABLE_ROUTES.includes(location)) {
      localStorage.setItem(LAST_ROUTE_KEY, location);
    }
  }, [location, user]);
  return null;
}

function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [to, setLocation]);
  return null;
}

function Router() {
  const { user, loading } = useAuth();
  const [restored, setRestored] = useState(false);

  // On first authenticated load, go back to wherever the user was
  const savedRoute = !loading && user && !restored
    ? (() => {
        setRestored(true);
        const r = localStorage.getItem(LAST_ROUTE_KEY);
        return r && RESTORABLE_ROUTES.includes(r) ? r : '/today';
      })()
    : null;

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <RouteTracker />
      <Switch>
        <Route path="/auth">
          {user ? <Redirect to={savedRoute ?? '/today'} /> : <Auth />}
        </Route>

        <Route path="/today"><ProtectedRoute component={Today} /></Route>
        <Route path="/subjects"><ProtectedRoute component={Subjects} /></Route>
        <Route path="/progress"><ProtectedRoute component={Progress} /></Route>
        <Route path="/admin"><ProtectedRoute component={AdminPanel} /></Route>
        <Route path="/notes/:id"><ProtectedRoute component={NoteEditor} /></Route>
        <Route path="/notes"><ProtectedRoute component={NotesIndex} /></Route>
        <Route path="/">
          <Redirect to={user ? (savedRoute ?? '/today') : '/auth'} />
        </Route>
        <Route path="/tabs">
          <Redirect to={user ? (savedRoute ?? '/today') : '/auth'} />
        </Route>

        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
    </>
  );
}

function App() {
  return (
    <SplashScreen>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <LangProvider>
          <AuthProvider>
            <PWAInstallProvider>
              <CourseProvider>
                <StudyProvider>
                  <AdminProvider>
                    <ContentProtectionGuard />
                    <Router />
                    <PWAUpdater />
                  </AdminProvider>
                </StudyProvider>
              </CourseProvider>
            </PWAInstallProvider>
          </AuthProvider>
        </LangProvider>
      </WouterRouter>
    </SplashScreen>
  );
}

export default App;
