import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase,
  Calculator,
  Coins,
  Gem,
  HandCoins,
  Info,
  Landmark,
  Save,
  Scale,
} from 'lucide-react';
import { db } from '../../firebaseConfig';
import { mergeGrowthMarketingTags } from '../../lib/marketingTagsSync';
import { formatCurrency, cn } from '../../lib/utils';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useNetDebitData } from '../../hooks/useNetDebitData';
import WealthNumberField from './WealthNumberField';
import {
  ZAKAT_WEALTH_FIRESTORE_DOC_ID,
  DEFAULT_NISAB_BDT,
  computeZakatWealthTotals,
  defaultZakatWealthInputs,
  parseZakatWealthInputs,
  type ZakatWealthInputs,
  ZAKAT_CALCULATOR_SOURCE,
  ZAKAT_CALCULATOR_VERSION,
} from '../../lib/zakatWealthCalculator';

const ZAKAT_GOLD = '#FFD700';

function bdtRound(n: number): number {
  return Math.round(Number(n) || 0);
}

const sectionMotion = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

function GlassSectionCard({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      {...sectionMotion}
      transition={{ type: 'spring', stiffness: 280, damping: 26, delay }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-indigo-300/25 bg-slate-900/[0.78] p-4 text-slate-100 shadow-xl backdrop-blur-xl sm:p-5',
        'dark:border-white/10 dark:bg-slate-950/80',
        'shadow-[0_18px_50px_-12px_rgba(79,70,229,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]',
        'dark:shadow-[0_20px_56px_-14px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]',
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-fuchsia-500/10"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

function SectionHeader({
  Icon,
  title,
  subtitle,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/35 bg-gradient-to-br from-indigo-600/90 to-violet-700/90 shadow-[0_0_22px_rgba(34,211,238,0.35)]">
        <Icon className="h-5 w-5 text-cyan-100" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <h4 className="text-sm font-black uppercase tracking-wide text-white drop-shadow-sm">{title}</h4>
        {subtitle ? <p className="mt-0.5 text-[11px] font-medium text-slate-300">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function ZakatIntegrityToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn(
        'pointer-events-auto max-w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[#FFD700]/45',
        'bg-slate-950/88 px-4 py-3 text-center text-[13px] font-bold leading-snug text-amber-50',
        'shadow-[0_0_36px_rgba(255,215,0,0.38),0_16px_40px_rgba(99,102,241,0.25),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl'
      )}
    >
      <p className="text-balance">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2.5 w-full rounded-xl border border-cyan-400/35 bg-gradient-to-r from-indigo-600/80 to-violet-700/80 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
      >
        OK
      </button>
    </motion.div>
  );
}

export interface WealthVaultZakatCalculatorProps {
  uid: string | undefined;
  language: 'en' | 'bn';
  cardShell: (...extra: (string | boolean | undefined)[]) => string;
  zakatAnchorRef?: React.Ref<HTMLDivElement>;
}

const WealthVaultZakatCalculator: React.FC<WealthVaultZakatCalculatorProps> = ({
  uid,
  language,
  cardShell,
  zakatAnchorRef,
}) => {
  const { t } = useLocalization();
  const { recoverableAssets, totalPayables, netDebitSum, debtsLoading } = useNetDebitData();

  const [inputs, setInputs] = useState<ZakatWealthInputs>(() => defaultZakatWealthInputs());
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [integrityToast, setIntegrityToast] = useState<string | null>(null);

  const recvDirtyRef = useRef(false);
  const debtsDirtyRef = useRef(false);
  const skipNetDerivedOnceRef = useRef(false);

  const totals = useMemo(() => computeZakatWealthTotals(inputs), [inputs]);

  const setField = useCallback(<K extends keyof ZakatWealthInputs>(key: K, value: ZakatWealthInputs[K]) => {
    if (key === 'lentMoneyBdt' || key === 'businessDuesBdt') recvDirtyRef.current = true;
    if (key === 'debtsBdt') debtsDirtyRef.current = true;
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const integrityMessageBn = t('zakatNetDebitIntegrityBn');

  const showReceivablesIntegrityIfNeeded = useCallback(() => {
    const manual = bdtRound(inputs.lentMoneyBdt + inputs.businessDuesBdt);
    const net = bdtRound(recoverableAssets);
    if (manual !== net) setIntegrityToast(integrityMessageBn);
  }, [inputs.lentMoneyBdt, inputs.businessDuesBdt, recoverableAssets, integrityMessageBn]);

  const showDebtsIntegrityIfNeeded = useCallback(() => {
    const manual = bdtRound(inputs.debtsBdt);
    const net = bdtRound(totalPayables);
    if (manual !== net) setIntegrityToast(integrityMessageBn);
  }, [inputs.debtsBdt, totalPayables, integrityMessageBn]);

  useEffect(() => {
    if (!integrityToast) return;
    const tmr = window.setTimeout(() => setIntegrityToast(null), 9000);
    return () => window.clearTimeout(tmr);
  }, [integrityToast]);

  /** Hydrate worksheet from Firestore once debts stream is ready. */
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    if (debtsLoading) return;

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'wealth', ZAKAT_WEALTH_FIRESTORE_DOC_ID));
        if (cancelled) return;
        if (snap.exists()) {
          setInputs(parseZakatWealthInputs(snap.data()));
          /** Saved worksheet: do not overwrite receivables/debts from Net Debit until user clears or re-saves. */
          recvDirtyRef.current = true;
          debtsDirtyRef.current = true;
        } else {
          setInputs({
            ...defaultZakatWealthInputs(),
            lentMoneyBdt: recoverableAssets,
            debtsBdt: totalPayables,
          });
          recvDirtyRef.current = false;
          debtsDirtyRef.current = false;
        }
        skipNetDerivedOnceRef.current = true;
      } catch {
        if (!cancelled) {
          setInputs({
            ...defaultZakatWealthInputs(),
            lentMoneyBdt: recoverableAssets,
            debtsBdt: totalPayables,
          });
          skipNetDerivedOnceRef.current = true;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-hydrate when user or loading gate changes
  }, [uid, debtsLoading]);

  /** Live sync from Net Debit sums unless the user has overridden receivables / debts. */
  useEffect(() => {
    if (!uid || debtsLoading || loading) return;
    if (skipNetDerivedOnceRef.current) {
      skipNetDerivedOnceRef.current = false;
      return;
    }
    setInputs((prev) => ({
      ...prev,
      lentMoneyBdt: recvDirtyRef.current ? prev.lentMoneyBdt : recoverableAssets,
      debtsBdt: debtsDirtyRef.current ? prev.debtsBdt : totalPayables,
    }));
  }, [uid, debtsLoading, loading, recoverableAssets, totalPayables]);

  const persist = useCallback(async () => {
    if (!uid) return;
    setSaveStatus('saving');
    try {
      const t = computeZakatWealthTotals(inputs);
      await setDoc(
        doc(db, 'users', uid, 'wealth', ZAKAT_WEALTH_FIRESTORE_DOC_ID),
        {
          ...inputs,
          source: ZAKAT_CALCULATOR_SOURCE,
          version: ZAKAT_CALCULATOR_VERSION,
          totalWealthBdt: t.totalWealthBdt,
          zakatDueBdt: t.zakatDueBdt,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      void mergeGrowthMarketingTags(uid, ['Wealth Vault User', 'Zakat Calculator User']);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [uid, inputs]);

  const bn = language === 'bn';

  const exclusionItems = bn
    ? ['ব্যক্তিগত বাড়ি', 'গাড়ি', 'ফার্নিচার', 'কাপড়', 'কাজের টুল/কম্পিউটার']
    : ['Personal house', 'Car', 'Furniture', 'Clothes', 'Tools / computers for work'];

  if (!uid) {
    return (
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        {bn ? 'লগইন করুন।' : 'Sign in to use the Wealth Vault.'}
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        /* overflow visible so sticky Zakat footer can stick to viewport while scrolling */
        cardShell('relative overflow-x-hidden p-4 sm:p-6'),
        'border-indigo-200/40 dark:border-indigo-500/20'
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-600/15 via-violet-600/10 to-cyan-500/10" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />

      <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="relative mx-auto w-full max-w-[6.5rem] shrink-0 sm:mx-0">
          <motion.div
            className="relative flex h-28 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-950 shadow-[0_22px_48px_rgba(76,29,149,0.55),inset_0_2px_0_rgba(255,255,255,0.12)] ring-2 ring-[#FFD700]/45"
            style={{ transformStyle: 'preserve-3d' }}
            initial={{ rotateY: -8, rotateX: 6 }}
            animate={{ rotateY: [-6, 6, -6], rotateX: [4, 8, 4] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden
          >
            <div className="absolute inset-1 rounded-xl border border-white/10 bg-black/25" style={{ transform: 'translateZ(8px)' }} />
            <Landmark className="relative z-10 h-11 w-11 text-[#FFD700] drop-shadow-[0_0_14px_rgba(255,215,0,0.65)]" strokeWidth={2} />
          </motion.div>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h3 className="flex items-center justify-center gap-2 text-sm font-black uppercase tracking-wider text-indigo-200 sm:justify-start">
            <Landmark className="h-4 w-4 text-cyan-300" />
            {bn ? 'ওয়েলথ ভল্ট · জাকাত' : 'Wealth Vault · Zakat'}
          </h3>
          <p className="mt-1 text-xs text-indigo-100/80 dark:text-violet-100/75">
            {bn
              ? 'সম্পদের বিভাগ অনুযায়ী লিখুন — নিসাব ও হিসাব রিয়েল টাইমে আপডেট হয়।'
              : 'Enter assets by section — Nisāb and Zakat update in real time.'}
          </p>
        </div>
      </div>

      <div ref={zakatAnchorRef} id="dashboard-zakat-anchor" className="scroll-mt-24 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mt-5 rounded-2xl border border-cyan-400/30 bg-slate-950/40 p-3 backdrop-blur-md sm:p-4"
        >
          <div className="flex gap-2 text-cyan-100">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-cyan-200">
                {bn ? 'এতে অন্তর্ভুক্ত নয়' : "What's NOT included"}
              </p>
              <ul className="mt-2 list-inside list-disc text-[11px] font-medium leading-relaxed text-indigo-50/90 sm:text-xs">
                {exclusionItems.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>

        <div className="mt-5 space-y-4">
          <GlassSectionCard delay={0.02}>
            <SectionHeader
              Icon={Coins}
              title={bn ? 'নগদ সম্পদ' : 'Cash assets'}
              subtitle={bn ? 'হাতে নগদ, ব্যাংক, মোবাইল ব্যাংকিং' : 'Cash in hand, bank, mobile banking'}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <WealthNumberField
                id="zv-cash"
                label={bn ? 'হাতে নগদ' : 'Cash in hand'}
                value={inputs.cashInHandBdt}
                onChange={(v) => setField('cashInHandBdt', v)}
              />
              <WealthNumberField
                id="zv-bank"
                label={bn ? 'ব্যাংক ব্যালেন্স' : 'Bank balance'}
                value={inputs.bankBalanceBdt}
                onChange={(v) => setField('bankBalanceBdt', v)}
              />
              <WealthNumberField
                id="zv-mobile"
                label={bn ? 'মোবাইল ব্যাংকিং (বিকাশ/নগদ)' : 'Mobile banking (bKash/Nagad)'}
                value={inputs.mobileBankingBdt}
                onChange={(v) => setField('mobileBankingBdt', v)}
              />
            </div>
          </GlassSectionCard>

          <GlassSectionCard delay={0.06}>
            <SectionHeader
              Icon={Gem}
              title={bn ? 'স্বর্ণ ও রূপা' : 'Gold & silver'}
              subtitle={bn ? 'বাজার মূল্য অনুযায়ী (বর্তমান)' : 'At current market value'}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WealthNumberField
                id="zv-gold"
                label={bn ? 'স্বর্ণের মূল্য (৳)' : 'Gold value (BDT)'}
                value={inputs.goldValueBdt}
                onChange={(v) => setField('goldValueBdt', v)}
              />
              <WealthNumberField
                id="zv-silver"
                label={bn ? 'রূপার মূল্য (৳)' : 'Silver value (BDT)'}
                value={inputs.silverValueBdt}
                onChange={(v) => setField('silverValueBdt', v)}
              />
            </div>
          </GlassSectionCard>

          <GlassSectionCard delay={0.1}>
            <SectionHeader
              Icon={Briefcase}
              title={bn ? 'ব্যবসায়িক সম্পদ' : 'Business assets'}
              subtitle={bn ? 'বিক্রয় মূল্যে মজুদ ও পণ্য' : 'Stock & goods at selling price'}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WealthNumberField
                id="zv-shop"
                label={bn ? 'দোকান / ইনভেন্টরি' : 'Shop / inventory stock'}
                value={inputs.shopInventoryBdt}
                onChange={(v) => setField('shopInventoryBdt', v)}
              />
              <WealthNumberField
                id="zv-trade"
                label={bn ? 'হোলসেল / রিটেল পণ্য' : 'Wholesale / retail goods'}
                value={inputs.wholesaleRetailBdt}
                onChange={(v) => setField('wholesaleRetailBdt', v)}
              />
            </div>
          </GlassSectionCard>

          <GlassSectionCard delay={0.14}>
            <SectionHeader
              Icon={HandCoins}
              title={bn ? 'পাওনা (পাওয়া টাকা)' : 'Receivables (pawa)'}
              subtitle={bn ? 'শুধু আদায়যোগ্য' : 'Only if recoverable'}
            />
            <p className="mb-3 text-[10px] font-semibold leading-relaxed text-cyan-200/85">
              {bn ? (
                <>
                  নেট ডেবিট থেকে যোগ্য পাওনা: {formatCurrency(recoverableAssets, language)} · পাওনা − দেনা:{' '}
                  {formatCurrency(netDebitSum, language)}
                </>
              ) : (
                <>
                  Net Debit recoverable receivables: {formatCurrency(recoverableAssets, language)} · Net (pawa − dena):{' '}
                  {formatCurrency(netDebitSum, language)}
                </>
              )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WealthNumberField
                id="zv-lent"
                label={bn ? 'ধার দেওয়া টাকা' : 'Lent money'}
                value={inputs.lentMoneyBdt}
                onChange={(v) => setField('lentMoneyBdt', v)}
                onFieldInteract={showReceivablesIntegrityIfNeeded}
              />
              <WealthNumberField
                id="zv-dues"
                label={bn ? 'ব্যবসায়িক বাকি' : 'Business dues'}
                value={inputs.businessDuesBdt}
                onChange={(v) => setField('businessDuesBdt', v)}
                onFieldInteract={showReceivablesIntegrityIfNeeded}
              />
            </div>
          </GlassSectionCard>

          <GlassSectionCard delay={0.18}>
            <SectionHeader
              Icon={Calculator}
              title={bn ? 'বিনিয়োগ' : 'Investments'}
              subtitle={bn ? 'নগদ মূল্যে' : 'At cash value'}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <WealthNumberField
                id="zv-shares"
                label={bn ? 'শেয়ার বাজার' : 'Share market'}
                value={inputs.shareMarketBdt}
                onChange={(v) => setField('shareMarketBdt', v)}
              />
              <WealthNumberField
                id="zv-savings-cert"
                label={bn ? 'সঞ্চয়পত্র' : 'Savings certificates'}
                value={inputs.savingsCertificatesBdt}
                onChange={(v) => setField('savingsCertificatesBdt', v)}
              />
              <WealthNumberField
                id="zv-dps"
                label={bn ? 'ডিপিএস / এফডিআর' : 'DPS / FDR'}
                value={inputs.dpsFdrBdt}
                onChange={(v) => setField('dpsFdrBdt', v)}
              />
            </div>
          </GlassSectionCard>

          <GlassSectionCard delay={0.22}>
            <SectionHeader
              Icon={Scale}
              title={bn ? 'ঋণ ও নিসাব' : 'Debts & Nisāb'}
              subtitle={bn ? 'মোট সম্পদ = সম্পদের যোগফল − পরিশোধযোগ্য ঋণ' : 'Total wealth = assets − debts to pay'}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <WealthNumberField
                id="zv-debts"
                label={bn ? 'বর্তমান ঋণ / পরিশোধ করতে হবে' : 'Current debts / loans to pay'}
                value={inputs.debtsBdt}
                onChange={(v) => setField('debtsBdt', v)}
                onFieldInteract={showDebtsIntegrityIfNeeded}
              />
              <WealthNumberField
                id="zv-nisab"
                label={bn ? 'নিসাব সীমা (৳)' : 'Nisāb threshold (BDT)'}
                hint={bn ? 'ডিফল্ট ৮৫,০০০ — প্রয়োজনে বদলান' : 'Default ৳85,000 — edit if needed'}
                value={inputs.nisabBdt}
                onChange={(v) => setField('nisabBdt', v > 0 ? v : DEFAULT_NISAB_BDT)}
              />
            </div>
            <p className="mt-2 text-[10px] font-semibold text-violet-200/90">
              {bn ? (
                <>নেট ডেবিট থেকে মোট দেনা: {formatCurrency(totalPayables, language)}</>
              ) : (
                <>Net Debit total payables (dena): {formatCurrency(totalPayables, language)}</>
              )}
            </p>
            <p className="mt-3 text-[11px] font-semibold text-indigo-100/85">
              {bn ? (
                <>
                  মোট সম্পদ (ঋণ বাদে):{' '}
                  <span className="font-black text-cyan-200">{formatCurrency(totals.totalWealthBdt, language)}</span>
                  {!totals.meetsNisab ? (
                    <span className="block pt-1 text-amber-200/90">
                      নিসাবের নিচে — জাকাত ০ (শরীয়ত পরামর্শ নিন)।
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  Total wealth (after debts):{' '}
                  <span className="font-black text-cyan-200">{formatCurrency(totals.totalWealthBdt, language)}</span>
                  {!totals.meetsNisab ? (
                    <span className="block pt-1 text-amber-200/90">Below Nisāb — Zakat due is 0 (seek scholarly guidance).</span>
                  ) : null}
                </>
              )}
            </p>
          </GlassSectionCard>
        </div>

        <div className="relative z-10 mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => void persist()}
            disabled={saveStatus === 'saving'}
            className={cn(
              'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-black text-white transition-all',
              'bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 shadow-lg shadow-indigo-500/30',
              'hover:brightness-110 active:scale-[0.98] disabled:opacity-60'
            )}
          >
            <Save className="h-4 w-4" />
            {saveStatus === 'saving'
              ? bn
                ? 'সংরক্ষণ…'
                : 'Saving…'
              : bn
                ? 'ওয়েলথ ভল্ট সংরক্ষণ'
                : 'Save to Wealth Vault'}
          </button>
          {saveStatus === 'saved' ? (
            <p className="text-center text-xs font-bold text-emerald-400 sm:self-center">{bn ? 'সংরক্ষিত।' : 'Saved.'}</p>
          ) : null}
          {saveStatus === 'error' ? (
            <p className="text-center text-xs font-bold text-rose-400 sm:self-center">{bn ? 'ত্রুটি। আবার চেষ্টা করুন।' : 'Error. Try again.'}</p>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'sticky bottom-0 z-20 -mx-4 mt-4 border-t border-[#FFD700]/35 bg-gradient-to-r from-indigo-950/95 via-violet-950/95 to-indigo-950/95 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6',
          'shadow-[0_-12px_40px_rgba(255,215,0,0.25),0_0_48px_rgba(99,102,241,0.2)]'
        )}
        style={{ boxShadow: `0 -8px 32px rgba(255, 215, 0, 0.22), 0 0 40px rgba(56, 189, 248, 0.15)` }}
      >
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          <div className="flex items-center gap-2 text-[#FFD700]">
            <Coins className="h-5 w-5 shrink-0" strokeWidth={2.2} />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] drop-shadow-[0_0_12px_rgba(255,215,0,0.5)]">
              {bn ? 'মোট জাকাত প্রাপ্য' : 'Total Zakat due'}
            </span>
          </div>
          <p
            className="text-2xl font-black tabular-nums sm:text-3xl"
            style={{
              color: ZAKAT_GOLD,
              textShadow: '0 0 24px rgba(255, 215, 0, 0.55), 0 2px 0 rgba(76, 29, 149, 0.35)',
            }}
          >
            {formatCurrency(totals.zakatDueBdt, language)}
          </p>
        </div>
        <p className="mt-1 text-center text-[10px] font-semibold text-indigo-200/80 sm:text-left">
          {bn
            ? `২.৫% × মোট সম্পদ (নিসাব: ${formatCurrency(inputs.nisabBdt, language)}+)`
            : `2.5% × total wealth (if Nisāb ≥ ${formatCurrency(inputs.nisabBdt, language)})`}
        </p>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[85] flex justify-center px-3 sm:bottom-24">
        <AnimatePresence>
          {integrityToast ? (
            <div className="pointer-events-auto">
              <ZakatIntegrityToast message={integrityToast} onDismiss={() => setIntegrityToast(null)} />
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.section>
  );
};

export default WealthVaultZakatCalculator;
