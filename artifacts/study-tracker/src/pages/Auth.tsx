import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLang } from '@/context/LangContext';
import { Input, Button } from '@/components/ui';
import { BookOpen, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const { login, register, error, clearError } = useAuth();
  const { t, lang, setLang } = useLang();
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const form = useForm({
    resolver: zodResolver(isLogin ? loginSchema : registerSchema),
    defaultValues: { email: '', password: '', name: '', confirmPassword: '' },
  });

  const onSubmit = async (data: any) => {
    clearError();
    setSubmitting(true);
    try {
      if (isLogin) {
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

        {/* Language toggle - right aligned below subtitle */}
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
          <div className="flex bg-secondary p-1 rounded-xl mb-6 relative">
            <div
              className="absolute h-10 w-[calc(50%-4px)] bg-card rounded-lg shadow-sm transition-all duration-300"
              style={{ left: isLogin ? '4px' : 'calc(50% + 0px)' }}
            />
            <button
              className={`flex-1 h-10 z-10 font-semibold text-sm transition-colors ${isLogin ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => { setIsLogin(true); form.reset(); clearError(); }}
            >
              {t('login')}
            </button>
            <button
              className={`flex-1 h-10 z-10 font-semibold text-sm transition-colors ${!isLogin ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => { setIsLogin(false); form.reset(); clearError(); }}
            >
              {t('register')}
            </button>
          </div>

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

            {error && (
              <p className="text-destructive text-sm text-center font-medium bg-destructive/10 py-2 rounded-lg px-3">
                {t(error as Parameters<typeof t>[0]) || error}
              </p>
            )}

            <div className="mt-auto pt-6">
              <Button type="submit" className="w-full py-4 text-base shadow-primary/25 shadow-lg" disabled={submitting}>
                {submitting ? '...' : isLogin ? t('loginBtn') : t('registerBtn')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
