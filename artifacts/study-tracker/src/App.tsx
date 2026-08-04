import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LangProvider } from "./context/LangContext";
import { CourseProvider, useCourse } from "./context/CourseContext";
import { StudyProvider } from "./context/StudyContext";
import { TestProvider } from "./context/TestContext";
import { Auth } from "./pages/Auth";
import { Today } from "./pages/Today";
import { Subjects } from "./pages/Subjects";
import { Progress } from "./pages/Progress";
import { NotesIndex } from "./pages/NotesIndex";
import { NoteEditor } from "./pages/NoteEditor";
import { Test } from "./pages/Test";
import { TestRunner } from "./pages/TestRunner";
import { CreateCoursePage } from "./pages/CreateCoursePage";
import { AdminPanel } from "./pages/AdminPanel";
import { PWAUpdater } from "./components/PWAUpdater";
import { PWAInstallProvider } from "./context/PWAInstallContext";
import { AdminProvider } from "./context/AdminContext";
import { ContentProtectionGuard } from "./components/ContentProtectionGuard";
import { hideAppShell } from "./lib/appShell";
import { BrandedLoadingScreen } from "./components/BrandedLoadingScreen";

// Branded full-screen loader shown whenever auth/course data is still being
// fetched (e.g. right after a page reload). Reuses the same animated
// entrance (logo slide + fade → title fade → spinner fade) as the
// post-login transition in Auth.tsx, so app-open and post-login feel identical.
function LoadingScreen() {
  return <BrandedLoadingScreen className="fixed inset-0 z-50" />;
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

  useEffect(() => {
    if (!loading && coursesLoaded) {
      hideAppShell();
    }
  }, [loading, coursesLoaded]);

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
const RESTORABLE_ROUTES = ['/today', '/subjects', '/notes', '/test', '/progress'];

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

  useEffect(() => {
    if (!loading && !user) {
      hideAppShell();
    }
  }, [loading, user]);

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
        <Route path="/test/run"><ProtectedRoute component={TestRunner} /></Route>
        <Route path="/test"><ProtectedRoute component={Test} /></Route>
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
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <LangProvider>
        <AuthProvider>
          <PWAInstallProvider>
            <CourseProvider>
              <StudyProvider>
                <TestProvider>
                  <AdminProvider>
                    <ContentProtectionGuard />
                    <Router />
                    <PWAUpdater />
                  </AdminProvider>
                </TestProvider>
              </StudyProvider>
            </CourseProvider>
          </PWAInstallProvider>
        </AuthProvider>
      </LangProvider>
    </WouterRouter>
  );
}

export default App;
