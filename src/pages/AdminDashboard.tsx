import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../firebaseConfig';
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
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
  BellRing,
  FileText,
  Copy,
  CheckCheck,
  RefreshCw,
  Send,
  Eye,
  MessageSquare,
  Image as ImageIcon,
  Pencil,
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
import { generateBlogContent, type GeneratedBlogContent } from '../lib/geminiApi';
import {
  sendBrowserPreviewNotification,
  queueNotificationsForUsers,
} from '../lib/fcmUtils';

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

// ── Category Users Modal ───────────────────────────────────────────────────────
interface CategoryUser {
  id: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  profession?: string;
  categoryAmount: number;
}

type CampaignStep = 'select' | 'generating' | 'preview';

interface CategoryUsersModalProps {
  category: string;
  type: 'income' | 'expense';
  users: CategoryUser[];
  language: 'en' | 'bn';
  onClose: () => void;
}

const CategoryUsersModal: React.FC<CategoryUsersModalProps> = ({
  category, type, users, language, onClose,
}) => {
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<CampaignStep>('select');
  const [content, setContent] = useState<GeneratedBlogContent | null>(null);
  // editedContent tracks live edits in the preview; initialised from AI output
  const [editedContent, setEditedContent] = useState<GeneratedBlogContent | null>(null);
  const [blogId, setBlogId] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Mirror freshly-generated content into the editable state
  useEffect(() => {
    if (content) setEditedContent({ ...content });
  }, [content]);

  const selectedUsers = users.filter((u) => selectedUids.has(u.id));
  const allSelected = users.length > 0 && selectedUids.size === users.length;

  const resetToSelect = () => {
    setStep('select');
    setContent(null);
    setEditedContent(null);
    setBlogId(null);
    setSendResult(null);
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

  const handleGenerate = async () => {
    if (selectedUids.size === 0) return;
    setStep('generating');
    setGenError(null);

    const firstUser = selectedUsers[0];
    try {
      const gen = await generateBlogContent(
        firstUser?.displayName || 'User',
        firstUser?.profession || 'other',
        category
      );

      // Save a draft blog so we have a shareable link to show in preview
      const ref = await addDoc(collection(db, 'blogs'), {
        ...gen,
        targetUserIds: [...selectedUids],
        targetCategory: category,
        categoryType: type,
        targetUserName: firstUser?.displayName || 'User',
        targetProfession: firstUser?.profession || 'other',
        createdAt: serverTimestamp(),
        status: 'draft',
      });

      setContent(gen);
      setBlogId(ref.id);
      setStep('preview');
    } catch (e: any) {
      setGenError(String(e?.message ?? e));
      setStep('select');
    }
  };

  const handleSendPreview = async () => {
    if (!editedContent) return;
    const ok = await sendBrowserPreviewNotification(
      editedContent.title,
      editedContent.notificationMessage,
      `/#/blog/${blogId}`
    );
    setSendResult(ok
      ? '✅ Preview notification sent to your device!'
      : '❌ Notification blocked — check browser permission settings.'
    );
  };

  const handleSendCampaign = async () => {
    if (!editedContent || !blogId) return;
    setIsSending(true);
    try {
      // Persist any manual edits back to the draft blog document
      await updateDoc(doc(db, 'blogs', blogId), {
        title: editedContent.title,
        notificationMessage: editedContent.notificationMessage,
        blogContent: editedContent.blogContent,
        imagePrompt: editedContent.imagePrompt,
        ctaText: editedContent.ctaText,
        status: 'published',
      });

      const queueId = await queueNotificationsForUsers(
        blogId,
        [...selectedUids],
        editedContent.title,
        editedContent.notificationMessage
      );
      const firstName = selectedUsers[0]?.displayName || 'User';
      setSendResult(
        `✅ Campaign sent to ${selectedUids.size} user${selectedUids.size !== 1 ? 's' : ''}${selectedUids.size === 1 ? ` (${firstName})` : ''}!\n🔗 Blog: #/blog/${blogId}\nBatch ID: ${queueId} (${selectedUids.size} queue entries created)`
      );
    } catch (e: any) {
      setSendResult(`❌ Failed: ${String(e?.message ?? e)}`);
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

  const updateField = (key: keyof GeneratedBlogContent, value: string) => {
    setEditedContent((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  // Field definitions for the editable preview
  const previewFields: {
    key: keyof GeneratedBlogContent;
    icon: React.ReactNode;
    label: string;
    color: string;
    multiline: boolean;
    rows?: number;
  }[] = [
    { key: 'title',               icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'Title',                color: 'indigo', multiline: false },
    { key: 'notificationMessage', icon: <BellRing      className="w-3.5 h-3.5" />, label: 'Notification Message', color: 'amber',  multiline: true,  rows: 3 },
    { key: 'blogContent',         icon: <FileText      className="w-3.5 h-3.5" />, label: 'Blog Content',         color: 'violet', multiline: true,  rows: 9 },
    { key: 'imagePrompt',         icon: <ImageIcon     className="w-3.5 h-3.5" />, label: 'Image Prompt (AI)',    color: 'sky',    multiline: true,  rows: 3 },
    { key: 'ctaText',             icon: <Target        className="w-3.5 h-3.5" />, label: 'CTA Button Text',      color: 'rose',   multiline: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/75 backdrop-blur-md"
      />

      {/* Modal — glassmorphism */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[2rem] bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/20 dark:ring-white/10 overflow-hidden"
      >
        {/* Modal header */}
        <div className={cn(
          'flex items-center justify-between gap-3 p-5 text-white shrink-0',
          type === 'expense'
            ? 'bg-gradient-to-r from-rose-600 to-red-500'
            : 'bg-gradient-to-r from-emerald-600 to-teal-500'
        )}>
          <div className="flex items-center gap-3 min-w-0">
            {type === 'expense'
              ? <TrendingDown className="w-5 h-5 shrink-0" />
              : <TrendingUp className="w-5 h-5 shrink-0" />
            }
            <div className="min-w-0">
              <h3 className="font-black text-lg leading-tight truncate">{category}</h3>
              <p className="text-xs text-white/70 mt-0.5">
                {users.length} user{users.length !== 1 ? 's' : ''} · {type === 'expense' ? 'Expense' : 'Income'} category
                {step === 'preview' && <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 rounded-full text-[10px] font-bold"><Pencil className="w-2.5 h-2.5" /> Editable</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {step === 'preview' && (
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
              {genError && (
                <div className="mx-5 mt-4 p-3 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                  <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-0.5">Generation Failed</p>
                  <p className="text-xs text-red-500 dark:text-red-300">{genError}</p>
                </div>
              )}

              {/* Select all header */}
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
                  {type === 'expense' ? 'Spent' : 'Earned'}
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
                        type === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                      )}>
                        {formatCurrency(u.categoryAmount, language)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Step: generating ── */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 animate-pulse flex items-center justify-center shadow-lg shadow-indigo-500/40">
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
                <div className="absolute -inset-1.5 rounded-2xl border-2 border-indigo-500/30 animate-ping" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-700 dark:text-slate-200">Gemini AI is crafting the campaign…</p>
                <p className="text-sm text-slate-400 mt-1">Targeting "{category}" · {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {/* ── Step: preview (editable) ── */}
          {step === 'preview' && editedContent && (
            <div className="p-5 space-y-4">
              {/* Editable hint banner */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
                <Pencil className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                  All fields are editable. Review & fix the AI content before sending.
                </p>
              </div>

              {/* Blog deep link */}
              {blogId && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
                  <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-300 flex-1 truncate font-mono">
                    #/blog/{blogId}
                  </span>
                  <button onClick={copyBlogLink} className="text-emerald-600 hover:text-emerald-700 transition-colors shrink-0">
                    {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              {/* Editable content fields */}
              {previewFields.map(({ key, icon, label, color, multiline, rows }) => (
                <div
                  key={key}
                  className={cn(
                    'rounded-2xl border p-3 space-y-2',
                    color === 'indigo' && 'bg-indigo-50/60 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700',
                    color === 'amber'  && 'bg-amber-50/60  dark:bg-amber-900/20  border-amber-200  dark:border-amber-700',
                    color === 'violet' && 'bg-violet-50/60 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700',
                    color === 'sky'    && 'bg-sky-50/60    dark:bg-sky-900/20    border-sky-200    dark:border-sky-700',
                    color === 'rose'   && 'bg-rose-50/60   dark:bg-rose-900/20   border-rose-200   dark:border-rose-700',
                  )}
                >
                  <div className={cn(
                    'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider',
                    color === 'indigo' && 'text-indigo-600 dark:text-indigo-400',
                    color === 'amber'  && 'text-amber-600  dark:text-amber-400',
                    color === 'violet' && 'text-violet-600 dark:text-violet-400',
                    color === 'sky'    && 'text-sky-600    dark:text-sky-400',
                    color === 'rose'   && 'text-rose-600   dark:text-rose-400',
                  )}>
                    {icon} {label}
                    <Pencil className="w-2.5 h-2.5 ml-auto opacity-40" />
                  </div>
                  {multiline ? (
                    <textarea
                      value={editedContent[key]}
                      onChange={(e) => updateField(key, e.target.value)}
                      rows={rows ?? 4}
                      className="w-full text-sm leading-relaxed bg-transparent resize-y focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-300 border-0 p-0"
                    />
                  ) : (
                    <input
                      type="text"
                      value={editedContent[key]}
                      onChange={(e) => updateField(key, e.target.value)}
                      className="w-full text-sm bg-transparent focus:outline-none text-slate-700 dark:text-slate-200 border-0 p-0"
                    />
                  )}
                </div>
              ))}

              {/* Send result */}
              {sendResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'p-3 rounded-2xl border text-sm leading-relaxed whitespace-pre-line',
                    sendResult.startsWith('✅')
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
                  )}
                >
                  {sendResult}
                </motion.div>
              )}
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
                onClick={handleGenerate}
                disabled={selectedUids.size === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-indigo-500/25"
              >
                <Sparkles className="w-4 h-4" />
                Target with AI Campaign
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSendPreview}
                disabled={isSending}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-sm font-bold rounded-2xl transition-all disabled:opacity-50"
              >
                <Eye className="w-4 h-4" /> Preview (My Device)
              </button>
              <button
                onClick={resetToSelect}
                disabled={isSending}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-bold rounded-2xl transition-all disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" /> Regenerate
              </button>
              <button
                onClick={handleSendCampaign}
                disabled={isSending || !editedContent}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-indigo-500/25 ml-auto disabled:opacity-50"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send to {selectedUids.size} User{selectedUids.size !== 1 ? 's' : ''} Now
              </button>
            </div>
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
  const [loading, setLoading] = useState(true);

  // ── Filter state
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

  // ── Category explorer state
  const [categoryModal, setCategoryModal] = useState<{ category: string; type: 'income' | 'expense' } | null>(null);

  // ── Category explorer tab
  const [explorerTab, setExplorerTab] = useState<'expense' | 'income'>('expense');

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
    return () => { unsubUsers(); unsubTx(); };
  }, []);

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

  const buildCategoryReport = useCallback((txType: 'income' | 'expense') => {
    const cats: Record<string, { total: number; users: Set<string> }> = {};
    transactions.filter((t) => t.type === txType && t.category).forEach((t) => {
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

  const filteredUsers = useMemo(() => users.filter((u) => {
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
  }), [users, searchTerm, incomeMin, incomeMax, filterCategory, filterCategoryMin, filterProfession, filterTag]);

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
    setSelectedUser(u);
    setUserTransactions(
      transactionsThisMonth
        .filter((t) => t.userId === u.id)
        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
        .slice(0, 8)
    );
  };

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
      formatted: String(rawUsers.length),
      icon: Users,
      gradient: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)',
      glow: 'rgba(99,102,241,0.45)',
      sub: `${users.filter((u) => u.subscription === 'Premium').length} Premium`,
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

  const activeExplorerReport = explorerTab === 'expense' ? platformExpenseCategoryReport : platformIncomeCategoryReport;

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
        <div className="flex flex-wrap gap-2">
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
              <p className="text-xs text-slate-500 dark:text-slate-400">Click any row to see users &amp; launch AI campaign · All time</p>
            </div>
          </div>
          {/* Tab switcher */}
          <div className="flex rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shrink-0 self-start sm:self-auto">
            {(['expense', 'income'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setExplorerTab(tab)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all',
                  explorerTab === tab
                    ? tab === 'expense'
                      ? 'bg-red-500 text-white'
                      : 'bg-emerald-500 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                )}
              >
                {tab === 'expense'
                  ? <><TrendingDown className="w-3 h-3" /> Expense</>
                  : <><TrendingUp className="w-3 h-3" /> Income</>
                }
              </button>
            ))}
          </div>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-5 py-3 bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span>Category</span>
          <span className="text-right">Users</span>
          <span className="text-right w-28">Total</span>
          <span className="hidden sm:block text-right w-24">Avg / User</span>
          <span className="w-16 text-center">Target</span>
        </div>

        {/* Category rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-[28rem] overflow-y-auto">
          {activeExplorerReport.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No {explorerTab} data found.</p>
          ) : (
            activeExplorerReport.map((row, idx) => (
              <motion.div
                key={row.name}
                layout
                className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer"
                onClick={() => setCategoryModal({ category: row.name, type: explorerTab })}
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
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-700 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/40">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white">Lead Generation Table</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{filteredUsers.length} of {users.length} users</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-900/40">
                {['User', 'Email / Phone', 'Profession', 'Monthly Income', 'Top Category', 'Net Balance', 'Behaviour Tags', ''].map((h) => (
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
                    <ChevronRight className="inline h-4 w-4 text-slate-300 transition-colors group-hover:text-indigo-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && <p className="py-12 text-center text-sm text-slate-400">No users match the current filters.</p>}
        </div>
      </motion.div>

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
    </div>
  );
};

export default AdminDashboard;
