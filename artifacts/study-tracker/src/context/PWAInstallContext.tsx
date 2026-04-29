import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallContextType {
  canInstall: boolean;
  isInstalled: boolean;
  installApp: () => Promise<void>;
}

const PWAInstallContext = createContext<PWAInstallContextType>({
  canInstall: false,
  isInstalled: false,
  installApp: async () => {},
});

export function PWAInstallProvider({ children }: { children: ReactNode }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const promptHandler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', promptHandler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', promptHandler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const installApp = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallEvent(null);
      setIsInstalled(true);
    }
  };

  return (
    <PWAInstallContext.Provider value={{
      canInstall: !!installEvent && !isInstalled,
      isInstalled,
      installApp,
    }}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstall() {
  return useContext(PWAInstallContext);
}
