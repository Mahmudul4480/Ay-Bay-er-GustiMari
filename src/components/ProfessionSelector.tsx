import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, CheckCircle2, Info, PencilLine, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import {
  PROFESSIONS,
  type ProfessionId,
  buildMergedCategoriesForProfession,
} from '../lib/professionData';

const ProfessionSelector: React.FC = () => {
  const { user, userProfile } = useAuth();
  const [selected, setSelected] = useState<ProfessionId | null>(null);
  const [customProfession, setCustomProfession] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const customBoxRef = useRef<HTMLDivElement>(null);

  // Auto-focus the text input and scroll it into view when 'other' is selected
  useEffect(() => {
    if (selected === 'other') {
      setTimeout(() => {
        customInputRef.current?.focus();
        customBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [selected]);

  // Detect whether this is an existing user coming back to set profession
  const isExistingUser = !!(
    userProfile &&
    (userProfile.incomeCategories?.length || userProfile.expenseCategories?.length)
  );

  // Continue is enabled when:
  //   - A non-'other' profession is selected, OR
  //   - 'other' is selected AND the custom text field is non-empty
  const canContinue =
    !submitting &&
    selected !== null &&
    (selected !== 'other' || customProfession.trim().length > 0);

  const handleContinue = async () => {
    if (!user || !selected || !canContinue) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      // For 'other', use the custom text as the Firestore profession value.
      // Category initialization still uses the 'other' ProfessionId so the
      // user gets the generic personal category set — this is intentional.
      const professionValue =
        selected === 'other' ? customProfession.trim() : selected;

      const { income, expense } = buildMergedCategoriesForProfession(
        selected,
        userProfile?.incomeCategories,
        userProfile?.expenseCategories
      );

      await updateDoc(doc(db, 'users', user.uid), {
        profession: professionValue,
        incomeCategories: income,
        expenseCategories: expense,
      });
      // On success the onSnapshot in AuthContext will update userProfile,
      // which causes App.tsx to navigate away from this screen automatically.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('ProfessionSelector save failed:', msg);
      setSaveError('Could not save your profession. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 px-4 py-10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-5xl"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            {isExistingUser ? 'One more step!' : 'What best describes you?'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
            {isExistingUser
              ? "We'll add the right income & expense categories for your profession."
              : "We'll tailor your income and expense categories to match your profession."}
          </p>
        </div>

        {/* Existing-user notice */}
        <AnimatePresence>
          {isExistingUser && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-700/60 dark:bg-blue-900/20"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your existing categories and transactions are safe — we&apos;ll only
                <strong> add</strong> new profession-specific categories without removing anything.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Profession grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {PROFESSIONS.map((p, i) => {
            const Icon = p.icon;
            const isSel = selected === p.id;
            return (
              <motion.button
                key={p.id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelected(p.id)}
                className={cn(
                  'group relative flex flex-col items-center rounded-2xl border-2 p-4 text-center transition-all sm:rounded-3xl sm:p-5',
                  p.cardClass,
                  isSel
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950'
                    : 'hover:border-blue-300/80 hover:shadow-md dark:hover:border-blue-700/50'
                )}
              >
                {/* Checkmark badge */}
                <AnimatePresence>
                  {isSel && (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      className="absolute right-2 top-2"
                    >
                      <CheckCircle2 className="h-5 w-5 text-blue-600 drop-shadow-sm" />
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Icon */}
                <div
                  className={cn(
                    'mb-2.5 flex h-12 w-12 items-center justify-center rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl',
                    p.iconWrapClass,
                    isSel && 'ring-2 ring-blue-400/50 ring-offset-1'
                  )}
                >
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} />
                </div>

                {/* English label */}
                <span className="text-xs font-bold leading-tight text-slate-800 dark:text-slate-100 sm:text-sm">
                  {p.label}
                </span>

                {/* Bengali sublabel */}
                <span className="mt-0.5 text-[10px] font-medium leading-tight text-slate-500 dark:text-slate-400 sm:text-xs">
                  {p.sublabel}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Custom profession input — only shown when 'other' is selected */}
        <AnimatePresence>
          {selected === 'other' && (
            <motion.div
              key="custom-profession-box"
              ref={customBoxRef}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="mt-6 mx-auto max-w-md"
            >
              <div className="rounded-2xl border-2 border-blue-300 bg-white p-5 shadow-lg shadow-blue-100/60 dark:border-blue-600 dark:bg-slate-800 dark:shadow-none">
                <label
                  htmlFor="custom-profession"
                  className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"
                >
                  <PencilLine className="h-4 w-4 text-blue-500" />
                  আপনার পেশাটি লিখুন
                  <span className="ml-auto text-xs font-normal text-slate-400">(যেমন: নার্স, সাংবাদিক, শিল্পী)</span>
                </label>
                <input
                  ref={customInputRef}
                  id="custom-profession"
                  type="text"
                  value={customProfession}
                  onChange={(e) => setCustomProfession(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) void handleContinue(); }}
                  placeholder="e.g. Nurse, Journalist, Pilot…"
                  maxLength={60}
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/25 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 dark:focus:border-blue-400 dark:focus:bg-slate-800"
                />
                <AnimatePresence>
                  {customProfession.trim().length > 0 && (
                    <motion.p
                      key="preview"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
                    >
                      সংরক্ষিত হবে:{' '}
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {customProfession.trim()}
                      </span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected pill summary */}
        <AnimatePresence>
          {selected && selected !== 'other' && (
            <motion.p
              key={selected}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-6 text-center text-sm font-medium text-slate-600 dark:text-slate-400"
            >
              Selected:{' '}
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 font-bold text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/30 dark:text-blue-300">
                {PROFESSIONS.find((p) => p.id === selected)?.label}
                &nbsp;·&nbsp;
                {PROFESSIONS.find((p) => p.id === selected)?.sublabel}
              </span>
            </motion.p>
          )}
        </AnimatePresence>

        {/* Save error */}
        <AnimatePresence>
          {saveError && (
            <motion.div
              key="save-error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mt-6 mx-auto max-w-md flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800/60 dark:bg-red-900/20"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-sm font-medium text-red-700 dark:text-red-300">{saveError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue button */}
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            disabled={!canContinue}
            onClick={handleContinue}
            className={cn(
              'flex min-w-[220px] items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-bold text-white shadow-lg transition-all',
              'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]',
              'shadow-blue-500/25',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                {!selected
                  ? 'Select a Profession'
                  : selected === 'other' && !customProfession.trim()
                    ? 'Enter Your Profession'
                    : 'Continue'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ProfessionSelector;
