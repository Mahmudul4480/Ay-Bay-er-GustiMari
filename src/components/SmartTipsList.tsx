import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, BookOpen, ArrowRight, Sparkles, Tag, CalendarDays, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLocalization } from '../contexts/LocalizationContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { useAuth } from '../contexts/AuthContext';

interface Blog {
  id: string;
  title: string;
  blogContent: string;
  notificationMessage: string;
  imageUrl?: string;
  category?: string;
  targetCategory?: string;
  status?: string;
  targetUserIds?: string[];
  createdAt?: { toDate?: () => Date } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  Travel:             'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  Food:               'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Shopping:           'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  Education:          'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  Health:             'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Transport:          'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Utilities:          'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Entertainment:      'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
};

function categoryChipClass(cat?: string) {
  if (!cat) return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  return CATEGORY_COLORS[cat] ?? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
}

function formatDate(blog: Blog): string {
  try {
    const d = blog.createdAt?.toDate?.();
    if (!d) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function excerpt(content: string, max = 120): string {
  const clean = content.replace(/#{1,6}\s*/g, '').replace(/\*+/g, '').trim();
  return clean.length <= max ? clean : clean.slice(0, max).trimEnd() + '…';
}

interface SmartTipsListProps {
  onBack?: () => void;
}

const SmartTipsList: React.FC<SmartTipsListProps> = ({ onBack }) => {
  const { language } = useLocalization();
  const { user } = useAuth();
  const [allBlogs, setAllBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'blogs'),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAllBlogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Blog)));
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'blogs');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  // Show blog if it's public (no targetUserIds / empty array) OR targeted specifically to current user
  const blogs = useMemo(() => {
    const uid = user?.uid;
    return allBlogs.filter((b) => {
      const targets = b.targetUserIds;
      if (!targets || targets.length === 0) return true;
      return uid ? targets.includes(uid) : false;
    });
  }, [allBlogs, user?.uid]);

  const openBlog = (blog: Blog) => {
    // Use existing hash-router to show full blog page
    window.location.hash = `#/blog/${blog.id}`;
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-24">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded-full p-2 text-slate-500 transition-all hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Back"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div
            className="smart-tips-banner flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)' }}
          >
            <Lightbulb className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="neon-text-purple bg-gradient-to-r from-purple-600 to-indigo-500 bg-clip-text text-2xl font-black text-transparent sm:text-3xl">
              {language === 'bn' ? 'আর্থিক টিপস' : 'Smart Tips'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {language === 'bn'
                ? 'বিশেষজ্ঞ পরামর্শ ও আর্থিক টিপস'
                : 'Expert financial advice curated just for you'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-3xl bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && blogs.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/40 dark:bg-purple-900/10 py-20 text-center"
        >
          <div className="smart-tips-banner flex h-16 w-16 items-center justify-center rounded-3xl"
            style={{ background: 'linear-gradient(135deg,#a855f7,#6366f1)' }}>
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <p className="text-lg font-bold text-slate-600 dark:text-slate-300">
            {language === 'bn' ? 'এখনো কোনো টিপস নেই' : 'No tips yet'}
          </p>
          <p className="max-w-xs text-sm text-slate-400">
            {language === 'bn'
              ? 'শীঘ্রই আপনার জন্য পার্সোনালাইজড আর্থিক টিপস আসছে!'
              : 'Personalised financial tips tailored to your spending habits are coming soon!'}
          </p>
        </motion.div>
      )}

      {/* ── Blog grid ── */}
      {!loading && blogs.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {blogs.map((blog, idx) => {
            const category = blog.targetCategory ?? blog.category;
            const dateStr = formatDate(blog);
            return (
              <motion.article
                key={blog.id}
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22, delay: idx * 0.05 }}
                whileHover={{ y: -6, scale: 1.02, transition: { type: 'spring', stiffness: 320, damping: 22 } }}
                whileTap={{ scale: 0.98 }}
                onClick={() => openBlog(blog)}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_4px_24px_rgba(168,85,247,0.06)] transition-all hover:border-purple-300 hover:shadow-[0_8px_40px_rgba(168,85,247,0.18)] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-purple-600"
              >
                {/* Gradient top strip */}
                <div
                  className="h-1.5 w-full"
                  style={{
                    background: `linear-gradient(90deg, hsl(${(idx * 47 + 260) % 360},80%,60%), hsl(${(idx * 47 + 300) % 360},75%,65%))`,
                  }}
                />

                {/* Optional image */}
                {blog.imageUrl && (
                  <div className="h-40 w-full overflow-hidden">
                    <img
                      src={blog.imageUrl}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-3 p-5">
                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {category && (
                      <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider', categoryChipClass(category))}>
                        <Tag className="h-2.5 w-2.5" />
                        {category}
                      </span>
                    )}
                    {dateStr && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <CalendarDays className="h-2.5 w-2.5" />
                        {dateStr}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="line-clamp-2 text-base font-bold leading-snug text-slate-800 dark:text-white">
                    {blog.title}
                  </h3>

                  {/* Excerpt */}
                  <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {excerpt(blog.notificationMessage || blog.blogContent)}
                  </p>

                  {/* Read more link */}
                  <div className="flex items-center gap-1.5 text-sm font-bold text-purple-600 dark:text-purple-400">
                    <BookOpen className="h-4 w-4" />
                    <span>{language === 'bn' ? 'পড়ুন' : 'Read tip'}</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Hover neon border glow overlay */}
                <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 ring-1 ring-purple-400/50 transition-opacity duration-300 group-hover:opacity-100" />
              </motion.article>
            );
          })}
        </div>
      )}

      {/* ── Full blog modal (fallback for hash navigation) ── */}
      <AnimatePresence>
        {selectedBlog && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
              onClick={() => setSelectedBlog(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.95 }}
              className="relative w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-800"
            >
              <button
                onClick={() => setSelectedBlog(null)}
                className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
              <h2 className="pr-10 text-xl font-black text-slate-800 dark:text-white">
                {selectedBlog.title}
              </h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {selectedBlog.blogContent}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SmartTipsList;
