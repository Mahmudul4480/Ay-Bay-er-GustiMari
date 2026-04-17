import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, cn } from '../../lib/utils';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  Heart,
  PiggyBank,
  Plus,
  Trash2,
  Gift,
  Smartphone,
  Bike,
  Plane,
  Home,
  Laptop,
} from 'lucide-react';
import type { Transaction } from '../../hooks/useTransactions';
import { computeFinancialPersona } from '../../lib/financialPersona';
import { mergeGrowthMarketingTags, mergeMarketingTagsFromTexts } from '../../lib/marketingTagsSync';
import { personaMarketingTag } from '../../lib/growthMarketingTags';
import { computeAllTimeCashBalance, newId, txAmt, type DonationEntry, type WishlistItem } from '../../lib/growthFinance';
import WealthVaultZakatCalculator from '../zakat/WealthVaultZakatCalculator';
type DreamPreset = {
  id: string;
  nameBn: string;
  nameEn: string;
  catBn: string;
  catEn: string;
  Icon: LucideIcon;
};

const DREAM_PRESETS: DreamPreset[] = [
  {
    id: 'iphone',
    nameBn: 'আইফোন',
    nameEn: 'iPhone',
    catBn: 'মোবাইল',
    catEn: 'Mobile',
    Icon: Smartphone,
  },
  {
    id: 'bike',
    nameBn: 'মোটরবাইক',
    nameEn: 'Motorcycle',
    catBn: 'যানবাহন',
    catEn: 'Vehicle',
    Icon: Bike,
  },
  {
    id: 'hajj',
    nameBn: 'হজ / উমরাহ',
    nameEn: 'Hajj / Umrah',
    catBn: 'ভ্রমণ',
    catEn: 'Travel',
    Icon: Plane,
  },
  {
    id: 'home',
    nameBn: 'নিজের বাড়ি',
    nameEn: 'Own home',
    catBn: 'বাসস্থান',
    catEn: 'Housing',
    Icon: Home,
  },
  {
    id: 'laptop',
    nameBn: 'ল্যাপটপ',
    nameEn: 'Laptop',
    catBn: 'ইলেকট্রনিক্স',
    catEn: 'Electronics',
    Icon: Laptop,
  },
];

function dreamProgressPercent(cashBdt: number, targetBdt: number): number {
  if (!(targetBdt > 0)) return 0;
  return Math.min(100, (Math.max(0, cashBdt) / targetBdt) * 100);
}

function DreamNeonProgressBar({
  pct,
  language,
}: {
  pct: number;
  language: 'en' | 'bn';
}) {
  return (
    <div className="mt-3 w-full" style={{ perspective: '480px' }}>
      <div
        className="relative h-4 w-full origin-center overflow-hidden rounded-full border border-fuchsia-400/45 bg-gradient-to-b from-slate-700/90 via-slate-800/95 to-slate-950 shadow-[inset_0_4px_14px_rgba(0,0,0,0.55),0_6px_0_rgba(168,85,247,0.12),0_0_24px_rgba(236,72,153,0.15)] dark:border-fuchsia-500/35 dark:from-slate-900 dark:via-slate-950 dark:to-black dark:shadow-[inset_0_4px_14px_rgba(0,0,0,0.65),0_0_28px_rgba(167,139,250,0.2)]"
        style={{ transform: 'rotateX(14deg) scale(0.98)' }}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-pink-500 shadow-[0_0_22px_rgba(236,72,153,0.85),0_0_40px_rgba(34,211,238,0.35),inset_0_1px_0_rgba(255,255,255,0.35)]"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent opacity-40"
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-center text-[11px] font-black tabular-nums text-fuchsia-600 dark:text-fuchsia-300">
        {pct.toFixed(0)}% ·{' '}
        {language === 'bn' ? 'স্বপ্নের দিকে অগ্রগতি' : 'toward your dream'}
      </p>
    </div>
  );
}

export interface GrowthDashboardSectionsProps {
  transactions: Transaction[];
  language: 'en' | 'bn';
  cardShell: (...extra: (string | boolean | undefined)[]) => string;
  /** Increment (e.g. from speed dial) to scroll to wishlist / dream entry and focus the name field. */
  wishlistFocusSignal?: number;
  /** Increment to scroll to Zakat / wealth vault estimate. */
  zakatFocusSignal?: number;
}

function parseWishlist(raw: unknown): WishlistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      return {
        id: String(o.id || newId()),
        name: String(o.name || ''),
        category: String(o.category || ''),
        price: Math.max(0, Number(o.price) || 0),
        imageUrl: o.imageUrl ? String(o.imageUrl) : undefined,
        createdAt: o.createdAt ? String(o.createdAt) : undefined,
      } as WishlistItem;
    })
    .filter(Boolean) as WishlistItem[];
}

function parseDonations(raw: unknown): DonationEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== 'object') return null;
      const o = x as Record<string, unknown>;
      return {
        id: String(o.id || newId()),
        amount: Math.max(0, Number(o.amount) || 0),
        note: o.note ? String(o.note) : undefined,
        createdAt: o.createdAt ? String(o.createdAt) : undefined,
      } as DonationEntry;
    })
    .filter(Boolean) as DonationEntry[];
}

const GrowthDashboardSections: React.FC<GrowthDashboardSectionsProps> = ({
  transactions,
  language,
  cardShell,
  wishlistFocusSignal = 0,
  zakatFocusSignal = 0,
}) => {
  const { user, userProfile } = useAuth();
  const uid = user?.uid;
  const cashAllTime = useMemo(() => computeAllTimeCashBalance(transactions), [transactions]);
  const persona = useMemo(() => computeFinancialPersona(transactions), [transactions]);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [donations, setDonations] = useState<DonationEntry[]>([]);
  const [wlName, setWlName] = useState('');
  const [wlCat, setWlCat] = useState('');
  const [wlPrice, setWlPrice] = useState('');
  const [wlImg, setWlImg] = useState('');
  const [dreamPresetId, setDreamPresetId] = useState<string | null>(null);
  const [donAmount, setDonAmount] = useState('');
  const [donNote, setDonNote] = useState('');

  const wishlistSectionRef = useRef<HTMLElement | null>(null);
  const wlNameInputRef = useRef<HTMLInputElement | null>(null);
  const zakatScrollRef = useRef<HTMLDivElement | null>(null);

  const zakatTagged = useRef(false);
  useEffect(() => {
    if (!uid || zakatTagged.current) return;
    zakatTagged.current = true;
    void mergeGrowthMarketingTags(uid, ['Zakat Calculator User']);
  }, [uid]);

  useEffect(() => {
    if (!wishlistFocusSignal) return;
    wishlistSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = window.setTimeout(() => {
      wlNameInputRef.current?.focus({ preventScroll: true });
    }, 450);
    return () => window.clearTimeout(t);
  }, [wishlistFocusSignal]);

  useEffect(() => {
    if (!zakatFocusSignal) return;
    zakatScrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [zakatFocusSignal]);

  useEffect(() => {
    if (!userProfile) return;
    setWishlist(parseWishlist(userProfile.wishlist));
    setDonations(parseDonations(userProfile.donations));
  }, [userProfile?.wishlist, userProfile?.donations, userProfile]);

  useEffect(() => {
    if (!uid) return;
    if (userProfile?.financialPersona?.id === persona.id) return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await updateDoc(doc(db, 'users', uid), {
            financialPersona: {
              id: persona.id,
              label: persona.label,
              labelBn: persona.labelBn,
              updatedAt: serverTimestamp(),
            },
          });
          await mergeGrowthMarketingTags(uid, [personaMarketingTag(persona.label)]);
        } catch (e) {
          console.warn('financialPersona sync:', e);
        }
      })();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [uid, persona.id, persona.label, persona.labelBn, userProfile?.financialPersona?.id]);

  const persistWishlist = useCallback(
    async (next: WishlistItem[]) => {
      if (!uid) return;
      setWishlist(next);
      try {
        await updateDoc(doc(db, 'users', uid), {
          wishlist: next,
          wishlistUpdatedAt: serverTimestamp(),
        });
        await mergeGrowthMarketingTags(uid, ['Wishlist User']);
        const text = next.map((w) => `${w.name} ${w.category}`).join('\n');
        await mergeMarketingTagsFromTexts(uid, [text]);
      } catch (e) {
        console.warn('wishlist save:', e);
      }
    },
    [uid],
  );

  const persistDonations = useCallback(
    async (next: DonationEntry[]) => {
      if (!uid) return;
      setDonations(next);
      try {
        await updateDoc(doc(db, 'users', uid), {
          donations: next,
          donationsUpdatedAt: serverTimestamp(),
        });
        await mergeGrowthMarketingTags(uid, ['Donation Tracker']);
        await mergeMarketingTagsFromTexts(
          uid,
          next.map((d) => `donation ${d.amount} ${d.note || ''}`),
        );
      } catch (e) {
        console.warn('donations save:', e);
      }
    },
    [uid],
  );

  const addWishlist = () => {
    const price = Number(wlPrice) || 0;
    const name = wlName.trim();
    const category =
      wlCat.trim() || (language === 'bn' ? 'স্বপ্ন' : 'Dream');
    const item: WishlistItem = {
      id: newId(),
      name,
      category,
      price,
      imageUrl: wlImg.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    if (!name || !(price > 0)) return;
    const gap = price - Math.max(0, cashAllTime);
    void persistWishlist([...wishlist, item]);
    if (gap > 0 && gap <= price * 0.15) {
      void mergeGrowthMarketingTags(uid!, ['High Purchase Intent']);
    }
    setWlName('');
    setWlCat('');
    setWlPrice('');
    setWlImg('');
    setDreamPresetId(null);
  };

  const applyDreamPreset = (p: DreamPreset) => {
    setDreamPresetId(p.id);
    setWlName(language === 'bn' ? p.nameBn : p.nameEn);
    setWlCat(language === 'bn' ? p.catBn : p.catEn);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Smart wishlist — Dream board */}
        <motion.section
          ref={wishlistSectionRef}
          id="dashboard-wishlist-section"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('p-5 sm:p-6')}
        >
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-300">
              <Heart className="h-4 w-4" />
              {language === 'bn' ? 'স্মার্ট উইশলিস্ট' : 'Smart wishlist'}
            </h3>
            <p className="mt-2 text-lg font-black leading-snug text-slate-800 dark:text-white sm:text-xl">
              {language === 'bn'
                ? 'আপনার পরবর্তী স্বপ্ন কী?'
                : "What's your next dream?"}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {language === 'bn'
                ? 'একটি স্বপ্ন বেছে নিন বা নিজে লিখুন, লক্ষ্য মূল্য দিন — অগ্রগতি আপনার সব সময়ের নগদ ব্যালেন্স অনুযায়ী।'
                : 'Pick a dream or type your own, set a target — progress uses your all-time cash balance.'}
            </p>
          </div>

          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {language === 'bn' ? 'দ্রুত বেছে নিন' : 'Quick picks'}
          </p>
          <div className="mb-5 flex gap-3 overflow-x-auto pb-2 pt-0.5 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 sm:snap-none lg:grid-cols-5">
            {DREAM_PRESETS.map((p) => {
              const Icon = p.Icon;
              const label = language === 'bn' ? p.nameBn : p.nameEn;
              const active = dreamPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyDreamPreset(p)}
                  className={cn(
                    'flex min-w-[5.5rem] max-w-[6.5rem] shrink-0 snap-center flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition-all active:scale-[0.97] sm:min-w-0 sm:max-w-none',
                    active
                      ? 'border-fuchsia-500/70 bg-gradient-to-b from-fuchsia-500/20 to-pink-500/10 shadow-[0_0_24px_rgba(217,70,239,0.35)] dark:border-fuchsia-400/50 dark:from-fuchsia-500/15'
                      : 'border-white/50 bg-white/40 hover:border-fuchsia-400/40 hover:bg-white/60 dark:border-white/10 dark:bg-slate-800/40 dark:hover:bg-slate-800/60'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-500/20 dark:text-fuchsia-300',
                      active && 'ring-2 ring-fuchsia-400/60'
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <span className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-800 dark:text-slate-100">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              ref={wlNameInputRef}
              placeholder={language === 'bn' ? 'স্বপ্ন / আইটেমের নাম' : 'Dream / item name'}
              value={wlName}
              onChange={(e) => {
                setWlName(e.target.value);
                setDreamPresetId(null);
              }}
              className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/50"
            />
            <input
              type="number"
              min={0}
              placeholder={language === 'bn' ? 'লক্ষ্য মূল্য (৳)' : 'Target price (৳)'}
              value={wlPrice}
              onChange={(e) => setWlPrice(e.target.value)}
              className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/50"
            />
            <input
              placeholder={language === 'bn' ? 'ক্যাটাগরি (ঐচ্ছিক)' : 'Category (optional)'}
              value={wlCat}
              onChange={(e) => setWlCat(e.target.value)}
              className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/50 sm:col-span-2"
            />
            <details className="sm:col-span-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400">
                {language === 'bn' ? 'আরও বিকল্প — ছবির লিংক' : 'More options — image link'}
              </summary>
              <input
                placeholder="Image URL (optional)"
                value={wlImg}
                onChange={(e) => setWlImg(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2 text-sm backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/50"
              />
            </details>
            <button
              type="button"
              onClick={addWishlist}
              className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 py-3 text-sm font-black text-white shadow-lg shadow-fuchsia-500/35"
            >
              <Plus className="h-4 w-4" />
              {language === 'bn' ? 'স্বপ্ন বোর্ডে যোগ করুন' : 'Add to dream board'}
            </button>
          </div>

          <div
            className={cn(
              'flex gap-4 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] snap-x snap-mandatory',
              'sm:grid sm:max-h-[min(70vh,28rem)] sm:grid-cols-1 sm:gap-4 sm:overflow-y-auto sm:overflow-x-visible sm:snap-none sm:pb-0',
              'md:grid-cols-2',
              wishlist.length === 0 && 'sm:max-h-none'
            )}
          >
            {wishlist.length === 0 ? (
              <p className="w-full py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                {language === 'bn'
                  ? 'এখনো কোনো স্বপ্ন যোগ করেননি — উপরে একটি বেছে নিন!'
                  : 'No dreams yet — tap a quick pick above!'}
              </p>
            ) : (
              wishlist.map((w) => {
                const gap = w.price - Math.max(0, cashAllTime);
                const pct = dreamProgressPercent(cashAllTime, w.price);
                return (
                  <article
                    key={w.id}
                    className="flex w-[min(88vw,300px)] shrink-0 snap-center flex-col rounded-2xl border border-white/45 bg-white/55 p-4 shadow-md backdrop-blur-md dark:border-white/10 dark:bg-slate-800/45 sm:w-auto sm:shrink"
                  >
                    <div className="flex items-start gap-3">
                      {w.imageUrl ? (
                        <img
                          src={w.imageUrl}
                          alt=""
                          className="h-14 w-14 rounded-xl object-cover ring-2 ring-fuchsia-400/25"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-pink-500/15 text-fuchsia-600 dark:text-fuchsia-300">
                          <Gift className="h-7 w-7" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-slate-900 dark:text-white">{w.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{w.category}</p>
                        <p className="mt-1 text-xs font-bold text-fuchsia-600 dark:text-fuchsia-300">
                          {language === 'bn' ? 'লক্ষ্য' : 'Target'}: {formatCurrency(w.price, language)}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {language === 'bn' ? 'নগদ (অল-টাইম)' : 'Cash (all-time)'}:{' '}
                          {formatCurrency(Math.max(0, cashAllTime), language)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void persistWishlist(wishlist.filter((x) => x.id !== w.id))}
                        className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                        aria-label={language === 'bn' ? 'মুছুন' : 'Remove'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <DreamNeonProgressBar pct={pct} language={language} />
                    <p className="mt-2 text-center text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      {gap <= 0
                        ? language === 'bn'
                          ? 'নগদ হিসাবে লক্ষ্য পূরণ বা অতিরিক্ত!'
                          : 'Target met or exceeded in cash!'
                        : language === 'bn'
                          ? `আরও লাগবে ${formatCurrency(gap, language)}`
                          : `${formatCurrency(gap, language)} to go`}
                    </p>
                  </article>
                );
              })
            )}
          </div>

          <p className="mt-5 rounded-2xl border border-cyan-400/40 bg-gradient-to-r from-cyan-500/12 via-violet-500/10 to-fuchsia-500/12 px-4 py-3.5 text-center text-sm font-black leading-snug text-cyan-900 shadow-[0_0_28px_rgba(34,211,238,0.2)] dark:border-cyan-500/30 dark:from-cyan-500/15 dark:via-violet-500/10 dark:to-fuchsia-500/10 dark:text-cyan-100 dark:shadow-[0_0_32px_rgba(34,211,238,0.15)]">
            {language === 'bn'
              ? 'স্বপ্ন পূরণ করতে আজই সঞ্চয় শুরু করুন!'
              : 'Start saving today to make your dream real!'}
          </p>
        </motion.section>

        <WealthVaultZakatCalculator
          uid={uid}
          language={language}
          cardShell={cardShell}
          zakatAnchorRef={zakatScrollRef}
        />
      </div>

      {/* Donations */}
      <div className="mx-auto w-full max-w-3xl">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('p-5 sm:p-6')}
        >
          <h3 className="mb-1 flex items-center gap-2 bg-gradient-to-r from-rose-600 via-pink-600 to-fuchsia-600 bg-clip-text text-sm font-black uppercase tracking-wider text-transparent dark:from-rose-400 dark:via-pink-400 dark:to-fuchsia-400">
            <PiggyBank className="h-4 w-4 text-rose-500 dark:text-rose-400" />
            {language === 'bn' ? 'দানের ইতিহাস' : 'Donation history'}
          </h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            {language === 'bn'
              ? 'দান লিখে হার্ট চাপুন — সব এন্ট্রি প্রোফাইলে সংরক্ষিত।'
              : 'Log an amount and tap the heart — entries stay on your profile.'}
          </p>

          <div className="relative mb-4 overflow-hidden rounded-2xl border border-rose-200/50 bg-gradient-to-br from-rose-500/[0.07] via-white/45 to-fuchsia-500/[0.08] p-[1px] shadow-[0_12px_40px_-12px_rgba(244,63,94,0.35)] backdrop-blur-xl dark:border-rose-500/20 dark:from-rose-950/30 dark:via-slate-900/35 dark:to-fuchsia-950/25">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(251,113,133,0.12),transparent_55%)]" aria-hidden />
            <div className="relative flex flex-col gap-3 rounded-[0.9rem] bg-white/25 p-3 dark:bg-slate-900/30 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-stretch">
                <label className="flex min-w-0 flex-col gap-1 sm:w-[7.5rem]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600/90 dark:text-rose-300/90">
                    {language === 'bn' ? 'পরিমাণ' : 'Amount'}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="৳"
                    value={donAmount}
                    onChange={(e) => setDonAmount(e.target.value)}
                    className={cn(
                      'w-full rounded-xl border border-white/70 bg-white/55 px-3 py-2.5 text-sm font-bold text-slate-800 outline-none transition-all',
                      'shadow-[inset_0_2px_6px_rgba(15,23,42,0.06),0_3px_0_rgba(15,23,42,0.05),0_10px_28px_-6px_rgba(244,63,94,0.18)]',
                      'placeholder:text-rose-300/80 focus:border-rose-300 focus:ring-2 focus:ring-rose-400/35',
                      'dark:border-slate-600/60 dark:bg-slate-800/55 dark:text-slate-100',
                      'dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.35),0_4px_0_rgba(0,0,0,0.25),0_0_24px_-4px_rgba(244,63,94,0.25)]'
                    )}
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {language === 'bn' ? 'নোট (ঐচ্ছিক)' : 'Note (optional)'}
                  </span>
                  <input
                    placeholder={language === 'bn' ? 'যেমন: মসজিদ, সাহায্য…' : 'e.g. mosque, aid…'}
                    value={donNote}
                    onChange={(e) => setDonNote(e.target.value)}
                    className={cn(
                      'min-h-[2.75rem] w-full rounded-xl border border-white/70 bg-white/50 px-3 py-2.5 text-sm outline-none transition-all',
                      'shadow-[inset_0_2px_8px_rgba(15,23,42,0.05),0_3px_0_rgba(15,23,42,0.04),0_8px_24px_-6px_rgba(99,102,241,0.12)]',
                      'placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-400/30',
                      'dark:border-slate-600/60 dark:bg-slate-800/45 dark:text-slate-100 dark:placeholder:text-slate-500',
                      'dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.32),0_4px_0_rgba(0,0,0,0.2)]'
                    )}
                  />
                </label>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                aria-label={language === 'bn' ? 'দান সেভ করুন' : 'Save donation'}
                onClick={() => {
                  const amount = Number(donAmount) || 0;
                  if (amount <= 0) return;
                  void persistDonations([
                    ...donations,
                    {
                      id: newId(),
                      amount,
                      note: donNote.trim() || undefined,
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  setDonAmount('');
                  setDonNote('');
                }}
                className="relative mx-auto flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 text-white shadow-[0_0_28px_rgba(244,63,94,0.55),0_10px_28px_-6px_rgba(219,39,119,0.45),inset_0_1px_0_rgba(255,255,255,0.35)] sm:mx-0 sm:h-14 sm:w-14"
              >
                <span
                  className="absolute -inset-0.5 animate-ping rounded-2xl bg-rose-400/40 opacity-40"
                  style={{ animationDuration: '2.2s' }}
                  aria-hidden
                />
                <Heart
                  className="relative z-10 h-6 w-6 drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                  fill="currentColor"
                  strokeWidth={1.5}
                />
              </motion.button>
            </div>
          </div>
          <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
            {donations.length === 0 ? (
              <li className="text-xs text-slate-400">{language === 'bn' ? 'কোনো দান নেই' : 'No donations logged.'}</li>
            ) : (
              [...donations]
                .reverse()
                .map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-xl border border-white/40 bg-white/45 px-3 py-2 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/40"
                  >
                    <span className="font-bold text-rose-700 dark:text-rose-300">
                      {formatCurrency(d.amount, language)}
                    </span>
                    <span className="max-w-[50%] truncate text-xs text-slate-500">{d.note}</span>
                    <button
                      type="button"
                      onClick={() => void persistDonations(donations.filter((x) => x.id !== d.id))}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))
            )}
          </ul>
        </motion.section>
      </div>
    </div>
  );
};

export default GrowthDashboardSections;
