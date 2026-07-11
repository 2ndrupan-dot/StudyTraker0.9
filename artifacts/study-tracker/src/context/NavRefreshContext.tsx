import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

interface NavRefreshContextType {
  registerRefresh: (path: string, fn: () => void) => void;
  unregisterRefresh: (path: string) => void;
  triggerRefresh: (path: string) => void;
  refreshingPath: string | null;
}

const NavRefreshContext = createContext<NavRefreshContextType | undefined>(undefined);

export function NavRefreshProvider({ children }: { children: React.ReactNode }) {
  const callbacks = useRef<Map<string, () => void>>(new Map());
  const [refreshingPath, setRefreshingPath] = useState<string | null>(null);

  const registerRefresh = useCallback((path: string, fn: () => void) => {
    callbacks.current.set(path, fn);
  }, []);

  const unregisterRefresh = useCallback((path: string) => {
    callbacks.current.delete(path);
  }, []);

  const triggerRefresh = useCallback((path: string) => {
    const fn = callbacks.current.get(path);
    if (!fn) return;
    setRefreshingPath(path);
    fn();
    setTimeout(() => setRefreshingPath(null), 700);
  }, []);

  return (
    <NavRefreshContext.Provider value={{ registerRefresh, unregisterRefresh, triggerRefresh, refreshingPath }}>
      {children}
    </NavRefreshContext.Provider>
  );
}

export function useNavRefresh() {
  const ctx = useContext(NavRefreshContext);
  if (!ctx) throw new Error('useNavRefresh must be used within NavRefreshProvider');
  return ctx;
}

export function useRegisterRefresh(path: string, fn: () => void) {
  const { registerRefresh, unregisterRefresh } = useNavRefresh();
  const fnRef = useRef(fn);
  fnRef.current = fn;

  React.useEffect(() => {
    registerRefresh(path, () => fnRef.current());
    return () => unregisterRefresh(path);
  }, [path, registerRefresh, unregisterRefresh]);
}
