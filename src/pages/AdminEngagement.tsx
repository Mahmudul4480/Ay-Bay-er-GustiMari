import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Filter,
  Send,
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
  Target,
  FileText,
  X,
  BookOpen,
  Tag,
  ImageIcon,
  Upload,
  PlusCircle,
  ListChecks,
  AlertCircle,
  Megaphone,
} from 'lucide-react';
import { db, storage } from '../firebaseConfig';
import { queueNotificationsForUsers } from '../lib/fcmUtils';
import { getProfessionLabel } from '../lib/professionData';
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
type BlogSource = 'existing' | 'new';

interface SavedBlog {
  id: string;
  title: string;
  blogContent: string;
  notificationMessage: string;
  imageUrl?: string;
  category?: string;
  status?: string;
  type?: string;
  createdAt: Timestamp | null;
}

interface SendPayload {
  notifTitle: string;
  notifMessage: string;
  blogSource: BlogSource;
  selectedBlogId: string;
  newBlogTitle: string;
  newBlogContent: string;
  imageFile: File | null;
}

interface AdminEngagementProps {
  currentUserEmail: string;
  onBack: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const initials = (user.displayName || '?')
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}

// ─── Campaign Success Card ────────────────────────────────────────────────────
function CampaignSuccessCard({
  blogId,
  batchId,
  userCount,
  onDismiss,
}: {
  blogId: string;
  batchId: string;
  userCount: number;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const deepLink = `${window.location.origin}${window.location.pathname}#/blog/${blogId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(deepLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3.5 bg-emerald-500/10 dark:bg-emerald-500/5 border-b border-emerald-200 dark:border-emerald-700">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-900/20">
          <CheckCheck className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">
            Campaign Sent Successfully!
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
            Blog published · {userCount} user{userCount !== 1 ? 's' : ''} queued for notification
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded-lg text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <BellRing className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-slate-600 dark:text-slate-400">
            <span className="font-bold text-slate-800 dark:text-white">{userCount}</span>
            {' '}notification{userCount !== 1 ? 's' : ''} queued in{' '}
            <code className="font-mono text-[11px] bg-slate-100 dark:bg-slate-700 px-1 rounded">notificationQueue</code>
          </span>
        </div>

        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-700/50 border border-emerald-100 dark:border-emerald-800">
          <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex-1 truncate font-mono">
            #/blog/{blogId}
          </span>
          <button onClick={copyLink} className="shrink-0 p-1 rounded text-emerald-500 hover:text-emerald-700 transition-colors">
            {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
            Batch: {batchId}
          </span>
          <span className="ml-auto">Deploy <code className="font-mono">processNotificationQueue</code> CF to dispatch FCM</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Manual Campaign Form ─────────────────────────────────────────────────────
function ManualCampaignForm({
  savedBlogs,
  targetUsers,
  onSend,
  sending,
  uploadProgress,
}: {
  savedBlogs: SavedBlog[];
  targetUsers: UserRow[];
  onSend: (payload: SendPayload) => void;
  sending: boolean;
  uploadProgress: number | null;
}) {
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [blogSource, setBlogSource] = useState<BlogSource>('existing');

  // Existing blog picker
  const [blogSearch, setBlogSearch] = useState('');
  const [selectedBlogId, setSelectedBlogId] = useState('');

  // New blog fields
  const [newBlogTitle, setNewBlogTitle] = useState('');
  const [newBlogContent, setNewBlogContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const inputBase =
    'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all';

  const filteredBlogs = useMemo(() => {
    const term = blogSearch.toLowerCase();
    return savedBlogs.filter(
      (b) => !term || b.title?.toLowerCase().includes(term) || b.category?.toLowerCase().includes(term),
    );
  }, [savedBlogs, blogSearch]);

  const selectedBlog = savedBlogs.find((b) => b.id === selectedBlogId);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!notifTitle.trim()) errs.notifTitle = 'Notification title is required';
    if (!notifMessage.trim()) errs.notifMessage = 'Notification message is required';
    if (blogSource === 'existing' && !selectedBlogId) errs.blog = 'Please select a blog';
    if (blogSource === 'new' && !newBlogTitle.trim()) errs.newBlogTitle = 'Blog title is required';
    if (blogSource === 'new' && !newBlogContent.trim()) errs.newBlogContent = 'Blog content is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSend({
      notifTitle: notifTitle.trim(),
      notifMessage: notifMessage.trim(),
      blogSource,
      selectedBlogId,
      newBlogTitle: newBlogTitle.trim(),
      newBlogContent: newBlogContent.trim(),
      imageFile,
    });
  };

  return (
    <div className="space-y-5">
      {/* ── Section 1: Notification ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-b border-slate-200 dark:border-slate-700">
          <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
            Push Notification
          </p>
        </div>
        <div className="p-4 space-y-3">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Notification Title *
            </label>
            <input
              type="text"
              value={notifTitle}
              onChange={(e) => { setNotifTitle(e.target.value); setErrors((p) => ({ ...p, notifTitle: '' })); }}
              placeholder="e.g. আপনার জন্য একটি বিশেষ বার্তা!"
              className={cn(inputBase, errors.notifTitle && 'border-red-400 ring-1 ring-red-400')}
            />
            {errors.notifTitle && (
              <p className="flex items-center gap-1 text-[11px] text-red-500">
                <AlertCircle className="w-3 h-3" /> {errors.notifTitle}
              </p>
            )}
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Notification Message *
              <span className="ml-1 font-normal text-slate-400 normal-case">(max 120 chars)</span>
            </label>
            <textarea
              value={notifMessage}
              onChange={(e) => { setNotifMessage(e.target.value); setErrors((p) => ({ ...p, notifMessage: '' })); }}
              rows={2}
              maxLength={120}
              placeholder="e.g. আজই আপনার খরচের হিসাব দেখুন এবং সঞ্চয় বাড়ান!"
              className={cn(inputBase, 'resize-none', errors.notifMessage && 'border-red-400 ring-1 ring-red-400')}
            />
            <div className="flex items-center justify-between">
              {errors.notifMessage
                ? <p className="flex items-center gap-1 text-[11px] text-red-500"><AlertCircle className="w-3 h-3" />{errors.notifMessage}</p>
                : <span />}
              <span className="text-[10px] text-slate-400">{notifMessage.length}/120</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Blog Source ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-slate-200 dark:border-slate-700">
          <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
          <p className="text-xs font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
            Blog Content
          </p>
        </div>

        {/* Source toggle */}
        <div className="flex gap-1 p-3 border-b border-slate-100 dark:border-slate-700">
          <button
            onClick={() => setBlogSource('existing')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all',
              blogSource === 'existing'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
            )}
          >
            <ListChecks className="w-3.5 h-3.5" /> Select Existing Blog
          </button>
          <button
            onClick={() => setBlogSource('new')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl transition-all',
              blogSource === 'new'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600',
            )}
          >
            <PlusCircle className="w-3.5 h-3.5" /> Create New Blog
          </button>
        </div>

        <div className="p-4">
          {/* ── EXISTING BLOG ── */}
          {blogSource === 'existing' && (
            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={blogSearch}
                  onChange={(e) => setBlogSearch(e.target.value)}
                  placeholder="Search blogs…"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm placeholder-slate-400 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* List */}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-600 divide-y divide-slate-100 dark:divide-slate-700">
                {filteredBlogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
                    <BookOpen className="w-7 h-7" />
                    <p className="text-xs">No blogs found. Create one below or in Blog Manager.</p>
                  </div>
                ) : (
                  filteredBlogs.map((blog) => {
                    const isSel = blog.id === selectedBlogId;
                    return (
                      <button
                        key={blog.id}
                        onClick={() => { setSelectedBlogId(blog.id); setErrors((p) => ({ ...p, blog: '' })); }}
                        className={cn(
                          'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
                          isSel ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40',
                        )}
                      >
                        <div className={cn(
                          'w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 transition-all',
                          isSel ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 dark:border-slate-500',
                        )}>
                          {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white mx-auto mt-0.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-white line-clamp-1">
                            {blog.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {blog.category && (
                              <span className="flex items-center gap-0.5 text-[10px] text-indigo-500 font-medium">
                                <Tag className="w-2.5 h-2.5" />{blog.category}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 ml-auto">
                              {blog.createdAt?.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) ?? '—'}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Selected preview */}
              {selectedBlog && (
                <motion.div
                  key={selectedBlog.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700"
                >
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 line-clamp-1">{selectedBlog.title}</p>
                  <p className="text-[11px] text-indigo-600/70 dark:text-indigo-400/70 line-clamp-2 mt-0.5 leading-relaxed">
                    {selectedBlog.blogContent?.slice(0, 120)}…
                  </p>
                </motion.div>
              )}

              {errors.blog && (
                <p className="flex items-center gap-1 text-[11px] text-red-500">
                  <AlertCircle className="w-3 h-3" /> {errors.blog}
                </p>
              )}
            </div>
          )}

          {/* ── NEW BLOG ── */}
          {blogSource === 'new' && (
            <div className="space-y-3">
              {/* Blog title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Blog Title *
                </label>
                <input
                  type="text"
                  value={newBlogTitle}
                  onChange={(e) => { setNewBlogTitle(e.target.value); setErrors((p) => ({ ...p, newBlogTitle: '' })); }}
                  placeholder="e.g. আপনার ঈদের বাজেট কি ঠিক আছে?"
                  className={cn(inputBase, errors.newBlogTitle && 'border-red-400 ring-1 ring-red-400')}
                />
                {errors.newBlogTitle && (
                  <p className="flex items-center gap-1 text-[11px] text-red-500">
                    <AlertCircle className="w-3 h-3" />{errors.newBlogTitle}
                  </p>
                )}
              </div>

              {/* Blog content */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Blog Content *
                </label>
                <textarea
                  value={newBlogContent}
                  onChange={(e) => { setNewBlogContent(e.target.value); setErrors((p) => ({ ...p, newBlogContent: '' })); }}
                  rows={7}
                  placeholder="ব্লগের মূল বিষয়বস্তু এখানে লিখুন…"
                  className={cn(inputBase, 'resize-y leading-relaxed', errors.newBlogContent && 'border-red-400 ring-1 ring-red-400')}
                />
                {errors.newBlogContent && (
                  <p className="flex items-center gap-1 text-[11px] text-red-500">
                    <AlertCircle className="w-3 h-3" />{errors.newBlogContent}
                  </p>
                )}
              </div>

              {/* Image upload */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Cover Image
                  <span className="font-normal normal-case text-slate-400">(optional · JPG/PNG/WEBP · max 5 MB)</span>
                </label>

                {imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-36 object-cover"
                    />
                    <button
                      onClick={clearImage}
                      className="absolute top-2 right-2 p-1.5 rounded-xl bg-black/50 hover:bg-black/70 text-white transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-2 left-2">
                      <span className="px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-medium">
                        {imageFile?.name}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400"
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-xs font-medium">Click to upload image</span>
                  </button>
                )}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {/* Upload progress */}
              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Uploading image…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-indigo-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Send Button ── */}
      <button
        onClick={handleSubmit}
        disabled={sending || targetUsers.length === 0}
        className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm transition-all disabled:opacity-50 shadow-lg shadow-indigo-900/20"
      >
        {sending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
          : <><Send className="w-4 h-4" /> Send Campaign to {targetUsers.length} User{targetUsers.length !== 1 ? 's' : ''}</>}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminEngagement({ currentUserEmail, onBack }: AdminEngagementProps) {
  const isAdmin = currentUserEmail === ADMIN_EMAIL;

  // ── Data ──
  const [rawUsers, setRawUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savedBlogs, setSavedBlogs] = useState<SavedBlog[]>([]);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [filterProfession, setFilterProfession] = useState('all');
  const [filterLastActive, setFilterLastActive] = useState<FilterLastActive>('all');
  const [showFilters, setShowFilters] = useState(false);

  // ── Selection ──
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [panelTargetUid, setPanelTargetUid] = useState<string | null>(null);

  // ── Send state ──
  const [isSending, setIsSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // ── Fetch users ──
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRawUsers(snap.docs.map((d) => {
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
      }));
      setLoadingUsers(false);
    }, () => setLoadingUsers(false));
    return unsub;
  }, [isAdmin]);

  // ── Fetch blogs ──
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'blogs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setSavedBlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SavedBlog)));
    });
    return unsub;
  }, [isAdmin]);

  const allProfessions = useMemo(() => {
    const set = new Set(rawUsers.map((u) => u.profession).filter(Boolean));
    return Array.from(set).sort();
  }, [rawUsers]);

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

  const targetUsers: UserRow[] = useMemo(() => {
    if (panelTargetUid) return rawUsers.filter((u) => u.uid === panelTargetUid);
    return rawUsers.filter((u) => selectedUids.has(u.uid));
  }, [panelTargetUid, selectedUids, rawUsers]);

  const isPanelOpen = targetUsers.length > 0;

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
    setSendResult(null);
  };

  const closePanel = () => {
    setPanelTargetUid(null);
    setSelectedUids(new Set());
    setSendResult(null);
    setUploadProgress(null);
  };

  // ── Send manual campaign ──
  const sendManualCampaign = useCallback(async (payload: SendPayload) => {
    if (!isAdmin) {
      setSendResult(`❌ Unauthorised. Only ${ADMIN_EMAIL} can send campaigns.`);
      return;
    }
    if (targetUsers.length === 0) return;

    setIsSending(true);
    setSendResult(null);
    setUploadProgress(null);

    try {
      let blogId: string;

      if (payload.blogSource === 'existing') {
        // Use the selected existing blog directly
        blogId = payload.selectedBlogId;
      } else {
        // Step 1 — Upload image to Firebase Storage if provided
        let imageUrl = '';
        if (payload.imageFile) {
          const fileRef = storageRef(
            storage,
            `blog_images/${Date.now()}_${payload.imageFile.name.replace(/\s+/g, '_')}`,
          );
          await new Promise<void>((resolve, reject) => {
            const task = uploadBytesResumable(fileRef, payload.imageFile!);
            task.on(
              'state_changed',
              (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
              reject,
              async () => {
                imageUrl = await getDownloadURL(task.snapshot.ref);
                setUploadProgress(null);
                resolve();
              },
            );
          });
        }

        // Step 2 — Save new blog to Firestore
        const blogRef = await addDoc(collection(db, 'blogs'), {
          title: payload.newBlogTitle,
          blogContent: payload.newBlogContent,
          notificationMessage: payload.notifMessage,
          imageUrl,
          imagePrompt: '',
          ctaText: 'আপনার আজকের হিসাবটি লিখুন — Ay Bay Er GustiMari-তে যান',
          type: 'manual',
          status: 'published',
          category: 'General',
          targetUserIds: targetUsers.map((u) => u.uid),
          createdAt: serverTimestamp(),
        });
        blogId = blogRef.id;
      }

      // Step 3 — Write one notificationQueue doc per user
      const batchId = await queueNotificationsForUsers(
        blogId,
        targetUsers.map((u) => u.uid),
        payload.notifTitle,
        payload.notifMessage,
      );

      setSendResult(`SUCCESS:${blogId}:${batchId}:${targetUsers.length}`);
    } catch (e: any) {
      setSendResult(`❌ Failed: ${String(e?.message ?? e)}`);
      setUploadProgress(null);
    } finally {
      setIsSending(false);
    }
  }, [isAdmin, targetUsers]);

  // ─── Access Denied ────────────────────────────────────────────────────────
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

  // ─── Main UI ──────────────────────────────────────────────────────────────
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
              Campaign Manager
            </h1>
            <p className="text-xs text-slate-400 truncate">Select users · compose campaign · send notification</p>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              {rawUsers.length} Users
            </span>
          </div>
        </div>
      </div>

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
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400',
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
                        <option key={p} value={p}>{getProfessionLabel(p)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 block uppercase tracking-wider">Joined</label>
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
                {selectedUids.size} user{selectedUids.size > 1 ? 's' : ''} selected — open Campaign panel →
              </span>
              <button
                onClick={() => setSelectedUids(new Set())}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {/* User Table */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <button onClick={toggleAll} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                {selectedUids.size === filteredUsers.length && filteredUsers.length > 0
                  ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                  : <Square className="w-4 h-4" />}
              </button>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex-1">
                User ({filteredUsers.length})
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:block w-24 text-center">Joined</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-20 text-center">FCM</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Campaign</span>
            </div>

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
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40',
                      )}
                    >
                      <button
                        onClick={() => toggleSelect(user.uid)}
                        className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                      >
                        {isSelected
                          ? <CheckSquare className="w-4 h-4 text-indigo-600" />
                          : <Square className="w-4 h-4" />}
                      </button>

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
                              <Briefcase className="w-2.5 h-2.5" />{getProfessionLabel(user.profession)}
                            </span>
                          </div>
                          {user.phone && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" />{user.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-[11px] text-slate-400 hidden md:block w-24 text-center shrink-0">
                        {formatRelative(user.createdAt)}
                      </span>

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

                      <div className="w-16 flex justify-center shrink-0">
                        <button
                          onClick={() => targetSingle(user.uid)}
                          title="Open Campaign Panel"
                          className={cn(
                            'p-1.5 rounded-xl border transition-all',
                            isTarget
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600',
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

      {/* ── Campaign Modal ── */}
      <AnimatePresence>
        {isPanelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
            />

            <motion.div
              key="campaign-modal"
              initial={{ opacity: 0, scale: 0.93, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 28 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[2rem] bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/80 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-white/70">Campaign Manager</p>
                  <p className="text-sm font-semibold truncate mt-0.5">
                    {targetUsers.length === 1
                      ? targetUsers[0].displayName
                      : `${targetUsers.length} users selected`}
                  </p>
                </div>
                <button onClick={closePanel} className="p-2 rounded-xl hover:bg-white/15 transition-all shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Target user chips */}
                <div className="flex flex-wrap gap-2">
                  {targetUsers.slice(0, 6).map((u) => (
                    <div key={u.uid} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium">
                      <Avatar user={u} />
                      <span className="truncate max-w-[100px]">{u.displayName}</span>
                      <span className="text-slate-400 shrink-0">({getProfessionLabel(u.profession)})</span>
                    </div>
                  ))}
                  {targetUsers.length > 6 && (
                    <div className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 text-xs">
                      +{targetUsers.length - 6} more
                    </div>
                  )}
                </div>

                {/* Show success OR form */}
                {sendResult && sendResult.startsWith('SUCCESS:') ? (() => {
                  const [, blogId, batchId, countStr] = sendResult.split(':');
                  return (
                    <CampaignSuccessCard
                      blogId={blogId}
                      batchId={batchId}
                      userCount={Number(countStr)}
                      onDismiss={() => setSendResult(null)}
                    />
                  );
                })() : (
                  <>
                    {sendResult && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3.5 rounded-2xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-sm text-red-700 dark:text-red-300 flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{sendResult}</span>
                      </motion.div>
                    )}

                    <ManualCampaignForm
                      savedBlogs={savedBlogs}
                      targetUsers={targetUsers}
                      onSend={sendManualCampaign}
                      sending={isSending}
                      uploadProgress={uploadProgress}
                    />
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 border-t border-slate-200/60 dark:border-slate-700/60 px-5 py-3 bg-amber-50/80 dark:bg-amber-900/10 flex items-start gap-2.5">
                <BellRing className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong>Cloud Function required</strong> — Deploy{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">processNotificationQueue</code>{' '}
                  to dispatch FCM push notifications. Each queued doc stores{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">userId</code>,{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">blogId</code>, and{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">clickAction</code>.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
