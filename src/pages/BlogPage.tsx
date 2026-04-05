import React, { useEffect, useState } from 'react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { ArrowLeft, Sparkles, Loader2, AlertTriangle, Share2, BookOpen } from 'lucide-react';
import { db } from '../firebaseConfig';

interface BlogDoc {
  title: string;
  notificationMessage: string;
  blogContent: string;
  imagePrompt: string;
  ctaText: string;
  targetUserName: string;
  targetProfession: string;
  createdAt: Timestamp | null;
}

interface BlogPageProps {
  blogId: string;
  onBack?: () => void;
}

// Deterministic pastel gradient from blogId seed
function seedGradient(id: string): string {
  const hash = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const gradients = [
    'from-indigo-900 via-purple-900 to-blue-900',
    'from-rose-900 via-pink-900 to-indigo-900',
    'from-emerald-900 via-teal-900 to-cyan-900',
    'from-amber-900 via-orange-900 to-rose-900',
    'from-violet-900 via-indigo-900 to-purple-900',
    'from-sky-900 via-blue-900 to-indigo-900',
  ];
  return gradients[hash % gradients.length];
}

// Build a polite image URL from the prompt using Picsum seeded by blogId
function imageUrl(blogId: string): string {
  const seed = [...blogId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `https://picsum.photos/seed/${seed}/800/420`;
}

export default function BlogPage({ blogId, onBack }: BlogPageProps) {
  const [blog, setBlog] = useState<BlogDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blogId) { setError('Invalid blog link.'); setLoading(false); return; }

    getDoc(doc(db, 'blogs', blogId))
      .then((snap) => {
        if (!snap.exists()) { setError('This blog post was not found.'); return; }
        setBlog(snap.data() as BlogDoc);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [blogId]);

  const gradient = seedGradient(blogId);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#/blog/${blogId}`;
    if (navigator.share) {
      await navigator.share({ title: blog?.title, url: shareUrl }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(shareUrl).catch(() => {});
      alert('Link copied to clipboard!');
    }
  };

  const handleCta = () => {
    // Navigate to dashboard — clear the hash
    if (onBack) { onBack(); return; }
    window.location.hash = '';
  };

  if (loading) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${gradient} flex flex-col items-center justify-center p-6 gap-4`}>
        <AlertTriangle className="w-16 h-16 text-red-300" />
        <p className="text-white text-xl font-bold text-center">{error ?? 'Unknown error'}</p>
        <button
          onClick={handleCta}
          className="mt-4 px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-2xl border border-white/30 backdrop-blur-sm transition-all"
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${gradient} relative overflow-hidden`}>
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between p-4 sm:p-6">
        <button
          onClick={handleCta}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-2xl backdrop-blur-sm transition-all active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Dashboard</span>
          <span className="sm:hidden">Back</span>
        </button>

        <div className="flex items-center gap-2">
          <img
            src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
            alt="Ay Bay Er GustiMari"
            className="h-8 w-auto object-contain"
          />
        </div>

        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-2xl backdrop-blur-sm transition-all active:scale-95"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/* Card */}
      <div className="relative z-10 max-w-2xl mx-auto px-4 pb-16 sm:px-6">
        <motion.article
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl overflow-hidden shadow-2xl"
        >
          {/* Cover image */}
          <div className="relative w-full h-52 sm:h-64 overflow-hidden">
            <img
              src={imageUrl(blogId)}
              alt={blog.imagePrompt}
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            {/* Prompt badge */}
            <div className="absolute bottom-3 left-3 right-3">
              <p className="text-white/60 text-[10px] leading-tight line-clamp-2 italic">
                🎨 {blog.imagePrompt}
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Meta */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 px-3 py-1 bg-white/15 border border-white/20 rounded-full text-white/80 text-xs font-medium">
                <BookOpen className="w-3 h-3" />
                {blog.targetProfession}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-400/20 border border-amber-400/30 rounded-full text-amber-200 text-xs font-medium">
                <Sparkles className="w-3 h-3" />
                AI Generated
              </span>
              {blog.createdAt && (
                <span className="text-white/40 text-xs ml-auto">
                  {blog.createdAt.toDate().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-white text-2xl sm:text-3xl font-extrabold leading-tight">
              {blog.title}
            </h1>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Blog content */}
            <div className="prose prose-invert max-w-none">
              {blog.blogContent.split('\n').filter(Boolean).map((para, i) => (
                <p key={i} className="text-white/85 text-base leading-relaxed mb-4 last:mb-0">
                  {para}
                </p>
              ))}
            </div>

            {/* CTA */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleCta}
              className="w-full py-4 px-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-lg rounded-2xl shadow-lg shadow-indigo-900/40 transition-all border border-white/20"
            >
              {blog.ctaText || 'হিসাব দেখতে এখানে ক্লিক করুন'}
            </motion.button>

            {/* Footer note */}
            <p className="text-center text-white/30 text-xs">
              Ay Bay Er GustiMari — আপনার পরিবারের আর্থিক হিসাব রক্ষক
            </p>
          </div>
        </motion.article>
      </div>
    </div>
  );
}
