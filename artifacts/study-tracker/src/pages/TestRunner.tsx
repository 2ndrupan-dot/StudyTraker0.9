import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useTest } from '@/context/TestContext';
import { useLang } from '@/context/LangContext';
import { parseTestContent, type ParsedQuestion } from '@/lib/testParser';
import { ConfirmModal } from '@/components/ui';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Square, Trophy, RotateCcw,
  CheckCircle2, XCircle, AlertCircle, SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Circular progress arc ────────────────────────────────────────────────────

function CircularScore({ correct, total, size = 72 }: { correct: number; total: number; size?: number }) {
  const pct = total === 0 ? 0 : correct / total;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const stroke = circ * (1 - pct);
  const green = `hsl(142 71% 45%)`;
  const grey = `hsl(var(--border))`;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={grey} strokeWidth={6} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={green} strokeWidth={6}
        strokeDasharray={circ}
        strokeDashoffset={stroke}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.7s ease' }}
      />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TestRunner() {
  const [, navigate] = useLocation();
  const { testDecks } = useTest();
  const { t, lang } = useLang();

  // Parse URL search params
  const params = new URLSearchParams(window.location.search);
  const subjectId = params.get('sid') ?? '';
  const cardId = params.get('cid') ?? '';

  const card = useMemo(() => {
    const deck = testDecks[subjectId] ?? [];
    return deck.find(c => c.id === cardId) ?? null;
  }, [testDecks, subjectId, cardId]);

  const questions: ParsedQuestion[] = useMemo(() => {
    if (!card) return [];
    return parseTestContent(card.question, card.answer);
  }, [card]);

  // Test state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({}); // questionNumber → selectedOptionIdx
  const [revealed, setRevealed] = useState<Record<number, boolean>>({}); // questionNumber → answered
  const [skipped, setSkipped] = useState<Record<number, boolean>>({}); // questionNumber → skipped
  const [finished, setFinished] = useState(false);
  const [showAnswerFirst, setShowAnswerFirst] = useState(false);

  // Confirm dialogs
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);

  const handleGoBack = () => navigate('/test');
  const handleStop = () => navigate('/test');

  if (!card || questions.length === 0) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground text-sm text-center">
          {lang === 'bn' ? 'টেস্ট কার্ড পাওয়া যায়নি বা প্রশ্ন পার্স করা যায়নি।' : 'Test card not found or no questions could be parsed.'}
        </p>
        <button onClick={() => navigate('/test')} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
          {t('testBack')}
        </button>
      </div>
    );
  }

  const q = questions[currentIdx];
  const total = questions.length;
  const answeredCount = Object.keys(revealed).length;
  const skippedCount = Object.keys(skipped).length;
  const selectedOpt = userAnswers[q.number];
  const isAnswered = revealed[q.number] === true;
  const isSkipped = skipped[q.number] === true;
  // Questions with no options can always be advanced (nothing to select)
  const hasOptions = q.options.length > 0;
  // Can advance if: answered, skipped, or has no options
  const canAdvance = isAnswered || isSkipped || !hasOptions;

  // Compute results (when finished)
  const correctCount = questions.filter(q => {
    const selected = userAnswers[q.number];
    return selected !== undefined && selected === q.correctOptionIndex;
  }).length;
  const attendedCount = answeredCount; // questions where user actually chose an answer
  const wrongQuestions = questions.filter(q => {
    const selected = userAnswers[q.number];
    return selected !== undefined && selected !== q.correctOptionIndex;
  });
  const skippedQuestions = questions.filter(q => skipped[q.number] === true);
  // Percentage: correct out of attended (not total)
  const pct = attendedCount === 0 ? 0 : Math.round((correctCount / attendedCount) * 100);

  const handleSelectOption = (optIdx: number) => {
    if (isAnswered || isSkipped || finished) return;
    setUserAnswers(prev => ({ ...prev, [q.number]: optIdx }));
    setRevealed(prev => ({ ...prev, [q.number]: true }));
    setShowAnswerFirst(false);
  };

  const handleNext = () => {
    if (!canAdvance) {
      setShowAnswerFirst(true);
      setTimeout(() => setShowAnswerFirst(false), 2000);
      return;
    }
    setShowAnswerFirst(false);
    if (currentIdx < total - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      setFinished(true);
    }
  };

  const handleSkip = () => {
    if (isAnswered || finished) return;
    setSkipped(prev => ({ ...prev, [q.number]: true }));
    setShowAnswerFirst(false);
    if (currentIdx < total - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      setFinished(true);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) { setCurrentIdx(i => i - 1); setShowAnswerFirst(false); }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setUserAnswers({});
    setRevealed({});
    setSkipped({});
    setFinished(false);
    setShowAnswerFirst(false);
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const progressPct = total === 0 ? 0 : (answeredCount / total) * 100;

  // ── Finished / Results screen ─────────────────────────────────────────────
  if (finished) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        {/* Header */}
        <div
          className="relative overflow-hidden px-5 pt-12 pb-8"
          style={{ background: 'linear-gradient(135deg, hsl(243 88% 52%) 0%, hsl(283 80% 52%) 50%, hsl(313 80% 52%) 100%)' }}
        >
          <div className="absolute top-[-20px] right-[-20px] w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col items-center gap-4">
            <Trophy size={36} className="text-yellow-300" />
            <h1 className="text-2xl font-bold text-white text-center">{t('testComplete')}</h1>

            {/* Circular score */}
            <div className="relative flex items-center justify-center mt-2">
              <CircularScore correct={correctCount} total={Math.max(attendedCount, 1)} size={100} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{pct}%</span>
                <span className="text-[10px] text-white/70">{t('testScoreLabel')}</span>
              </div>
            </div>

            <div className="flex gap-5 mt-1">
              {/* Attended */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-lg font-bold text-sky-300">{attendedCount}/{total}</span>
                <span className="text-[11px] text-white/70">{t('testAttended')}</span>
              </div>
              <div className="w-px bg-white/20" />
              {/* Correct */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-lg font-bold text-emerald-300">{correctCount}/{attendedCount}</span>
                <span className="text-[11px] text-white/70">{t('testCorrectCount')}</span>
              </div>
              <div className="w-px bg-white/20" />
              {/* Skipped */}
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-lg font-bold text-amber-300">{skippedCount}/{total}</span>
                <span className="text-[11px] text-white/70">{t('testSkipped')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 max-w-xl mx-auto w-full space-y-5">
          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90"
            >
              <RotateCcw size={16} /> {t('testRetry')}
            </button>
            <button
              onClick={() => navigate('/test')}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-secondary text-foreground font-semibold text-sm hover:bg-secondary/70"
            >
              <ChevronLeft size={16} /> {t('testBack')}
            </button>
          </div>

          {/* Wrong answers review */}
          {wrongQuestions.length > 0 && (
            <div className="rounded-2xl overflow-hidden shadow-sm">
              {/* Red header bar */}
              <div className="flex items-center gap-2.5 px-4 py-3 bg-red-400 dark:bg-red-500">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/25 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
                </span>
                <span className="text-sm font-bold text-white">{t('testWrongReview')} ({wrongQuestions.length})</span>
              </div>
              {/* Cards */}
              <div className="bg-white dark:bg-card divide-y divide-red-50 dark:divide-red-900/20">
                {wrongQuestions.map(wq => {
                  const selected = userAnswers[wq.number];
                  const selectedOpt = selected !== undefined ? wq.options[selected] : null;
                  const correctOpt = wq.correctOptionIndex !== -1 ? wq.options[wq.correctOptionIndex] : null;
                  return (
                    <div key={wq.number} className="flex gap-3 px-4 py-3.5">
                      {/* Number badge */}
                      <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-500/15 text-red-500 dark:text-red-400 text-xs font-bold mt-0.5">
                        {wq.number}
                      </span>
                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm font-semibold text-foreground leading-snug">{wq.questionText}</p>
                        {selectedOpt && (
                          <p className="text-[12px] text-red-600 dark:text-red-400 flex items-center gap-1.5">
                            <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2 2L6 6M6 2L2 6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg></span>
                            <span className="font-bold">{lang === 'bn' ? 'আপনার উত্তর:' : 'Your answer:'}</span> <span className="text-foreground">{selectedOpt.label ? `${selectedOpt.label}) ` : ''}{selectedOpt.text}</span>
                          </p>
                        )}
                        {correctOpt ? (
                          <p className="text-[12px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                            <span className="font-bold">{lang === 'bn' ? 'সঠিক উত্তর:' : 'Correct answer:'}</span> <span className="text-foreground">{correctOpt.label ? `${correctOpt.label}) ` : ''}{correctOpt.text}</span>
                          </p>
                        ) : wq.correctAnswerText ? (
                          <p className="text-[12px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                            <span className="font-bold">{lang === 'bn' ? 'সঠিক উত্তর:' : 'Correct answer:'}</span> <span className="text-foreground">{wq.correctAnswerText}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {wrongQuestions.length === 0 && skippedQuestions.length === 0 && (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
              <p className="font-bold text-foreground">
                {lang === 'bn' ? 'অসাধারণ! সব উত্তর সঠিক!' : 'Perfect score! All answers correct!'}
              </p>
            </div>
          )}

          {/* Skipped questions review */}
          {skippedQuestions.length > 0 && (
            <div className="rounded-2xl overflow-hidden shadow-sm">
              {/* Amber header bar */}
              <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-400 dark:bg-amber-500">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/25 shrink-0">
                  <SkipForward size={14} className="text-white" />
                </span>
                <span className="text-sm font-bold text-white">{t('testSkippedReview')} ({skippedQuestions.length})</span>
              </div>
              {/* Cards */}
              <div className="bg-white dark:bg-card divide-y divide-amber-50 dark:divide-amber-900/20">
                {skippedQuestions.map(sq => {
                  const correctOpt = sq.correctOptionIndex !== -1 ? sq.options[sq.correctOptionIndex] : null;
                  return (
                    <div key={sq.number} className="flex gap-3 px-4 py-3.5">
                      {/* Number badge */}
                      <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold mt-0.5">
                        {sq.number}
                      </span>
                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm font-semibold text-foreground leading-snug">{sq.questionText}</p>
                        {(correctOpt || sq.correctAnswerText) && (
                          <p className="text-[12px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <span className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500"><svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
                            <span className="font-bold">{lang === 'bn' ? 'সঠিক উত্তর:' : 'Correct answer:'}</span>{' '}
                            <span className="text-foreground">{correctOpt
                              ? `${correctOpt.label ? `${correctOpt.label}) ` : ''}${correctOpt.text}`
                              : sq.correctAnswerText}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Question screen ───────────────────────────────────────────────────────

  const isCorrectSelected = isAnswered && selectedOpt !== undefined && selectedOpt === q.correctOptionIndex;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <div
        className="relative overflow-hidden px-4 pt-safe-top"
        style={{ background: 'linear-gradient(135deg, hsl(243 88% 52%) 0%, hsl(283 80% 52%) 50%, hsl(313 80% 52%) 100%)' }}
      >
        <div className="absolute top-[-20px] right-[-20px] w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center justify-between py-3">
          {/* Back */}
          <button
            onClick={() => setConfirmBack(true)}
            className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors active:scale-95"
          >
            <ChevronLeft size={20} className="text-white" />
          </button>

          {/* Title + counter */}
          <div className="flex flex-col items-center gap-0.5">
            <p className="text-white font-bold text-sm leading-tight">{card.title}</p>
            <p className="text-white/70 text-[11px]">
              {currentIdx + 1} / {total}
            </p>
          </div>

          {/* Stop */}
          <button
            onClick={() => setConfirmStop(true)}
            className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors active:scale-95"
          >
            <Square size={16} className="text-white" fill="currentColor" />
          </button>
        </div>

        {/* Progress bar + circular score */}
        <div className="pb-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-white"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          {/* Mini circular correct score */}
          <div className="relative shrink-0 w-8 h-8">
            <CircularScore correct={correctCount} total={Math.max(answeredCount, 1)} size={32} />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
              {correctCount}
            </span>
          </div>
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={q.number}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Question text */}
            <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm">
              <p className="text-[11px] font-semibold text-primary uppercase tracking-wide mb-2">
                {t('testQuestionLabel')} {q.number}
              </p>
              <p className="text-base font-semibold text-foreground leading-relaxed">{q.questionText}</p>
            </div>

            {/* Options */}
            {q.options.length > 0 ? (
              <div className="space-y-2.5">
                {q.options.map((opt, optIdx) => {
                  const isSelected = selectedOpt === optIdx;
                  const isCorrect = q.correctOptionIndex === optIdx;

                  let ring = 'border-border/70 bg-card hover:border-primary/40 hover:bg-primary/5';
                  let textClass = 'text-foreground';
                  let labelClass = 'bg-secondary text-muted-foreground';

                  if (isAnswered) {
                    if (isCorrect) {
                      ring = 'border-emerald-500 bg-emerald-500';
                      textClass = 'text-white font-semibold';
                      labelClass = 'bg-white/25 text-white';
                    } else if (isSelected && !isCorrect) {
                      ring = 'border-red-500 bg-red-500';
                      textClass = 'text-white font-semibold';
                      labelClass = 'bg-white/25 text-white';
                    }
                  } else if (isSelected) {
                    ring = 'border-primary/60 bg-primary/5';
                    labelClass = 'bg-primary text-primary-foreground';
                  }

                  return (
                    <motion.button
                      key={optIdx}
                      whileTap={{ scale: isAnswered ? 1 : 0.98 }}
                      onClick={() => handleSelectOption(optIdx)}
                      disabled={isAnswered}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all duration-200 shadow-sm',
                        ring,
                        isAnswered ? 'cursor-default' : 'cursor-pointer',
                      )}
                    >
                      {opt.label && (
                        <span className={cn('shrink-0 w-7 h-7 rounded-xl text-[12px] font-bold flex items-center justify-center transition-colors', labelClass)}>
                          {opt.label.toUpperCase()}
                        </span>
                      )}
                      <span className={cn('text-sm flex-1 text-left leading-snug', textClass)}>{opt.text}</span>
                      {isAnswered && isCorrect && <CheckCircle2 size={16} className="shrink-0 text-white" />}
                      {isAnswered && isSelected && !isCorrect && <XCircle size={16} className="shrink-0 text-white" />}
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              /* No options — show open answer */
              <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm">
                <p className="text-[11px] text-muted-foreground mb-2 font-medium">
                  {lang === 'bn' ? 'উত্তর:' : 'Answer:'}
                </p>
                <p className="text-sm font-semibold text-foreground">{q.correctAnswerText || '—'}</p>
              </div>
            )}

            {/* Feedback message */}
            <AnimatePresence>
              {isAnswered && q.options.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className="flex justify-center"
                >
                  <div className={cn(
                    'inline-flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm shadow-lg',
                    isCorrectSelected
                      ? 'bg-emerald-500 text-white shadow-emerald-200 dark:shadow-emerald-900/40'
                      : 'bg-red-500 text-white shadow-red-200 dark:shadow-red-900/40',
                  )}>
                    {isCorrectSelected
                      ? <CheckCircle2 size={15} className="shrink-0" />
                      : <XCircle size={15} className="shrink-0" />}
                    {isCorrectSelected ? t('testCorrect') : t('testWrong')}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-md border-t border-border/60 px-5 pb-safe-bottom">
        {/* "Answer first" hint */}
        <AnimatePresence>
          {showAnswerFirst && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-center text-[11px] text-amber-600 dark:text-amber-400 font-semibold pt-2"
            >
              {t('testAnswerFirst')}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="max-w-xl mx-auto flex items-center justify-between gap-2 py-3">
          {/* Previous */}
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="flex items-center gap-1 px-4 py-2.5 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground disabled:opacity-40 hover:bg-secondary transition-colors"
          >
            <ChevronLeft size={15} />
            {t('testPrev')}
          </button>

          {/* Skip — hidden if already answered or skipped, or no options */}
          {!isAnswered && !isSkipped && hasOptions ? (
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 px-4 py-2.5 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              <SkipForward size={14} />
              {t('testSkip')}
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground font-semibold tabular-nums">
              {answeredCount + skippedCount} / {total}
            </span>
          )}

          {/* Next / Finish */}
          <button
            onClick={handleNext}
            className={cn(
              'flex items-center gap-1 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors',
              !canAdvance
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : currentIdx === total - 1
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {currentIdx === total - 1 ? t('testFinish') : t('testNext')}
            {currentIdx < total - 1 && <ChevronRight size={15} />}
          </button>
        </div>
      </div>

      {/* Stop confirm */}
      <ConfirmModal
        isOpen={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={handleStop}
        title={t('testStop')}
        message={t('testStopConfirm')}
        confirmText={t('yes')}
        cancelText={t('cancel')}
        isDanger
      />

      {/* Back confirm */}
      <ConfirmModal
        isOpen={confirmBack}
        onClose={() => setConfirmBack(false)}
        onConfirm={handleGoBack}
        title={t('testBack')}
        message={t('testBackConfirm')}
        confirmText={t('yes')}
        cancelText={t('cancel')}
        isDanger
      />
    </div>
  );
}
