import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LangProvider } from "./context/LangContext";
import { StudyProvider } from "./context/StudyContext";
import { Auth } from "./pages/Auth";
import { Today } from "./pages/Today";
import { Subjects } from "./pages/Subjects";
import { Progress } from "./pages/Progress";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user && location !== '/auth') {
      setLocation('/auth');
    }
  }, [user, loading, location, setLocation]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] max-w-md mx-auto bg-background p-5 pb-24">
        <div className="skeleton h-8 w-36 mb-6 mt-4" />
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="skeleton h-4 w-4 rounded-full" />
                <div className="skeleton h-4 flex-1 rounded" />
                <div className="skeleton h-4 w-12 rounded" />
              </div>
              <div className="skeleton h-2 w-full rounded-full" />
              <div className="flex gap-2">
                <div className="skeleton h-6 w-16 rounded-lg" />
                <div className="skeleton h-6 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-card/90 border-t border-border h-[68px] flex items-center justify-around px-4">
          {[1,2,3].map(i => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="skeleton h-6 w-6 rounded" />
              <div className="skeleton h-2.5 w-10 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!user) return null;
  return <Component />;
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

  if (loading) {
    return (
      <div className="min-h-[100dvh] max-w-md mx-auto bg-background p-5 pb-24">
        <div className="skeleton h-8 w-36 mb-6 mt-4" />
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-2 w-3/4 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/auth">
        {user ? <Redirect to="/today" /> : <Auth />}
      </Route>

      <Route path="/today"><ProtectedRoute component={Today} /></Route>
      <Route path="/subjects"><ProtectedRoute component={Subjects} /></Route>
      <Route path="/progress"><ProtectedRoute component={Progress} /></Route>

      <Route path="/">
        <Redirect to={user ? "/today" : "/auth"} />
      </Route>
      <Route path="/tabs">
        <Redirect to={user ? "/today" : "/auth"} />
      </Route>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <LangProvider>
        <AuthProvider>
          <StudyProvider>
            <Router />
          </StudyProvider>
        </AuthProvider>
      </LangProvider>
    </WouterRouter>
  );
}

export default App;
