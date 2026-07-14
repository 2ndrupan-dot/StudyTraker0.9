import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { Input, Button } from '@/components/ui';
import { BookOpen, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

/** Spinning loader identical to the one shown during app launch */
function LoginSplashOverlay() {
  return (
    <motion.div
      key="login-splash"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gradient-hero"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Logo — slides up */}
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="absolute inset-0 rounded-3xl bg-white/30 blur-xl scale-110" />
        <div className="relative w-20 h-20 bg-white/20 backdrop-blur-sm shadow-2xl rounded-3xl flex items-center justify-center border border-white/40">
          <BookOpen size={40} className="text-white drop-shadow-lg" />
        </div>
      </motion.div>

      {/* StudyTrack title — fades in after logo */}
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="text-3xl font-bold tracking-tight text-white drop-shadow mt-5"
      >
        StudyTrack
      </motion.h1>

      {/* Spinner — pinned to the very bottom of the screen */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2"
      >
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </motion.div>
    </motion.div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

type AuthView = 'login' | 'register' | 'forgot';

export function Auth() {
  const [view, setView] = useState<AuthView>('login');
  const { login, register, signInWithGoogle, resetPassword, error, clearError } = useAuth();
  const { t, lang, setLang } = useLang();
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const isLogin = view === 'login';
  const isForgot = view === 'forgot';

  const loginSchema = z.object({
    email: z.string().email({ message: t('invalidEmail') }),
    password: z.string().min(1, { message: t('passwordMin') }),
  });

  const registerSchema = z.object({
    name: z.string().min(2, { message: t('nameRequired') }),
    email: z.string().email({ message: t('invalidEmail') }),
    password: z.string().min(6, { message: t('passwordMin') }),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t('passwordMatch'),
    path: ['confirmPassword'],
  });

  const forgotSchema = z.object({
    email: z.string().email({ message: t('invalidEmail') }),
  });

  const form = useForm({
    resolver: zodResolver(isForgot ? forgotSchema : isLogin ? loginSchema : registerSchema),
    defaultValues: { email: '', password: '', name: '', confirmPassword: '' },
  });

  const switchView = (v: AuthView) => {
    setView(v);
    form.reset();
    clearError();
    setResetSent(false);
  };

  const onSubmit = async (data: any) => {
    clearError();
    setSubmitting(true);
    try {
      if (isForgot) {
        await resetPassword(data.email);
        setResetSent(true);
      } else if (isLogin) {
        await login(data.email, data.password);
      } else {
        await register(data.name, data.email, data.password);
      }
    } catch {
      // error shown via context
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    clearError();
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch {
      // error shown via context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    {/* Full-screen login splash — shown while submitting, mirrors the app launch animation */}
    <AnimatePresence>
      {submitting && <LoginSplashOverlay />}
    </AnimatePresence>

    <div className="min-h-[100dvh] flex flex-col items-center relative overflow-hidden gradient-hero">
      {/* Decorative blobs */}
      <div className="absolute top-[-60px] right-[-60px] w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-80px] left-[-40px] w-96 h-96 rounded-full bg-black/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-[-80px] w-64 h-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />

      <div className="flex-1 px-6 pt-14 pb-8 flex flex-col w-full max-w-md">
        <div className="flex justify-center mb-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-white/30 blur-xl scale-110" />
            <div className="relative w-20 h-20 bg-white/20 backdrop-blur-sm shadow-2xl rounded-3xl flex items-center justify-center border border-white/40">
              <BookOpen size={40} className="text-white drop-shadow-lg" />
            </div>
          </div>
        </div>

        <div className="text-center mb-5">
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow">StudyTrack</h1>
          <p className="text-white/85 mt-1.5 text-sm font-medium">Powered by : StudyTrack team</p>
        </div>

        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-2 bg-white/25 backdrop-blur-md border border-white/50 rounded-full px-3.5 py-1.5 shadow-md hover:bg-white/35 transition-colors"
          >
            <span className={`text-xs font-extrabold tracking-wide transition-colors ${lang === 'en' ? 'text-white drop-shadow' : 'text-white/60'}`}>ENG</span>
            <div className="relative w-9 h-5 bg-white/30 rounded-full mx-0.5 border border-white/40">
              <div
                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
                style={{ left: lang === 'en' ? '2px' : '18px' }}
              />
            </div>
            <span className={`text-xs font-extrabold tracking-wide transition-colors ${lang === 'bn' ? 'text-white drop-shadow' : 'text-white/60'}`}>বাংলা</span>
          </button>
        </div>

        <div className="glass rounded-3xl p-6 shadow-2xl border border-white/40 flex-1 flex flex-col">

          {/* ── FORGOT PASSWORD VIEW ── */}
          <AnimatePresence mode="wait">
            {isForgot ? (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1"
              >
                <button
                  onClick={() => switchView('login')}
                  className="flex items-center gap-2 text-sm text-muted-foreground mb-5 hover:text-foreground transition-colors self-start"
                >
                  <ArrowLeft size={16} />
                  {t('backToLogin')}
                </button>

                <h2 className="text-xl font-bold text-foreground mb-1">{t('resetPassword')}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t('resetPasswordDesc')}</p>

                {resetSent ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-green-700 font-medium text-sm bg-green-50 px-4 py-3 rounded-xl border border-green-200">
                      {t('resetPasswordSent')}
                    </p>
                    <button
                      onClick={() => switchView('login')}
                      className="text-primary text-sm font-semibold underline underline-offset-2"
                    >
                      {t('backToLogin')}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 flex-1">
                    <Input
                      type="email"
                      placeholder={t('resetEmailLabel')}
                      {...form.register('email')}
                      error={form.formState.errors.email?.message as string}
                    />

                    {error && (
                      <p className="text-destructive text-sm text-center font-medium bg-destructive/10 py-2 rounded-lg px-3">
                        {t(error as Parameters<typeof t>[0]) || error}
                      </p>
                    )}

                    <div className="mt-auto pt-4">
                      <Button type="submit" className="w-full py-4 text-base shadow-primary/25 shadow-lg" disabled={submitting}>
                        {submitting ? '...' : t('sendResetLink')}
                      </Button>
                    </div>
                  </form>
                )}
              </motion.div>
            ) : (
              /* ── LOGIN / REGISTER VIEW ── */
              <motion.div
                key="auth"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col flex-1"
              >
                {/* Tab switcher */}
                <div className="flex bg-secondary p-1 rounded-xl mb-5 relative">
                  <div
                    className="absolute h-10 w-[calc(50%-4px)] bg-card rounded-lg shadow-sm transition-all duration-300"
                    style={{ left: isLogin ? '4px' : 'calc(50% + 0px)' }}
                  />
                  <button
                    className={`flex-1 h-10 z-10 font-semibold text-sm transition-colors ${isLogin ? 'text-primary' : 'text-muted-foreground'}`}
                    onClick={() => switchView('login')}
                  >
                    {t('login')}
                  </button>
                  <button
                    className={`flex-1 h-10 z-10 font-semibold text-sm transition-colors ${!isLogin ? 'text-primary' : 'text-muted-foreground'}`}
                    onClick={() => switchView('register')}
                  >
                    {t('register')}
                  </button>
                </div>

                {/* Google Sign-In button */}
                <button
                  type="button"
                  onClick={handleGoogle}
                  disabled={submitting}
                  className="flex items-center justify-center gap-3 w-full py-3 px-4 rounded-2xl border-2 border-border bg-white hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 font-semibold text-sm text-foreground shadow-sm mb-4 disabled:opacity-60"
                >
                  <GoogleIcon />
                  {t('continueWithGoogle')}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">{t('orContinueWith')}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Email/Password form */}
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 flex-1">
                  <AnimatePresence mode="popLayout">
                    {!isLogin && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Input placeholder={t('name')} {...form.register('name')} error={form.formState.errors.name?.message as string} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Input type="email" placeholder={t('email')} {...form.register('email')} error={form.formState.errors.email?.message as string} />

                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      placeholder={t('password')}
                      {...form.register('password')}
                      error={form.formState.errors.password?.message as string}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-3.5 text-muted-foreground">
                      {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  <AnimatePresence mode="popLayout">
                    {!isLogin && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Input
                          type={showPass ? 'text' : 'password'}
                          placeholder={t('confirmPassword')}
                          {...form.register('confirmPassword')}
                          error={form.formState.errors.confirmPassword?.message as string}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Forgot Password link — only shown on login tab */}
                  {isLogin && (
                    <div className="flex justify-end -mt-1">
                      <button
                        type="button"
                        onClick={() => switchView('forgot')}
                        className="text-xs text-primary font-medium hover:underline"
                      >
                        {t('forgotPassword')}
                      </button>
                    </div>
                  )}

                  {error && (
                    <p className="text-destructive text-sm text-center font-medium bg-destructive/10 py-2 rounded-lg px-3">
                      {t(error as Parameters<typeof t>[0]) || error}
                    </p>
                  )}

                  <div className="mt-auto pt-2">
                    <Button type="submit" className="w-full py-4 text-base shadow-primary/25 shadow-lg" disabled={submitting}>
                      {submitting ? '...' : isLogin ? t('loginBtn') : t('registerBtn')}
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Decorative bottom spinner — always visible, far below the form */}
      <div className="w-full flex justify-center pb-10 pt-4 mt-auto">
        <div className="w-7 h-7 border-2 border-white/25 border-t-white/70 rounded-full animate-spin" />
      </div>
    </div>
    </>
  );
}
