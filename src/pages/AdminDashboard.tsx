import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../firebaseConfig';
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useCurrentMonthKey } from '../hooks/useCurrentMonthKey';
import { parseMonthKey } from '../lib/monthUtils';
import LiveClockDate from '../components/LiveClockDate';
import { useAuth } from '../contexts/AuthContext';
import { getProfessionLabel } from '../lib/professionData';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  User as UserIcon,
  Download,
  Search,
  ChevronRight,
  X,
  Calendar,
  PieChart as PieChartIcon,
  BarChart3,
  Star,
  ShieldX,
  Tags,
  Activity,
  Filter,
  Target,
  Sparkles,
  Loader2,
  CheckSquare,
  Square,
  FileText,
  Copy,
  CheckCheck,
  Send,
  AlertCircle,
  UserX,
  Loader2 as SpinIcon,
  Briefcase,
  Clock,
  Bell,
  UserMinus,
  Ghost,
  Zap,
  Phone,
  LineChart,
  MessageSquare,
  Mail,
  MessageCircle,
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Sector,
} from 'recharts';
import type { PieSectorDataItem } from 'recharts';
import { format } from 'date-fns';
import {
  queueNotificationsForUsers,
  queueNotificationForUser,
  queueManualNotificationsForUsers,
} from '../lib/fcmUtils';
import {
  generatePersonalFinanceTip,
  generateReengagementPushForUser,
  generateAdminUserStrategicInsight,
  REENGAGEMENT_NOTIFICATION_DISCLAIMER_BN,
  type DirectNotifyUserType,
} from '../lib/geminiApi';
import {
  buildSmsDraftHref,
  buildMailtoHref,
  buildWhatsAppWebHref,
} from '../lib/adminOutreachLinks';
import {
  computeLqi,
  leadTierFromLqi,
  isMerchantProspect,
  LEAD_BADGE_LABELS,
  merchantProspectLabel,
  type FinancialNetworkDoc,
  type LeadTier,
} from '../lib/leadScoring';
import {
  getIntelligenceBucketForTag,
  MARKETING_TAGS_CATALOG,
  type IntelligenceBucket,
} from '../lib/intelligenceKeywords';

type LeadMetricsRow = {
  lqi: number;
  tier: LeadTier;
  merchantProspect: boolean;
  topCreditors: string;
  totalBorrowedOutstanding: number;
};

function LeadGenBadges({ lm, className }: { lm?: LeadMetricsRow; className?: string }) {
  if (!lm) return <span className="text-slate-400 text-xs">—</span>;
  const showMerchantExtra = lm.merchantProspect && (lm.tier === 'gold' || lm.tier === 'silver');
  const primary =
    lm.tier === 'gold'
      ? LEAD_BADGE_LABELS.gold
      : lm.tier === 'silver'
        ? LEAD_BADGE_LABELS.silver
        : lm.merchantProspect
          ? merchantProspectLabel()
          : null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {primary ? (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
            lm.tier === 'gold' &&
              'bg-amber-100 text-amber-900 ring-1 ring-amber-300/60 dark:bg-amber-900/45 dark:text-amber-100 dark:ring-amber-700/50',
            lm.tier === 'silver' &&
              'bg-slate-200 text-slate-800 ring-1 ring-slate-300/70 dark:bg-slate-600 dark:text-slate-100 dark:ring-slate-500/50',
            lm.tier === 'standard' &&
              lm.merchantProspect &&
              'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300/50 dark:bg-cyan-900/40 dark:text-cyan-100 dark:ring-cyan-700/40',
          )}
        >
          {primary}
        </span>
      ) : (
        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">—</span>
      )}
      {showMerchantExtra ? (
        <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-cyan-900 ring-1 ring-cyan-300/50 dark:bg-cyan-900/40 dark:text-cyan-100 dark:ring-cyan-700/40">
          {merchantProspectLabel()}
        </span>
      ) : null}
    </div>
  );
}

function GoldLeadStar({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Star
      className="h-4 w-4 shrink-0 text-amber-400"
      style={{
        transform: 'perspective(40px) rotateX(14deg) rotateY(-22deg)',
        filter: 'drop-shadow(0 2px 6px rgba(251,191,36,0.95)) drop-shadow(0 1px 0 rgba(146,100,20,0.45))',
      }}
      aria-hidden
    />
  );
}

function marketingCyberClasses(bucket: IntelligenceBucket): string {
  switch (bucket) {
    case 'premium_banking':
      return 'border-sky-400/70 bg-sky-950/50 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.55),inset_0_1px_0_rgba(255,255,255,0.12)]';
    case 'premium_signal':
      return 'border-amber-400/80 bg-amber-950/45 text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.55),inset_0_1px_0_rgba(255,255,255,0.15)]';
    case 'digital_wallet':
      return 'border-fuchsia-500/60 bg-fuchsia-950/40 text-fuchsia-100 shadow-[0_0_14px_rgba(217,70,239,0.45),inset_0_1px_0_rgba(255,255,255,0.1)]';
    case 'solvency_religious':
      return 'border-emerald-400/70 bg-emerald-950/45 text-emerald-100 shadow-[0_0_14px_rgba(52,211,153,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]';
    default:
      return 'border-slate-500/50 bg-slate-900/60 text-slate-200';
  }
}

function MarketingCyberBadges({ tags, className }: { tags: string[]; className?: string }) {
  if (!tags?.length) {
    return <span className="text-[11px] font-medium text-slate-500 dark:text-slate-500">—</span>;
  }
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            'rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em]',
            marketingCyberClasses(getIntelligenceBucketForTag(tag)),
          )}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'chotan4480@gmail.com';

const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#22c55e',
  '#e11d48', '#7c3aed', '#0ea5e9', '#84cc16', '#fb923c',
];

const TAG_META: Record<string, { emoji: string; bg: string; text: string }> = {
  Renter:       { emoji: '🏠', bg: 'bg-sky-100 dark:bg-sky-900/40',    text: 'text-sky-700 dark:text-sky-300' },
  'Debt Payer': { emoji: '💳', bg: 'bg-rose-100 dark:bg-rose-900/40',  text: 'text-rose-700 dark:text-rose-300' },
  Gourmet:      { emoji: '🍽️', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderActiveShape(props: PieSectorDataItem) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const innerRadius = Number(props.innerRadius ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0) + 16;
  const startAngle = Number(props.startAngle ?? 0);
  const endAngle = Number(props.endAngle ?? 0);
  const fill = typeof props.fill === 'string' ? props.fill : '#6366f1';
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius} outerRadius={outerRadius}
      startAngle={startAngle} endAngle={endAngle}
      fill={fill}
      style={{ filter: `drop-shadow(0 6px 24px ${fill}88)`, transition: 'all 0.25s ease' }}
    />
  );
}

function Bar3DShape(props: {
  x?: number; y?: number; width?: number; height?: number; fill?: string;
  [key: string]: unknown;
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill = '#6366f1' } = props;
  if (height < 2) return <g />;
  const d = Math.min(width * 0.3, 11);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={4} />
      <polygon points={`${x},${y} ${x + d},${y - d} ${x + width + d},${y - d} ${x + width},${y}`} fill={fill} style={{ filter: 'brightness(1.45)' }} />
      <polygon points={`${x + width},${y} ${x + width + d},${y - d} ${x + width + d},${y + height - d} ${x + width},${y + height}`} fill={fill} style={{ filter: 'brightness(0.55)' }} />
    </g>
  );
}

const LiveBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1.5">
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">LIVE</span>
  </span>
);

const escapeCsv = (val: string | number | undefined | null) => {
  const s = val == null ? '' : String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Firestore transaction `date` → epoch ms (real-time list uses same shape as elsewhere in this file). */
function txTimestampMs(t: { date?: unknown }): number | null {
  const raw = t.date;
  if (raw == null) return null;
  const d =
    typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as { toDate: () => Date }).toDate === 'function'
      ? (raw as { toDate: () => Date }).toDate()
      : raw instanceof Date
        ? raw
        : null;
  if (!d || isNaN(d.getTime())) return null;
  return d.getTime();
}

const MS_PER_DAY = 86_400_000;

function firestoreTimeMs(val: unknown): number | null {
  if (val == null) return null;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    try {
      return (val as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    try {
      return (val as { toDate: () => Date }).toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

function lastTransactionMsForUser(uid: string, txs: any[]): number | null {
  let last: number | null = null;
  for (const t of txs) {
    if (t.userId !== uid) continue;
    const ms = txTimestampMs(t as { date?: unknown });
    if (ms != null && (last === null || ms > last)) last = ms;
  }
  return last;
}

/** Newest-first sort: login → lastActive → last tx → created. */
function getUserListSortTimeMs(u: { id: string } & Record<string, unknown>, txs: any[]): number {
  const login = firestoreTimeMs(u.lastLoginAt);
  const active = firestoreTimeMs(u.lastActive);
  const tx = lastTransactionMsForUser(u.id, txs);
  const created = firestoreTimeMs(u.createdAt);
  return Math.max(login ?? 0, active ?? 0, tx ?? 0, created ?? 0, 0);
}

// ── Category Users Modal ───────────────────────────────────────────────────────
interface CategoryUser {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  profession?: string;
  categoryAmount: number;
}

type CampaignStep = 'select' | 'compose' | 'sent';

interface CategoryUsersModalProps {
  category: string;
  type: 'income' | 'expense' | 'profession';
  users: CategoryUser[];
  language: 'en' | 'bn';
  onClose: () => void;
}

const CategoryUsersModal: React.FC<CategoryUsersModalProps> = ({
  category, type, users, language, onClose,
}) => {
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<CampaignStep>('select');
  const [blogId, setBlogId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Compose form
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const selectedUsers = users.filter((u) => selectedUids.has(u.id));
  const allSelected = users.length > 0 && selectedUids.size === users.length;

  const resetToSelect = () => {
    setStep('select');
    setBlogId(null);
    setSendError(null);
    setNotifTitle('');
    setNotifMessage('');
    setFormErrors({});
  };

  const toggleAll = () => {
    if (allSelected) setSelectedUids(new Set());
    else setSelectedUids(new Set(users.map((u) => u.id)));
  };

  const toggleUid = (uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const handleCompose = () => {
    if (selectedUids.size === 0) return;
    setStep('compose');
  };

  const handleSend = async () => {
    const errs: Record<string, string> = {};
    if (!notifTitle.trim()) errs.title = 'Notification title is required';
    if (!notifMessage.trim()) errs.message = 'Notification message is required';
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }

    setIsSending(true);
    setSendError(null);
    try {
      const blogRef = await addDoc(collection(db, 'blogs'), {
        title: notifTitle.trim(),
        blogContent: notifMessage.trim(),
        notificationMessage: notifMessage.trim(),
        imageUrl: '',
        type: 'manual',
        status: 'published',
        category,
        targetUserIds: [...selectedUids],
        categoryType: type,
        createdAt: serverTimestamp(),
      });
      setBlogId(blogRef.id);

      await queueNotificationsForUsers(
        blogRef.id,
        [...selectedUids],
        notifTitle.trim(),
        notifMessage.trim(),
      );

      setStep('sent');
    } catch (e: any) {
      setSendError(`Failed: ${String(e?.message ?? e)}`);
    } finally {
      setIsSending(false);
    }
  };

  const copyBlogLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/blog/${blogId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputBase = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/75 backdrop-blur-md"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[2rem] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/20 dark:ring-white/10 overflow-hidden"
      >
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between gap-3 p-5 text-white shrink-0',
          type === 'expense'
            ? 'bg-gradient-to-r from-rose-600 to-red-500'
            : type === 'income'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-500'
            : 'bg-gradient-to-r from-indigo-600 to-purple-600'
        )}>
          <div className="flex items-center gap-3 min-w-0">
            {type === 'expense'
              ? <TrendingDown className="w-5 h-5 shrink-0" />
              : type === 'income'
              ? <TrendingUp className="w-5 h-5 shrink-0" />
              : <Briefcase className="w-5 h-5 shrink-0" />
            }
            <div className="min-w-0">
              <h3 className="font-black text-lg leading-tight truncate">{category}</h3>
              <p className="text-xs text-white/70 mt-0.5">
                {users.length} user{users.length !== 1 ? 's' : ''} ·{' '}
                {type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Profession'} category
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {step === 'compose' && (
              <button
                onClick={resetToSelect}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-xs font-bold transition-all"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/15 rounded-full transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Step: select ── */}
          {step === 'select' && (
            <>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40">
                <button onClick={toggleAll} className="text-slate-400 hover:text-indigo-600 transition-colors">
                  {allSelected
                    ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                    : <Square className="w-4 h-4" />
                  }
                </button>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex-1">
                  User ({users.length})
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {type === 'expense' ? 'Spent' : type === 'income' ? 'Earned' : 'Total Spend'}
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                {users.map((u) => {
                  const isSel = selectedUids.has(u.id);
                  return (
                    <motion.div
                      key={u.id}
                      layout
                      onClick={() => toggleUid(u.id)}
                      className={cn(
                        'flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors',
                        isSel
                          ? 'bg-indigo-50/60 dark:bg-indigo-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      )}
                    >
                      <div className="text-slate-400 shrink-0">
                        {isSel
                          ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                          : <Square className="w-4 h-4" />
                        }
                      </div>
                      {u.photoURL
                        ? <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {(u.displayName || '?').charAt(0).toUpperCase()}
                          </div>
                        )
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                          {u.displayName || 'Unknown'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {u.email} · {getProfessionLabel(u.profession)}
                        </p>
                      </div>
                      <span className={cn(
                        'text-sm font-bold shrink-0',
                        type === 'expense' ? 'text-red-600 dark:text-red-400'
                        : type === 'income' ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-indigo-600 dark:text-indigo-400'
                      )}>
                        {formatCurrency(u.categoryAmount, language)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Step: compose ── */}
          {step === 'compose' && (
            <div className="p-5 space-y-4">
              {/* Target summary chips */}
              <div className="flex flex-wrap gap-2">
                {selectedUsers.slice(0, 4).map((u) => (
                  <div key={u.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium">
                    {u.photoURL
                      ? <img src={u.photoURL} alt="" className="w-5 h-5 rounded-full object-cover" />
                      : <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-[9px] font-bold">{(u.displayName || '?').charAt(0).toUpperCase()}</div>
                    }
                    <span className="truncate max-w-[80px]">{u.displayName || 'Unknown'}</span>
                  </div>
                ))}
                {selectedUsers.length > 4 && (
                  <div className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs">
                    +{selectedUsers.length - 4} more
                  </div>
                )}
              </div>

              {/* Error */}
              {sendError && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-2xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-300 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{sendError}</span>
                </motion.div>
              )}

              {/* Notification Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Notification Title *
                </label>
                <input
                  type="text"
                  value={notifTitle}
                  onChange={(e) => { setNotifTitle(e.target.value); setFormErrors((p) => ({ ...p, title: '' })); }}
                  placeholder={type === 'profession' ? `e.g. "${category}" পেশাদারদের জন্য একটি টিপস` : `e.g. আপনার "${category}" খরচ সম্পর্কে একটি টিপস`}
                  className={cn(inputBase, formErrors.title && 'border-red-400 ring-1 ring-red-400')}
                />
                {formErrors.title && (
                  <p className="flex items-center gap-1 text-[11px] text-red-500">
                    <AlertCircle className="w-3 h-3" /> {formErrors.title}
                  </p>
                )}
              </div>

              {/* Notification Message */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Message *</span>
                  <span className="font-normal text-slate-400 normal-case">(max 120 chars)</span>
                </label>
                <textarea
                  value={notifMessage}
                  onChange={(e) => { setNotifMessage(e.target.value); setFormErrors((p) => ({ ...p, message: '' })); }}
                  rows={3}
                  maxLength={120}
                  placeholder="সংক্ষিপ্ত নোটিফিকেশন বার্তা লিখুন…"
                  className={cn(inputBase, 'resize-none', formErrors.message && 'border-red-400 ring-1 ring-red-400')}
                />
                <div className="flex items-center justify-between">
                  {formErrors.message
                    ? <p className="flex items-center gap-1 text-[11px] text-red-500"><AlertCircle className="w-3 h-3" />{formErrors.message}</p>
                    : <span />}
                  <span className="text-[10px] text-slate-400">{notifMessage.length}/120</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: sent ── */}
          {step === 'sent' && blogId && (
            <div className="p-5">
              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3.5 bg-emerald-500/10 border-b border-emerald-200 dark:border-emerald-700">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-900/20">
                    <CheckCheck className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">Campaign Sent Successfully!</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {selectedUids.size} user{selectedUids.size !== 1 ? 's' : ''} queued for notification
                    </p>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-700/50 border border-emerald-100 dark:border-emerald-800">
                    <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex-1 truncate font-mono">
                      #/blog/{blogId}
                    </span>
                    <button onClick={copyBlogLink} className="shrink-0 p-1 rounded text-emerald-500 hover:text-emerald-700 transition-colors">
                      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Deploy <code className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">processNotificationQueue</code> Cloud Function to dispatch FCM push notifications.
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-4">
          {step === 'select' && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400 flex-1">
                {selectedUids.size > 0
                  ? <><strong className="text-slate-700 dark:text-slate-200">{selectedUids.size}</strong> user{selectedUids.size !== 1 ? 's' : ''} selected</>
                  : 'Select users to target'
                }
              </p>
              <button
                onClick={handleCompose}
                disabled={selectedUids.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-indigo-500/25"
              >
                <Send className="w-4 h-4" />
                Compose Campaign
              </button>
            </div>
          )}

          {step === 'compose' && (
            <button
              onClick={handleSend}
              disabled={isSending}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-indigo-500/25"
            >
              {isSending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                : <><Send className="w-4 h-4" /> Send to {selectedUids.size} User{selectedUids.size !== 1 ? 's' : ''}</>
              }
            </button>
          )}

          {step === 'sent' && (
            <button
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-2xl transition-all"
            >
              Close
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const AdminDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { user } = useAuth();
  const { language } = useLocalization();
  const adminMonthKey = useCurrentMonthKey();
  const chartUid = React.useId().replace(/:/g, '');

  // ── Data state
  const [rawUsers, setRawUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [userIntelligenceMap, setUserIntelligenceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // ── Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [incomeMin, setIncomeMin] = useState('');
  const [incomeMax, setIncomeMax] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCategoryMin, setFilterCategoryMin] = useState('');
  const [filterProfession, setFilterProfession] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterMarketingTag, setFilterMarketingTag] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Modal state
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userInAppNotifs, setUserInAppNotifs] = useState<
    { id: string; title: string; body: string; read: boolean; createdAt: unknown }[]
  >([]);
  const [userInAppNotifsLoading, setUserInAppNotifsLoading] = useState(false);
  const [userInAppNotifsError, setUserInAppNotifsError] = useState<string | null>(null);
  const [adminStrategicInsight, setAdminStrategicInsight] = useState<string | null>(null);
  const [adminStrategicLoading, setAdminStrategicLoading] = useState(false);
  const [adminStrategicError, setAdminStrategicError] = useState<string | null>(null);
  const [adminActionPendingUid, setAdminActionPendingUid] = useState<string | null>(null);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

  const [panelPushTitle, setPanelPushTitle] = useState('Ay Bay Er GustiMari');
  const [panelPushMessage, setPanelPushMessage] = useState('');
  const [panelPushBlogId, setPanelPushBlogId] = useState('');
  const [panelPushSending, setPanelPushSending] = useState(false);
  const [panelPushError, setPanelPushError] = useState<string | null>(null);
  const [panelPushAiLoading, setPanelPushAiLoading] = useState(false);
  const [panelAdminOnlyInsight, setPanelAdminOnlyInsight] = useState<string | null>(null);
  const [panelAdminOnlyLoading, setPanelAdminOnlyLoading] = useState(false);
  const [panelAdminOnlyError, setPanelAdminOnlyError] = useState<string | null>(null);
  const [panelBlogList, setPanelBlogList] = useState<{ id: string; title: string }[]>([]);

  // ── Category explorer state
  const [categoryModal, setCategoryModal] = useState<{ category: string; type: 'income' | 'expense' } | null>(null);
  const [professionModal, setProfessionModal] = useState<{ id: string; name: string; userIds: string[] } | null>(null);

  // ── Category explorer tab
  const [explorerTab, setExplorerTab] = useState<'expense' | 'income' | 'profession'>('expense');

  // ── Inactive users state
  const [inactiveFilter, setInactiveFilter] = useState<1 | 3 | 5 | 7>(1);
  const [inactiveSelectedUids, setInactiveSelectedUids] = useState<Set<string>>(new Set());
  const [inactiveComposeOpen, setInactiveComposeOpen] = useState(false);
  const [inactiveComposeTitle, setInactiveComposeTitle] = useState('');
  const [inactiveComposeMsg, setInactiveComposeMsg] = useState('');
  const [inactiveSending, setInactiveSending] = useState(false);
  const [inactiveBlogId, setInactiveBlogId] = useState<string | null>(null);
  const [inactiveSendError, setInactiveSendError] = useState<string | null>(null);
  const [inactiveSendDone, setInactiveSendDone] = useState(false);
  const [inactiveAiLoading, setInactiveAiLoading] = useState(false);

  // ── Global campaign (segment-targeted bulk notify) ───────────────────────────
  const [globalCampaignOpen, setGlobalCampaignOpen] = useState(false);
  const [globalCampaignSegment, setGlobalCampaignSegment] = useState<'all' | 'ghost' | 'irregular' | 'power'>('all');
  const [globalCampaignTitle, setGlobalCampaignTitle] = useState('Ay Bay Er GustiMari');
  const [globalCampaignMessage, setGlobalCampaignMessage] = useState('');
  const [globalCampaignBlogId, setGlobalCampaignBlogId] = useState('');
  const [globalCampaignBlogList, setGlobalCampaignBlogList] = useState<{ id: string; title: string }[]>([]);
  const [globalCampaignSending, setGlobalCampaignSending] = useState(false);
  const [globalCampaignError, setGlobalCampaignError] = useState<string | null>(null);

  const [adminDebts, setAdminDebts] = useState<any[]>([]);
  const [financialNetworkDocs, setFinancialNetworkDocs] = useState<any[]>([]);
  const [fbExportGoldOnly, setFbExportGoldOnly] = useState(false);

  const [adminUserPhoneDraft, setAdminUserPhoneDraft] = useState('');
  const [adminUserPhoneSaving, setAdminUserPhoneSaving] = useState(false);
  const [adminUserPhoneError, setAdminUserPhoneError] = useState<string | null>(null);
  const [adminUserPhoneSaved, setAdminUserPhoneSaved] = useState(false);

  // ── Firestore live listeners ─────────────────────────────────────────────────
  useEffect(() => {
    let usersReady = false, txReady = false;
    const maybeReady = () => { if (usersReady && txReady) setLoading(false); };

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => { setRawUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); usersReady = true; maybeReady(); },
      (err) => { handleFirestoreError(err, OperationType.LIST, 'users'); usersReady = true; maybeReady(); }
    );
    const unsubTx = onSnapshot(
      collection(db, 'transactions'),
      (snap) => { setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); txReady = true; maybeReady(); },
      (err) => { handleFirestoreError(err, OperationType.LIST, 'transactions'); txReady = true; maybeReady(); }
    );
    const unsubIntelligence = onSnapshot(
      collection(db, 'user_intelligence'),
      (snap) => {
        const map: Record<string, any> = {};
        snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setUserIntelligenceMap(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'user_intelligence')
    );
    return () => { unsubUsers(); unsubTx(); unsubIntelligence(); };
  }, []);

  useEffect(() => {
    const unsubD = onSnapshot(
      collection(db, 'debts'),
      (snap) => setAdminDebts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'debts'),
    );
    const unsubF = onSnapshot(
      collection(db, 'financial_network'),
      (snap) => setFinancialNetworkDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => handleFirestoreError(err, OperationType.LIST, 'financial_network'),
    );
    return () => {
      unsubD();
      unsubF();
    };
  }, []);

  useEffect(() => {
    if (!selectedUser?.id) {
      setAdminUserPhoneDraft('');
      setAdminUserPhoneError(null);
      setAdminUserPhoneSaved(false);
      return;
    }
    setAdminUserPhoneDraft(String(selectedUser.phoneNumber ?? '').trim());
    setAdminUserPhoneError(null);
    setAdminUserPhoneSaved(false);
  }, [selectedUser?.id]);

  const saveAdminUserPhone = useCallback(async () => {
    if (!selectedUser?.id || user?.email !== ADMIN_EMAIL) return;
    const trimmed = adminUserPhoneDraft.trim();
    const digits = trimmed.replace(/\D/g, '');
    if (trimmed.length > 0 && digits.length < 10) {
      setAdminUserPhoneError('সঠিক মোবাইলের জন্য কমপক্ষে ১০ ডিজিট দিন (খালি রাখলে মুছে যাবে)।');
      return;
    }
    setAdminUserPhoneSaving(true);
    setAdminUserPhoneError(null);
    setAdminUserPhoneSaved(false);
    try {
      await updateDoc(doc(db, 'users', selectedUser.id), { phoneNumber: trimmed });
      setSelectedUser((prev) => (prev && prev.id === selectedUser.id ? { ...prev, phoneNumber: trimmed } : prev));
      setAdminUserPhoneSaved(true);
    } catch (e: unknown) {
      setAdminUserPhoneError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdminUserPhoneSaving(false);
    }
  }, [selectedUser, adminUserPhoneDraft, user?.email]);

  // Blogs list for User Monitoring push composer + Global Campaign
  useEffect(() => {
    if (!selectedUser && !globalCampaignOpen) return;
    const qBlogs = query(collection(db, 'blogs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      qBlogs,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          title: String((d.data() as { title?: string }).title || 'Untitled'),
        }));
        setPanelBlogList(list);
        setGlobalCampaignBlogList(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'blogs'),
    );
    return () => unsub();
  }, [selectedUser, globalCampaignOpen]);

  // In-app notification history for the open User Monitoring Board
  useEffect(() => {
    const uid = selectedUser?.id;
    if (!uid) {
      setUserInAppNotifs([]);
      setUserInAppNotifsError(null);
      setUserInAppNotifsLoading(false);
      return;
    }
    setUserInAppNotifsLoading(true);
    setUserInAppNotifsError(null);
    const qn = query(
      collection(db, 'users', uid, 'inAppNotifications'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      qn,
      (snap) => {
        setUserInAppNotifs(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              title: typeof data.title === 'string' ? data.title : '',
              body: typeof data.body === 'string' ? data.body : '',
              read: data.read === true,
              createdAt: data.createdAt ?? null,
            };
          }),
        );
        setUserInAppNotifsLoading(false);
      },
      (err) => {
        console.error('[Admin] inAppNotifications listener:', err);
        setUserInAppNotifsError(
          err instanceof Error ? err.message : 'Could not load notification history.',
        );
        setUserInAppNotifsLoading(false);
      },
    );
    return () => unsub();
  }, [selectedUser?.id]);

  useEffect(() => {
    setAdminStrategicInsight(null);
    setAdminStrategicError(null);
    setAdminStrategicLoading(false);
  }, [selectedUser?.id]);

  useEffect(() => {
    setPanelPushTitle('Ay Bay Er GustiMari');
    setPanelPushMessage('');
    setPanelPushBlogId('');
    setPanelPushError(null);
    setPanelPushAiLoading(false);
    setPanelPushSending(false);
    setPanelAdminOnlyInsight(null);
    setPanelAdminOnlyError(null);
    setPanelAdminOnlyLoading(false);
  }, [selectedUser?.id]);

  // ── Computed ─────────────────────────────────────────────────────────────────

  const adminMonthLabel = useMemo(() => {
    const p = parseMonthKey(adminMonthKey);
    if (!p) return adminMonthKey;
    return new Date(p.year, p.monthIndex, 1).toLocaleString(
      language === 'bn' ? 'bn-BD' : 'en-US',
      { month: 'long', year: 'numeric' }
    );
  }, [adminMonthKey, language]);

  // Transactions this calendar month (for charts)
  const transactionsThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    return transactions.filter((t) => {
      const d = t.date?.toDate ? t.date.toDate() : t.date instanceof Date ? t.date : null;
      return d && d.getFullYear() === y && d.getMonth() === m;
    });
  }, [transactions]);

  /** All-time transaction-derived stats for the User Monitoring Board (selected user). */
  const userMonitoring = useMemo(() => {
    const uid = selectedUser?.id;
    if (!uid) return null;
    const txs = transactions
      .filter((t: any) => t.userId === uid)
      .sort((a: any, b: any) => (txTimestampMs(b) ?? 0) - (txTimestampMs(a) ?? 0));

    const allTimeIncome = txs
      .filter((t: any) => t.type === 'income')
      .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const allTimeExpense = txs
      .filter((t: any) => t.type === 'expense')
      .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);

    const expenseByCat: Record<string, number> = {};
    txs
      .filter((t: any) => t.type === 'expense')
      .forEach((t: any) => {
        const c = (t.category && String(t.category).trim()) || 'Uncategorized';
        expenseByCat[c] = (expenseByCat[c] || 0) + (Number(t.amount) || 0);
      });
    const top3ExpenseCategories = Object.entries(expenseByCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({ category, amount }));

    const dayKeys = new Set<string>();
    let minMs: number | null = null;
    let maxMs: number | null = null;
    txs.forEach((t: any) => {
      const ms = txTimestampMs(t);
      if (ms == null) return;
      if (minMs === null || ms < minMs) minMs = ms;
      if (maxMs === null || ms > maxMs) maxMs = ms;
      const d = new Date(ms);
      dayKeys.add(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    });
    const distinctActiveDays = dayKeys.size;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    let spanCalendarDays = 1;
    if (minMs != null) {
      const firstDay = new Date(minMs);
      firstDay.setHours(0, 0, 0, 0);
      spanCalendarDays = Math.max(
        1,
        Math.floor((startOfToday.getTime() - firstDay.getTime()) / MS_PER_DAY) + 1,
      );
    }
    const inactiveDaysInWindow = Math.max(0, spanCalendarDays - distinctActiveDays);
    const weeksInSpan = Math.max(1, spanCalendarDays / 7);
    const entriesPerWeek = txs.length / weeksInSpan;

    const recentNotes = txs
      .map((t: any) => (typeof t.note === 'string' ? t.note.trim() : ''))
      .filter(Boolean)
      .slice(0, 20);

    const daysSinceLastActivity =
      maxMs == null ? null : Math.max(0, Math.floor((Date.now() - maxMs) / MS_PER_DAY));

    return {
      txs,
      allTimeIncome,
      allTimeExpense,
      top3ExpenseCategories,
      distinctActiveDays,
      inactiveDaysInWindow,
      spanCalendarDays,
      entriesPerWeek,
      recentNotes,
      last10Activities: txs.slice(0, 10),
      daysSinceLastActivity,
      firstTxMs: minMs,
      lastTxMs: maxMs,
    };
  }, [selectedUser?.id, transactions]);

  /** Users enriched with spending stats and behavioural tags (this month). */
  const users = useMemo(() => rawUsers.map((rawUser: any) => {
    const userTx = transactionsThisMonth.filter((t: any) => t.userId === rawUser.id);
    const totalIncome = userTx.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const totalExpense = userTx.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);

    const categoryBreakdown: Record<string, number> = {};
    userTx.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      if (t.category) categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + (Number(t.amount) || 0);
    });

    const topCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

    const catSum = (...kw: string[]) =>
      Object.entries(categoryBreakdown).reduce((s, [cat, amt]) => {
        if (kw.some((k) => cat.toLowerCase().includes(k.toLowerCase()))) return s + amt;
        return s;
      }, 0);

    const tags: string[] = [];
    if (totalExpense > 0) {
      if ((catSum('rent', 'house') / totalExpense) * 100 > 15) tags.push('Renter');
      if ((catSum('loan', 'installment', 'credit card', 'emi') / totalExpense) * 100 > 20) tags.push('Debt Payer');
      if ((catSum('food', 'restaurant', 'dining', 'bazar', 'sukna', 'kaca') / totalExpense) * 100 > 20) tags.push('Gourmet');
    }

    const marketingTagsRaw = rawUser.marketingTags;
    const marketingTags = Array.isArray(marketingTagsRaw)
      ? [...new Set(marketingTagsRaw.filter((x: unknown) => typeof x === 'string'))] as string[]
      : [];

    return {
      ...rawUser,
      totalIncome, totalExpense,
      balance: totalIncome - totalExpense,
      categoryBreakdown, topCategory, tags,
      marketingTags,
      transactionCount: userTx.length,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0,
      subscription: userTx.length > 15 ? 'Premium' : 'Free',
    };
  }), [rawUsers, transactionsThisMonth]);

  const dailyActiveUsers = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const uids = new Set<string>();
    transactions.forEach((t) => {
      const d = t.date?.toDate ? t.date.toDate() : t.date instanceof Date ? t.date : null;
      if (d && d >= today) uids.add(t.userId);
    });
    return uids.size;
  }, [transactions]);

  /** All expense categories this month for pie chart. */
  const allCategoriesDist = useMemo(() => {
    const cats: Record<string, number> = {};
    transactionsThisMonth.filter((t) => t.type === 'expense').forEach((t) => {
      if (t.category) cats[t.category] = (cats[t.category] || 0) + (Number(t.amount) || 0);
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [transactionsThisMonth]);

  /** Platform income/expense trend over last 6 months. */
  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-US', { month: 'short' }), income: 0, expense: 0 });
    }
    transactions.forEach((t) => {
      const d = t.date?.toDate ? t.date.toDate() : t.date instanceof Date ? t.date : null;
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const m = months.find((x) => x.key === key);
      if (!m) return;
      if (t.type === 'income') m.income += Number(t.amount) || 0;
      else if (t.type === 'expense') m.expense += Number(t.amount) || 0;
    });
    return months;
  }, [transactions]);

  // ── All-time category reports (all transactions, not month-limited) ──────────

  // Categories that make no sense for income and should be excluded from income report
  const EXCLUDED_FROM_INCOME = new Set(['Debit', 'debit', 'Credit Card Bill', 'Loan Installment']);

  const buildCategoryReport = useCallback((txType: 'income' | 'expense') => {
    const cats: Record<string, { total: number; users: Set<string> }> = {};
    transactions
      .filter((t) => t.type === txType && t.category)
      .filter((t) => txType !== 'income' || !EXCLUDED_FROM_INCOME.has(t.category))
      .forEach((t) => {
        if (!cats[t.category]) cats[t.category] = { total: 0, users: new Set() };
        cats[t.category].total += Number(t.amount) || 0;
        if (t.userId) cats[t.category].users.add(t.userId);
      });
    const platformTotal = Object.values(cats).reduce((s, v) => s + v.total, 0);
    return Object.entries(cats)
      .map(([name, { total, users: us }]) => ({
        name, total,
        pct: platformTotal > 0 ? (total / platformTotal) * 100 : 0,
        userCount: us.size,
        avgPerUser: us.size > 0 ? total / us.size : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  const platformExpenseCategoryReport = useMemo(() => buildCategoryReport('expense'), [buildCategoryReport]);
  const platformIncomeCategoryReport  = useMemo(() => buildCategoryReport('income'),  [buildCategoryReport]);

  /** Profession distribution from user sign-in data, enriched with transaction totals. */
  const platformProfessionReport = useMemo(() => {
    const profs: Record<string, { users: Set<string>; income: number; expense: number }> = {};
    rawUsers.forEach((u: any) => {
      const pid = u.profession || 'other';
      if (!profs[pid]) profs[pid] = { users: new Set(), income: 0, expense: 0 };
      profs[pid].users.add(u.id);
    });
    transactions.forEach((t) => {
      if (!t.userId) return;
      const user = rawUsers.find((u: any) => u.id === t.userId);
      const pid = user?.profession || 'other';
      if (!profs[pid]) profs[pid] = { users: new Set(), income: 0, expense: 0 };
      if (t.type === 'income') profs[pid].income += Number(t.amount) || 0;
      else if (t.type === 'expense') profs[pid].expense += Number(t.amount) || 0;
    });
    const totalUsers = rawUsers.length;
    return Object.entries(profs)
      .map(([id, { users: us, income, expense }]) => ({
        id,
        name: getProfessionLabel(id),
        userCount: us.size,
        userIds: [...us],
        totalIncome: income,
        totalExpense: expense,
        pct: totalUsers > 0 ? (us.size / totalUsers) * 100 : 0,
      }))
      .sort((a, b) => b.userCount - a.userCount);
  }, [rawUsers, transactions]);

  /** Users who have all-time transactions in the selected category. */
  const categoryModalUsers = useMemo((): CategoryUser[] => {
    if (!categoryModal) return [];
    const userAmounts: Record<string, number> = {};
    transactions
      .filter((t) => t.type === categoryModal.type && t.category === categoryModal.category)
      .forEach((t) => {
        if (t.userId) userAmounts[t.userId] = (userAmounts[t.userId] || 0) + (Number(t.amount) || 0);
      });
    return rawUsers
      .filter((u) => userAmounts[u.id] !== undefined)
      .map((u) => ({ id: u.id, displayName: u.displayName, email: u.email, photoURL: u.photoURL, profession: u.profession, categoryAmount: userAmounts[u.id] || 0 }))
      .sort((a, b) => b.categoryAmount - a.categoryAmount);
  }, [categoryModal, transactions, rawUsers]);

  /** Users in the selected profession for the profession modal. */
  const professionModalUsers = useMemo((): CategoryUser[] => {
    if (!professionModal) return [];
    return rawUsers
      .filter((u: any) => professionModal.userIds.includes(u.id))
      .map((u: any) => {
        const totalExpense = transactions
          .filter((t) => t.userId === u.id && t.type === 'expense')
          .reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
        return { id: u.id, displayName: u.displayName, email: u.email, photoURL: u.photoURL, profession: u.profession, categoryAmount: totalExpense };
      })
      .sort((a, b) => b.categoryAmount - a.categoryAmount);
  }, [professionModal, rawUsers, transactions]);

  /** Users inactive for at least inactiveFilter days (no transactions in that window). */
  const inactiveUsers = useMemo(() => {
    const lastTxMs: Record<string, number> = {};
    transactions.forEach((t) => {
      if (!t.userId) return;
      const d = t.date?.toDate ? t.date.toDate() : t.date instanceof Date ? t.date : null;
      if (!d) return;
      const ms = d.getTime();
      if (!lastTxMs[t.userId] || ms > lastTxMs[t.userId]) lastTxMs[t.userId] = ms;
    });
    const now = Date.now();
    const thresholdMs = inactiveFilter * 86_400_000;
    return rawUsers
      .filter((u: any) => {
        if (u.hideFromAdminList) return false;
        const lastMs = lastTxMs[u.id];
        if (lastMs !== undefined) return (now - lastMs) >= thresholdMs;
        const createdMs = u.createdAt?.toMillis ? u.createdAt.toMillis() : null;
        return createdMs ? (now - createdMs) >= thresholdMs : false;
      })
      .map((u: any) => {
        const lastMs = lastTxMs[u.id];
        const createdMs = u.createdAt?.toMillis ? u.createdAt.toMillis() : now;
        const activityMs = lastMs ?? createdMs;
        return { ...u, daysInactive: Math.floor((now - activityMs) / 86_400_000) };
      })
      .sort((a: any, b: any) => b.daysInactive - a.daysInactive);
  }, [rawUsers, transactions, inactiveFilter]);

  const allExpenseCategories = useMemo(() => {
    const cats = new Set<string>();
    users.forEach((u) => Object.keys(u.categoryBreakdown).forEach((c) => cats.add(c)));
    return [...cats].sort();
  }, [users]);

  const activeProfessions = useMemo(() => {
    const set = new Set<string>();
    rawUsers.forEach((u: any) => { if (u.profession) set.add(u.profession); });
    return [...set].sort();
  }, [rawUsers]);

  const visibleUsers = useMemo(
    () => users.filter((u) => !u.hideFromAdminList),
    [users]
  );

  /**
   * Lead table segments (real-time from `transactions` via useMemo):
   * - ghost: zero transaction documents for this user
   * - power: ≥3 transactions in rolling last 7 days (Pro plan targets)
   * - irregular: has transactions but fewer than 3 in last 7d (covers “silent 5d+” and light weekly users)
   */
  const leadGenSegment = useMemo(() => {
    const now = Date.now();
    const cutoff7 = now - 7 * MS_PER_DAY;

    const totalByUser: Record<string, number> = {};
    const count7: Record<string, number> = {};

    transactions.forEach((t: any) => {
      const uid = t.userId;
      if (!uid) return;
      const ms = txTimestampMs(t);
      if (ms == null) return;
      totalByUser[uid] = (totalByUser[uid] || 0) + 1;
      if (ms >= cutoff7) count7[uid] = (count7[uid] || 0) + 1;
    });

    const byUid: Record<string, 'ghost' | 'power' | 'irregular'> = {};
    const counts = { ghost: 0, power: 0, irregular: 0 };

    visibleUsers.forEach((u) => {
      const total = totalByUser[u.id] || 0;
      const c7 = count7[u.id] || 0;
      let seg: 'ghost' | 'power' | 'irregular';
      if (total === 0) seg = 'ghost';
      else if (c7 >= 3) seg = 'power';
      else seg = 'irregular';
      byUid[u.id] = seg;
      counts[seg]++;
    });

    return { byUid, counts, totalByUser, count7 };
  }, [transactions, visibleUsers]);

  /** User IDs for global campaign by activity segment (same rules as Lead table tabs). */
  const campaignTargetUserIds = useMemo(() => {
    if (globalCampaignSegment === 'all') return visibleUsers.map((u) => u.id);
    return visibleUsers
      .filter((u) => leadGenSegment.byUid[u.id] === globalCampaignSegment)
      .map((u) => u.id);
  }, [visibleUsers, leadGenSegment, globalCampaignSegment]);

  /** Ranked users enriched with all-time behavioral intelligence from user_intelligence collection. */
  const intelligenceRows = useMemo(() => {
    return rawUsers
      .map((u: any) => {
        const intel = userIntelligenceMap[u.id];
        if (!intel) return null;
        const totalSpent = intel.totalSpentByCategory as Record<string, number> | undefined;
        const frequency = intel.frequency as Record<string, number> | undefined;
        const topCat = totalSpent
          ? Object.entries(totalSpent).sort((a, b) => b[1] - a[1])[0]
          : null;
        const mostFrequent = frequency
          ? Object.entries(frequency).sort((a, b) => b[1] - a[1])[0]
          : null;
        const totalAllTimeSpend = totalSpent
          ? Object.values(totalSpent).reduce((s, v) => s + v, 0)
          : 0;
        return {
          id: u.id,
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL,
          profession: u.profession,
          lastSpentCategory: intel.lastSpentCategory as string | undefined,
          topCategory: topCat ? topCat[0] : undefined,
          topCategoryAmount: topCat ? topCat[1] : 0,
          mostFrequentCategory: mostFrequent ? mostFrequent[0] : undefined,
          mostFrequentCount: mostFrequent ? mostFrequent[1] : 0,
          totalAllTimeSpend,
          customCategories: (intel.customCategories as string[] | undefined) ?? [],
          totalSpentByCategory: totalSpent ?? {},
          frequency: frequency ?? {},
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.totalAllTimeSpend - a.totalAllTimeSpend) as {
        id: string;
        displayName: string;
        email: string;
        photoURL?: string;
        profession?: string;
        lastSpentCategory?: string;
        topCategory?: string;
        topCategoryAmount: number;
        mostFrequentCategory?: string;
        mostFrequentCount: number;
        totalAllTimeSpend: number;
        customCategories: string[];
        totalSpentByCategory: Record<string, number>;
        frequency: Record<string, number>;
      }[];
  }, [userIntelligenceMap, rawUsers]);

  /** AI context for the open User Monitoring Board (push composer + re-engagement). */
  const selectedUserNotifyContext = useMemo(() => {
    if (!selectedUser?.id) return null;
    const uid = selectedUser.id;
    const seg = leadGenSegment.byUid[uid];
    const userType: DirectNotifyUserType =
      seg === 'ghost' ? 'Ghost User' : seg === 'power' ? 'Power User' : 'Irregular User';
    const intelRow = intelligenceRows.find((r) => r.id === uid);
    let lastMs: number | null = null;
    for (const t of transactions) {
      const tid = (t as { userId?: string }).userId;
      if (tid !== uid) continue;
      const ms = txTimestampMs(t as { date?: unknown });
      if (ms != null && (lastMs === null || ms > lastMs)) lastMs = ms;
    }
    const daysSinceLastEntry =
      lastMs === null ? null : Math.max(0, Math.floor((Date.now() - lastMs) / MS_PER_DAY));
    return {
      displayName: selectedUser.displayName || 'বন্ধু',
      profession: getProfessionLabel(selectedUser.profession),
      topCategory: intelRow?.topCategory ?? selectedUser.topCategory,
      userType,
      daysSinceLastEntry,
    };
  }, [selectedUser, leadGenSegment, intelligenceRows, transactions]);

  /**
   * Inactive campaign AI: same inputs as Lead “Direct notify” — uses the selected user
   * with the highest days inactive as the profile sample (segment, days since last entry, top category).
   */
  const inactiveCampaignAiContext = useMemo(() => {
    if (inactiveSelectedUids.size === 0) return null;
    const selectedRows = inactiveUsers.filter((u: any) => inactiveSelectedUids.has(u.id));
    if (selectedRows.length === 0) return null;
    const u = selectedRows.reduce((a: any, b: any) => (a.daysInactive >= b.daysInactive ? a : b));
    const uid = u.id;
    const seg = leadGenSegment.byUid[uid];
    const userType: DirectNotifyUserType =
      seg === 'ghost' ? 'Ghost User' : seg === 'power' ? 'Power User' : 'Irregular User';
    const intelRow = intelligenceRows.find((r) => r.id === uid);
    let lastMs: number | null = null;
    for (const t of transactions) {
      const tid = (t as { userId?: string }).userId;
      if (tid !== uid) continue;
      const ms = txTimestampMs(t as { date?: unknown });
      if (ms != null && (lastMs === null || ms > lastMs)) lastMs = ms;
    }
    const daysSinceLastEntry =
      lastMs === null ? null : Math.max(0, Math.floor((Date.now() - lastMs) / MS_PER_DAY));
    return {
      displayName: u.displayName || 'বন্ধু',
      profession: getProfessionLabel(u.profession),
      topCategory: intelRow?.topCategory,
      userType,
      daysSinceLastEntry,
    };
  }, [inactiveSelectedUids, inactiveUsers, leadGenSegment, intelligenceRows, transactions]);

  /** Aggregated custom category list with contributing users, sorted by popularity. */
  const customCategoriesReport = useMemo(() => {
    const catMap: Record<string, { users: { id: string; displayName: string; email: string }[] }> = {};
    Object.entries(userIntelligenceMap).forEach(([uid, intel]) => {
      const u = rawUsers.find((x: any) => x.id === uid);
      const userInfo = { id: uid, displayName: u?.displayName || 'Unknown', email: u?.email || '' };
      ((intel.customCategories as string[] | undefined) ?? []).forEach((cat) => {
        if (!catMap[cat]) catMap[cat] = { users: [] };
        catMap[cat].users.push(userInfo);
      });
    });
    return Object.entries(catMap)
      .map(([category, { users: catUsers }]) => ({ category, users: catUsers }))
      .sort((a, b) => b.users.length - a.users.length);
  }, [userIntelligenceMap, rawUsers]);

  const filteredUsers = useMemo(() => {
    const filtered = visibleUsers.filter((u) => {
      const term = searchTerm.toLowerCase();
      if (term && !u.displayName?.toLowerCase().includes(term) && !u.email?.toLowerCase().includes(term)) return false;
      if (incomeMin && u.totalIncome < Number(incomeMin)) return false;
      if (incomeMax && u.totalIncome > Number(incomeMax)) return false;
      if (filterCategory && filterCategoryMin) {
        const spent = u.categoryBreakdown[filterCategory] || 0;
        if (spent < Number(filterCategoryMin)) return false;
      }
      if (filterProfession && u.profession !== filterProfession) return false;
      if (filterTag && !u.tags.includes(filterTag)) return false;
      if (filterMarketingTag) {
        const m = (u as { marketingTags?: string[] }).marketingTags ?? [];
        if (!m.includes(filterMarketingTag)) return false;
      }
      return true;
    });
    return filtered.sort(
      (a, b) => getUserListSortTimeMs(b as any, transactions) - getUserListSortTimeMs(a as any, transactions),
    );
  }, [visibleUsers, searchTerm, incomeMin, incomeMax, filterCategory, filterCategoryMin, filterProfession, filterTag, filterMarketingTag, transactions]);

  const leadMetricsByUid = useMemo(() => {
    const now = Date.now();
    const cutoff30 = now - 30 * MS_PER_DAY;
    const fnByUid: Record<string, FinancialNetworkDoc[]> = {};
    financialNetworkDocs.forEach((doc: any) => {
      const uid = doc.userId;
      if (!uid) return;
      if (!fnByUid[uid]) fnByUid[uid] = [];
      fnByUid[uid].push({
        userId: uid,
        debtId: doc.debtId,
        contactName: doc.contactName,
        contactPhone: doc.contactPhone,
        isBusiness: doc.isBusiness,
        debtType: doc.debtType,
        amount: doc.amount,
      });
    });

    const catsByUid: Record<string, Set<string>> = {};
    transactions.forEach((t: any) => {
      if (t.type !== 'expense' || !t.category) return;
      const uid = t.userId;
      if (!uid) return;
      if (!catsByUid[uid]) catsByUid[uid] = new Set();
      catsByUid[uid].add(String(t.category));
    });

    const tx30ByUid: Record<string, number> = {};
    transactions.forEach((t: any) => {
      const ms = txTimestampMs(t);
      if (ms == null || ms < cutoff30) return;
      const uid = t.userId;
      if (!uid) return;
      tx30ByUid[uid] = (tx30ByUid[uid] || 0) + 1;
    });

    const out: Record<string, LeadMetricsRow> = {};
    visibleUsers.forEach((u) => {
      const uid = u.id;
      const network = fnByUid[uid] ?? [];
      const cats = Array.from(catsByUid[uid] ?? []);
      const tx30 = tx30ByUid[uid] ?? 0;
      const isPower = leadGenSegment.byUid[uid] === 'power';
      const lqi = computeLqi({
        monthlyIncome: u.totalIncome,
        txCountLast30Days: tx30,
        isPowerSegment: isPower,
        expenseCategoryLabels: cats,
        financialNetwork: network,
      });
      const tier = leadTierFromLqi(lqi);
      const merchant = isMerchantProspect(network);

      const userDebts = adminDebts.filter(
        (d: any) => d.userId === uid && d.type === 'borrowed' && d.status !== 'paid',
      );
      const top3 = [...userDebts].sort((a: any, b: any) => (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 3);
      const topCreditors = top3
        .map((d: any) => `${String(d.personName || '?').replace(/;/g, ',')} (${Number(d.amount) || 0})`)
        .join(' | ');

      const totalBorrowedOutstanding = userDebts.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0);

      out[uid] = { lqi, tier, merchantProspect: merchant, topCreditors, totalBorrowedOutstanding };
    });
    return out;
  }, [visibleUsers, transactions, financialNetworkDocs, adminDebts, leadGenSegment]);

  const selectedUserFinancialNetwork = useMemo(() => {
    const uid = selectedUser?.id;
    if (!uid) return [] as any[];
    return financialNetworkDocs.filter((d: any) => d.userId === uid);
  }, [selectedUser?.id, financialNetworkDocs]);

  const tooltipStyle = useCallback((): React.CSSProperties => {
    const dark = document.documentElement.classList.contains('dark');
    return {
      borderRadius: 16, border: 'none', padding: '12px 16px',
      boxShadow: dark ? '0 22px 48px rgba(0,0,0,0.55)' : '0 22px 44px -10px rgba(15,23,42,0.2)',
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      color: dark ? '#fff' : '#0f172a',
    };
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────────
  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportFacebookAdsCsv = () => {
    const rows = fbExportGoldOnly
      ? filteredUsers.filter((u) => leadMetricsByUid[u.id]?.tier === 'gold')
      : filteredUsers;
    const lines = [
      ['fn', 'ln', 'email', 'phone'].join(','),
      ...rows.map((u) => {
        const parts = (u.displayName || '').trim().split(' ');
        return [escapeCsv(parts[0] || ''), escapeCsv(parts.slice(1).join(' ') || ''), escapeCsv(u.email || ''), escapeCsv(u.phoneNumber || '')].join(',');
      }),
    ];
    const tag = fbExportGoldOnly ? 'gold_' : '';
    downloadCsv(lines.join('\n'), `fb_custom_audience_${tag}${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const exportFullCsv = () => {
    const headers = [
      'Name', 'Email', 'Phone', 'Profession', 'Monthly Income', 'Monthly Expense', 'Balance',
      'Top Category', 'Tags', 'Marketing Tags', 'LQI Score', 'Lead Tier', 'Merchant Prospect', 'Top 3 Creditors',
    ];
    const lines = [
      headers.join(','),
      ...filteredUsers.map((u) => {
        const lm = leadMetricsByUid[u.id];
        const tierLabel =
          lm?.tier === 'gold' ? 'Gold Lead' : lm?.tier === 'silver' ? 'Silver Lead' : 'Standard';
        const mTags = ((u as { marketingTags?: string[] }).marketingTags ?? []).join('; ');
        return [
          escapeCsv(u.displayName || 'N/A'), escapeCsv(u.email),
          escapeCsv(u.phoneNumber || 'N/A'), escapeCsv(getProfessionLabel(u.profession)),
          u.totalIncome, u.totalExpense, u.balance,
          escapeCsv(u.topCategory), escapeCsv(u.tags.join('; ')), escapeCsv(mTags),
          lm?.lqi ?? '', tierLabel, lm?.merchantProspect ? 'yes' : 'no', escapeCsv(lm?.topCreditors ?? ''),
        ].join(',');
      }),
    ];
    downloadCsv(lines.join('\n'), `full_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handleUserClick = (u: any) => {
    setAdminActionError(null);
    setSelectedUser(u);
  };

  const handleAnalyzeUserVibe = useCallback(async () => {
    if (!selectedUser || !userMonitoring) return;
    setAdminStrategicLoading(true);
    setAdminStrategicError(null);
    try {
      const lm = leadMetricsByUid[selectedUser.id];
      const topCats = userMonitoring.top3ExpenseCategories.map((c: { category?: string }) => c.category ?? '').filter(Boolean);
      const payload = {
        displayName: selectedUser.displayName || 'Unknown',
        profession: getProfessionLabel(selectedUser.profession),
        email: selectedUser.email || '',
        phone: selectedUser.phoneNumber || '',
        monthlyIncome: selectedUser.totalIncome,
        estimatedOutstandingBorrowedDebt: lm?.totalBorrowedOutstanding ?? 0,
        topExpenseCategories: topCats,
        lqiScore: lm?.lqi,
        leadTier: lm?.tier,
        merchantProspect: lm?.merchantProspect ?? false,
        allTimeIncome: userMonitoring.allTimeIncome,
        allTimeExpense: userMonitoring.allTimeExpense,
        top3ExpenseCategories: userMonitoring.top3ExpenseCategories,
        transactionCountAllTime: userMonitoring.txs.length,
        entriesPerWeekApprox: Number(userMonitoring.entriesPerWeek.toFixed(2)),
        distinctActiveDays: userMonitoring.distinctActiveDays,
        inactiveCalendarDaysInSpan: userMonitoring.inactiveDaysInWindow,
        daysSinceLastActivity: userMonitoring.daysSinceLastActivity,
        recentNotesFromTransactions: userMonitoring.recentNotes,
      };
      const text = await generateAdminUserStrategicInsight(JSON.stringify(payload, null, 2));
      setAdminStrategicInsight(text);
    } catch (e: unknown) {
      setAdminStrategicError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdminStrategicLoading(false);
    }
  }, [selectedUser, userMonitoring, leadMetricsByUid]);

  const forceUserRelogin = useCallback(async (targetUserId: string) => {
    if (user?.email !== ADMIN_EMAIL) return;

    setAdminActionPendingUid(targetUserId);
    setAdminActionError(null);
    try {
      await updateDoc(doc(db, 'users', targetUserId), {
        forceRelogin: true,
        hideFromAdminList: true,
        adminRemovedAt: serverTimestamp(),
      });

      if (selectedUser?.id === targetUserId) {
        setSelectedUser(null);
      }
    } catch (error) {
      console.error('Failed to force re-login:', error);
      setAdminActionError('Could not remove this user from the list right now. Please try again.');
    } finally {
      setAdminActionPendingUid(null);
    }
  }, [selectedUser?.id, user?.email]);

  const sendInactiveCampaign = useCallback(async () => {
    const uids = [...inactiveSelectedUids];
    if (!uids.length || !inactiveComposeTitle.trim() || !inactiveComposeMsg.trim()) return;
    setInactiveSending(true);
    setInactiveSendError(null);
    try {
      const blogRef = await addDoc(collection(db, 'blogs'), {
        title: inactiveComposeTitle.trim(),
        blogContent: inactiveComposeMsg.trim(),
        notificationMessage: inactiveComposeMsg.trim(),
        imageUrl: '',
        type: 'manual',
        status: 'published',
        category: 'Re-engagement',
        targetUserIds: uids,
        createdAt: serverTimestamp(),
      });
      setInactiveBlogId(blogRef.id);
      await queueNotificationsForUsers(blogRef.id, uids, inactiveComposeTitle.trim(), inactiveComposeMsg.trim());
      setInactiveSendDone(true);
      setInactiveComposeOpen(false);
      setInactiveSelectedUids(new Set());
    } catch (e: any) {
      setInactiveSendError(`Failed: ${String(e?.message ?? e)}`);
    } finally {
      setInactiveSending(false);
    }
  }, [inactiveSelectedUids, inactiveComposeTitle, inactiveComposeMsg]);

  const handlePanelReengageAi = useCallback(async () => {
    if (!selectedUser || !userMonitoring || !selectedUserNotifyContext) return;
    setPanelPushAiLoading(true);
    setPanelPushError(null);
    try {
      const { title, message } = await generateReengagementPushForUser({
        displayName: selectedUserNotifyContext.displayName,
        profession: selectedUserNotifyContext.profession,
        topCategory: selectedUserNotifyContext.topCategory,
        userType: selectedUserNotifyContext.userType,
        daysSinceLastEntry: selectedUserNotifyContext.daysSinceLastEntry,
        allTimeIncome: userMonitoring.allTimeIncome,
        allTimeExpense: userMonitoring.allTimeExpense,
        top3ExpenseCategories: userMonitoring.top3ExpenseCategories,
        entriesPerWeekApprox: Number(userMonitoring.entriesPerWeek.toFixed(2)),
        recentNotesSample: userMonitoring.recentNotes,
      });
      setPanelPushTitle(title);
      setPanelPushMessage(message);
    } catch (err: unknown) {
      setPanelPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPanelPushAiLoading(false);
    }
  }, [selectedUser, userMonitoring, selectedUserNotifyContext]);

  const handlePanelAdminOnlyInsight = useCallback(async () => {
    if (!selectedUser || !userMonitoring) return;
    setPanelAdminOnlyLoading(true);
    setPanelAdminOnlyError(null);
    try {
      const lm = leadMetricsByUid[selectedUser.id];
      const topCats = userMonitoring.top3ExpenseCategories.map((c: { category?: string }) => c.category ?? '').filter(Boolean);
      const payload = {
        purpose: 'admin_only_product_and_retention_advice',
        displayName: selectedUser.displayName || 'Unknown',
        profession: getProfessionLabel(selectedUser.profession),
        email: selectedUser.email || '',
        phone: selectedUser.phoneNumber || '',
        segment: selectedUserNotifyContext?.userType ?? 'Unknown',
        monthlyIncome: selectedUser.totalIncome,
        estimatedOutstandingBorrowedDebt: lm?.totalBorrowedOutstanding ?? 0,
        topExpenseCategories: topCats,
        lqiScore: lm?.lqi,
        leadTier: lm?.tier,
        merchantProspect: lm?.merchantProspect ?? false,
        allTimeIncome: userMonitoring.allTimeIncome,
        allTimeExpense: userMonitoring.allTimeExpense,
        top3ExpenseCategories: userMonitoring.top3ExpenseCategories,
        transactionCountAllTime: userMonitoring.txs.length,
        entriesPerWeekApprox: Number(userMonitoring.entriesPerWeek.toFixed(2)),
        distinctActiveDays: userMonitoring.distinctActiveDays,
        daysSinceLastActivity: userMonitoring.daysSinceLastActivity,
        recentNotesFromTransactions: userMonitoring.recentNotes,
      };
      const text = await generateAdminUserStrategicInsight(JSON.stringify(payload, null, 2));
      setPanelAdminOnlyInsight(text);
    } catch (e: unknown) {
      setPanelAdminOnlyError(e instanceof Error ? e.message : String(e));
    } finally {
      setPanelAdminOnlyLoading(false);
    }
  }, [selectedUser, userMonitoring, selectedUserNotifyContext?.userType, leadMetricsByUid]);

  const handlePanelSendPush = useCallback(async () => {
    if (!selectedUser) return;
    if (!panelPushTitle.trim() || !panelPushMessage.trim()) {
      setPanelPushError('শিরোনাম ও বার্তা লিখুন।');
      return;
    }
    setPanelPushSending(true);
    setPanelPushError(null);
    try {
      await queueNotificationForUser(selectedUser.id, panelPushTitle.trim(), panelPushMessage.trim(), {
        blogId: panelPushBlogId.trim() || null,
      });
    } catch (err: unknown) {
      setPanelPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPanelPushSending(false);
    }
  }, [selectedUser, panelPushTitle, panelPushMessage, panelPushBlogId]);

  const handleInactiveAiPersonalTip = useCallback(async () => {
    const ctx = inactiveCampaignAiContext;
    if (!ctx) {
      setInactiveSendError('Select at least one user from the inactive list.');
      return;
    }
    setInactiveAiLoading(true);
    setInactiveSendError(null);
    try {
      const { title, message } = await generatePersonalFinanceTip({
        displayName: ctx.displayName,
        profession: ctx.profession,
        topCategory: ctx.topCategory,
        userType: ctx.userType,
        daysSinceLastEntry: ctx.daysSinceLastEntry,
      });
      setInactiveComposeTitle(title);
      setInactiveComposeMsg(message.slice(0, 120));
    } catch (err: unknown) {
      setInactiveSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setInactiveAiLoading(false);
    }
  }, [inactiveCampaignAiContext]);

  const openGlobalCampaign = useCallback(() => {
    setGlobalCampaignError(null);
    setGlobalCampaignTitle('Ay Bay Er GustiMari');
    setGlobalCampaignMessage('');
    setGlobalCampaignBlogId('');
    setGlobalCampaignSegment('all');
    setGlobalCampaignOpen(true);
  }, []);

  const handleGlobalCampaignSend = useCallback(async () => {
    if (!globalCampaignTitle.trim() || !globalCampaignMessage.trim()) {
      setGlobalCampaignError('Please add a title and a message.');
      return;
    }
    if (campaignTargetUserIds.length === 0) {
      setGlobalCampaignError('No users match this segment.');
      return;
    }
    setGlobalCampaignSending(true);
    setGlobalCampaignError(null);
    try {
      if (globalCampaignBlogId.trim()) {
        await queueNotificationsForUsers(
          globalCampaignBlogId.trim(),
          campaignTargetUserIds,
          globalCampaignTitle.trim(),
          globalCampaignMessage.trim(),
        );
      } else {
        await queueManualNotificationsForUsers(
          campaignTargetUserIds,
          globalCampaignTitle.trim(),
          globalCampaignMessage.trim(),
        );
      }
      setGlobalCampaignOpen(false);
    } catch (err: unknown) {
      setGlobalCampaignError(err instanceof Error ? err.message : String(err));
    } finally {
      setGlobalCampaignSending(false);
    }
  }, [
    campaignTargetUserIds,
    globalCampaignTitle,
    globalCampaignMessage,
    globalCampaignBlogId,
  ]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
          <div className="absolute inset-3 animate-ping rounded-full bg-indigo-500/20" />
        </div>
      </div>
    );
  }

  // ── Access Denied ────────────────────────────────────────────────────────────
  if (user?.email !== ADMIN_EMAIL) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-red-950/20 to-slate-950 p-8">
        <motion.div
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.1 }}
          className="flex flex-col items-center gap-8 text-center"
        >
          <div className="relative">
            <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 rounded-full bg-red-500/25 blur-2xl" />
            <motion.div animate={{ rotateZ: [0, -8, 8, -4, 4, 0] }} transition={{ delay: 0.6, duration: 0.5 }}
              className="relative flex h-36 w-36 items-center justify-center rounded-full"
              style={{ background: 'linear-gradient(135deg,#b91c1c,#7f1d1d)', boxShadow: '0 0 80px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.12)' }}
            >
              <ShieldX className="h-20 w-20 text-white drop-shadow-lg" />
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
            <h1 className="text-4xl font-black tracking-[0.18em] text-red-400 drop-shadow-[0_0_30px_rgba(239,68,68,0.5)] sm:text-5xl">ACCESS DENIED</h1>
            <p className="mt-3 text-base text-slate-400">This area is restricted to the platform administrator.</p>
          </motion.div>
          <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
            onClick={onBack}
            className="rounded-2xl bg-white/10 px-8 py-3 font-bold text-white backdrop-blur-sm ring-1 ring-white/20 transition-all hover:bg-white/15"
          >
            ← Return to App
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── Main Dashboard ────────────────────────────────────────────────────────────
  const statCards = [
    {
      label: 'Total Users',
      formatted: String(visibleUsers.length),
      icon: Users,
      gradient: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)',
      glow: 'rgba(99,102,241,0.45)',
      sub: `${visibleUsers.filter((u) => u.subscription === 'Premium').length} Premium`,
    },
    {
      label: 'Daily Active Users',
      formatted: String(dailyActiveUsers),
      icon: Activity,
      gradient: 'linear-gradient(135deg,#059669 0%,#0d9488 100%)',
      glow: 'rgba(16,185,129,0.45)',
      sub: 'Transactions today',
    },
  ];

  const activeExplorerReport = explorerTab === 'expense' ? platformExpenseCategoryReport : explorerTab === 'income' ? platformIncomeCategoryReport : [];

  return (
    <div className="w-full min-w-0 space-y-8 pb-24 sm:pb-20">
      <LiveClockDate prominent className="shadow-md" />

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={onBack} className="mt-1 shrink-0 rounded-full p-2 transition-all hover:bg-slate-100 dark:hover:bg-slate-700">
            <ArrowLeft className="h-6 w-6 text-slate-600 dark:text-slate-400" />
          </button>
          <div className="min-w-0">
            <h2 className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-2xl font-black text-transparent sm:text-3xl">
              Marketing Intelligence Center
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Live platform analytics &nbsp;·&nbsp;
              <span className="font-semibold text-slate-700 dark:text-slate-200">{adminMonthLabel}</span>
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <input
              type="checkbox"
              checked={fbExportGoldOnly}
              onChange={(e) => setFbExportGoldOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            FB export: Gold leads only
          </label>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={openGlobalCampaign}
            aria-label="Open global campaign: notify users by segment"
            className="flex w-full min-h-[3.25rem] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-6 py-3.5 text-left shadow-xl shadow-orange-500/35 ring-2 ring-white/30 transition-all hover:brightness-110 sm:w-auto dark:ring-white/10"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/25">
              <Bell className="h-6 w-6 text-white" />
            </span>
            <span className="min-w-0 flex flex-col leading-tight">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">Global campaign</span>
              <span className="text-base font-black text-white">Notify all</span>
              <span className="text-[11px] font-semibold text-white/85">Ghost, irregular, power, or everyone</span>
            </span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportFacebookAdsCsv}
            className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:bg-indigo-700">
            <Download className="h-4 w-4" /> Export Custom Audience (CSV)
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportFullCsv}
            className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
            <Download className="h-4 w-4" /> Full CSV Report
          </motion.button>
        </div>
      </div>

      {/* ── Stat Cards (2 only — platform volume removed) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: i * 0.08 }}
            whileHover={{ y: -6, transition: { type: 'spring', stiffness: 320, damping: 22 } }}
            style={{ background: card.gradient, boxShadow: `0 20px 60px -10px ${card.glow}, inset 0 1px 0 rgba(255,255,255,0.12)` }}
            className="relative overflow-hidden rounded-3xl p-6 text-white"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-white/70">{card.label}</span>
                  <LiveBadge />
                </div>
                <p className="truncate text-3xl font-black tracking-tight">{card.formatted}</p>
                <p className="mt-1 text-xs text-white/60">{card.sub}</p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                <card.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="neon-card rounded-[2rem] border border-slate-200/80 p-5 dark:border-slate-700 sm:p-7">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
              <PieChartIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Spending Distribution</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">All categories · {adminMonthLabel}</p>
            </div>
          </div>
          <div className="h-[min(20rem,70vw)] min-h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {CHART_COLORS.map((c, i) => (
                    <linearGradient key={i} id={`pie-${chartUid}-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.6} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={allCategoriesDist.length ? allCategoriesDist : [{ name: 'No data', value: 1 }]}
                  cx="50%" cy="50%" innerRadius="40%" outerRadius="68%"
                  paddingAngle={allCategoriesDist.length ? 4 : 0} dataKey="value"
                  activeShape={renderActiveShape}
                >
                  {(allCategoriesDist.length ? allCategoriesDist : [{ name: 'No data', value: 1 }]).map((_, idx) => (
                    <Cell key={`pc-${idx}`} fill={allCategoriesDist.length ? `url(#pie-${chartUid}-${idx % CHART_COLORS.length})` : '#e2e8f0'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => formatCurrency(v, language)} />
                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 11, maxHeight: 280, overflowY: 'auto' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className="neon-card rounded-[2rem] border border-slate-200/80 p-5 dark:border-slate-700 sm:p-7">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
              <BarChart3 className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Income vs Expense Trends</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">All users · last 6 months</p>
            </div>
          </div>
          <div className="h-[min(20rem,70vw)] min-h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} barGap={6} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v: number) => formatCurrency(v, language)} />
                <Legend />
                <Bar dataKey="income" name="Income" fill="#10b981" shape={(p: any) => <Bar3DShape {...p} fill="#10b981" />} maxBarSize={36} />
                <Bar dataKey="expense" name="Expense" fill="#ef4444" shape={(p: any) => <Bar3DShape {...p} fill="#ef4444" />} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* ── Category Explorers ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="neon-card overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-slate-700">
        {/* Header + tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-slate-100 dark:border-slate-700 p-5 sm:p-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
              <Tags className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 dark:text-white">Category Intelligence Explorer</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {explorerTab === 'profession' ? 'User distribution by sign-in profession · All time' : 'Click any row to see users & send manual campaign · All time'}
              </p>
            </div>
          </div>
          {/* Tab switcher */}
          <div className="flex rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setExplorerTab('expense')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all',
                explorerTab === 'expense'
                  ? 'bg-red-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              <TrendingDown className="w-3 h-3" /> Expense
            </button>
            <button
              onClick={() => setExplorerTab('income')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all border-l border-slate-200 dark:border-slate-600',
                explorerTab === 'income'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              <TrendingUp className="w-3 h-3" /> Income
            </button>
            <button
              onClick={() => setExplorerTab('profession')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all border-l border-slate-200 dark:border-slate-600',
                explorerTab === 'profession'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              <Briefcase className="w-3 h-3" /> Profession
            </button>
          </div>
        </div>

        {/* Table header */}
        {explorerTab === 'profession' ? (
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-5 py-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Profession</span>
            <span className="text-right w-16">Users</span>
            <span className="text-right w-28">Income</span>
            <span className="text-right w-28">Expense</span>
            <span className="w-16 text-center">Target</span>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-5 py-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Category</span>
            <span className="text-right">Users</span>
            <span className="text-right w-28">Total</span>
            <span className="hidden sm:block text-right w-24">Avg / User</span>
            <span className="w-16 text-center">Target</span>
          </div>
        )}

        {/* Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-[28rem] overflow-y-auto">
          {explorerTab === 'profession' ? (
            platformProfessionReport.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No profession data found.</p>
            ) : (
              platformProfessionReport.map((row, idx) => (
                <motion.div
                  key={row.id}
                  layout
                  onClick={() => setProfessionModal({ id: row.id, name: row.name, userIds: row.userIds })}
                  className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{row.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="w-16 sm:w-24 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500"
                            style={{ width: `${Math.min(row.pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{row.pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 text-right w-16">{row.userCount}</span>
                  <span className="text-sm font-bold text-right w-28 text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(row.totalIncome, language)}
                  </span>
                  <span className="text-sm font-bold text-right w-28 text-red-600 dark:text-red-400">
                    {formatCurrency(row.totalExpense, language)}
                  </span>
                  <div className="w-16 flex justify-center">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                      <Target className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                      <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors hidden sm:inline">Target</span>
                    </div>
                  </div>
                </motion.div>
              ))
            )
          ) : activeExplorerReport.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No {explorerTab} data found.</p>
          ) : (
            activeExplorerReport.map((row, idx) => (
              <motion.div
                key={row.name}
                layout
                className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
                onClick={() => setCategoryModal({ category: row.name, type: explorerTab as 'income' | 'expense' })}
              >
                {/* Name + bar */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{row.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="w-16 sm:w-24 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', explorerTab === 'expense' ? 'bg-gradient-to-r from-red-400 to-rose-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500')}
                          style={{ width: `${Math.min(row.pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{row.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 text-right">{row.userCount}</span>

                <span className={cn('text-sm font-bold text-right w-28', explorerTab === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                  {formatCurrency(row.total, language)}
                </span>

                <span className="hidden sm:block text-xs text-slate-400 text-right w-24">
                  {formatCurrency(row.avgPerUser, language)}
                </span>

                <div className="w-16 flex justify-center">
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 transition-colors">
                    <Target className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors hidden sm:inline">Target</span>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>

      {/* ── Inactive Users Panel ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="neon-card overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-slate-700">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-slate-100 dark:border-slate-700 p-5 sm:p-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 dark:text-white">Inactive Users</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign in করেছে কিন্তু app use করছে না · Re-engage with targeted notifications
              </p>
            </div>
          </div>
          {/* Day filter buttons */}
          <div className="flex rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0 self-start sm:self-auto">
            {([1, 3, 5, 7] as const).map((d) => (
              <button
                key={d}
                onClick={() => { setInactiveFilter(d); setInactiveSelectedUids(new Set()); setInactiveSendDone(false); setInactiveBlogId(null); }}
                className={cn(
                  'px-3.5 py-2 text-xs font-bold transition-all border-l first:border-l-0 border-slate-200 dark:border-slate-600',
                  inactiveFilter === d
                    ? 'bg-amber-500 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-slate-700'
                )}
              >
                {d}d+
              </button>
            ))}
          </div>
        </div>

        {/* Success banner */}
        {inactiveSendDone && inactiveBlogId && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mx-5 mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
            <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-300 flex-1 font-medium">Campaign sent successfully!</p>
            <button onClick={() => { setInactiveSendDone(false); setInactiveBlogId(null); }} className="text-emerald-500 hover:text-emerald-700 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-5 py-3 mt-1 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <button
            onClick={() => {
              if (inactiveSelectedUids.size === inactiveUsers.length && inactiveUsers.length > 0) {
                setInactiveSelectedUids(new Set());
              } else {
                setInactiveSelectedUids(new Set(inactiveUsers.map((u: any) => u.id)));
              }
            }}
            className="text-slate-400 hover:text-indigo-600 transition-colors"
          >
            {inactiveSelectedUids.size === inactiveUsers.length && inactiveUsers.length > 0
              ? <CheckSquare className="w-4 h-4 text-indigo-600" />
              : <Square className="w-4 h-4" />
            }
          </button>
          <span>User</span>
          <span className="text-right hidden sm:block w-24">Profession</span>
          <span className="text-right w-20">Inactive</span>
          <span className="w-20 text-center">{inactiveFilter >= 7 ? 'Action' : 'Select'}</span>
        </div>

        {/* User rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-[28rem] overflow-y-auto">
          {inactiveUsers.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-slate-400">
              <Activity className="w-8 h-8" />
              <p className="text-sm">No users inactive for {inactiveFilter}+ day{inactiveFilter > 1 ? 's' : ''}.</p>
            </div>
          ) : (
            inactiveUsers.map((u: any) => {
              const isSel = inactiveSelectedUids.has(u.id);
              return (
                <motion.div
                  key={u.id}
                  layout
                  className={cn(
                    'grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2 px-5 py-3 transition-colors',
                    isSel ? 'bg-amber-50/60 dark:bg-amber-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                  )}
                >
                  <button
                    onClick={() => setInactiveSelectedUids((prev) => { const next = new Set(prev); next.has(u.id) ? next.delete(u.id) : next.add(u.id); return next; })}
                    className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                  >
                    {isSel ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4" />}
                  </button>

                  <div className="flex items-center gap-2.5 min-w-0">
                    {u.photoURL
                      ? <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{(u.displayName || '?').charAt(0).toUpperCase()}</div>
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{u.displayName || 'Unknown'}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{u.email}</p>
                    </div>
                  </div>

                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hidden sm:block w-24 text-center truncate">
                    {getProfessionLabel(u.profession)}
                  </span>

                  <span className={cn(
                    'text-xs font-bold w-20 text-right',
                    u.daysInactive >= 7 ? 'text-red-600 dark:text-red-400' : u.daysInactive >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                  )}>
                    {u.daysInactive}d ago
                  </span>

                  <div className="w-20 flex justify-center shrink-0">
                    {inactiveFilter >= 7 ? (
                      <button
                        onClick={() => forceUserRelogin(u.id)}
                        disabled={adminActionPendingUid === u.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 text-[10px] font-bold transition-all disabled:opacity-50"
                      >
                        {adminActionPendingUid === u.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <UserMinus className="w-3 h-3" />
                        }
                        {adminActionPendingUid === u.id ? '…' : 'Remove'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setInactiveSelectedUids((prev) => { const next = new Set(prev); next.has(u.id) ? next.delete(u.id) : next.add(u.id); return next; })}
                        className={cn(
                          'p-1.5 rounded-xl border transition-all text-[10px] font-bold',
                          isSel
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-amber-400 hover:text-amber-600'
                        )}
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Footer — bulk send button */}
        {inactiveSelectedUids.size > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="border-t border-slate-100 dark:border-slate-700 p-4 flex items-center gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400 flex-1">
              <strong className="text-slate-700 dark:text-slate-200">{inactiveSelectedUids.size}</strong> user{inactiveSelectedUids.size !== 1 ? 's' : ''} selected
            </p>
            <button
              onClick={() => { setInactiveComposeOpen(true); setInactiveSendError(null); setInactiveComposeTitle(''); setInactiveComposeMsg(''); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-amber-500/25"
            >
              <Send className="w-4 h-4" />
              Send Notification
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* ── User Intelligence Panel ── */}
      {(intelligenceRows.length > 0 || customCategoriesReport.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="neon-card overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-slate-700 space-y-0">

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 p-5 sm:p-6 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">User Intelligence — Behavioral Spending</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All-time data from <code className="font-mono text-violet-600 dark:text-violet-400">user_intelligence</code> collection · {intelligenceRows.length} tracked user{intelligenceRows.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Behavioral rows */}
          {intelligenceRows.length > 0 && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_5.5rem_auto_auto_auto_auto] gap-2 px-5 py-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>User</span>
                <span className="text-center">LQI</span>
                <span className="text-center">Lead</span>
                <span className="text-right w-28 hidden sm:block">Total Spent</span>
                <span className="text-right w-28">Top Category</span>
                <span className="text-right w-24 hidden sm:block">Last Spent</span>
                <span className="text-right w-20">Freq.</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
                {intelligenceRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_2.75rem_5.5rem_auto_auto_auto_auto] items-center gap-2 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    onClick={() => {
                      const u = users.find((x) => x.id === row.id);
                      if (u) handleUserClick(u);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {row.photoURL
                        ? <img src={row.photoURL} alt="" className="h-8 w-8 rounded-xl object-cover shrink-0" />
                        : <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white text-xs font-bold">{(row.displayName || '?').charAt(0).toUpperCase()}</div>
                      }
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <GoldLeadStar show={leadMetricsByUid[row.id]?.tier === 'gold'} />
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{row.displayName || 'Unknown'}</p>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{row.email}</p>
                      </div>
                    </div>

                    <span className="text-center font-mono text-xs font-black text-violet-600 dark:text-violet-300">
                      {leadMetricsByUid[row.id]?.lqi ?? '—'}
                    </span>
                    <div className="flex justify-center">
                      <LeadGenBadges lm={leadMetricsByUid[row.id]} />
                    </div>

                    <span className="hidden sm:block text-xs font-bold text-red-600 dark:text-red-400 text-right w-28">
                      {formatCurrency(row.totalAllTimeSpend, language)}
                    </span>

                    <span className="text-right w-28">
                      {row.topCategory ? (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 max-w-[6.5rem] truncate">
                          {row.topCategory}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </span>

                    <span className="hidden sm:block text-right w-24">
                      {row.lastSpentCategory ? (
                        <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 max-w-[5.5rem] truncate">
                          {row.lastSpentCategory}
                        </span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </span>

                    <div className="text-right w-20 space-y-0.5">
                      {row.mostFrequentCategory && (
                        <>
                          <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{row.mostFrequentCount}×</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[4.5rem]">{row.mostFrequentCategory}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Custom Categories Report */}
          {customCategoriesReport.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-700 p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">User-Created Custom Categories</h4>
                <span className="ml-auto rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-300">
                  {customCategoriesReport.length} custom
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {customCategoriesReport.map(({ category, users: catUsers }) => (
                  <div key={category}
                    className="flex items-center gap-1.5 rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5"
                    title={`Created by: ${catUsers.map((u) => u.displayName).join(', ')}`}
                  >
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-200">{category}</span>
                    <span className="rounded-full bg-amber-200 dark:bg-amber-700 px-1.5 py-0.5 text-[10px] font-black text-amber-900 dark:text-amber-100">
                      {catUsers.length}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">These are categories created by users that are not in the default list. Use them to discover new spending patterns.</p>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Advanced Filters ── */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search by name or email…" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-2xl border px-5 py-3.5 text-sm font-bold transition-all',
              showFilters
                ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            <Filter className="h-4 w-4" />
            Filters {filterProfession || filterTag || filterMarketingTag || incomeMin || incomeMax || filterCategory ? '●' : ''}
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/50 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Income Min (৳)</label>
                  <input type="number" placeholder="e.g. 10000" value={incomeMin} onChange={(e) => setIncomeMin(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Income Max (৳)</label>
                  <input type="number" placeholder="e.g. 100000" value={incomeMax} onChange={(e) => setIncomeMax(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category Spend</label>
                  <div className="flex gap-1">
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                      <option value="">Any category</option>
                      {allExpenseCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="Min ৳" value={filterCategoryMin} onChange={(e) => setFilterCategoryMin(e.target.value)}
                      className="w-20 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Profession</label>
                  <select value={filterProfession} onChange={(e) => setFilterProfession(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                    <option value="">All professions</option>
                    {activeProfessions.map((p) => <option key={p} value={p}>{getProfessionLabel(p)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Marketing tag (keyword scanner)
                  </label>
                  <select
                    value={filterMarketingTag}
                    onChange={(e) => setFilterMarketingTag(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">Any — show all users</option>
                    {MARKETING_TAGS_CATALOG.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Matches saved <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-700">users.marketingTags</code> (e.g. Zakat Payer, EBL User).
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
                <span className="text-xs font-bold text-slate-400">Behaviour tag:</span>
                {(['', 'Renter', 'Debt Payer', 'Gourmet'] as const).map((tag) => (
                  <button key={tag || 'all'} onClick={() => setFilterTag(tag)}
                    className={cn('rounded-full px-4 py-1.5 text-xs font-bold transition-all',
                      filterTag === tag ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'
                    )}>
                    {tag === '' ? 'All' : (TAG_META[tag]?.emoji ?? '') + ' ' + tag}
                  </button>
                ))}
                {(searchTerm || incomeMin || incomeMax || filterCategory || filterProfession || filterTag || filterMarketingTag) && (
                  <button onClick={() => { setSearchTerm(''); setIncomeMin(''); setIncomeMax(''); setFilterCategory(''); setFilterCategoryMin(''); setFilterProfession(''); setFilterTag(''); setFilterMarketingTag(''); }}
                    className="rounded-full bg-red-100 px-4 py-1.5 text-xs font-bold text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400">
                    Clear All
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── User directory (single list, newest login / activity first) ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="neon-card overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-slate-700">
        <div className="space-y-2 border-b border-slate-100 p-5 dark:border-slate-700 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">Users</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredUsers.length} shown · {visibleUsers.length} total · sorted by latest login / activity (top = most recent)
                </p>
                <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                  Segments: Ghost {leadGenSegment.counts.ghost} · Irregular {leadGenSegment.counts.irregular} · Power {leadGenSegment.counts.power} · row badge = activity type
                </p>
              </div>
            </div>
          </div>
        </div>
        {adminActionError && (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {adminActionError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                {['User', 'Last activity', 'Email / Phone', 'Profession', 'Monthly Income', 'LQI', 'Lead', 'Top Category', 'Net Balance', 'Behaviour Tags', 'Action'].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {filteredUsers.map((u) => {
                const seg = leadGenSegment.byUid[u.id];
                const segShort = seg === 'ghost' ? 'Ghost' : seg === 'power' ? 'Power' : 'Irregular';
                const sortMs = getUserListSortTimeMs(u as any, transactions);
                const lm = leadMetricsByUid[u.id];
                return (
                <tr key={u.id} onClick={() => handleUserClick(u)} className="group cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-700/40">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {u.photoURL ? <img src={u.photoURL} alt="" className="h-10 w-10 rounded-2xl object-cover" /> : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-700"><UserIcon className="h-5 w-5 text-slate-400" /></div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <GoldLeadStar show={lm?.tier === 'gold'} />
                          <p className="font-bold text-slate-800 dark:text-white">{u.displayName || 'Anonymous'}</p>
                        </div>
                        <span
                          className={cn(
                            'mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase',
                            seg === 'power'
                              ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
                              : seg === 'ghost'
                                ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
                          )}
                        >
                          {segShort}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {sortMs > 0 ? format(new Date(sortMs), 'MMM d, yyyy') : '—'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {sortMs > 0 ? format(new Date(sortMs), 'HH:mm') : 'no timestamp'}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-xs text-slate-600 dark:text-slate-400">{u.email}</p>
                    {u.phoneNumber && <p className="text-xs font-medium text-blue-500">{u.phoneNumber}</p>}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-xl bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {getProfessionLabel(u.profession)}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold text-green-600 dark:text-green-400">{formatCurrency(u.totalIncome, language)}</td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm font-black text-violet-600 dark:text-violet-300">{lm ? lm.lqi : '—'}</span>
                  </td>
                  <td className="px-5 py-4 max-w-[9rem]">
                    <LeadGenBadges lm={lm} />
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{u.topCategory}</span>
                  </td>
                  <td className={cn('px-5 py-4 font-bold', u.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>{formatCurrency(u.balance, language)}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">
                      {u.tags.length === 0 ? <span className="text-xs text-slate-300 dark:text-slate-600">—</span> : u.tags.map((tag: string) => (
                        <span key={tag} className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-black', TAG_META[tag]?.bg ?? 'bg-slate-100', TAG_META[tag]?.text ?? 'text-slate-600')}>
                          {TAG_META[tag]?.emoji ?? ''} {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.07 }}
                        whileTap={{ scale: 0.93 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void forceUserRelogin(u.id);
                        }}
                        disabled={adminActionPendingUid === u.id}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-md shadow-rose-400/30 transition-all hover:from-rose-600 hover:to-red-600 hover:shadow-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-rose-900/40"
                        title="Remove from list and force this user to sign in again"
                      >
                        {adminActionPendingUid === u.id
                          ? <SpinIcon className="h-3 w-3 animate-spin" />
                          : <UserX className="h-3.5 w-3.5" />}
                        {adminActionPendingUid === u.id ? 'Removing…' : 'Remove'}
                      </motion.button>
                      <ChevronRight className="inline h-4 w-4 text-slate-300 transition-colors group-hover:text-indigo-500" />
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-400">
              No users match the current filters. Clear filters or adjust search.
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Global campaign modal ── */}
      <AnimatePresence>
        {globalCampaignOpen && (
          <motion.div
            key="global-campaign"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] flex items-center justify-center p-4"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
              aria-label="Close"
              onClick={() => setGlobalCampaignOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="relative z-10 w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/30 bg-white/75 p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/75"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-rose-500/10" />
              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 ring-1 ring-amber-400/30">
                      <Bell className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">Global campaign</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Queue one notification per user · processed by Cloud Function
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setGlobalCampaignOpen(false)}
                    className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {globalCampaignError && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {globalCampaignError}
                  </div>
                )}

                <div className="mb-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Target segment
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'all' as const, label: 'All Users', count: visibleUsers.length },
                      { id: 'ghost' as const, label: 'Ghost Users', count: leadGenSegment.counts.ghost },
                      { id: 'irregular' as const, label: 'Irregular', count: leadGenSegment.counts.irregular },
                      { id: 'power' as const, label: 'Power Users', count: leadGenSegment.counts.power },
                    ]).map(({ id, label, count }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setGlobalCampaignSegment(id)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all',
                          globalCampaignSegment === id
                            ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/30'
                            : 'border-slate-200 bg-white/80 text-slate-700 hover:border-amber-300 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200',
                        )}
                      >
                        {label}
                        <span className="ml-1.5 font-black opacity-80">({count})</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    Recipients: {campaignTargetUserIds.length} user{campaignTargetUserIds.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Title
                    </label>
                    <input
                      type="text"
                      value={globalCampaignTitle}
                      onChange={(e) => setGlobalCampaignTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Message
                    </label>
                    <textarea
                      value={globalCampaignMessage}
                      onChange={(e) => setGlobalCampaignMessage(e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                      placeholder="Notification body for every recipient…"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Link to blog (optional)
                    </label>
                    <select
                      value={globalCampaignBlogId}
                      onChange={(e) => setGlobalCampaignBlogId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                    >
                      <option value="">No blog — open app home when tapped</option>
                      {globalCampaignBlogList.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      If you pick a blog, tap opens <code className="rounded bg-slate-200/80 px-1 dark:bg-slate-700">#/blog/:id</code>
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/60 pt-4 dark:border-slate-600/60">
                  <button
                    type="button"
                    onClick={() => setGlobalCampaignOpen(false)}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGlobalCampaignSend()}
                    disabled={globalCampaignSending || campaignTargetUserIds.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {globalCampaignSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {globalCampaignSending ? 'Queueing…' : 'Send campaign'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── User Monitoring Board (full glass) ── */}
      <AnimatePresence>
        {selectedUser && userMonitoring && (
          <div className="fixed inset-0 z-50 flex flex-col p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative mx-auto flex h-[min(100dvh-1rem,900px)] w-full max-w-[min(96rem,100%)] flex-col overflow-hidden rounded-[1.75rem] border border-white/35 bg-white/50 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/45"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/30 bg-gradient-to-r from-indigo-600/90 via-violet-600/90 to-purple-700/90 px-4 py-3 text-white backdrop-blur-sm sm:px-6 sm:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  {selectedUser.photoURL ? (
                    <img
                      src={selectedUser.photoURL}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-2xl border-2 border-white/35 object-cover sm:h-14 sm:w-14"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 sm:h-14 sm:w-14">
                      <UserIcon className="h-7 w-7 text-white" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-100/90">User Monitoring Board</p>
                    <div className="flex min-w-0 items-center gap-2">
                      <GoldLeadStar show={leadMetricsByUid[selectedUser.id]?.tier === 'gold'} />
                      <h3 className="truncate text-lg font-black sm:text-xl">{selectedUser.displayName || 'Anonymous'}</h3>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(selectedUser.tags ?? []).map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black text-white"
                        >
                          {TAG_META[tag]?.emoji ?? ''} {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 max-w-[min(100%,28rem)] border-t border-white/20 pt-2">
                      <p className="mb-1.5 text-[8px] font-black uppercase tracking-[0.22em] text-indigo-100/85">
                        Marketing intelligence
                      </p>
                      <MarketingCyberBadges
                        tags={
                          Array.isArray((selectedUser as { marketingTags?: string[] }).marketingTags)
                            ? (selectedUser as { marketingTags: string[] }).marketingTags
                            : []
                        }
                        className="gap-1.5"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="shrink-0 rounded-full p-2 transition-colors hover:bg-white/15"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
                  {/* ── Section A: Identity & Quick Actions ── */}
                  <section className="xl:col-span-5 space-y-4">
                    <div className="rounded-3xl border border-white/50 bg-white/55 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/40 sm:p-5">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <UserIcon className="h-4 w-4 text-indigo-500" />
                        Identity
                      </h4>
                      <dl className="space-y-2.5 text-sm">
                        <div className="flex justify-between gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-600/50">
                          <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                          <dd className="max-w-[60%] truncate text-right font-bold text-slate-800 dark:text-white">
                            {selectedUser.displayName || '—'}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-600/50">
                          <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                          <dd className="max-w-[60%] truncate text-right font-semibold text-slate-800 dark:text-white">
                            {selectedUser.email || '—'}
                          </dd>
                        </div>
                        <div className="space-y-2 border-b border-slate-200/60 pb-3 dark:border-slate-600/50">
                          <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wide">
                            <Phone className="h-3.5 w-3.5" /> মোবাইল (অ্যাডমিন সেট)
                          </dt>
                          <dd className="!m-0 space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                type="tel"
                                inputMode="tel"
                                autoComplete="off"
                                placeholder="যেমন: 01712xxxxxx"
                                value={adminUserPhoneDraft}
                                onChange={(e) => {
                                  setAdminUserPhoneDraft(e.target.value);
                                  setAdminUserPhoneSaved(false);
                                  setAdminUserPhoneError(null);
                                }}
                                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none ring-indigo-500/0 transition-all focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                              />
                              <motion.button
                                type="button"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                disabled={adminUserPhoneSaving}
                                onClick={() => void saveAdminUserPhone()}
                                className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-md shadow-indigo-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {adminUserPhoneSaving ? 'সেভ…' : 'সংরক্ষণ'}
                              </motion.button>
                            </div>
                            {adminUserPhoneError ? (
                              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{adminUserPhoneError}</p>
                            ) : null}
                            {adminUserPhoneSaved ? (
                              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">ফায়ারস্টোরে সংরক্ষিত।</p>
                            ) : null}
                            <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                              ইউজারের অ্যাকাউন্টে <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">phoneNumber</code> হিসেবে যাবে — CSV, SMS ও WhatsApp লিংকে ব্যবহার হবে।
                            </p>
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-slate-500 dark:text-slate-400">Profession</dt>
                          <dd className="text-right font-semibold text-slate-800 dark:text-white">
                            {getProfessionLabel(selectedUser.profession)}
                          </dd>
                        </div>
                        <div className="space-y-2 border-t border-slate-200/60 pt-3 dark:border-slate-600/50">
                          <dt className="text-[10px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">
                            Marketing tags (scanner)
                          </dt>
                          <dd className="!m-0">
                            <MarketingCyberBadges
                              tags={
                                Array.isArray((selectedUser as { marketingTags?: string[] }).marketingTags)
                                  ? (selectedUser as { marketingTags: string[] }).marketingTags
                                  : []
                              }
                            />
                          </dd>
                        </div>
                        {leadMetricsByUid[selectedUser.id] && (
                          <>
                            <div className="flex justify-between gap-2 border-t border-slate-200/60 pt-2.5 dark:border-slate-600/50">
                              <dt className="text-slate-500 dark:text-slate-400">LQI score</dt>
                              <dd className="flex items-center gap-2 text-right font-mono font-black text-violet-600 dark:text-violet-300">
                                <GoldLeadStar show={leadMetricsByUid[selectedUser.id].tier === 'gold'} />
                                {leadMetricsByUid[selectedUser.id].lqi}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-2 border-t border-slate-200/60 pt-2.5 dark:border-slate-600/50 items-start">
                              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Lead quality</dt>
                              <dd className="max-w-[65%] flex justify-end">
                                <LeadGenBadges lm={leadMetricsByUid[selectedUser.id]} />
                              </dd>
                            </div>
                            {leadMetricsByUid[selectedUser.id].topCreditors ? (
                              <div className="flex justify-between gap-2 border-t border-slate-200/60 pt-2.5 dark:border-slate-600/50 items-start">
                                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Top creditors (borrowed)</dt>
                                <dd className="max-w-[65%] text-right text-xs font-semibold leading-snug text-slate-700 dark:text-slate-200">
                                  {leadMetricsByUid[selectedUser.id].topCreditors}
                                </dd>
                              </div>
                            ) : null}
                          </>
                        )}
                      </dl>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-emerald-500/10 p-3 text-center ring-1 ring-emerald-500/20 dark:bg-emerald-500/5">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Total income
                          </p>
                          <p className="mt-1 text-base font-black text-emerald-600 dark:text-emerald-400 sm:text-lg">
                            {formatCurrency(userMonitoring.allTimeIncome, language)}
                          </p>
                          <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">All-time</p>
                        </div>
                        <div className="rounded-2xl bg-rose-500/10 p-3 text-center ring-1 ring-rose-500/20 dark:bg-rose-500/5">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                            Total expense
                          </p>
                          <p className="mt-1 text-base font-black text-rose-600 dark:text-rose-400 sm:text-lg">
                            {formatCurrency(userMonitoring.allTimeExpense, language)}
                          </p>
                          <p className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">All-time</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/50 bg-white/55 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/40 sm:p-5">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <Briefcase className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        Financial network
                        <span className="ml-auto rounded-full bg-slate-200/80 px-2 py-0.5 text-[9px] font-black text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {selectedUserFinancialNetwork.length} linked
                        </span>
                      </h4>
                      {selectedUserFinancialNetwork.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          No <code className="rounded bg-slate-100 px-1 dark:bg-slate-700">financial_network</code> rows yet. They appear when the user saves debt/loan entries with contact details.
                        </p>
                      ) : (
                        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                          {selectedUserFinancialNetwork.map((n: any) => (
                            <li
                              key={n.id ?? `${n.debtId}-${n.contactPhone}`}
                              className="rounded-2xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 dark:border-slate-600/50 dark:bg-slate-900/40"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-slate-800 dark:text-slate-100">{n.contactName || '—'}</span>
                                {n.isBusiness ? (
                                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                                    Business
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-black uppercase text-slate-600 dark:bg-slate-300">
                                    Person
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                                {n.contactPhone || '—'} · {n.debtType === 'borrowed' ? 'Borrowed' : n.debtType === 'lent' ? 'Lent' : '—'} ·{' '}
                                {formatCurrency(Number(n.amount) || 0, language)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div
                      className="relative overflow-hidden rounded-3xl border border-rose-300/50 dark:border-rose-800/50"
                      style={{ background: 'linear-gradient(135deg,#fff1f2 0%,#fff5f5 55%,#fef2f2 100%)' }}
                    >
                      <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-rose-400/20 blur-2xl" />
                      <div className="relative flex flex-col gap-3 p-4 dark:[background:linear-gradient(135deg,#2d1216_0%,#2a1010_100%)] sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50">
                            <UserX className="h-5 w-5 text-rose-600 dark:text-rose-300" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-rose-900 dark:text-rose-100">Quick action</p>
                            <p className="text-[11px] leading-relaxed text-rose-600/90 dark:text-rose-300/90">
                              Hides this user from the dashboard and forces a fresh sign-in on their device.
                            </p>
                          </div>
                        </div>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => void forceUserRelogin(selectedUser.id)}
                          disabled={adminActionPendingUid === selectedUser.id}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/35 transition-all hover:from-rose-500 hover:to-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {adminActionPendingUid === selectedUser.id ? (
                            <>
                              <SpinIcon className="h-4 w-4 animate-spin" /> Working…
                            </>
                          ) : (
                            <>
                              <UserX className="h-4 w-4" /> Force Remove
                            </>
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </section>

                  {/* ── Section B: Activity Analytics ── */}
                  <section className="xl:col-span-7 space-y-4">
                    <div className="rounded-3xl border border-white/50 bg-white/55 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/40 sm:p-5">
                      <h4 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <LineChart className="h-4 w-4 text-violet-500" />
                        Activity analytics
                      </h4>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-900/50">
                          <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Days active</p>
                          <p className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-300">
                            {userMonitoring.distinctActiveDays}
                          </p>
                          <p className="text-[10px] text-slate-500">Distinct days with ≥1 entry (all-time)</p>
                        </div>
                        <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-900/50">
                          <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Days inactive (window)</p>
                          <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-300">
                            {userMonitoring.inactiveDaysInWindow}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Calendar days from first entry → today minus active days
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-900/50">
                          <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Transaction frequency</p>
                          <p className="mt-1 text-2xl font-black text-violet-600 dark:text-violet-300">
                            {userMonitoring.entriesPerWeek < 0.1
                              ? '—'
                              : `${userMonitoring.entriesPerWeek.toFixed(1)}/wk`}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Avg entries per week since first activity ({userMonitoring.txs.length} total)
                          </p>
                        </div>
                      </div>
                      {userMonitoring.daysSinceLastActivity != null && (
                        <p className="mt-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <Clock className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                          {userMonitoring.daysSinceLastActivity === 0
                            ? 'Last activity: today'
                            : `${userMonitoring.daysSinceLastActivity} day(s) since last entry`}
                        </p>
                      )}
                    </div>

                    <div className="rounded-3xl border border-white/50 bg-white/55 p-4 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/40 sm:p-5">
                      <h4 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <Activity className="h-4 w-4 text-sky-500" />
                        Last 10 activities
                      </h4>
                      <div className="relative pl-3">
                        <div className="absolute bottom-1 left-[7px] top-1 w-px bg-gradient-to-b from-indigo-400/80 via-violet-400/50 to-transparent" />
                        <ul className="space-y-2.5">
                          {userMonitoring.last10Activities.map((t: any) => {
                            const ms = txTimestampMs(t);
                            const d = ms != null ? new Date(ms) : null;
                            return (
                              <li key={t.id} className="relative flex gap-3 pl-4">
                                <span
                                  className={cn(
                                    'absolute left-0 top-1.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-800',
                                    t.type === 'expense' ? 'bg-rose-500' : 'bg-emerald-500',
                                  )}
                                />
                                <div className="min-w-0 flex-1 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-2 dark:border-slate-600/50 dark:bg-slate-900/30">
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span className="truncate text-xs font-bold text-slate-800 dark:text-white">
                                      {t.category || '—'} ·{' '}
                                      <span className="font-semibold text-slate-500">{t.type}</span>
                                    </span>
                                    <span
                                      className={cn(
                                        'text-xs font-black',
                                        t.type === 'expense' ? 'text-rose-500' : 'text-emerald-600',
                                      )}
                                    >
                                      {t.type === 'expense' ? '-' : '+'}
                                      {formatCurrency(Number(t.amount) || 0, language)}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">
                                    {d ? format(d, 'MMM d, yyyy · HH:mm') : '—'}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                        {userMonitoring.last10Activities.length === 0 && (
                          <p className="py-6 text-center text-sm text-slate-400">No transactions yet.</p>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* ── Section C: Logs ── */}
                  <section className="xl:col-span-7 space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="flex min-h-[220px] flex-col rounded-3xl border border-white/50 bg-white/55 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/40">
                        <div className="border-b border-slate-200/60 px-4 py-3 dark:border-slate-600/50">
                          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            <FileText className="h-4 w-4 text-indigo-500" />
                            Transaction log (all-time)
                          </h4>
                        </div>
                        <div className="max-h-[min(40vh,320px)] flex-1 overflow-y-auto p-3">
                          {userMonitoring.txs.map((t: any) => (
                            <div
                              key={t.id}
                              className="mb-2 rounded-2xl border border-slate-200/60 bg-white/70 px-3 py-2.5 last:mb-0 dark:border-slate-600/40 dark:bg-slate-900/35"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold text-slate-800 dark:text-white">
                                    {t.category || '—'}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {t.date?.toDate
                                      ? format(t.date.toDate(), 'MMM d, yyyy')
                                      : '—'}{' '}
                                    · <span className="capitalize">{t.type}</span>
                                  </p>
                                </div>
                                <p
                                  className={cn(
                                    'shrink-0 text-sm font-black',
                                    t.type === 'expense' ? 'text-rose-500' : 'text-emerald-600',
                                  )}
                                >
                                  {t.type === 'expense' ? '-' : '+'}
                                  {formatCurrency(Number(t.amount) || 0, language)}
                                </p>
                              </div>
                              <p className="mt-1.5 text-[11px] leading-snug text-slate-600 dark:text-slate-300">
                                <span className="font-semibold text-slate-500 dark:text-slate-400">Note: </span>
                                {typeof t.note === 'string' && t.note.trim() ? t.note : '—'}
                              </p>
                            </div>
                          ))}
                          {userMonitoring.txs.length === 0 && (
                            <p className="py-8 text-center text-sm text-slate-400">No transactions.</p>
                          )}
                        </div>
                      </div>

                      <div className="flex min-h-[220px] flex-col rounded-3xl border border-white/50 bg-white/55 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-800/40">
                        <div className="border-b border-slate-200/60 px-4 py-3 dark:border-slate-600/50">
                          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            <Bell className="h-4 w-4 text-amber-500" />
                            Notification history
                          </h4>
                        </div>
                        <div className="max-h-[min(40vh,320px)] flex-1 overflow-y-auto p-3">
                          {userInAppNotifsLoading && (
                            <div className="flex justify-center py-8">
                              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                            </div>
                          )}
                          {userInAppNotifsError && (
                            <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                              {userInAppNotifsError}
                            </p>
                          )}
                          {!userInAppNotifsLoading &&
                            !userInAppNotifsError &&
                            userInAppNotifs.map((n) => (
                              <div
                                key={n.id}
                                className="mb-2 rounded-2xl border border-slate-200/60 bg-white/70 px-3 py-2.5 last:mb-0 dark:border-slate-600/40 dark:bg-slate-900/35"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs font-bold text-slate-800 dark:text-white">{n.title || '—'}</p>
                                  <span
                                    className={cn(
                                      'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase',
                                      n.read
                                        ? 'bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                        : 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30',
                                    )}
                                  >
                                    {n.read ? 'Read' : 'Unread'}
                                  </span>
                                </div>
                                <p className="mt-1 line-clamp-3 text-[11px] text-slate-600 dark:text-slate-300">
                                  {n.body || '—'}
                                </p>
                                <p className="mt-1 text-[10px] text-slate-400">
                                  {n.createdAt &&
                                  typeof n.createdAt === 'object' &&
                                  n.createdAt !== null &&
                                  'toDate' in n.createdAt &&
                                  typeof (n.createdAt as { toDate: () => Date }).toDate === 'function'
                                    ? format((n.createdAt as { toDate: () => Date }).toDate(), 'MMM d, yyyy HH:mm')
                                    : '—'}
                                </p>
                              </div>
                            ))}
                          {!userInAppNotifsLoading && !userInAppNotifsError && userInAppNotifs.length === 0 && (
                            <p className="py-8 text-center text-sm text-slate-400">No in-app notifications.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ── Outreach: push, SMS, email, WhatsApp + AI (same 360° board) ── */}
                  <section className="xl:col-span-12">
                    <div className="rounded-3xl border border-indigo-200/50 bg-gradient-to-br from-white/70 to-indigo-50/40 p-4 shadow-lg backdrop-blur-xl dark:border-indigo-500/20 dark:from-slate-800/50 dark:to-indigo-950/30 sm:p-5">
                      <h4 className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-200">
                        <Bell className="h-4 w-4" />
                        আউটরিচ: অ্যাপ পুশ · SMS · ইমেইল · হোয়াটসঅ্যাপ
                      </h4>
                      <p className="mb-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-indigo-700 dark:text-indigo-300">অ্যাপ পুশ</span> FCM কিউতে যায়।{' '}
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">SMS / ইমেইল / WhatsApp</span> এখন{' '}
                        ড্রাফট লিংক (ডিভাইসে খুলবে) — পরে চাইলে Twilio, SendGrid, WhatsApp Cloud API ইত্যাদি ব্যাকএন্ড থেকে পাঠাতে পারবেন।{' '}
                        AI অল-টাইম ডাটা দেখে শিরোনাম+বার্তা বানায়।
                      </p>
                      <p className="mb-3 rounded-lg border border-slate-200/80 bg-slate-50/90 px-2.5 py-1.5 font-mono text-[9px] leading-snug text-slate-500 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
                        Integration stubs: see <code className="text-indigo-600 dark:text-indigo-400">src/lib/adminOutreachLinks.ts</code>{' '}
                        (mailto / sms / wa.me) + server-side send when you add providers.
                      </p>
                      <p className="mb-4 rounded-xl border border-amber-200/70 bg-amber-50/95 px-3 py-2 text-[10px] leading-snug text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/35 dark:text-amber-100">
                        <span className="font-black">পুশ বার্তায় স্বয়ংক্রিয় বিঃদ্রঃ:</span>{' '}
                        {REENGAGEMENT_NOTIFICATION_DISCLAIMER_BN.trim()}
                      </p>

                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <div className="space-y-3">
                          {panelPushError && (
                            <div className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              {panelPushError}
                            </div>
                          )}
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              শিরোনাম
                            </label>
                            <input
                              type="text"
                              value={panelPushTitle}
                              onChange={(e) => setPanelPushTitle(e.target.value)}
                              className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-600 dark:bg-slate-900/80 dark:text-white"
                            />
                          </div>
                          <div>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                বার্তা (পুশ, SMS, ইমেইল, WA)
                              </label>
                              <button
                                type="button"
                                onClick={() => void handlePanelReengageAi()}
                                disabled={panelPushAiLoading || !selectedUserNotifyContext}
                                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-indigo-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {panelPushAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                AI — ইউজারের জন্য নোটিফিকেশন
                              </button>
                            </div>
                            <textarea
                              value={panelPushMessage}
                              onChange={(e) => setPanelPushMessage(e.target.value)}
                              rows={4}
                              className="w-full resize-y rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-600 dark:bg-slate-900/80 dark:text-white"
                              placeholder="ম্যানুয়ালি লিখুন বা AI বাটন…"
                            />
                            <p className="mt-1 text-[10px] text-slate-400">
                              সেগমেন্ট: {selectedUserNotifyContext?.userType ?? '—'}
                              {selectedUserNotifyContext?.daysSinceLastEntry != null
                                ? ` · শেষ এন্ট্রি ${selectedUserNotifyContext.daysSinceLastEntry} দিন আগে`
                                : ''}
                            </p>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              ব্লগ লিংক (ঐচ্ছিক)
                            </label>
                            <select
                              value={panelPushBlogId}
                              onChange={(e) => setPanelPushBlogId(e.target.value)}
                              className="w-full rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-600 dark:bg-slate-900/80 dark:text-white"
                            >
                              <option value="">নো ব্লগ — হোম খুলবে</option>
                              {panelBlogList.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              চ্যানেলে পাঠান / খুলুন
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void handlePanelSendPush()}
                                disabled={panelPushSending}
                                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                              >
                                {panelPushSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                                অ্যাপ পুশ (কিউ)
                              </button>
                              {(() => {
                                const msg = `${panelPushTitle.trim() ? `${panelPushTitle.trim()}\n\n` : ''}${panelPushMessage.trim() || 'Ay Bay Er GustiMari'}`;
                                const smsHref = buildSmsDraftHref(selectedUser.phoneNumber, msg);
                                return smsHref ? (
                                  <a
                                    href={smsHref}
                                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50 sm:text-sm"
                                  >
                                    <MessageSquare className="h-4 w-4 shrink-0" />
                                    SMS
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center rounded-xl border border-dashed border-slate-300 px-3 py-2 text-[10px] text-slate-400 dark:border-slate-600">
                                    SMS — ফোন নেই
                                  </span>
                                );
                              })()}
                              {(() => {
                                const msg = `${panelPushTitle.trim() ? `${panelPushTitle.trim()}\n\n` : ''}${panelPushMessage.trim() || 'Ay Bay Er GustiMari'}`;
                                const mailHref = buildMailtoHref(selectedUser.email, panelPushTitle.trim() || 'Ay Bay Er GustiMari', msg);
                                return mailHref ? (
                                  <a
                                    href={mailHref}
                                    className="inline-flex items-center gap-2 rounded-xl border border-sky-300/80 bg-sky-50 px-4 py-2.5 text-xs font-bold text-sky-900 transition-colors hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/50 sm:text-sm"
                                  >
                                    <Mail className="h-4 w-4 shrink-0" />
                                    ইমেইল
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center rounded-xl border border-dashed border-slate-300 px-3 py-2 text-[10px] text-slate-400 dark:border-slate-600">
                                    ইমেইল — ঠিকানা নেই
                                  </span>
                                );
                              })()}
                              {(() => {
                                const msg = `${panelPushTitle.trim() ? `${panelPushTitle.trim()}\n\n` : ''}${panelPushMessage.trim() || 'Ay Bay Er GustiMari'}`;
                                const waHref = buildWhatsAppWebHref(selectedUser.phoneNumber, msg);
                                return waHref ? (
                                  <a
                                    href={waHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl border border-green-500/50 bg-green-50 px-4 py-2.5 text-xs font-bold text-green-900 transition-colors hover:bg-green-100 dark:border-green-700 dark:bg-green-950/50 dark:text-green-100 dark:hover:bg-green-900/40 sm:text-sm"
                                  >
                                    <MessageCircle className="h-4 w-4 shrink-0" />
                                    WhatsApp
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center rounded-xl border border-dashed border-slate-300 px-3 py-2 text-[10px] text-slate-400 dark:border-slate-600">
                                    WA — ফোন নেই
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white/50 p-4 dark:border-slate-600/50 dark:bg-slate-900/30">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            শুধু এডমিনের জন্য (পাঠানো হয় না)
                          </p>
                          <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                            প্রো প্ল্যান, অফার, বা রিটেনশন স্ট্র্যাটেজি — ইউজার দেখবে না। ডাটা বিশ্লেষণ করে ইংরেজি/বাংলায় পরামর্শ।
                          </p>
                          {panelAdminOnlyError && (
                            <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                              {panelAdminOnlyError}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => void handlePanelAdminOnlyInsight()}
                            disabled={panelAdminOnlyLoading || !userMonitoring}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/80 bg-amber-50/90 py-2.5 text-xs font-black uppercase tracking-wide text-amber-950 shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
                          >
                            {panelAdminOnlyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                            AI — এডমিন পরামর্শ (প্রো/অফার)
                          </button>
                          {panelAdminOnlyInsight && (
                            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-600 dark:bg-slate-950/50 dark:text-slate-100">
                              <p className="whitespace-pre-wrap">{panelAdminOnlyInsight}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* ── Section D: AI Strategic Playbook ── */}
                  <section className="xl:col-span-5 xl:row-span-1">
                    <div
                      className={cn(
                        'relative overflow-hidden rounded-3xl border-2 p-4 shadow-[0_0_32px_rgba(99,102,241,0.35),0_0_64px_rgba(168,85,247,0.2)]',
                        'border-indigo-400/90 bg-gradient-to-br from-slate-950/80 via-indigo-950/40 to-purple-950/80',
                        'dark:border-violet-400/80 dark:from-slate-950/90 dark:via-indigo-950/50 dark:to-purple-950/90',
                      )}
                    >
                      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/25 blur-3xl" />
                      <div className="pointer-events-none absolute -bottom-8 left-0 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl" />

                      <div className="relative">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.9)]" />
                          <h4 className="bg-gradient-to-r from-indigo-200 via-violet-200 to-fuchsia-200 bg-clip-text text-base font-black tracking-tight text-transparent sm:text-lg">
                            AI Strategic Insight for Admin
                          </h4>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-indigo-100/80">
                          Mastermind layer: analysis is for you only, not shown to the user. Uses Gemini (1.5 Flash first)
                          with all-time totals, top expense categories, frequency, and recent notes.
                        </p>

                        <button
                          type="button"
                          onClick={() => void handleAnalyzeUserVibe()}
                          disabled={adminStrategicLoading}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-600 to-purple-600 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-violet-500/40 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {adminStrategicLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing…
                            </>
                          ) : (
                            <>
                              <Zap className="h-4 w-4" /> Analyze User Vibe
                            </>
                          )}
                        </button>

                        {adminStrategicError && (
                          <p className="mt-3 rounded-xl border border-red-400/40 bg-red-950/40 p-3 text-xs text-red-200">
                            {adminStrategicError}
                          </p>
                        )}

                        {adminStrategicInsight && (
                          <div className="mt-4 max-h-[min(36vh,280px)] overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-3 text-sm leading-relaxed text-indigo-50/95 backdrop-blur-sm">
                            <p className="whitespace-pre-wrap">{adminStrategicInsight}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>

                {adminActionError && (
                  <p className="mt-4 text-center text-xs font-semibold text-red-600 dark:text-red-400">{adminActionError}</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Category Users Modal ── */}
      <AnimatePresence>
        {categoryModal && (
          <CategoryUsersModal
            key={`${categoryModal.category}-${categoryModal.type}`}
            category={categoryModal.category}
            type={categoryModal.type}
            users={categoryModalUsers}
            language={language as 'en' | 'bn'}
            onClose={() => setCategoryModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Profession Users Modal ── */}
      <AnimatePresence>
        {professionModal && (
          <CategoryUsersModal
            key={`profession-${professionModal.id}`}
            category={professionModal.name}
            type="profession"
            users={professionModalUsers}
            language={language as 'en' | 'bn'}
            onClose={() => setProfessionModal(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Inactive Users Compose Modal ── */}
      <AnimatePresence>
        {inactiveComposeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setInactiveComposeOpen(false)}
              className="absolute inset-0 bg-slate-900/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="relative w-full max-w-lg flex flex-col rounded-[2rem] bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-white/20 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 p-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Bell className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-black text-lg leading-tight">Re-engagement Campaign</h3>
                    <p className="text-xs text-white/70 mt-0.5">
                      {inactiveSelectedUids.size} user{inactiveSelectedUids.size !== 1 ? 's' : ''} · Inactive {inactiveFilter}+ days
                    </p>
                  </div>
                </div>
                <button onClick={() => setInactiveComposeOpen(false)} className="p-2 hover:bg-white/15 rounded-full transition-all shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                {inactiveSendError && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-2xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{inactiveSendError}</span>
                  </motion.div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Notification Title *</label>
                  <input
                    type="text"
                    value={inactiveComposeTitle}
                    onChange={(e) => setInactiveComposeTitle(e.target.value)}
                    placeholder="e.g. আপনাকে মিস করছি! আবার ফিরে আসুন"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Message *
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-normal text-slate-400 normal-case">(max 120 chars)</span>
                      <button
                        type="button"
                        onClick={() => void handleInactiveAiPersonalTip()}
                        disabled={inactiveAiLoading || inactiveSending || !inactiveCampaignAiContext}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500/90 to-indigo-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-indigo-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {inactiveAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        ✨ AI Bengali tip
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={inactiveComposeMsg}
                    onChange={(e) => setInactiveComposeMsg(e.target.value)}
                    rows={3}
                    maxLength={120}
                    placeholder="বার্তা বাংলায় লিখুন, অথবা AI বাটনে টিপুন…"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all resize-none"
                  />
                  <p className="text-[10px] text-slate-400 text-right">{inactiveComposeMsg.length}/120</p>
                  {inactiveCampaignAiContext && (
                    <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                      AI uses the same model as Lead Generation “Direct notify”: segment (
                      {inactiveCampaignAiContext.userType}
                      {inactiveCampaignAiContext.daysSinceLastEntry != null
                        ? ` · ${inactiveCampaignAiContext.daysSinceLastEntry}d since last entry`
                        : ' · no entries yet'}
                      ), profession, top spend category (
                      {String(inactiveCampaignAiContext.topCategory ?? '—')}). One sample user = highest inactive days among selected.
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-slate-100 dark:border-slate-700 p-4">
                <button
                  onClick={sendInactiveCampaign}
                  disabled={inactiveSending || !inactiveComposeTitle.trim() || !inactiveComposeMsg.trim()}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-amber-500/25"
                >
                  {inactiveSending
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                    : <><Send className="w-4 h-4" /> Send to {inactiveSelectedUids.size} User{inactiveSelectedUids.size !== 1 ? 's' : ''}</>
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
