import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, Download } from 'lucide-react';
import { useLang } from '@/context/LangContext';
import { usePWAInstall } from '@/context/PWAInstallContext';

export function PWAUpdater() {
  const { t } = useLang();
  const { canInstall, installApp } = usePWAInstall();
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

      {!updateAvailable && canInstall && !installDismissed && (
        <motion.div
          key="install"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className="fixed bottom-[100px] left-3 right-3 md:left-auto md:right-4 md:bottom-4 md:max-w-sm z-[55] bg-card border border-border/60 shadow-xl rounded-2xl p-3 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Download size={16} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-foreground">{t('installApp')}</div>
            <div className="text-[10px] text-muted-foreground line-clamp-2">{t('installAppDesc')}</div>
          </div>
          <button
            onClick={installApp}
            className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
          >
            {t('installBtn')}
          </button>
          <button onClick={dismissInstall} className="text-muted-foreground p-1">
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
