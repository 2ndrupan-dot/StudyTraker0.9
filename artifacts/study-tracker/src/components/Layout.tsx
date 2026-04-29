import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Target, BookOpen, CheckCircle2, GraduationCap, Cloud, CloudOff, Search, Download, Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/context/LangContext';
import { useStudy } from '@/context/StudyContext';
import { usePWAInstall } from '@/context/PWAInstallContext';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalSearch } from './GlobalSearch';

export function Layout({ children }: { children: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

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
        <main className="flex-1 ml-64 min-h-[100dvh] overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile: full-screen with bottom nav */}
      <div className="md:hidden w-full min-h-[100dvh] bg-background relative overflow-x-hidden pb-[80px]">
        {children}
        <BottomNav />
        <FloatingSearchButton onClick={() => setSearchOpen(true)} />
      </div>

      {/* Online / Sync status */}
      <ConnectionStatus />

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
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

function ConnectionStatus() {
  const { syncing, online } = useStudy();
  const { t } = useLang();
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOfflineRef = React.useRef(false);

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

  const visible = !online || showBackOnline || syncing;
  if (!visible) return null;

  let label = '';
  let Icon: React.ElementType = Cloud;
  let cls = '';
  let spinning = false;

  if (!online) {
    label = t('offline');
    Icon = CloudOff;
    cls = 'bg-red-500/10 text-red-700 border-red-300';
  } else if (showBackOnline) {
    label = t('online');
    Icon = Cloud;
    cls = 'bg-green-500/10 text-green-700 border-green-300';
  } else {
    label = t('syncing');
    cls = 'bg-card text-muted-foreground border-border';
    spinning = true;
  }

  return (
    <AnimatePresence>
      <motion.div
        key={label}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          'fixed top-3 right-3 z-50 flex items-center gap-2 shadow-lg rounded-full px-3 py-1.5 text-xs font-bold border',
          cls
        )}
      >
        {spinning ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full"
          />
        ) : (
          <Icon size={12} />
        )}
        <span className="hidden sm:inline">{label}</span>
      </motion.div>
    </AnimatePresence>
  );
}

function InstallSection() {
  const { t } = useLang();
  const { canInstall, isInstalled, installApp } = usePWAInstall();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'StudyTrack', url });
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

  if (isInstalled) return null;

  return (
    <div className="space-y-1.5">
      {canInstall && (
        <button
          onClick={installApp}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Download size={14} />
          <span>{t('installApp')}</span>
        </button>
      )}
      <button
        onClick={handleShare}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        {copied ? <Check size={14} className="text-green-500" /> : <Share2 size={14} />}
        <span>{copied ? t('linkCopied') : t('shareInstallLink')}</span>
      </button>
    </div>
  );
}

function NavItem({ path, icon: Icon, label }: { path: string; icon: any; label: string }) {
  const [location, setLocation] = useLocation();
  const isActive = location === path || (location === '/tabs' && path === '/today');

  return (
    <button
      onClick={() => setLocation(path)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
      <span>{label}</span>
      {isActive && (
        <motion.div
          layoutId="sidebar-indicator"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"
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
    { path: '/progress', icon: Target, label: t('progress') },
  ];

  return (
    <div className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border/60 flex flex-col z-30 shadow-sm">
      {/* Logo */}
      <div className="p-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md">
            <GraduationCap size={20} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-foreground text-base leading-tight">StudyTrack</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Study Planner</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="p-3 pb-1">
        <button
          type="button"
          onClick={onSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/60 hover:bg-secondary text-muted-foreground text-xs font-medium border border-border/60 transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">{t('searchPlaceholder')}</span>
          <kbd className="hidden lg:inline px-1.5 py-0.5 rounded bg-card border border-border/60 text-[9px] font-bold">⌘K</kbd>
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1">
        {tabs.map(tab => (
          <NavItem key={tab.path} {...tab} />
        ))}
      </nav>

      {/* Footer: install + share */}
      <div className="p-3 border-t border-border/40 space-y-2">
        <InstallSection />
        <p className="text-[10px] text-muted-foreground text-center pt-1">StudyTrack v2.0</p>
      </div>
    </div>
  );
}

function MobileInstallButton() {
  const { t } = useLang();
  const { canInstall, isInstalled, installApp } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  if (isInstalled) return null;

  const handleShare = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'StudyTrack', url });
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

function BottomNav() {
  const [location, setLocation] = useLocation();
  const { t } = useLang();
  const { isInstalled } = usePWAInstall();

  const tabs = [
    { path: '/today', icon: CheckCircle2, label: t('today') },
    { path: '/subjects', icon: BookOpen, label: t('subjects') },
    { path: '/progress', icon: Target, label: t('progress') },
  ];

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border pb-safe z-40">
        <div className="flex items-center justify-around h-[68px] px-2 max-w-md mx-auto">
          {tabs.map(tab => {
            const isActive =
              location === tab.path ||
              (location === '/tabs' && tab.path === '/today');
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => setLocation(tab.path)}
                className="flex-1 flex flex-col items-center justify-center gap-1 h-full relative"
              >
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute top-0 w-8 h-1 bg-primary rounded-b-full shadow-[0_0_8px_var(--color-primary)]"
                  />
                )}
                <Icon
                  size={22}
                  className={cn("transition-all duration-300", isActive ? "text-primary scale-110" : "text-muted-foreground")}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span className={cn("text-[10px] font-medium transition-colors", isActive ? "text-primary" : "text-muted-foreground")}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating install/share button for mobile (hidden when already installed) */}
      {!isInstalled && (
        <AnimatePresence>
          <MobileInstallButton key="mobile-install" />
        </AnimatePresence>
      )}
    </>
  );
}
