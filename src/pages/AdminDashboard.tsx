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
import { generatePersonalFinanceTip, type DirectNotifyUserType } from '../lib/geminiApi';

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
  const [leadSegmentTab, setLeadSegmentTab] = useState<'ghost' | 'irregular' | 'power'>('power');
  const [searchTerm, setSearchTerm] = useState('');
  const [incomeMin, setIncomeMin] = useState('');
  const [incomeMax, setIncomeMax] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCategoryMin, setFilterCategoryMin] = useState('');
  const [filterProfession, setFilterProfession] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Modal state
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userTransactions, setUserTransactions] = useState<any[]>([]);
  const [adminActionPendingUid, setAdminActionPendingUid] = useState<string | null>(null);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);

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

  // ── Per-user notify modal (notificationQueue → Cloud Function) ─────────────
  const [notifyUser, setNotifyUser] = useState<any | null>(null);
  const [notifyTitle, setNotifyTitle] = useState('Ay Bay Er GustiMari');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyBlogId, setNotifyBlogId] = useState('');
  const [notifyBlogList, setNotifyBlogList] = useState<{ id: string; title: string }[]>([]);
  const [notifySending, setNotifySending] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifyAiLoading, setNotifyAiLoading] = useState(false);

  // ── Global campaign (segment-targeted bulk notify) ───────────────────────────
  const [globalCampaignOpen, setGlobalCampaignOpen] = useState(false);
  const [globalCampaignSegment, setGlobalCampaignSegment] = useState<'all' | 'ghost' | 'irregular' | 'power'>('all');
  const [globalCampaignTitle, setGlobalCampaignTitle] = useState('Ay Bay Er GustiMari');
  const [globalCampaignMessage, setGlobalCampaignMessage] = useState('');
  const [globalCampaignBlogId, setGlobalCampaignBlogId] = useState('');
  const [globalCampaignBlogList, setGlobalCampaignBlogList] = useState<{ id: string; title: string }[]>([]);
  const [globalCampaignSending, setGlobalCampaignSending] = useState(false);
  const [globalCampaignError, setGlobalCampaignError] = useState<string | null>(null);

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

  // Blogs list for Notify + Global Campaign modals
  useEffect(() => {
    if (!notifyUser && !globalCampaignOpen) return;
    const qBlogs = query(collection(db, 'blogs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      qBlogs,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          title: String((d.data() as { title?: string }).title || 'Untitled'),
        }));
        setNotifyBlogList(list);
        setGlobalCampaignBlogList(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'blogs'),
    );
    return () => unsub();
  }, [notifyUser, globalCampaignOpen]);

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

    return {
      ...rawUser,
      totalIncome, totalExpense,
      balance: totalIncome - totalExpense,
      categoryBreakdown, topCategory, tags,
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

  /** Direct Notify AI: Ghost / Irregular / Power + whole days since last transaction (all time). */
  const directNotifyAiContext = useMemo(() => {
    if (!notifyUser?.id) return null;
    const uid = notifyUser.id;
    const seg = leadGenSegment.byUid[uid];
    const userType: DirectNotifyUserType =
      seg === 'ghost' ? 'Ghost User' : seg === 'power' ? 'Power User' : 'Irregular User';
    let lastMs: number | null = null;
    for (const t of transactions) {
      const tid = (t as { userId?: string }).userId;
      if (tid !== uid) continue;
      const ms = txTimestampMs(t as { date?: unknown });
      if (ms != null && (lastMs === null || ms > lastMs)) lastMs = ms;
    }
    const daysSinceLastEntry =
      lastMs === null ? null : Math.max(0, Math.floor((Date.now() - lastMs) / MS_PER_DAY));
    return { userType, daysSinceLastEntry };
  }, [notifyUser, leadGenSegment, transactions]);

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

  const filteredUsers = useMemo(() => visibleUsers.filter((u) => {
    if (leadGenSegment.byUid[u.id] !== leadSegmentTab) return false;
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
    return true;
  }), [visibleUsers, leadGenSegment, leadSegmentTab, searchTerm, incomeMin, incomeMax, filterCategory, filterCategoryMin, filterProfession, filterTag]);

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
    const lines = [
      ['fn', 'ln', 'email', 'phone'].join(','),
      ...filteredUsers.map((u) => {
        const parts = (u.displayName || '').trim().split(' ');
        return [escapeCsv(parts[0] || ''), escapeCsv(parts.slice(1).join(' ') || ''), escapeCsv(u.email || ''), escapeCsv(u.phoneNumber || '')].join(',');
      }),
    ];
    downloadCsv(lines.join('\n'), `fb_custom_audience_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const exportFullCsv = () => {
    const headers = ['Name', 'Email', 'Phone', 'Profession', 'Monthly Income', 'Monthly Expense', 'Balance', 'Top Category', 'Tags'];
    const lines = [
      headers.join(','),
      ...filteredUsers.map((u) => [
        escapeCsv(u.displayName || 'N/A'), escapeCsv(u.email),
        escapeCsv(u.phoneNumber || 'N/A'), escapeCsv(getProfessionLabel(u.profession)),
        u.totalIncome, u.totalExpense, u.balance,
        escapeCsv(u.topCategory), escapeCsv(u.tags.join('; ')),
      ].join(',')),
    ];
    downloadCsv(lines.join('\n'), `full_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handleUserClick = (u: any) => {
    setAdminActionError(null);
    setSelectedUser(u);
    setUserTransactions(
      transactionsThisMonth
        .filter((t) => t.userId === u.id)
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
        .slice(0, 8)
    );
  };

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
        setUserTransactions([]);
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

  const openNotifyModal = useCallback((u: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifyError(null);
    setNotifyTitle('Ay Bay Er GustiMari');
    setNotifyMessage('');
    setNotifyBlogId('');
    setNotifyUser(u);
  }, []);

  const handleSendNotify = useCallback(async () => {
    if (!notifyUser) return;
    if (!notifyTitle.trim() || !notifyMessage.trim()) {
      setNotifyError('Please add a title and a message.');
      return;
    }
    setNotifySending(true);
    setNotifyError(null);
    try {
      await queueNotificationForUser(notifyUser.id, notifyTitle.trim(), notifyMessage.trim(), {
        blogId: notifyBlogId.trim() || null,
      });
      setNotifyUser(null);
    } catch (err: unknown) {
      setNotifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifySending(false);
    }
  }, [notifyUser, notifyTitle, notifyMessage, notifyBlogId]);

  const handleAiPersonalTip = useCallback(async () => {
    if (!notifyUser) return;
    setNotifyAiLoading(true);
    setNotifyError(null);
    try {
      const ctx = directNotifyAiContext;
      const { title, message } = await generatePersonalFinanceTip({
        displayName: notifyUser.displayName || 'বন্ধু',
        profession: getProfessionLabel(notifyUser.profession),
        topCategory: notifyUser.topCategory,
        userType: ctx?.userType ?? 'Irregular User',
        daysSinceLastEntry: ctx?.daysSinceLastEntry ?? null,
      });
      setNotifyTitle(title);
      setNotifyMessage(message);
    } catch (err: unknown) {
      setNotifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setNotifyAiLoading(false);
    }
  }, [notifyUser, directNotifyAiContext]);

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
        <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
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
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-5 py-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span>User</span>
                <span className="text-right w-28 hidden sm:block">Total Spent</span>
                <span className="text-right w-28">Top Category</span>
                <span className="text-right w-24 hidden sm:block">Last Spent</span>
                <span className="text-right w-20">Freq.</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-72 overflow-y-auto">
                {intelligenceRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
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
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{row.displayName || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-400 truncate">{row.email}</p>
                      </div>
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
            Filters {filterProfession || filterTag || incomeMin || incomeMax || filterCategory ? '●' : ''}
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
                {(searchTerm || incomeMin || incomeMax || filterCategory || filterProfession || filterTag) && (
                  <button onClick={() => { setSearchTerm(''); setIncomeMin(''); setIncomeMax(''); setFilterCategory(''); setFilterCategoryMin(''); setFilterProfession(''); setFilterTag(''); }}
                    className="rounded-full bg-red-100 px-4 py-1.5 text-xs font-bold text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400">
                    Clear All
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Lead Generation Table ── */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="neon-card overflow-hidden rounded-[2rem] border border-slate-200/80 dark:border-slate-700">
        <div className="space-y-4 border-b border-slate-100 p-5 dark:border-slate-700 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white">Lead Generation Table</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredUsers.length} match{filteredUsers.length !== 1 ? 'es' : ''} · {leadGenSegment.counts[leadSegmentTab]} in this segment · {visibleUsers.length} total users
                </p>
              </div>
            </div>
          </div>

          {/* Activity segment tabs (real-time from transactions) */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">User activity</p>
            <div className="flex flex-wrap gap-2">
              {([
                {
                  id: 'ghost' as const,
                  label: 'Ghost Users',
                  hint: 'Signed up · 0 transactions',
                  icon: Ghost,
                  count: leadGenSegment.counts.ghost,
                },
                {
                  id: 'irregular' as const,
                  label: 'Irregular Users',
                  hint: 'Has history · fewer than 3 entries in last 7 days',
                  icon: Activity,
                  count: leadGenSegment.counts.irregular,
                },
                {
                  id: 'power' as const,
                  label: 'Power Users',
                  hint: 'Pro targets · ≥3 entries in last 7 days',
                  icon: Zap,
                  count: leadGenSegment.counts.power,
                },
              ]).map(({ id, label, hint, icon: Icon, count }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLeadSegmentTab(id)}
                  title={hint}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-all sm:min-w-[10rem] sm:flex-none',
                    leadSegmentTab === id
                      ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 dark:border-indigo-400'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/80 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-500/50 dark:hover:bg-slate-700/80'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      leadSegmentTab === id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', leadSegmentTab === id ? 'text-white' : 'text-indigo-600 dark:text-indigo-400')} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold leading-tight">{label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-[10px] font-medium leading-snug',
                        leadSegmentTab === id ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                      )}
                    >
                      {count} user{count !== 1 ? 's' : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        {adminActionError && (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {adminActionError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                {['User', 'Email / Phone', 'Profession', 'Monthly Income', 'Top Category', 'Net Balance', 'Behaviour Tags', 'Action'].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {filteredUsers.map((u) => (
                <tr key={u.id} onClick={() => handleUserClick(u)} className="group cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-700/40">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {u.photoURL ? <img src={u.photoURL} alt="" className="h-10 w-10 rounded-2xl object-cover" /> : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-700"><UserIcon className="h-5 w-5 text-slate-400" /></div>
                      )}
                      <p className="font-bold text-slate-800 dark:text-white">{u.displayName || 'Anonymous'}</p>
                    </div>
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
                        onClick={(e) => openNotifyModal(u, e)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/60"
                        title="Send push & in-app notification"
                      >
                        <Bell className="h-3.5 w-3.5" />
                        Notify
                      </motion.button>
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
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-400">
              No users match the current filters or activity tab. Try another segment or clear filters.
            </p>
          )}
        </div>
      </motion.div>

      {/* ── Notify user modal (glassmorphism) ── */}
      <AnimatePresence>
        {notifyUser && (
          <motion.div
            key={notifyUser.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
              aria-label="Close"
              onClick={() => setNotifyUser(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className="relative z-10 w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/30 bg-white/70 p-6 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.6)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10" />
              <div className="relative">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/15 ring-1 ring-indigo-500/25 dark:bg-indigo-400/10">
                      <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">Direct notify</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {notifyUser.displayName || 'User'} · {notifyUser.email}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifyUser(null)}
                    className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {notifyError && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {notifyError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Notification title
                    </label>
                    <input
                      type="text"
                      value={notifyTitle}
                      onChange={(e) => setNotifyTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none ring-indigo-500/30 placeholder:text-slate-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                      placeholder="Short title"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Message
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleAiPersonalTip()}
                        disabled={notifyAiLoading}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500/90 to-indigo-600 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-md shadow-indigo-500/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {notifyAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        ✨ AI Bengali tip
                      </button>
                    </div>
                    <textarea
                      value={notifyMessage}
                      onChange={(e) => setNotifyMessage(e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none ring-indigo-500/30 placeholder:text-slate-400 focus:ring-2 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                      placeholder="বার্তা বাংলায় লিখুন, অথবা AI বাটনে টিপুন…"
                    />
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      AI uses segment ({directNotifyAiContext?.userType ?? '—'}
                      {directNotifyAiContext?.daysSinceLastEntry != null
                        ? ` · ${directNotifyAiContext.daysSinceLastEntry}d since last entry`
                        : directNotifyAiContext?.userType === 'Ghost User'
                          ? ' · no entries yet'
                          : ''}
                      ), profession, top category ({String(notifyUser.topCategory ?? '—')}). AI fills title (Bangla) + message (≤140 chars); tone varies for loan/debt, shopping/food, rent/utilities.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Push a blog (optional)
                    </label>
                    <select
                      value={notifyBlogId}
                      onChange={(e) => setNotifyBlogId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-white"
                    >
                      <option value="">No blog — open app home when tapped</option>
                      {notifyBlogList.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/60 pt-4 dark:border-slate-600/60">
                  <button
                    type="button"
                    onClick={() => setNotifyUser(null)}
                    className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendNotify()}
                    disabled={notifySending}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {notifySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {notifySending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* ── User Detail Modal ── */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 24 }}
              className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] bg-white shadow-2xl dark:bg-slate-800">
              <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white">
                <div className="flex items-center gap-4">
                  {selectedUser.photoURL ? (
                    <img src={selectedUser.photoURL} alt="" className="h-14 w-14 rounded-2xl border-2 border-white/30 object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20"><UserIcon className="h-7 w-7 text-white" /></div>
                  )}
                  <div>
                    <h3 className="text-xl font-black">{selectedUser.displayName || 'Anonymous'}</h3>
                    <p className="text-sm text-indigo-100">{selectedUser.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedUser.tags.map((tag: string) => (
                        <span key={tag} className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black text-white">{TAG_META[tag]?.emoji ?? ''} {tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedUser(null)} className="rounded-full p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6">
                {/* ── Admin Remove Section ── */}
                <div className="relative overflow-hidden rounded-2xl border border-rose-200/70 dark:border-rose-800/60"
                  style={{ background: 'linear-gradient(135deg,#fff1f2 0%,#fff5f5 60%,#fef2f2 100%)' }}
                >
                  {/* Decorative glow blob */}
                  <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-rose-400/15 blur-2xl" />

                  <div className="relative flex flex-wrap items-center justify-between gap-4 p-4 dark:[background:linear-gradient(135deg,#2d1216_0%,#2a1010_100%)]">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/50 shadow-sm">
                        <UserX className="h-4 w-4 text-rose-600 dark:text-rose-300" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-rose-800 dark:text-rose-200 leading-tight">
                          Remove from Dashboard
                        </p>
                        <p className="mt-0.5 text-[11px] text-rose-500 dark:text-rose-400 leading-relaxed">
                          Hides this user &amp; forces a fresh sign-in on their device.
                        </p>
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => void forceUserRelogin(selectedUser.id)}
                      disabled={adminActionPendingUid === selectedUser.id}
                      className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 transition-all hover:from-rose-500 hover:to-red-500 hover:shadow-rose-500/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {adminActionPendingUid === selectedUser.id ? (
                        <><SpinIcon className="h-4 w-4 animate-spin" /> Removing…</>
                      ) : (
                        <><UserX className="h-4 w-4" /> Remove &amp; Sign Out</>
                      )}
                    </motion.button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Income', value: selectedUser.totalIncome, color: 'text-green-600 dark:text-green-400' },
                    { label: 'Expense', value: selectedUser.totalExpense, color: 'text-red-500 dark:text-red-400' },
                    { label: 'Balance', value: selectedUser.balance, color: 'text-indigo-600 dark:text-indigo-400' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl bg-slate-50 p-4 text-center dark:bg-slate-900/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                      <p className={cn('mt-1 text-lg font-black', s.color)}>{formatCurrency(s.value, language)}</p>
                    </div>
                  ))}
                </div>

                {Object.keys(selectedUser.categoryBreakdown).length > 0 && (
                  <div>
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                      <Tags className="h-4 w-4 text-amber-500" /> Category Breakdown
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(selectedUser.categoryBreakdown as Record<string, number>)
                        .sort((a, b) => b[1] - a[1]).slice(0, 8)
                        .map(([cat, amt]) => {
                          const pct = selectedUser.totalExpense > 0 ? (amt / selectedUser.totalExpense) * 100 : 0;
                          return (
                            <div key={cat} className="flex items-center gap-3">
                              <span className="w-28 truncate text-xs font-semibold text-slate-600 dark:text-slate-400">{cat}</span>
                              <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" style={{ height: 6 }}>
                                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="w-10 text-right text-xs font-bold text-slate-500">{pct.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                    <Calendar className="h-4 w-4 text-blue-500" /> Recent Transactions
                  </h4>
                  <div className="space-y-2">
                    {userTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/30">
                        <div className="flex items-center gap-3">
                          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', t.type === 'expense' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30')}>
                            {t.type === 'expense' ? <TrendingDown className="h-4 w-4 text-red-600" /> : <TrendingUp className="h-4 w-4 text-green-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-white">{t.category}</p>
                            <p className="text-[10px] text-slate-400">{t.date?.toDate ? format(t.date.toDate(), 'MMM dd, yyyy') : 'N/A'}</p>
                          </div>
                        </div>
                        <p className={cn('font-black text-sm', t.type === 'expense' ? 'text-red-500' : 'text-green-600')}>
                          {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount, language)}
                        </p>
                      </div>
                    ))}
                    {userTransactions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No transactions for this month.</p>}
                  </div>
                </div>
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
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Message *</span>
                    <span className="font-normal text-slate-400 normal-case">(max 120 chars)</span>
                  </label>
                  <textarea
                    value={inactiveComposeMsg}
                    onChange={(e) => setInactiveComposeMsg(e.target.value)}
                    rows={3}
                    maxLength={120}
                    placeholder="আপনার খরচ ট্র্যাক করুন — Ay Bay Er GustiMari আপনার জন্য অপেক্ষা করছে!"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all resize-none"
                  />
                  <p className="text-[10px] text-slate-400 text-right">{inactiveComposeMsg.length}/120</p>
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
