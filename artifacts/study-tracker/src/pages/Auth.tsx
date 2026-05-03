import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { Input, Button } from '@/components/ui';
import { BookOpen, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

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
    <div className="min-h-[100dvh] max-w-md mx-auto bg-background flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-br from-primary/20 to-accent/40 rounded-b-[40px] -z-10" />

      <div className="flex-1 px-6 pt-16 pb-8 flex flex-col">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-white shadow-xl rounded-3xl flex items-center justify-center border border-white/50 rotate-3">
            <BookOpen size={40} className="text-primary -rotate-3" />
          </div>
        </div>

        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">StudyTrack</h1>
          <p className="text-muted-foreground mt-2">Manage your study time.</p>
        </div>

        {/* Language toggle */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm border border-border/40 rounded-full px-3 py-1.5 shadow-sm"
          >
            <span className={`text-xs font-bold transition-colors ${lang === 'en' ? 'text-primary' : 'text-muted-foreground'}`}>ENG</span>
            <div className="relative w-8 h-4 bg-secondary rounded-full mx-0.5">
              <div
                className="absolute top-0.5 w-3 h-3 bg-primary rounded-full shadow-sm transition-all duration-200"
                style={{ left: lang === 'en' ? '2px' : '18px' }}
              />
            </div>
            <span className={`text-xs font-bold transition-colors ${lang === 'bn' ? 'text-primary' : 'text-muted-foreground'}`}>বাংলা</span>
          </button>
        </div>

        <div className="bg-card rounded-3xl p-6 shadow-xl border border-border/50 flex-1 flex flex-col">

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
    </div>
  );
}
