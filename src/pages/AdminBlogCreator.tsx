import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  FileText,
  Tag,
  Loader2,
  BookOpen,
  Search,
  Eye,
  CheckCircle,
  AlertCircle,
  BellRing,
  ShieldX,
  Calendar,
  Sparkles,
  ImagePlus,
  Image as ImageIcon,
  UploadCloud,
} from 'lucide-react';
import { db, storage } from '../firebaseConfig';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { cn } from '../lib/utils';

const ADMIN_EMAIL = 'chotan4480@gmail.com';

const BLOG_CATEGORIES = [
  'General',
  'Financial Tips',
  'Savings',
  'Investment',
  'Budget',
  'Debt Management',
  'Income',
  'Tax',
  'Emergency Fund',
  'Retirement',
  'Insurance',
];

interface BlogDoc {
  id: string;
  title: string;
  blogContent: string;
  category: string;
  notificationMessage: string;
  imageUrl?: string;
  imagePrompt?: string;
  ctaText?: string;
  targetUserName?: string;
  targetProfession?: string;
  createdAt: Timestamp | null;
  status: 'draft' | 'published';
  type?: 'manual' | 'ai';
}

interface FormState {
  title: string;
  blogContent: string;
  category: string;
  notificationMessage: string;
  status: 'draft' | 'published';
  imageUrl: string;
}

const emptyForm: FormState = {
  title: '',
  blogContent: '',
  category: 'General',
  notificationMessage: '',
  status: 'published',
  imageUrl: '',
};

interface AdminBlogCreatorProps {
  currentUserEmail: string;
  onBack: () => void;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.95 }}
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-semibold',
        type === 'success'
          ? 'bg-emerald-50 dark:bg-emerald-900/80 border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
          : 'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200',
      )}
    >
      {type === 'success'
        ? <CheckCircle className="w-4 h-4 shrink-0" />
        : <AlertCircle className="w-4 h-4 shrink-0" />}
      {msg}
    </motion.div>
  );
}

// ─── Blog Form Modal ──────────────────────────────────────────────────────────
function BlogFormModal({
  editingId,
  form,
  saving,
  uploadProgress,
  imageFile,
  onChange,
  onImageChange,
  onSave,
  onClose,
}: {
  editingId: string | null;
  form: FormState;
  saving: boolean;
  uploadProgress: number | null;
  imageFile: File | null;
  onChange: (patch: Partial<FormState>) => void;
  onImageChange: (file: File | null) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const inputBase =
    'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all';

  // Local preview: new file takes priority over saved URL
  const previewSrc = imageFile
    ? URL.createObjectURL(imageFile)
    : form.imageUrl || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-[2rem] bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-indigo-600 to-violet-600 text-white shrink-0">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-white/70">
              {editingId ? 'Edit Blog Post' : 'New Blog Post'}
            </p>
            <p className="text-sm font-semibold mt-0.5">
              {editingId ? 'Update existing content' : 'Write a new post for your users'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/15 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Title *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="একটি আকর্ষণীয় শিরোনাম লিখুন…"
              className={inputBase}
            />
          </div>

          {/* Category + Status row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3" /> Category
              </label>
              <select
                value={form.category}
                onChange={(e) => onChange({ category: e.target.value })}
                className={inputBase}
              >
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Status
              </label>
              <div className="flex gap-2 pt-1">
                {(['published', 'draft'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => onChange({ status: s })}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-xs font-bold border transition-all',
                      form.status === s
                        ? s === 'published'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'bg-amber-400 border-amber-400 text-white'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-slate-400',
                    )}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Image Upload ──────────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ImagePlus className="w-3 h-3" /> Cover Image
              <span className="ml-1 normal-case font-normal text-slate-400">(optional · jpg/png/webp · max 5 MB)</span>
            </label>

            {/* Preview */}
            {previewSrc && (
              <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900">
                <img
                  src={previewSrc}
                  alt="Cover preview"
                  className="w-full h-44 object-cover"
                />
                <button
                  type="button"
                  onClick={() => { onImageChange(null); onChange({ imageUrl: '' }); }}
                  className="absolute top-2 right-2 p-1.5 rounded-xl bg-slate-900/60 hover:bg-red-600 text-white transition-all"
                  title="Remove image"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                {imageFile && (
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/60 text-white text-[10px] font-semibold">
                    <ImageIcon className="w-3 h-3" />
                    {imageFile.name.length > 28 ? imageFile.name.slice(0, 28) + '…' : imageFile.name}
                  </div>
                )}
              </div>
            )}

            {/* Upload progress */}
            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><UploadCloud className="w-3 h-3" /> Uploading…</span>
                  <span className="font-bold">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Pick / change file button */}
            {!previewSrc && (
              <label className="flex flex-col items-center justify-center gap-2 w-full h-28 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50 dark:bg-slate-900 cursor-pointer transition-all group">
                <UploadCloud className="w-7 h-7 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 transition-colors" />
                <span className="text-xs text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 font-medium transition-colors">
                  Click to choose image
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 5 * 1024 * 1024) {
                      alert('Image is too large. Maximum size is 5 MB.');
                      return;
                    }
                    onImageChange(f);
                  }}
                />
              </label>
            )}

            {/* Change button when preview exists */}
            {previewSrc && (
              <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer transition-all w-fit">
                <ImagePlus className="w-4 h-4" />
                Change image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > 5 * 1024 * 1024) {
                      alert('Image is too large. Maximum size is 5 MB.');
                      return;
                    }
                    onImageChange(f);
                  }}
                />
              </label>
            )}
          </div>

          {/* Notification Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <BellRing className="w-3 h-3" /> Notification Message
              <span className="ml-1 text-slate-400 normal-case font-normal">(push preview · max 120 chars)</span>
            </label>
            <textarea
              value={form.notificationMessage}
              onChange={(e) => onChange({ notificationMessage: e.target.value })}
              rows={2}
              maxLength={120}
              placeholder="ব্যবহারকারীর ফোনে যে বার্তাটি দেখাবে…"
              className={cn(inputBase, 'resize-none')}
            />
            <p className="text-right text-[10px] text-slate-400">
              {form.notificationMessage.length}/120
            </p>
          </div>

          {/* Blog Content */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> Blog Content *
            </label>
            <textarea
              value={form.blogContent}
              onChange={(e) => onChange({ blogContent: e.target.value })}
              rows={12}
              placeholder="এখানে ব্লগের মূল কন্টেন্ট লিখুন। প্রতিটি লাইন একটি প্যারাগ্রাফ হবে…"
              className={cn(inputBase, 'resize-y leading-relaxed')}
            />
            <p className="text-right text-[10px] text-slate-400">
              {form.blogContent.length} characters
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold transition-all disabled:opacity-60 shadow-md shadow-indigo-900/20"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" />{uploadProgress !== null ? `Uploading ${uploadProgress}%` : 'Saving…'}</>
              : <><Save className="w-4 h-4" />{editingId ? 'Update Blog' : 'Publish Blog'}</>
            }
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Blog Card ────────────────────────────────────────────────────────────────
function BlogCard({
  blog,
  deletingId,
  onEdit,
  onDelete,
  onPreview,
}: {
  blog: BlogDoc;
  deletingId: string | null;
  onEdit: (b: BlogDoc) => void;
  onDelete: (id: string) => void;
  onPreview: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDeleting = deletingId === blog.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden hover:shadow-md transition-shadow group"
    >
      {/* Cover image thumbnail */}
      {blog.imageUrl && (
        <div className="h-32 w-full overflow-hidden">
          <img
            src={blog.imageUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}
      <div className="p-5">
        {/* Top row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 mt-0.5">
            {blog.type === 'ai'
              ? <Sparkles className="w-4.5 h-4.5 text-indigo-500" />
              : <FileText className="w-4.5 h-4.5 text-indigo-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-snug line-clamp-2">
              {blog.title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-full text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                <Tag className="w-2.5 h-2.5" />
                {blog.category || 'General'}
              </span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                blog.status === 'published'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300',
              )}>
                {blog.status}
              </span>
              {blog.type === 'ai' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300">
                  AI
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content preview */}
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 mb-3 pl-12">
          {blog.blogContent || '(no content)'}
        </p>

        {/* Notification preview */}
        {blog.notificationMessage && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 mb-3">
            <BellRing className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 line-clamp-1 leading-relaxed">
              {blog.notificationMessage}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Calendar className="w-3 h-3" />
            {blog.createdAt
              ? blog.createdAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'}
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPreview(blog.id)}
              title="Preview"
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-all"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onEdit(blog)}
              title="Edit"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { onDelete(blog.id); setConfirmDelete(false); }}
                  className="px-2 py-1 rounded-lg bg-red-600 text-white text-[10px] font-bold"
                >
                  {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminBlogCreator({ currentUserEmail, onBack }: AdminBlogCreatorProps) {
  const isAdmin = currentUserEmail === ADMIN_EMAIL;

  const [blogs, setBlogs] = useState<BlogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'blogs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BlogDoc)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [isAdmin]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setImageFile(null);
    setUploadProgress(null);
    setShowForm(true);
  };

  const openEdit = (blog: BlogDoc) => {
    setEditingId(blog.id);
    setForm({
      title: blog.title || '',
      blogContent: blog.blogContent || '',
      category: blog.category || 'General',
      notificationMessage: blog.notificationMessage || '',
      status: blog.status || 'published',
      imageUrl: blog.imageUrl || '',
    });
    setImageFile(null);
    setUploadProgress(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setImageFile(null);
    setUploadProgress(null);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required.', 'error'); return; }
    if (!form.blogContent.trim()) { showToast('Blog content is required.', 'error'); return; }
    setSaving(true);
    try {
      // ── Upload new image if selected ──────────────────────────────────
      let resolvedImageUrl = form.imageUrl || '';
      if (imageFile) {
        const fileRef = storageRef(
          storage,
          `blog_images/${Date.now()}_${imageFile.name.replace(/\s+/g, '_')}`,
        );
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(fileRef, imageFile);
          task.on(
            'state_changed',
            (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
            reject,
            async () => {
              resolvedImageUrl = await getDownloadURL(task.snapshot.ref);
              setUploadProgress(null);
              resolve();
            },
          );
        });
      }

      // ── Save to Firestore ─────────────────────────────────────────────
      if (editingId) {
        await updateDoc(doc(db, 'blogs', editingId), {
          title: form.title.trim(),
          blogContent: form.blogContent.trim(),
          category: form.category,
          notificationMessage: form.notificationMessage.trim(),
          status: form.status,
          imageUrl: resolvedImageUrl,
          type: 'manual',
        });
        showToast('Blog updated successfully!');
      } else {
        await addDoc(collection(db, 'blogs'), {
          title: form.title.trim(),
          blogContent: form.blogContent.trim(),
          category: form.category,
          notificationMessage: form.notificationMessage.trim(),
          status: form.status,
          imageUrl: resolvedImageUrl,
          type: 'manual',
          createdAt: serverTimestamp(),
          targetUserIds: [],
          targetUserName: '',
          targetProfession: '',
          imagePrompt: '',
          ctaText: 'আপনার আজকের হিসাবটি লিখুন - Ay Bay Er GustiMari-তে যান',
        });
        showToast('Blog published successfully!');
      }
      closeForm();
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'blogs', id));
      showToast('Blog deleted.');
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = (id: string) => {
    window.location.hash = `/blog/${id}`;
  };

  const filteredBlogs = useMemo(() => {
    const term = search.toLowerCase();
    return blogs.filter((b) => {
      if (filterCategory !== 'all' && b.category !== filterCategory) return false;
      if (term && !b.title?.toLowerCase().includes(term) && !b.blogContent?.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [blogs, search, filterCategory]);

  const allCategories = useMemo(() => {
    const set = new Set(blogs.map((b) => b.category).filter(Boolean));
    return Array.from(set).sort();
  }, [blogs]);

  const manualCount = blogs.filter((b) => b.type !== 'ai').length;
  const aiCount = blogs.filter((b) => b.type === 'ai').length;

  // ── Access Denied ──
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-rose-900 to-slate-900 flex flex-col items-center justify-center gap-6 p-8">
        <ShieldX className="w-20 h-20 text-red-400" />
        <p className="text-red-300 font-bold text-2xl">Access Denied</p>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold rounded-2xl transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent truncate">
              Blog Manager
            </h1>
            <p className="text-xs text-slate-400 truncate">Create and manage blog posts for user re-engagement</p>
          </div>
          {/* Stats */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
              {manualCount} Manual
            </span>
            <span className="px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 border border-violet-100 dark:border-violet-800 text-[11px] font-bold text-violet-600 dark:text-violet-400">
              {aiCount} AI
            </span>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold transition-all shadow-md shadow-indigo-900/20 shrink-0"
          >
            <Plus className="w-4 h-4" /> New Blog
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search blogs by title or content…"
              className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
          >
            <option value="all">All Categories</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Blog grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading blogs…</span>
          </div>
        ) : filteredBlogs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400"
          >
            <BookOpen className="w-14 h-14" />
            <p className="text-base font-semibold">No blogs yet</p>
            <p className="text-sm">Click "New Blog" to write your first post</p>
            <button
              onClick={openCreate}
              className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all"
            >
              <Plus className="w-4 h-4" /> Write First Blog
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredBlogs.map((blog) => (
                <BlogCard
                  key={blog.id}
                  blog={blog}
                  deletingId={deletingId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onPreview={handlePreview}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Form Modal ── */}
      <AnimatePresence>
        {showForm && (
          <BlogFormModal
            editingId={editingId}
            form={form}
            saving={saving}
            uploadProgress={uploadProgress}
            imageFile={imageFile}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            onImageChange={setImageFile}
            onSave={handleSave}
            onClose={closeForm}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
