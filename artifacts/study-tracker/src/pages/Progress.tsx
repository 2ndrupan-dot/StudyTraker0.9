import React, { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStudy } from '@/context/StudyContext';
import { useLang } from '@/context/LangContext';
import { Layout } from '@/components/Layout';
import { Settings, LogOut, User as UserIcon, BookOpen, Target, ShieldCheck, Camera, CalendarDays, CheckCircle2 } from 'lucide-react';
import { Modal, ConfirmModal, Input, Button } from '@/components/ui';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

const cardVariants = {
  hidden: { opacity: 0, x: -40 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.07, type: 'spring', stiffness: 320, damping: 28, mass: 0.8 }
  }),
};

export function Progress() {
  const { user, logout, updateProfile, updateProfilePhoto } = useAuth();
  const { subjects, settings, setCourseStartDate } = useStudy();
  const { t, lang, setLang } = useLang();

  const [modals, setModals] = useState({ profile: false, settings: false, logout: false });
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', currentPass: '', newPass: '' });
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Course Start Date state
  const [pendingStartDate, setPendingStartDate] = useState('');
  const [showResetConfirm1, setShowResetConfirm1] = useState(false);
  const [showResetConfirm2, setShowResetConfirm2] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const totalChapters = subjects.flatMap(s => s.chapters).length;
  const completedChapters = subjects.flatMap(s => s.chapters).filter(c => c.completed).length;
  const overallProg = totalChapters === 0 ? 0 : Math.round((completedChapters / totalChapters) * 100);
  const completedSubjects = subjects.filter(s => s.completed).length;

  const handleUpdateProfile = async () => {
    if (!profileForm.name) return;
    if (!profileForm.currentPass) {
      setProfileError(t('currentPassRequired'));
      return;
    }
    setProfileSaving(true);
    setProfileError('');
    try {
      await updateProfile(profileForm.name, profileForm.currentPass, profileForm.newPass || undefined);
      setModals({ ...modals, profile: false });
      setProfileForm(prev => ({ ...prev, currentPass: '', newPass: '' }));
    } catch {
      setProfileError(t('profileUpdateFailed'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoMsg('');
    try {
      await updateProfilePhoto(file);
      setPhotoMsg(t('photoUpdated'));
    } catch {
      setPhotoMsg(t('photoUpdateFailed'));
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openProfileModal = () => {
    setProfileForm({ name: user?.name || '', currentPass: '', newPass: '' });
    setProfileError('');
    setPhotoMsg('');
    setModals({ ...modals, profile: true });
  };

  // Course Start Date handlers
  const handleStartDateRequest = () => {
    if (!pendingStartDate) return;
    setShowResetConfirm1(true);
  };

  const handleConfirm1 = () => {
    setShowResetConfirm1(false);
    setShowResetConfirm2(true);
  };

  const handleConfirm2 = () => {
    setCourseStartDate(pendingStartDate);
    setShowResetConfirm2(false);
    setPendingStartDate('');
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 5000);
  };

  return (
    <Layout>
      <div className="p-5">
        <header className="flex items-center justify-between mb-8">
          <motion.h1
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold text-foreground"
          >
            {t('progress')}
          </motion.h1>
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setModals({ ...modals, settings: true })}
              className="p-2.5 bg-secondary text-foreground rounded-full hover:bg-secondary/80 transition-colors shadow-sm"
            >
              <Settings size={20} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setModals({ ...modals, logout: true })}
              className="p-2.5 bg-destructive/10 text-destructive rounded-full hover:bg-destructive hover:text-white transition-colors shadow-sm"
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        </header>

        {/* User Card */}
        <motion.div
          custom={0}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          onClick={openProfileModal}
          className="bg-card rounded-3xl p-5 shadow-lg shadow-black/5 border border-border/50 mb-6 flex items-center gap-4 cursor-pointer hover:shadow-xl transition-all group"
        >
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl border-2 border-primary/20 overflow-hidden shadow-md group-hover:ring-2 group-hover:ring-primary/30 transition-all">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user?.name} className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-sm">
              <Camera size={11} className="text-primary-foreground" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground leading-tight truncate">{user?.name}</h2>
            <p className="text-sm text-muted-foreground font-medium truncate">{user?.email}</p>
            <p className="text-xs text-primary/70 font-medium mt-0.5">{t('editProfile')}</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 transition-colors">
            <UserIcon size={16} />
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center">
            <div className="text-primary bg-primary/10 w-9 h-9 rounded-full flex items-center justify-center mb-3">
              <ShieldCheck size={18} />
            </div>
            <motion.p
              key={completedSubjects}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-3xl font-bold text-foreground"
            >
              {completedSubjects}
            </motion.p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">{t('completed')} {t('subjects')}</p>
          </motion.div>
          <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex flex-col justify-center">
            <div className="text-green-500 bg-green-500/10 w-9 h-9 rounded-full flex items-center justify-center mb-3">
              <BookOpen size={18} />
            </div>
            <p className="text-3xl font-bold text-foreground">{subjects.length}</p>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1">{t('activeSubjects')}</p>
          </motion.div>
        </div>

        {/* Big Progress */}
        <motion.div
          custom={3}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="bg-card rounded-3xl p-6 shadow-md border border-border/50 mb-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Target size={120} />
          </div>
          <h3 className="font-bold text-foreground mb-4 relative z-10">{t('overallProgress')}</h3>
          <div className="flex items-end gap-2 mb-3 relative z-10">
            <motion.span
              key={overallProg}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-5xl font-black text-primary leading-none"
            >
              {overallProg}%
            </motion.span>
          </div>
          <div className="h-4 w-full bg-secondary rounded-full overflow-hidden relative z-10 border border-border/50 shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${overallProg}%` }}
              transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
            />
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-3 relative z-10">
            {completedChapters} {t('completed')} / {totalChapters} {t('chapters')}
          </p>
        </motion.div>

        {/* Subject Breakdown */}
        <h3 className="font-bold text-lg mb-4 text-foreground px-1">{t('subjects')}</h3>
        <div className="space-y-3">
          {subjects.map((s, i) => {
            const chCount = s.chapters.length;
            const cCount = s.chapters.filter(c => c.completed).length;
            const p = chCount === 0 ? 0 : Math.round((cCount / chCount) * 100);
            return (
              <motion.div
                key={s.id}
                custom={i + 4}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                    <span className="font-bold text-foreground text-sm">{s.title}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-secondary px-2 py-1 rounded text-muted-foreground">
                    {format(parseISO(s.deadline), 'MMM d')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${p}%` }}
                      transition={{ duration: 0.6, delay: 0.1 * i }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground w-8 text-right">{p}%</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Profile Modal */}
      <Modal
        isOpen={modals.profile}
        onClose={() => { setModals({ ...modals, profile: false }); setProfileError(''); setPhotoMsg(''); }}
        title={t('editProfile')}
        align="bottom"
        icon={UserIcon}
      >
        <div className="space-y-4">
          {/* Photo upload section */}
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-primary/10 border-2 border-primary/20 overflow-hidden shadow-md">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user?.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-primary font-bold text-2xl">
                    {user?.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
              {photoUploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button
              variant="outline"
              className="text-xs py-2 px-4 h-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoUploading}
            >
              <Camera size={13} className="mr-1.5" />
              {user?.photoURL ? t('changePhoto') : t('uploadPhoto')}
            </Button>
            {photoMsg && (
              <p className={`text-xs text-center ${photoMsg.includes(t('photoUpdated')) ? 'text-green-600' : 'text-destructive'}`}>
                {photoMsg}
              </p>
            )}
          </div>

          <div className="border-t border-border/40 pt-4 space-y-3">
            <Input placeholder={t('name')} value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} />
            <Input type="password" placeholder={t('currentPass')} value={profileForm.currentPass} onChange={e => setProfileForm({ ...profileForm, currentPass: e.target.value })} />
            <Input type="password" placeholder={t('newPasswordOp')} value={profileForm.newPass} onChange={e => setProfileForm({ ...profileForm, newPass: e.target.value })} />
          </div>
          {profileError && (
            <p className="text-destructive text-sm bg-destructive/10 rounded-xl px-3 py-2">{profileError}</p>
          )}
          <Button className="w-full mt-4 py-3.5" onClick={handleUpdateProfile} disabled={profileSaving}>
            {profileSaving ? '...' : t('saveChanges')}
          </Button>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={modals.settings} onClose={() => setModals({ ...modals, settings: false })} title={t('settings')} align="bottom" icon={Settings}>
        <div className="space-y-6">
          {/* Language */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-3">{t('language')}</p>
            <div className="flex bg-secondary p-1.5 rounded-xl relative border border-border/50">
              <motion.div
                layout
                className="absolute h-10 w-[calc(50%-6px)] bg-card rounded-lg shadow-sm"
                style={{ left: lang === 'en' ? '6px' : 'calc(50%)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
              <button
                className={`flex-1 h-10 z-10 font-bold text-sm transition-colors ${lang === 'en' ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setLang('en')}
              >
                English
              </button>
              <button
                className={`flex-1 h-10 z-10 font-bold text-sm transition-colors ${lang === 'bn' ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setLang('bn')}
              >
                বাংলা
              </button>
            </div>
          </div>

          {/* Course Starting Date */}
          <div className="border-t border-border/40 pt-5">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays size={15} className="text-primary" />
              <p className="text-sm font-semibold text-foreground">{t('courseStartDate')}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{t('courseStartDateDesc')}</p>

            {settings.courseStartDate && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-xl">
                <CalendarDays size={13} className="text-primary shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground font-medium">{t('courseStartDateCurrent')}</p>
                  <p className="text-sm font-bold text-primary">
                    {format(parseISO(settings.courseStartDate), 'MMM d, yyyy')}
                  </p>
                </div>
                {settings.resetScheduled && (
                  <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-500/10 border border-amber-200 px-2 py-0.5 rounded-full">
                    {lang === 'bn' ? 'নির্ধারিত' : 'Scheduled'}
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="date"
                value={pendingStartDate}
                onChange={e => setPendingStartDate(e.target.value)}
                className="flex-1 text-sm rounded-xl border border-border/60 bg-secondary px-3 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                onClick={handleStartDateRequest}
                disabled={!pendingStartDate}
                className="shrink-0 px-4 py-2.5 h-auto text-sm"
              >
                {settings.courseStartDate ? t('courseStartDateChange') : t('courseStartDateSet')}
              </Button>
            </div>

            {resetSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-200 rounded-xl"
              >
                <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                <p className="text-xs font-semibold text-green-700">{t('courseResetScheduled')}</p>
              </motion.div>
            )}
          </div>
        </div>
      </Modal>

      {/* Logout Confirm */}
      <ConfirmModal
        isOpen={modals.logout}
        onClose={() => setModals({ ...modals, logout: false })}
        onConfirm={logout}
        title={t('logout')}
        message={t('logoutConfirm')}
        confirmText={t('yes')}
        cancelText={t('no')}
        isDanger={true}
      />

      {/* Course Reset - First Confirmation */}
      <ConfirmModal
        isOpen={showResetConfirm1}
        onClose={() => setShowResetConfirm1(false)}
        onConfirm={handleConfirm1}
        title={t('courseResetConfirm1Title')}
        message={t('courseResetConfirm1Msg')}
        confirmText={t('courseResetProceeed')}
        cancelText={t('cancel')}
        isDanger={true}
      />

      {/* Course Reset - Second Confirmation */}
      <ConfirmModal
        isOpen={showResetConfirm2}
        onClose={() => setShowResetConfirm2(false)}
        onConfirm={handleConfirm2}
        title={t('courseResetConfirm2Title')}
        message={t('courseResetConfirm2Msg')}
        confirmText={t('courseResetAbsoluteSure')}
        cancelText={t('cancel')}
        isDanger={true}
      />
    </Layout>
  );
}
