import React from 'react';
import { useLocation } from 'wouter';
import { Target, BookOpen, User, CheckCircle2, GraduationCap, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLang } from '@/context/LangContext';
import { useStudy } from '@/context/StudyContext';
import { motion } from 'framer-motion';

export function Layout({ children }: { children: React.ReactNode }) {
  const { syncing } = useStudy();

  return (
    <>
      {/* Desktop: sidebar layout */}
      <div className="hidden md:flex min-h-[100dvh] bg-background">
        <SideNav />
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
      </div>

      {/* Sync indicator */}
      {syncing && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-card border border-border shadow-lg rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full"
          />
          <span className="hidden sm:inline">Syncing</span>
        </div>
      )}
    </>
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

function SideNav() {
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

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1">
        {tabs.map(tab => (
          <NavItem key={tab.path} {...tab} />
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/40">
        <p className="text-[10px] text-muted-foreground text-center">StudyTrack v2.0</p>
      </div>
    </div>
  );
}

function BottomNav() {
  const [location, setLocation] = useLocation();
  const { t } = useLang();

  const tabs = [
    { path: '/today', icon: CheckCircle2, label: t('today') },
    { path: '/subjects', icon: BookOpen, label: t('subjects') },
    { path: '/progress', icon: Target, label: t('progress') },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border pb-safe z-40">
      <div className="flex items-center justify-around h-[68px] px-2 max-w-md mx-auto">
        {tabs.map(tab => {
          const isActive = location === tab.path || (location === '/tabs' && tab.path === '/today');
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
                size={24}
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
  );
}
