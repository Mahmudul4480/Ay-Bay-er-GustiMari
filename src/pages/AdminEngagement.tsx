import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Filter,
  Sparkles,
  Send,
  Eye,
  CheckSquare,
  Square,
  Loader2,
  ShieldX,
  User,
  Mail,
  Phone,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Bell,
  BellRing,
  ArrowLeft,
  Copy,
  CheckCheck,
  RefreshCw,
  Target,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  X,
  Pencil,
} from 'lucide-react';
import { db } from '../firebaseConfig';
import { generateBlogContent, type GeneratedBlogContent } from '../lib/geminiApi';
import { sendBrowserPreviewNotification, queueNotificationsForUsers } from '../lib/fcmUtils';
import { cn } from '../lib/utils';

const ADMIN_EMAIL = 'chotan4480@gmail.com';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserRow {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  profession: string;
  createdAt: Timestamp | null;
  fcmToken?: string;
  monthlyIncome?: number;
  role?: string;
  photoURL?: string;
}

type FilterLastActive = 'all' | '7d' | '30d' | '90d';

interface AdminEngagementProps {
  currentUserEmail: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function professionLabel(p: string): string {
  const MAP: Record<string, string> = {
    doctor: 'Doctor', engineer: 'Engineer', teacher: 'Teacher',
    banker: 'Banker', businessman: 'Businessman', student: 'Student',
    government: 'Govt. Employee', lawyer: 'Lawyer', farmer: 'Farmer',
    freelancer: 'Freelancer', housewife: 'Housewife', military: 'Military',
    journalist: 'Journalist', accountant: 'Accountant', nurse: 'Nurse',
    pharmacist: 'Pharmacist', architect: 'Architect', pilot: 'Pilot',
    chef: 'Chef', artist: 'Artist', other: 'Other',
  };
  return MAP[p?.toLowerCase()] ?? (p || 'Unknown');
}

function daysSince(ts: Timestamp | null): number {
  if (!ts) return 9999;
  return Math.floor((Date.now() - ts.toMillis()) / 86_400_000);
}

function formatRelative(ts: Timestamp | null): string {
  if (!ts) return '—';
  const d = daysSince(ts);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function Avatar({ user }: { user: UserRow }) {
  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-600 shrink-0"
      />
    );
  }
  const initials = (user.displayName || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

// ─── Content Preview Panel (editable) ────────────────────────────────────────
function ContentPanel({
  content,
  targetUsers,
  onSendPreview,
  onSendToUsers,
  onRegenerate,
  sending,
  blogId,
}: {
  content: GeneratedBlogContent;
  targetUsers: UserRow[];
  onSendPreview: (edited: GeneratedBlogContent) => void;
  onSendToUsers: (edited: GeneratedBlogContent) => void;
  onRegenerate: () => void;
  sending: boolean;
  blogId: string | null;
}) {
  // Own copy of the AI output — user can edit before sending
  const [editedContent, setEditedContent] = useState<GeneratedBlogContent>({ ...content });
  const [copied, setCopied] = useState(false);

  // Re-sync when a fresh generation arrives (Regenerate pressed)
  useEffect(() => {
    setEditedContent({ ...content });
  }, [content]);

  const updateField = (key: keyof GeneratedBlogContent, value: string) => {
    setEditedContent((prev) => ({ ...prev, [key]: value }));
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#/blog/${blogId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fieldDefs: {
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
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-4 h-full overflow-y-auto pr-1"
    >
      {/* Editable hint */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
        <Pencil className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
        <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">
          All fields are editable. Fix any mistakes before sending.
        </p>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRegenerate}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" /> Regenerate
        </button>
        <button
          onClick={() => onSendPreview(editedContent)}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all disabled:opacity-50"
        >
          <Eye className="w-3 h-3" /> Preview (My Device)
        </button>
        <button
          onClick={() => onSendToUsers(editedContent)}
          disabled={sending || targetUsers.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white transition-all disabled:opacity-50 shadow-md shadow-indigo-900/30"
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Send to {targetUsers.length} User{targetUsers.length !== 1 ? 's' : ''} Now
        </button>
      </div>

      {/* Blog deep link */}
      {blogId && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
          <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-xs text-emerald-700 dark:text-emerald-300 flex-1 truncate font-mono">
            #/blog/{blogId}
          </span>
          <button onClick={copyLink} className="text-emerald-600 hover:text-emerald-700 transition-colors shrink-0">
            {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Editable content fields */}
      {fieldDefs.map(({ key, icon, label, color, multiline, rows }) => (
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
              className="w-full text-sm leading-relaxed bg-transparent resize-y focus:outline-none text-slate-700 dark:text-slate-200 border-0 p-0"
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
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminEngagement({ currentUserEmail, onBack }: AdminEngagementProps) {
  const isAdmin = currentUserEmail === ADMIN_EMAIL;

  // ── Data ──
  const [rawUsers, setRawUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [filterProfession, setFilterProfession] = useState('all');
  const [filterLastActive, setFilterLastActive] = useState<FilterLastActive>('all');
  const [showFilters, setShowFilters] = useState(false);

  // ── Selection ──
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());

  // ── AI & Blog ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedBlogContent | null>(null);
  const [generatedBlogId, setGeneratedBlogId] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // ── Panel target user (for single-user mode) ──
  const [panelTargetUid, setPanelTargetUid] = useState<string | null>(null);

  // ── Fetch users ──
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const rows: UserRow[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, any>;
        return {
          uid: d.id,
          displayName: data.displayName || data.name || 'Unknown',
          email: data.email || '',
          phone: data.phone || data.phoneNumber || undefined,
          profession: data.profession || 'other',
          createdAt: data.createdAt ?? null,
          fcmToken: data.fcmToken,
          monthlyIncome: data.monthlyIncome,
          role: data.role,
          photoURL: data.photoURL,
        };
      });
      setRawUsers(rows);
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));
    return unsub;
  }, [isAdmin]);

  // ── Unique professions for filter dropdown ──
  const allProfessions = useMemo(() => {
    const set = new Set(rawUsers.map((u) => u.profession).filter(Boolean));
    return Array.from(set).sort();
  }, [rawUsers]);

  // ── Filtered users ──
  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase();
    return rawUsers.filter((u) => {
      if (term && !u.displayName.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term)) return false;
      if (filterProfession !== 'all' && u.profession !== filterProfession) return false;
      if (filterLastActive !== 'all') {
        const days = { '7d': 7, '30d': 30, '90d': 90 }[filterLastActive] ?? 9999;
        if (daysSince(u.createdAt) > days) return false;
      }
      return true;
    });
  }, [rawUsers, search, filterProfession, filterLastActive]);

  // ── Effective target users (panel or selection) ──
  const targetUsers: UserRow[] = useMemo(() => {
    if (panelTargetUid) {
      return rawUsers.filter((u) => u.uid === panelTargetUid);
    }
    return rawUsers.filter((u) => selectedUids.has(u.uid));
  }, [panelTargetUid, selectedUids, rawUsers]);

  const isPanelOpen = targetUsers.length > 0;

  // ── Toggle selection ──
  const toggleSelect = useCallback((uid: string) => {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
    setPanelTargetUid(null);
  }, []);

  const toggleAll = () => {
    if (selectedUids.size === filteredUsers.length) {
      setSelectedUids(new Set());
    } else {
      setSelectedUids(new Set(filteredUsers.map((u) => u.uid)));
    }
    setPanelTargetUid(null);
  };

  const targetSingle = (uid: string) => {
    setPanelTargetUid(uid);
    setSelectedUids(new Set());
    setGeneratedContent(null);
    setGeneratedBlogId(null);
    setGenError(null);
    setSendResult(null);
  };

  const closePanel = () => {
    setPanelTargetUid(null);
    setSelectedUids(new Set());
    setGeneratedContent(null);
    setGeneratedBlogId(null);
    setGenError(null);
    setSendResult(null);
  };

  // ── Generate AI content ──
  const generateContent = useCallback(async () => {
    const first = targetUsers[0];
    if (!first) return;
    setIsGenerating(true);
    setGenError(null);
    setGeneratedContent(null);
    setGeneratedBlogId(null);
    setSendResult(null);
    try {
      const content = await generateBlogContent(first.displayName, first.profession);
      setGeneratedContent(content);

      // Save blog to Firestore immediately
      const ref = await addDoc(collection(db, 'blogs'), {
        title: content.title,
        notificationMessage: content.notificationMessage,
        blogContent: content.blogContent,
        imagePrompt: content.imagePrompt,
        ctaText: content.ctaText,
        targetUserIds: targetUsers.map((u) => u.uid),
        targetUserName: first.displayName,
        targetProfession: first.profession,
        createdAt: serverTimestamp(),
        status: 'draft',
      });
      setGeneratedBlogId(ref.id);
    } catch (e: any) {
      setGenError(String(e?.message ?? e));
    } finally {
      setIsGenerating(false);
    }
  }, [targetUsers]);

  // ── Send Preview (admin's device only, uses edited content) ──
  const sendPreview = async (editedContent: GeneratedBlogContent) => {
    const ok = await sendBrowserPreviewNotification(
      editedContent.title,
      editedContent.notificationMessage,
      `/#/blog/${generatedBlogId}`
    );
    setSendResult(ok
      ? '✅ Preview notification sent to your device!'
      : '❌ Could not send preview — check browser notification permissions.'
    );
  };

  // ── Send to selected users (persist edits → Firestore, then queue) ──
  const sendToUsers = async (editedContent: GeneratedBlogContent) => {
    if (!generatedBlogId || targetUsers.length === 0) return;
    setIsSending(true);
    try {
      // Persist manual edits back to the draft blog document
      await updateDoc(doc(db, 'blogs', generatedBlogId), {
        title: editedContent.title,
        notificationMessage: editedContent.notificationMessage,
        blogContent: editedContent.blogContent,
        imagePrompt: editedContent.imagePrompt,
        ctaText: editedContent.ctaText,
        status: 'published',
      });

      const queueId = await queueNotificationsForUsers(
        generatedBlogId,
        targetUsers.map((u) => u.uid),
        editedContent.title,
        editedContent.notificationMessage
      );
      const firstName = targetUsers[0]?.displayName || 'User';
      setSendResult(
        `✅ Campaign sent to ${targetUsers.length} user${targetUsers.length !== 1 ? 's' : ''}${targetUsers.length === 1 ? ` (${firstName})` : ''}!\n🔗 Blog: #/blog/${generatedBlogId}\nQueue ID: ${queueId}\n💡 Deploy 'processNotificationQueue' Cloud Function to dispatch FCM pushes.`
      );
    } catch (e: any) {
      setSendResult(`❌ Failed: ${String(e?.message ?? e)}`);
    } finally {
      setIsSending(false);
    }
  };

  // ─── Access Denied screen ───────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-rose-900 to-slate-900 flex flex-col items-center justify-center gap-6 p-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1, rotate: [0, -5, 5, -5, 0] }}
          transition={{ duration: 0.6, type: 'spring' }}
          className="w-28 h-28 rounded-3xl bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center shadow-2xl shadow-red-900/50"
        >
          <ShieldX className="w-14 h-14 text-red-400" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-4xl font-black text-red-300 text-center drop-shadow-[0_0_24px_rgba(239,68,68,0.5)]"
        >
          Access Denied
        </motion.h1>
        <p className="text-red-200/60 text-center text-sm max-w-xs">
          This section is restricted to the platform administrator only.
        </p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-2xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  // ─── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent truncate">
              User Re-engagement Dashboard
            </h1>
            <p className="text-xs text-slate-400 truncate">AI-powered blog & notification system</p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              {rawUsers.length} Users
            </span>
          </div>
        </div>
      </div>

      {/* ── User Table (full-width — modal opens on top) ── */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex flex-col gap-4">

          {/* Search + Filter bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-medium transition-all shrink-0',
                showFilters
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400'
              )}
            >
              <Filter className="w-4 h-4" />
              Filters
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Expandable filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">Profession</label>
                    <select
                      value={filterProfession}
                      onChange={(e) => setFilterProfession(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Professions</option>
                      {allProfessions.map((p) => (
                        <option key={p} value={p}>{professionLabel(p)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">Joined (Last Active)</label>
                    <select
                      value={filterLastActive}
                      onChange={(e) => setFilterLastActive(e.target.value as FilterLastActive)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="all">All Time</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="90d">Last 90 Days</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bulk select bar */}
          {selectedUids.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700"
            >
              <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 flex-1">
                {selectedUids.size} user{selectedUids.size > 1 ? 's' : ''} selected
              </span>
              <button
                onClick={generateContent}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 shadow-md shadow-indigo-900/20"
              >
                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Generate AI Blog
              </button>
              <button onClick={() => setSelectedUids(new Set())} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <button onClick={toggleAll} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                {selectedUids.size === filteredUsers.length && filteredUsers.length > 0
                  ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                  : <Square className="w-4 h-4" />
                }
              </button>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">
                User ({filteredUsers.length})
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:block w-24 text-center">Joined</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-20 text-center">FCM</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Action</span>
            </div>

            {/* Rows */}
            {loadingUsers ? (
              <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading users…</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <User className="w-10 h-10" />
                <p className="text-sm">No users match the filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-[60vh] overflow-y-auto">
                {filteredUsers.map((user) => {
                  const isSelected = selectedUids.has(user.uid);
                  const isTarget = panelTargetUid === user.uid;
                  return (
                    <motion.div
                      key={user.uid}
                      layout
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 transition-colors',
                        isSelected || isTarget
                          ? 'bg-indigo-50/60 dark:bg-indigo-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(user.uid)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                      >
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                          : <Square className="w-4 h-4" />
                        }
                      </button>

                      {/* User info */}
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">
                            {user.displayName}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                              <Mail className="w-2.5 h-2.5 shrink-0" />{user.email}
                            </span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0">
                              <Briefcase className="w-2.5 h-2.5" />{professionLabel(user.profession)}
                            </span>
                          </div>
                          {user.phone && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" />{user.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Joined */}
                      <span className="text-[11px] text-slate-400 hidden md:block w-24 text-center shrink-0">
                        {formatRelative(user.createdAt)}
                      </span>

                      {/* FCM token indicator */}
                      <div className="w-20 flex justify-center shrink-0">
                        {user.fcmToken ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-full text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                            <Bell className="w-2.5 h-2.5" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-[10px] text-slate-400">
                            No token
                          </span>
                        )}
                      </div>

                      {/* Single target button */}
                      <div className="w-16 flex justify-center shrink-0">
                        <button
                          onClick={() => targetSingle(user.uid)}
                          title="Target this user"
                          className={cn(
                            'p-1.5 rounded-xl border transition-all',
                            isTarget
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600'
                          )}
                        >
                          <Target className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Campaign Modal Overlay ── */}
      <AnimatePresence>
        {isPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
            />

            {/* Glassmorphism modal */}
            <motion.div
              key="campaign-modal"
              initial={{ opacity: 0, scale: 0.93, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 28 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[2rem] bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl shadow-2xl ring-1 ring-white/25 dark:ring-white/10 overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/70">AI Campaign Generator</p>
                  <p className="text-sm font-semibold truncate mt-0.5">
                    {targetUsers.length === 1
                      ? targetUsers[0].displayName
                      : `${targetUsers.length} users selected`}
                  </p>
                </div>
                <button
                  onClick={closePanel}
                  className="p-2 rounded-xl hover:bg-white/15 transition-all shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Target user chips */}
                {targetUsers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {targetUsers.slice(0, 6).map((u) => (
                      <div key={u.uid} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium">
                        <Avatar user={u} />
                        <span className="truncate max-w-[100px]">{u.displayName}</span>
                        <span className="text-slate-400 shrink-0">({professionLabel(u.profession)})</span>
                      </div>
                    ))}
                    {targetUsers.length > 6 && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs">
                        +{targetUsers.length - 6} more
                      </div>
                    )}
                  </div>
                )}

                {/* Generate button */}
                {!generatedContent && !isGenerating && !genError && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={generateContent}
                    className="w-full py-5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-900/20 transition-all"
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate AI Blog Content
                  </motion.button>
                )}

                {/* Generating state */}
                {isGenerating && (
                  <div className="flex flex-col items-center justify-center py-14 gap-4">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 animate-pulse flex items-center justify-center shadow-lg shadow-indigo-500/40">
                        <Sparkles className="w-10 h-10 text-white" />
                      </div>
                      <div className="absolute -inset-1.5 rounded-2xl border-2 border-indigo-500/30 animate-ping" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-700 dark:text-slate-200">Gemini AI is crafting the campaign…</p>
                      <p className="text-sm text-slate-400 mt-1">Personalising content for {targetUsers[0]?.displayName ?? 'user'}</p>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {genError && !isGenerating && (
                  <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400 mb-1">Generation Failed</p>
                    <p className="text-xs text-red-500 dark:text-red-300 leading-relaxed">{genError}</p>
                    <button
                      onClick={generateContent}
                      className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-bold rounded-xl transition-all"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  </div>
                )}

                {/* Editable content preview */}
                {generatedContent && !isGenerating && (
                  <ContentPanel
                    content={generatedContent}
                    targetUsers={targetUsers}
                    blogId={generatedBlogId}
                    onSendPreview={(edited) => sendPreview(edited)}
                    onSendToUsers={(edited) => sendToUsers(edited)}
                    onRegenerate={generateContent}
                    sending={isSending}
                  />
                )}

                {/* Send result */}
                {sendResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'p-4 rounded-2xl border text-sm leading-relaxed whitespace-pre-line',
                      sendResult.startsWith('✅')
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
                    )}
                  >
                    {sendResult}
                  </motion.div>
                )}
              </div>

              {/* Modal footer — Cloud Function note */}
              <div className="shrink-0 border-t border-slate-200/60 dark:border-slate-700/60 px-5 py-3 bg-amber-50/80 dark:bg-amber-900/10 flex items-start gap-2.5">
                <BellRing className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong>Cloud Function required</strong> — Deploy{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">processNotificationQueue</code>{' '}
                  to auto-dispatch FCM push notifications from the queue. Each entry now stores{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">targetUserId</code> for granular processing.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
