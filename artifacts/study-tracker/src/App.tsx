import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
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

type ConnectionState = "checking" | "online" | "offline";

async function hasInternetConnection(): Promise<boolean> {
  if (!navigator.onLine) return false;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1500);

  try {
    // navigator.onLine can remain true when a device is connected to Wi-Fi
    // without internet access. A no-cors request only checks reachability and
    // does not read or send any user data.
    await fetch("https://www.gstatic.com/generate_204", {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function OfflineScreen({ checking = false }: { checking?: boolean }) {
  const [isReloading, setIsReloading] = useState(false);

  const reload = () => {
    if (isReloading || checking) return;
    setIsReloading(true);
    window.setTimeout(() => window.location.reload(), 700);
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-indigo-100 bg-white/90 p-8 text-center shadow-xl shadow-indigo-100/60 backdrop-blur-sm">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 text-primary">
          <WifiOff size={40} strokeWidth={1.8} aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {checking ? "ইন্টারনেট সংযোগ পরীক্ষা করা হচ্ছে..." : "ইন্টারনেট সংযোগ নেই"}
        </h1>
        <p className="mt-3 text-base font-medium text-foreground/80">
          {checking ? "Checking your internet connection..." : "Please connect your internet and try again."}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {checking
            ? "অনুগ্রহ করে অপেক্ষা করুন।"
            : "আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন। সংযোগ ফিরে এলে নিচের বাটনে চাপ দিন।"}
        </p>
        <button
          type="button"
          onClick={reload}
          disabled={isReloading || checking}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw size={18} className={isReloading || checking ? "animate-spin" : ""} aria-hidden="true" />
          {checking
            ? "সংযোগ পরীক্ষা হচ্ছে... / Checking..."
            : isReloading
              ? "লোড হচ্ছে... / Loading..."
              : "Reload / পুনরায় লোড করুন"}
        </button>
      </div>
    </main>
  );
}

function OfflineGuard({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<ConnectionState>(() =>
    typeof navigator === "undefined"
      ? "checking"
      : navigator.onLine
        ? "checking"
        : "offline",
  );

  useEffect(() => {
    let active = true;

    const verifyConnection = async () => {
      if (!navigator.onLine) {
        if (active) setConnection("offline");
        return;
      }
      if (active) setConnection("checking");
      const reachable = await hasInternetConnection();
      if (active) setConnection(reachable ? "online" : "offline");
    };

    const handleOnline = () => {
      void verifyConnection();
    };
    const handleOffline = () => setConnection("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void verifyConnection();
    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (connection !== "online") {
    return <OfflineScreen checking={connection === "checking"} />;
  }
  return <>{children}</>;
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
    <OfflineGuard>
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
    </OfflineGuard>
  );
}

export default App;
