import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, Download } from 'lucide-react';
import { useLang } from '@/context/LangContext';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { useLocation } from 'wouter';

export function PWAUpdater() {
  const { t } = useLang();
  const { canInstall, installApp } = usePWAInstall();
  const [location] = useLocation();
  const isAuthPage = location === '/auth';
  const [installDismissed, setInstallDismissed] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    setInstallDismissed(localStorage.getItem('@study_pwa_install_dismissed') === '1');
  }, []);

  // Register service worker (only in production builds where SW exists)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (import.meta.env.DEV) return;

    const onLoad = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');

        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
          setUpdateAvailable(true);
        }

        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(sw);
              setUpdateAvailable(true);
            }
          });
        });
      } catch {
        /* SW registration failed – app still works */
      }
    };

    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });

    let refreshing = false;
    const handler = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handler);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
  }, []);

  const dismissInstall = () => {
    setInstallDismissed(true);
    localStorage.setItem('@study_pwa_install_dismissed', '1');
  };

  const applyUpdate = () => {
    if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.button
          key="update"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          onClick={applyUpdate}
          className="fixed bottom-[100px] left-1/2 -translate-x-1/2 z-[55] bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold"
        >
          <RefreshCw size={14} />
          {t('updateAvailable')}
        </motion.button>
      )}

      {/* Install popup banner intentionally disabled — install button is inside the app */}
    </AnimatePresence>
  );
}
