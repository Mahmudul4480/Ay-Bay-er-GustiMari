/**
 * Legacy / bug-affected users: onboarding done but no phoneNumber in Firestore.
 * Blocks main app until they save a number (merge — no data loss).
 */

import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Phone, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { db } from '../firebaseConfig';

const CollectPhonePrompt: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLocalization();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBn = language === 'bn';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      setError(isBn ? 'মোবাইল নম্বর লিখুন।' : 'Please enter your mobile number.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { phoneNumber: trimmed },
        { merge: true },
      );
      console.log(`Success: Phone number ${trimmed} saved for user ${user.uid}`);
    } catch (err) {
      console.error('[CollectPhonePrompt]', err);
      setError(
        isBn
          ? 'সংরক্ষণ ব্যর্থ। আবার চেষ্টা করুন।'
          : 'Could not save. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-violet-50/30 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div
          className={[
            'overflow-hidden rounded-[2rem] border border-indigo-200/60 bg-white/80 p-8 shadow-[0_0_0_1px_rgba(99,102,241,0.12),0_24px_48px_-12px_rgba(0,0,0,0.18)]',
            'backdrop-blur-xl dark:border-indigo-500/25 dark:bg-slate-900/85',
          ].join(' ')}
        >
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/35">
              <Phone className="h-8 w-8" />
            </div>
          </div>

          <h1 className="text-center text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {isBn ? 'মোবাইল নম্বর যোগ করুন' : 'Add your mobile number'}
          </h1>
          <p className="mt-2 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {isBn
              ? 'আপনার অ্যাকাউন্টে মোবাইল নম্বর সংরক্ষিত নেই। চালিয়ে যেতে নম্বরটি লিখুন।'
              : 'We do not have a mobile number on your account. Enter it to continue.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {isBn ? 'মোবাইল নম্বর' : 'Mobile number'}
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={isBn ? '+৮৮০ …' : '+880 …'}
                autoComplete="tel"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-lg font-medium text-slate-900 outline-none transition focus:ring-4 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  {isBn ? 'সংরক্ষণ করুন' : 'Save & continue'}
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default CollectPhonePrompt;
