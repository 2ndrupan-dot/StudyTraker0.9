import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Target, BookOpen, CheckCircle2, GraduationCap, Cloud, CloudOff, AlertCircle, Search, Download, Share2, Check, FileText, User as UserIcon, Headset, ClipboardList, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/context/LangContext';
import { useStudy } from '@/context/StudyContext';
import { useTest } from '@/context/TestContext';
import { retrySaveFailure, useSaveStatus } from '@/lib/saveStatus';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { useAdmin } from '@/context/AdminContext';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalSearch } from './GlobalSearch';
import { ConfirmModal } from '@/components/ui';

export function Layout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Desktop: sidebar layout */}
      <div className="hidden md:flex min-h-[100dvh] bg-background">
        <SideNav onSearch={() => setSearchOpen(true)} />
        <main className="flex-1 ml-64 min-h-[100dvh]">
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Mobile: full-screen with bottom nav */}
      <div className="md:hidden w-full min-h-[100dvh] bg-background relative overflow-x-clip pb-[80px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
        <BottomNav onSearchClick={() => setSearchOpen(true)} />
      </div>

      {/* Online / Sync status */}
      <ConnectionStatus isProfilePage={location === '/progress'} />
      <LocalNotesRecoveryNotice />
      <LocalTestCardRecoveryNotice />

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

const LOCAL_NOTES_RECOVERY_EXPANDED_KEY = 'studytrack-local-notes-recovery-expanded';

function LocalNotesRecoveryNotice() {
  const {
    localNotesRecoveryCount,
    localNotesRecoveryItems,
    restoreLocalNotes,
    dismissLocalNotesRecovery,
    online,
    syncStatus,
  } = useStudy();
  const { t, lang } = useLang();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ type: 'restore' | 'dismiss'; keys: string[] } | null>(null);
  const [restoreFeedback, setRestoreFeedback] = useState<'syncing' | 'saved' | 'failed' | null>(null);
  const [expanded, setExpanded] = useState(() => {
    try {
      return sessionStorage.getItem(LOCAL_NOTES_RECOVERY_EXPANDED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (localNotesRecoveryCount < 1) {
      setExpanded(false);
      try {
        sessionStorage.removeItem(LOCAL_NOTES_RECOVERY_EXPANDED_KEY);
      } catch {
        // The notice remains collapsed in this component if storage is unavailable.
      }
    }
  }, [localNotesRecoveryCount]);

  useEffect(() => {
    const currentKeys = new Set(localNotesRecoveryItems.map(item => item.key));
    setSelectedKeys(keys => keys.filter(key => currentKeys.has(key)));
  }, [localNotesRecoveryItems]);

  if (localNotesRecoveryCount < 1) return null;

  const allSelected = localNotesRecoveryItems.length > 0 &&
    localNotesRecoveryItems.every(item => selectedKeys.includes(item.key));
  const restoreDisabled = !online || syncStatus === 'syncing' || restoreFeedback === 'syncing';
  const toggleSelected = (key: string) => {
    setSelectedKeys(keys => keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key]);
  };
  const askRestore = (keys: string[]) => setConfirmAction({ type: 'restore', keys });
  const askDismiss = (keys: string[]) => setConfirmAction({ type: 'dismiss', keys });
  const runRestore = async (keys: string[]) => {
    setRestoreFeedback('syncing');
    const saved = await restoreLocalNotes(keys);
    setRestoreFeedback(saved ? 'saved' : 'failed');
    window.setTimeout(() => setRestoreFeedback(null), 3000);
  };
  const submitConfirmedAction = () => {
    if (!confirmAction) return;
    const { type, keys } = confirmAction;
    setSelectedKeys(selected => selected.filter(key => !keys.includes(key)));
    if (type === 'restore') {
      void runRestore(keys);
    } else {
      void dismissLocalNotesRecovery(keys);
    }
    setConfirmAction(null);
  };

  const hideNotice = () => {
    setExpanded(false);
    try {
      sessionStorage.removeItem(LOCAL_NOTES_RECOVERY_EXPANDED_KEY);
    } catch {
      // Keep the current component state even if session storage is unavailable.
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          try {
            sessionStorage.setItem(LOCAL_NOTES_RECOVERY_EXPANDED_KEY, 'true');
          } catch {
            // Keep the current component state even if session storage is unavailable.
          }
        }}
        aria-label={t('showLocalNotesRecovery')}
        title={t('showLocalNotesRecovery')}
        className="fixed bottom-[92px] right-3 z-50 inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-amber-300 bg-amber-600 px-3 text-white shadow-lg hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <AlertCircle size={18} />
        <span className="ml-1 text-xs font-bold">{localNotesRecoveryCount}</span>
      </button>
    );
  }

  return (
    <div
      role="status"
      className="fixed top-10 left-2 right-2 z-40 mx-auto flex max-w-xl flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 shadow-lg sm:flex-row sm:items-start sm:justify-between dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="flex min-w-0 items-start justify-between gap-2 sm:flex-1">
        <p className="m-0 min-w-0 flex-1 leading-snug">
          {t('localNotesRecoveryMessage').replace('{count}', String(localNotesRecoveryCount))}
        </p>
        <button
          type="button"
          onClick={hideNotice}
          aria-label={t('hideLocalNotesRecovery')}
          title={t('hideLocalNotesRecovery')}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-900 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:w-64 sm:shrink-0 sm:items-end">
        <button
          type="button"
          onClick={() => setDetailsOpen(value => !value)}
          aria-expanded={detailsOpen}
          className="self-start rounded-lg border border-amber-400/70 px-3 py-2 font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-amber-100 dark:hover:bg-amber-900 sm:self-auto"
        >
          {detailsOpen ? t('hideLocalNotesRecoveryDetails') : t('localNotesRecoveryDetails')}
        </button>
        {detailsOpen && (
          <div className="w-full rounded-lg border border-amber-300/70 bg-white/50 p-2 dark:border-amber-800 dark:bg-black/10">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                {lang === 'bn' ? `${localNotesRecoveryItems.length}টি নোট` : `${localNotesRecoveryItems.length} notes`}
              </span>
              <button
                type="button"
                onClick={() => setSelectedKeys(allSelected ? [] : localNotesRecoveryItems.map(item => item.key))}
                className="text-xs font-semibold underline underline-offset-2"
              >
                {allSelected ? t('deselectAllRecoveryNotes') : t('selectAllRecoveryNotes')}
              </button>
            </div>
            <ol className="max-h-48 space-y-1 overflow-y-auto">
              {localNotesRecoveryItems.map((item, index) => (
                <li key={item.key} className="flex items-center gap-1.5 rounded-md px-1 py-1.5 hover:bg-amber-100/70 dark:hover:bg-amber-900/30">
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-amber-800/70 dark:text-amber-200/70">
                    {index + 1}.
                  </span>
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(item.key)}
                    onChange={() => toggleSelected(item.key)}
                    aria-label={`${lang === 'bn' ? 'নির্বাচন করুন' : 'Select'}: ${item.key === 'overall-note' ? t('overallNotes') : item.title}`}
                    className="h-4 w-4 shrink-0 accent-amber-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">
                      {item.key === 'overall-note' ? t('overallNotes') : item.title}
                    </p>
                    {item.breadcrumb.length > 0 && (
                      <p className="truncate text-[10px] opacity-70">{item.breadcrumb.join(' › ')}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => askDismiss([item.key])}
                    aria-label={`${lang === 'bn' ? 'রিস্টোর তালিকা থেকে বাদ দিন' : 'Remove from restore list'}: ${item.key === 'overall-note' ? t('overallNotes') : item.title}`}
                    title={lang === 'bn' ? 'রিস্টোর তালিকা থেকে বাদ দিন' : 'Remove from restore list'}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => askRestore([item.key])}
                    disabled={restoreDisabled}
                    aria-label={`${lang === 'bn' ? 'রিস্টোর করুন' : 'Restore'}: ${item.key === 'overall-note' ? t('overallNotes') : item.title}`}
                    title={lang === 'bn' ? 'রিস্টোর করুন' : 'Restore'}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                  >
                    <Check size={14} />
                  </button>
                </li>
              ))}
            </ol>
            {selectedKeys.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 border-t border-amber-300/60 pt-2 dark:border-amber-800">
                <button
                  type="button"
                  onClick={() => askRestore(selectedKeys)}
                  disabled={restoreDisabled}
                  className="flex-1 rounded-lg bg-amber-700 px-2 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-amber-300 dark:text-amber-950"
                >
                  {t('restoreSelectedRecoveryNotes')} ({selectedKeys.length})
                </button>
                <button
                  type="button"
                  onClick={() => askDismiss(selectedKeys)}
                  className="flex-1 rounded-lg bg-rose-700/10 px-2 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-700/20 dark:text-rose-200"
                >
                  {t('deleteSelectedRecoveryNotes')} ({selectedKeys.length})
                </button>
              </div>
            )}
          </div>
        )}
        {restoreFeedback && (
          <p role="status" className="text-xs font-semibold" aria-live="polite">
            {restoreFeedback === 'syncing' ? t('syncing') : restoreFeedback === 'saved' ? t('syncSaved') : t('syncFailed')}
          </p>
        )}
        <button
          type="button"
          disabled={restoreDisabled}
          onClick={() => askRestore(localNotesRecoveryItems.map(item => item.key))}
          className="w-full shrink-0 rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-300 dark:text-amber-950 sm:w-auto"
        >
          {online ? t('restoreLocalNotes') : t('restoreLocalNotesOffline')}
        </button>
      </div>
      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={submitConfirmedAction}
        title={confirmAction?.type === 'restore' ? t('confirmRestoreRecoveryNotesTitle') : t('confirmDismissRecoveryNotesTitle')}
        message={(confirmAction?.type === 'restore'
          ? t('confirmRestoreRecoveryNotesMessage')
          : t('confirmDismissRecoveryNotesMessage')
        ).replace('{count}', String(confirmAction?.keys.length ?? 0))}
        confirmText={t('confirmRecoveryAction')}
        cancelText={t('cancelRecoveryAction')}
        isDanger={confirmAction?.type === 'dismiss'}
      />
    </div>
  );
}

function LocalTestCardRecoveryNotice() {
  const { localTestRecoveryItems, restoreLocalTestCards } = useTest();
  const { subjects, online } = useStudy();
  const { t, lang } = useLang();
  const [expanded, setExpanded] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'saved' | 'failed' | null>(null);

  if (localTestRecoveryItems.length === 0) return null;

  const restore = async (key: string) => {
    setRestoringKey(key);
    setFeedback(null);
    const restored = await restoreLocalTestCards([key]);
    setFeedback(restored ? 'saved' : 'failed');
    setRestoringKey(null);
    window.setTimeout(() => setFeedback(null), 3500);
  };

  return (
    <>
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('showLocalTestRecovery')}
          title={t('showLocalTestRecovery')}
          className="fixed bottom-[144px] right-3 z-50 inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-sky-300 bg-sky-700 px-3 text-white shadow-lg hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <AlertCircle size={18} />
          <span className="ml-1 text-xs font-bold">{localTestRecoveryItems.length}</span>
        </button>
      ) : (
        <section
          role="status"
          className="fixed bottom-[144px] right-2 z-50 flex max-h-[min(60vh,28rem)] w-[min(23rem,calc(100vw-1rem))] flex-col gap-2 overflow-hidden rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950 shadow-xl dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
        >
          <header className="flex items-center justify-between gap-2">
            <p className="m-0 font-semibold">
              {t('localTestRecoveryMessage').replace('{count}', String(localTestRecoveryItems.length))}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label={t('hideLocalTestRecovery')}
              title={t('hideLocalTestRecovery')}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:hover:bg-sky-900"
            >
              <X size={16} />
            </button>
          </header>
          <ol className="min-h-0 space-y-1 overflow-y-auto">
            {localTestRecoveryItems.map(item => {
              const subjectTitle = subjects.find(subject => subject.id === item.subjectId)?.title ?? item.subjectId;
              return (
                <li key={item.key} className="flex items-center gap-2 rounded-lg bg-white/60 p-2 dark:bg-black/10">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-xs font-semibold">{item.title}</p>
                    <p className="m-0 truncate text-[10px] opacity-70">
                      {subjectTitle}{item.personal ? ` · ${t('personalTestCards')}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void restore(item.key)}
                    disabled={!online || restoringKey !== null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-700 px-2.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-300 dark:text-sky-950"
                  >
                    {restoringKey === item.key ? <RotateCcw size={13} className="animate-spin" /> : <Check size={13} />}
                    {online ? t('restoreLocalTestCard') : t('restoreLocalNotesOffline')}
                  </button>
                </li>
              );
            })}
          </ol>
          {feedback && (
            <p role="status" aria-live="polite" className="m-0 text-xs font-semibold">
              {feedback === 'saved' ? t('localTestRecoverySaved') : t('localTestRecoveryFailed')}
            </p>
          )}
        </section>
      )}
    </>
  );
}

function FloatingSearchButton({ onClick }: { onClick: () => void }) {
  const { t } = useLang();
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-label={t('searchTitle')}
      className="md:hidden fixed bottom-[88px] right-4 z-40 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
    >
      <Search size={20} strokeWidth={2.4} />
    </motion.button>
  );
}

function ConnectionStatus({ isProfilePage }: { isProfilePage: boolean }) {
  const { syncStatus, syncError, online } = useStudy();
  const { pending, failures, lastSuccessAt } = useSaveStatus();
  const { t } = useLang();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [failuresOpen, setFailuresOpen] = useState(false);
  const wasOfflineRef = React.useRef(false);
  const lastSuccessSeenRef = React.useRef(lastSuccessAt);

  useEffect(() => {
    // Layout is mounted separately by each page. Ignore a success that
    // happened before this instance mounted, otherwise tab navigation replays
    // the previous "Saved" message.
    if (!lastSuccessAt || lastSuccessAt === lastSuccessSeenRef.current) return;
    lastSuccessSeenRef.current = lastSuccessAt;
    setShowSaved(true);
    const id = window.setTimeout(() => setShowSaved(false), 2500);
    return () => window.clearTimeout(id);
  }, [lastSuccessAt]);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
      setShowBackOnline(true);
      const id = setTimeout(() => {
        setShowBackOnline(false);
        wasOfflineRef.current = false;
      }, 2500);
      return () => clearTimeout(id);
    }
    return;
  }, [online]);

  const visible = !online ||
    showBackOnline ||
    syncStatus === 'syncing' ||
    syncStatus === 'failed' ||
    pending > 0 ||
    failures.length > 0 ||
    showSaved;
  if (!visible) return null;

  const visibleFailures = failures.length > 0
    ? failures
    : syncStatus === 'failed'
      ? [{ id: 'study-context-failure', label: t('saveOperation'), message: syncError || t('syncFailed'), failedAt: Date.now() }]
      : [];
  const retryFailure = (id: string) => {
    setFailuresOpen(false);
    void retrySaveFailure(id);
  };
  const activeSaveCount = Math.max(pending, syncStatus === 'syncing' ? 1 : 0);

  let label = '';
  let Icon: React.ElementType = Cloud;
  let cls = '';
  let spinning = false;

  if (visibleFailures.length > 0) {
    label = t('syncFailed');
    Icon = AlertCircle;
    cls = 'bg-red-600 text-white border-red-700 shadow-red-500/30';
  } else if (!online) {
    label = t('offline');
    Icon = CloudOff;
    cls = 'bg-red-600 text-white border-red-700 shadow-red-500/30';
  } else if (activeSaveCount > 0) {
    label = t('syncing');
    cls = 'bg-white/90 text-slate-600 border-slate-200 shadow-slate-300/40 backdrop-blur-sm';
    spinning = true;
  } else if (showBackOnline) {
    label = t('online');
    Icon = Cloud;
    cls = 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-400/30';
  } else if (showSaved) {
    label = t('syncSaved');
    Icon = Check;
    cls = 'bg-emerald-500 text-white border-emerald-600 shadow-emerald-400/30';
  }

  return (
    <AnimatePresence>
      <motion.div
        key={label}
        initial={{ opacity: 0, y: -12, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.9 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="fixed top-0.5 right-2 z-50 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2 md:top-2"
      >
        <button
          type="button"
          onClick={() => visibleFailures.length > 0 && setFailuresOpen(open => !open)}
          aria-expanded={visibleFailures.length > 0 ? failuresOpen : undefined}
          aria-label={visibleFailures.length > 0 ? `${label}. ${t('syncFailureDetails')}` : label}
          className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm',
            isProfilePage && 'py-0',
            visibleFailures.length > 0 ? 'cursor-pointer' : 'cursor-default',
            cls
          )}
        >
          {spinning ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="h-2 w-2 rounded-full border border-slate-400 border-t-transparent"
            />
          ) : (
            <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
          )}
          <span>{label}</span>
          {visibleFailures.length > 1 && <span className="hidden md:inline">({visibleFailures.length})</span>}
        </button>

        <AnimatePresence>
          {failuresOpen && visibleFailures.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              role="region"
              aria-label={t('syncFailureDetails')}
              className="w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-red-200 bg-white p-3 text-slate-800 shadow-xl dark:border-red-900 dark:bg-slate-950 dark:text-slate-100"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="m-0 text-xs font-bold text-red-700 dark:text-red-300">{t('syncFailureDetails')}</h2>
                <button
                  type="button"
                  onClick={() => setFailuresOpen(false)}
                  aria-label={t('dismissSyncFailure')}
                  title={t('dismissSyncFailure')}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-300 dark:hover:bg-red-900"
                >
                  <X size={16} />
                </button>
              </div>
              <ul className="m-0 flex max-h-[60vh] list-none flex-col gap-2 overflow-y-auto p-0">
                {visibleFailures.map(failure => (
                  <li key={failure.id} className="rounded-lg bg-red-50 p-2.5 text-xs dark:bg-red-950/50">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="leading-snug text-red-800 dark:text-red-200">{failure.label}</strong>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => retryFailure(failure.id)}
                          disabled={!failure.retry}
                          aria-label={t('retrySave')}
                          title={failure.retry ? t('retrySave') : t('retryUnavailable')}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-45 dark:text-red-300 dark:hover:bg-red-900"
                        >
                          <RotateCcw size={12} />
                          {t('retrySave')}
                        </button>
                      </div>
                    </div>
                    {!failure.retry && (
                      <p className="mb-0 mt-1 text-[10px] text-red-700 dark:text-red-300">
                        {t('retryUnavailable')}
                      </p>
                    )}
                    {(failure.occurrences ?? 1) > 1 && (
                      <p className="mb-0 mt-1 text-[10px] font-medium text-red-700 dark:text-red-300">
                        {t('saveOccurrences').replace('{count}', String(failure.occurrences))}
                      </p>
                    )}
                    <p className="mb-0 mt-1 whitespace-pre-wrap break-words leading-relaxed text-red-700 dark:text-red-200">
                      {failure.message}
                    </p>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function InstallSection() {
  const { t } = useLang();
  const { canInstall, isInstalled, installApp } = usePWAInstall();
  const { appContact } = useAdmin();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Learning Sathi', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* ignore */ }
    }
  };

  // Once the app is already installed there's nothing left to install/share
  // here — replace this slot with a Contact button instead of leaving it
  // empty, so installed-app users still have a way to reach support.
  if (isInstalled) {
    if (!appContact.supportLink) return null;
    return (
      <button
        onClick={() => window.open(appContact.supportLink, '_blank', 'noopener,noreferrer')}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/15 text-white hover:bg-white/25 transition-colors border border-white/15"
      >
        <Headset size={14} />
        <span>{t('contactSupport')}</span>
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {canInstall && (
        <button
          onClick={installApp}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/15 text-white hover:bg-white/25 transition-colors border border-white/15"
        >
          <Download size={14} />
          <span>{t('installApp')}</span>
        </button>
      )}
      <button
        onClick={handleShare}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
      >
        {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
        <span>{copied ? t('linkCopied') : t('shareInstallLink')}</span>
      </button>
    </div>
  );
}

function NavItem({ path, icon: Icon, label }: { path: string; icon: any; label: string }) {
  const [location, setLocation] = useLocation();
  const isActive = location === path || (location === '/tabs' && path === '/today') || (path !== '/today' && location.startsWith(path + '/'));

  const handleClick = () => {
    if (!isActive) {
      setLocation(path);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200",
        isActive
          ? "bg-white/15 text-white shadow-sm border border-white/20"
          : "text-white/55 hover:bg-white/10 hover:text-white/85"
      )}
    >
      <div>
        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
      </div>
      <span>{label}</span>
      {isActive && (
        <motion.div
          layoutId="sidebar-indicator"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-white"
        />
      )}
    </button>
  );
}

function SideNav({ onSearch }: { onSearch: () => void }) {
  const { t } = useLang();

  const tabs = [
    { path: '/today', icon: CheckCircle2, label: t('today') },
    { path: '/subjects', icon: BookOpen, label: t('subjects') },
    { path: '/notes', icon: FileText, label: t('notesTab') },
    { path: '/test', icon: ClipboardList, label: t('testTab') },
    { path: '/progress', icon: UserIcon, label: t('profileTab') },
  ];

  return (
    <div className="fixed left-0 top-0 bottom-0 w-64 gradient-sidebar flex flex-col z-30 shadow-xl">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl glass-dark flex items-center justify-center glow-sm border border-white/20">
            <GraduationCap size={22} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-base leading-tight tracking-tight">Learning Sathi</h1>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="p-3 pb-1">
        <button
          type="button"
          onClick={onSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl glass-dark border border-white/15 text-white/60 hover:text-white/90 hover:border-white/25 text-xs font-medium transition-all"
        >
          <Search size={14} />
          <span className="flex-1 text-left">{t('searchPlaceholder')}</span>
          <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[9px] font-bold text-white/50">⌘K</kbd>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1">
        {tabs.map(tab => (
          <NavItem key={tab.path} {...tab} />
        ))}
      </nav>

      {/* Footer: install + share */}
      <div className="p-3 border-t border-white/10 space-y-2">
        <InstallSection />
        <p className="text-[10px] text-white/30 text-center pt-1">Learning Sathi v2.0</p>
      </div>
    </div>
  );
}

function MobileInstallButton() {
  const { t } = useLang();
  const { canInstall, isInstalled, installApp } = usePWAInstall();
  const { appContact } = useAdmin();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Once installed there's nothing to install/share from this FAB — show a
  // Contact button in its place instead of just removing the button.
  if (isInstalled) {
    if (!appContact.supportLink) return null;
    return (
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => window.open(appContact.supportLink, '_blank', 'noopener,noreferrer')}
        className="fixed bottom-[88px] left-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center bg-card border border-border/60 text-muted-foreground"
        aria-label={t('contactSupport')}
        title={t('contactSupport')}
      >
        <Headset size={20} />
      </motion.button>
    );
  }

  const handleShare = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Learning Sathi', url });
        setShowMenu(false);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => { setCopied(false); setShowMenu(false); }, 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => { setCopied(false); setShowMenu(false); }, 2000);
      } catch { /* ignore */ }
    }
  };

  return (
    <>
      {showMenu && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          className="fixed bottom-[148px] right-4 z-50 bg-card border border-border/60 rounded-2xl shadow-xl p-2 min-w-[180px]"
        >
          {canInstall && (
            <button
              onClick={() => { installApp(); setShowMenu(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
            >
              <Download size={16} />
              {t('installApp')}
            </button>
          )}
          <button
            onClick={handleShare}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Share2 size={16} />}
            {copied ? t('linkCopied') : t('shareInstallLink')}
          </button>
        </motion.div>
      )}

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowMenu(v => !v)}
        className={cn(
          "fixed bottom-[88px] left-4 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors",
          showMenu ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"
        )}
        aria-label={t('installApp')}
      >
        <Download size={20} />
      </motion.button>

      {showMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowMenu(false)}
        />
      )}
    </>
  );
}


function BottomNav({ onSearchClick }: { onSearchClick: () => void }) {
  const [location, setLocation] = useLocation();
  const { t } = useLang();
  const { isInstalled } = usePWAInstall();
  const tabs = [
    { path: '/today',    icon: CheckCircle2,  label: t('today') },
    { path: '/subjects', icon: BookOpen,      label: t('subjects') },
    { path: '/notes',    icon: FileText,      label: t('notesTab') },
    { path: '/test',     icon: ClipboardList, label: t('testTab') },
    { path: '/progress', icon: UserIcon,      label: t('profileTab') },
  ];

  const handleTabClick = (path: string, isActive: boolean) => {
    if (!isActive) {
      setLocation(path);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-secondary/90 backdrop-blur-md border-t-2 border-border/80 pb-safe z-40 shadow-[0_-8px_28px_rgba(30,27,75,0.16)]">
        <div className="flex items-center justify-around h-[68px] px-1 max-w-md mx-auto">
          {tabs.map(tab => {
            const isActive =
              location === tab.path ||
              (location === '/tabs' && tab.path === '/today') ||
              (tab.path !== '/today' && location.startsWith(tab.path + '/'));
            const Icon = tab.icon;

            return (
              <button
                key={tab.path}
                onClick={() => handleTabClick(tab.path, isActive)}
                className="flex-1 flex flex-col items-center justify-center gap-1 h-full relative"
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute top-0 w-10 h-1 rounded-b-full"
                    style={{ background: 'linear-gradient(90deg, hsl(243 88% 62%), hsl(263 80% 60%))' }}
                  />
                )}
                {isActive ? (
                  <div className="w-9 h-9 rounded-2xl gradient-primary flex items-center justify-center shadow-md glow-sm">
                    <Icon size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                ) : (
                  <Icon size={22} className="text-muted-foreground transition-all duration-300" strokeWidth={2} />
                )}
                <span className={cn("text-[10px] font-semibold transition-colors", isActive ? "text-gradient" : "text-muted-foreground")}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
