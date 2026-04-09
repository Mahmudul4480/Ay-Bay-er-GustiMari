import React from 'react';
import { AuthProvider, useAuth, isOnboardingComplete } from './contexts/AuthContext';
import { LocalizationProvider, useLocalization } from './contexts/LocalizationContext';
import { TransactionFeedbackProvider } from './contexts/TransactionFeedbackContext';
import { TransactionsProvider } from './hooks/useTransactions';
import { MonthSelectionProvider } from './contexts/MonthSelectionContext';
import { loginWithGoogle, logout, isInAppBrowser, isConfigValid } from './firebaseConfig';
import { LogOut, LayoutDashboard, CreditCard, Settings, Plus, Menu, X, Sun, Moon, AlertTriangle, ArrowLeft, Home, BookOpen, Lightbulb, Users, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import DebtTracker from './components/DebtTracker';
import SettingsPage from './components/SettingsPage';
import Onboarding from './components/Onboarding';
import CollectPhonePrompt from './components/CollectPhonePrompt';
import ProfessionSelector from './components/ProfessionSelector';
import AdminDashboard from './pages/AdminDashboard';
import AdminBlogCreator from './pages/AdminBlogCreator';
import BlogPage from './pages/BlogPage';
import SmartTipsList from './components/SmartTipsList';
import WelcomeOverlay from './components/WelcomeOverlay';
import { useNotifications } from './hooks/useNotifications';
import { useWelcomeBack } from './hooks/useWelcomeBack';
import NotificationBar from './components/NotificationBar';
import { usePeerBenchmarkInsight, peerSidebarSubtitle } from './hooks/usePeerBenchmarkInsight';
import { usePWA } from './hooks/usePWA';

const ADMIN_EMAIL = 'chotan4480@gmail.com';
const FORCE_RELOGIN_NOTICE_KEY = 'force-relogin-notice';
const APP_LOGO_URL = 'https://i.postimg.cc/K8yGqVdy/logo-png.png';

function needsProfession(profile: { profession?: string } | null): boolean {
  if (!profile) return false;
  const p = profile.profession;
  return p == null || String(p).trim() === '';
}

/** Onboarding সম্পন্ন কিন্তু ফায়ারস্টোরে ফোন নেই (পুরনো বাগ / খালি ঐচ্ছিক ছেড়ে দেওয়া) */
function needsPhoneNumber(
  profile: { onboardingCompleted?: boolean; onboardingComplete?: boolean; phoneNumber?: string | null } | null
): boolean {
  if (!isOnboardingComplete(profile)) return false;
  return !String(profile.phoneNumber ?? '').trim();
}

// ── Hash-based blog routing ──────────────────────────────────────────────────
function useBlogRoute() {
  const [blogId, setBlogId] = React.useState<string | null>(() => {
    const hash = window.location.hash; // e.g. "#/blog/abc123"
    const match = hash.match(/^#\/blog\/([^/?#]+)/);
    return match ? match[1] : null;
  });

  React.useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#\/blog\/([^/?#]+)/);
      setBlogId(match ? match[1] : null);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const closeBlog = () => {
    window.location.hash = '';
    setBlogId(null);
  };

  return { blogId, closeBlog };
}

const AppContent: React.FC = () => {
  const { user, loading, userProfile } = useAuth();
  const { language, setLanguage, t } = useLocalization();
  const [activeTab, setActiveTab] = React.useState('dashboard');

  const isAdminUser =
    !!user && user.email === ADMIN_EMAIL && userProfile?.role === 'admin';

  // Register SW, request permission, get FCM token, save to Firestore, foreground listener
  useNotifications(user?.uid);
  // Welcome-back in-app notification + lastActive (no modal — bell dropdown only)
  useWelcomeBack(user?.uid);

  // Blog deep-link routing
  const { blogId, closeBlog } = useBlogRoute();

  // ── All hooks must be declared before any conditional return ──
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [loginNotice, setLoginNotice] = React.useState<string | null>(null);
  const [isMdUp, setIsMdUp] = React.useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  );

  const peerInsight = usePeerBenchmarkInsight();
  const pwaInstall = usePWA();

  const goDashboardFromPeerNav = React.useCallback(() => {
    setActiveTab('dashboard');
    setIsSidebarOpen(false);
  }, []);

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsMdUp(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const notice = sessionStorage.getItem(FORCE_RELOGIN_NOTICE_KEY);
    if (!notice) return;
    setLoginNotice(notice);
    sessionStorage.removeItem(FORCE_RELOGIN_NOTICE_KEY);
  }, []);

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  if (loading || (user && userProfile === null)) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    const isAppBrowser = isInAppBrowser();
    
    const handleLogin = async () => {
      setLoginError(null);
      try {
        await loginWithGoogle();
      } catch (error: any) {
        console.error("Login failed:", error);
        let message = "Login failed. Please try again.";
        if (error.code === 'auth/popup-blocked') {
          message = "Popup was blocked by your browser. Please allow popups for this site.";
        } else if (error.code === 'auth/unauthorized-domain') {
          const currentDomain = window.location.hostname;
          message = `unauthorized-domain:${currentDomain}`;
        } else if (error.message) {
          message = error.message;
        }
        setLoginError(message);
      }
    };

    const isUnauthorizedDomain = loginError?.startsWith('unauthorized-domain:');
    const domainToAuthorize = isUnauthorizedDomain ? loginError.split(':')[1] : null;
    
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-800 to-slate-900 p-4 transition-colors overflow-hidden relative">
        {/* Background decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/10 backdrop-blur-xl p-10 rounded-[2.5rem] shadow-2xl border border-white/20 max-w-md w-full text-center transition-all flex flex-col items-center justify-center gap-8"
        >
          <div className="logo-container inline-block mx-auto">
            <motion.img
              src={APP_LOGO_URL}
              alt="Logo"
              className="w-64 h-auto object-contain cursor-pointer drop-shadow-2xl brightness-110"
              animate={{
                y: [0, -5, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              whileHover={{
                rotate: [0, -5, 5, -5, 5, 0],
                transition: {
                  duration: 0.2,
                  repeat: Infinity
                }
              }}
              whileTap={{ scale: 0.95 }}
            />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight drop-shadow-sm">
              {t('appName')}
            </h1>
            <p className="text-slate-300 font-medium text-sm">Personal Finance & Debt Manager</p>
          </div>

          {loginError && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/20 border border-red-500/30 p-4 rounded-2xl flex items-start gap-3 text-left w-full"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-xs font-bold text-red-100">Login Error</p>
                {isUnauthorizedDomain ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-red-200 leading-relaxed">
                      This domain is not authorized in your Firebase Console. Please add it to the "Authorized domains" list.
                    </p>
                    <div className="flex items-center gap-2 bg-black/20 p-2 rounded-lg border border-white/10">
                      <code className="text-[10px] text-white flex-1 truncate">{domainToAuthorize}</code>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(domainToAuthorize || '');
                          alert('Domain copied! Now add it to Firebase Console.');
                        }}
                        className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-2 py-1 rounded font-bold transition-all"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-red-200 leading-relaxed">
                    {loginError}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {loginNotice && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-blue-500/20 border border-blue-500/30 p-4 rounded-2xl flex items-start gap-3 text-left w-full"
            >
              <AlertTriangle className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-100 leading-relaxed">
                {loginNotice}
              </p>
            </motion.div>
          )}

          {!isConfigValid && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/20 border border-red-500/30 p-4 rounded-2xl flex items-start gap-3 text-left"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-red-100">Configuration Missing</p>
                <p className="text-[10px] text-red-200 leading-relaxed">
                  Firebase environment variables are not set. Please configure them in the Settings menu to enable login.
                </p>
              </div>
            </motion.div>
          )}

          <button
            onClick={handleLogin}
            disabled={!isConfigValid}
            className={cn(
              "w-full flex items-center justify-center gap-3 bg-white/90 backdrop-blur-sm border border-white/20 py-4 px-6 rounded-2xl font-bold text-slate-900 transition-all shadow-md active:scale-95 group",
              !isConfigValid ? "opacity-50 cursor-not-allowed" : "hover:bg-white hover:shadow-lg"
            )}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 group-hover:scale-110 transition-transform" />
            {t('loginWithGoogle')}
          </button>

          {isAppBrowser && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-amber-500/20 border border-amber-500/30 p-4 rounded-2xl flex items-start gap-3 text-left"
            >
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-100 leading-relaxed">
                {language === 'bn' 
                  ? 'একটি নিরবচ্ছিন্ন লগইনের জন্য, অনুগ্রহ করে আপনার ফোনের ডিফল্ট ব্রাউজারে (Chrome/Safari) এই লিংকটি ওপেন করুন (উপরে ডানদিকে ৩-ডট মেনুর মাধ্যমে)।' 
                  : 'For a seamless login, please open this link in your default browser (Chrome/Safari) via the 3-dot menu.'}
              </p>
            </motion.div>
          )}

          <div className="flex justify-center gap-6 pt-2">
            <button 
              onClick={() => setLanguage('en')} 
              className={cn(
                "text-sm font-bold px-4 py-2 rounded-xl transition-all", 
                language === 'en' 
                  ? "bg-white/20 text-white shadow-lg border border-white/30" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              English
            </button>
            <button 
              onClick={() => setLanguage('bn')} 
              className={cn(
                "text-sm font-bold px-4 py-2 rounded-xl transition-all", 
                language === 'bn' 
                  ? "bg-white/20 text-white shadow-lg border border-white/30" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              বাংলা
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Blog deep-link — only after auth is confirmed, so Firestore rules pass
  if (blogId) {
    return <BlogPage blogId={blogId} onBack={closeBlog} />;
  }

  if (userProfile && needsProfession(userProfile)) {
    return <ProfessionSelector />;
  }

  if (userProfile && !isOnboardingComplete(userProfile)) {
    return <Onboarding />;
  }

  if (userProfile && needsPhoneNumber(userProfile)) {
    return <CollectPhonePrompt />;
  }

  type SidebarTab = { id: string; label: string; icon: React.ElementType; neon?: 'tips' | 'peer' };

  const personalTabs: SidebarTab[] = [
    {
      id: 'dashboard',
      label: language === 'bn' ? t('dashboard') : 'Dashboard (Personal)',
      icon: LayoutDashboard,
    },
    { id: 'transactions', label: t('transactions'), icon: CreditCard },
    {
      id: 'peercomparison',
      label: language === 'bn' ? 'সমকক্ষ তুলনা (বেনামী)' : 'Peer comparison (anonymous)',
      icon: BarChart3,
      neon: 'peer',
    },
    {
      id: 'smarttips',
      label: language === 'bn' ? 'আর্থিক টিপস' : 'Smart Tips',
      icon: Lightbulb,
      neon: 'tips',
    },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  const adminTabs: SidebarTab[] = isAdminUser
    ? [
        { id: 'admin', label: 'Admin Dashboard', icon: Users },
        { id: 'blogcreator', label: 'Blogs', icon: BookOpen },
      ]
    : [];

  const goDashboard = () => {
    setActiveTab('dashboard');
    setIsSidebarOpen(false);
  };

  const renderSidebarTab = (tab: SidebarTab) => {
    const isActive = activeTab === tab.id;
    if (tab.neon === 'peer') {
      return (
        <button
          key={tab.id}
          type="button"
          onClick={goDashboardFromPeerNav}
          title={peerSidebarSubtitle(
            language === 'bn' ? 'bn' : 'en',
            peerInsight.peerSpendTone,
            peerInsight.avgPeerSpend,
            peerInsight.peerSpendN,
          )}
          className={cn(
            'peer-comparison-sidebar-btn relative flex w-full items-center gap-3 rounded-xl border border-emerald-200/70 p-3 font-bold transition-all hover:scale-[1.03] active:scale-[0.97]',
            'bg-gradient-to-r from-emerald-50 to-cyan-50 text-emerald-900',
            'dark:border-emerald-600/45 dark:from-emerald-950/45 dark:to-cyan-950/35 dark:text-emerald-100',
            'hover:from-emerald-100 hover:to-cyan-100 dark:hover:from-emerald-900/55 dark:hover:to-cyan-900/45'
          )}
          aria-label={tab.label}
        >
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-55" />
            <tab.icon className="relative h-5 w-5 text-emerald-600 dark:text-emerald-300" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-100">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            {language === 'bn' ? 'লাইভ' : 'LIVE'}
          </span>
        </button>
      );
    }
    if (tab.neon === 'tips') {
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => {
            setActiveTab(tab.id);
            setIsSidebarOpen(false);
          }}
          className={cn(
            'smart-tips-sidebar-btn relative w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all hover:scale-[1.03] active:scale-[0.97]',
            isActive
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.55)]'
              : 'bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 border border-purple-200/60 dark:from-purple-950/40 dark:to-indigo-950/40 dark:text-purple-300 dark:border-purple-700/40 hover:from-purple-100 hover:to-indigo-100 dark:hover:from-purple-900/50 dark:hover:to-indigo-900/50'
          )}
        >
          <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-purple-400 opacity-60" />
            <tab.icon className="relative h-5 w-5" />
          </span>
          <span>{tab.label}</span>
          {!isActive && (
            <span className="ml-auto rounded-full bg-purple-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
              NEW
            </span>
          )}
        </button>
      );
    }
    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => {
          setActiveTab(tab.id);
          setIsSidebarOpen(false);
        }}
        className={cn(
          'w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all',
          isActive
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
        )}
      >
        <tab.icon className="w-5 h-5 shrink-0" />
        <span className="text-left">{tab.label}</span>
      </button>
    );
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-slate-50 transition-colors dark:bg-slate-900 md:flex-row">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white p-3 transition-colors dark:border-slate-700 dark:bg-slate-800 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {(activeTab === 'transactions' || activeTab === 'settings' || activeTab === 'smarttips') && (
            <button
              type="button"
              onClick={goDashboard}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-700 transition-all active:scale-95 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              <Home className="h-4 w-4" />
            </button>
          )}
          <motion.button
            type="button"
            onClick={goDashboard}
            className="sidebar-brand-hit min-w-0 shrink-0 text-left"
            aria-label="Go to dashboard"
            whileTap={{ scale: 0.94 }}
          >
            <img
              src={APP_LOGO_URL}
              alt="Ay Bay Er GustiMari"
              className="sidebar-logo-neon h-auto max-h-10 w-auto max-w-[9rem] object-contain"
              decoding="async"
            />
          </motion.button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="flex items-center gap-2 p-2 px-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all border border-slate-200 dark:border-slate-600 shadow-sm active:scale-95"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-blue-600" />}
            <span className="text-xs font-bold hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
          </button>
          <NotificationBar userId={user.uid} />
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600 dark:text-slate-300">
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isSidebarOpen && !isMdUp && (
          <motion.button
            type="button"
            key="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden"
            aria-label="Close menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || isMdUp) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={cn(
              'fixed top-0 left-0 z-50 flex h-screen w-[min(17rem,88vw)] flex-col border-r border-slate-200 bg-white transition-colors dark:border-slate-700 dark:bg-slate-800 md:sticky md:flex md:w-[17rem]',
              !isSidebarOpen && 'hidden md:flex'
            )}
          >
            <div className="flex flex-col items-stretch gap-4 px-4 pt-5 pb-4 md:px-5">
              <div className="flex w-full justify-center border-b border-slate-200/90 pb-5 dark:border-slate-600/80">
                <motion.button
                  type="button"
                  onClick={goDashboard}
                  className="sidebar-brand-hit flex w-full max-w-[15rem] cursor-pointer flex-col items-center justify-center rounded-2xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-800 md:max-w-[16.5rem]"
                  aria-label="Go to dashboard"
                  whileTap={{ scale: 0.96 }}
                >
                  <img
                    src={APP_LOGO_URL}
                    alt="Ay Bay Er GustiMari"
                    width={220}
                    height={80}
                    className="sidebar-logo-neon pointer-events-none mx-auto h-auto max-h-[7.5rem] w-full object-contain md:max-h-[8.5rem]"
                    decoding="async"
                  />
                </motion.button>
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="w-full flex items-center justify-between gap-3 p-3 px-4 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all border border-slate-100 dark:border-slate-700 shadow-sm group"
              >
                <div className="flex items-center gap-3">
                  {isDarkMode ? <Sun className="w-5 h-5 text-amber-500 group-hover:rotate-45 transition-transform" /> : <Moon className="w-5 h-5 text-blue-600 group-hover:-rotate-12 transition-transform" />}
                  <span className="font-bold text-sm">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full relative transition-colors duration-300",
                  isDarkMode ? "bg-blue-600" : "bg-slate-300"
                )}>
                  <div className={cn(
                    "absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300",
                    isDarkMode ? "left-6" : "left-1"
                  )} />
                </div>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 pb-2">
              <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {language === 'bn' ? 'ব্যক্তিগত' : 'Personal'}
              </p>
              <div className="space-y-2">{personalTabs.map(renderSidebarTab)}</div>

              {isAdminUser && adminTabs.length > 0 && (
                <>
                  <div className="my-3 border-t border-slate-100 dark:border-slate-700" aria-hidden />
                  <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                    {language === 'bn' ? 'অ্যাডমিন' : 'Admin control'}
                  </p>
                  <div className="space-y-2">{adminTabs.map(renderSidebarTab)}</div>
                </>
              )}
            </nav>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 p-3 mb-4">
                <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-600" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-medium transition-all"
              >
                <LogOut className="w-5 h-5" />
                {t('logout')}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop main area: sticky header + scrollable content */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Desktop-only top header — hidden on mobile (mobile already has its own header) */}
        <div className="hidden md:flex sticky top-0 z-40 items-center justify-between border-b border-slate-200 bg-white px-6 py-3 transition-colors dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-semibold capitalize text-slate-500 dark:text-slate-400">
            {activeTab === 'dashboard'
              ? language === 'bn'
                ? t('dashboard')
                : 'Dashboard (Personal)'
              : activeTab === 'transactions'
                ? t('transactions')
                : activeTab === 'smarttips'
                  ? language === 'bn'
                    ? 'আর্থিক টিপস'
                    : 'Smart Tips'
                  : activeTab === 'settings'
                    ? t('settings')
                    : activeTab === 'admin'
                      ? 'Admin Dashboard'
                      : activeTab === 'blogcreator'
                        ? 'Blogs'
                        : activeTab}
          </p>
          <NotificationBar userId={user.uid} />
        </div>

        {/* Main Content */}
        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 overflow-x-hidden p-3 pb-24 sm:p-4 md:p-8 md:pb-8">
          {activeTab === 'dashboard' && (
            <Dashboard onTabChange={setActiveTab} pwaInstall={pwaInstall} />
          )}
        {activeTab === 'transactions' && <TransactionList />}
        {activeTab === 'debts' && <DebtTracker />}
        {activeTab === 'smarttips' && <SmartTipsList onBack={() => setActiveTab('dashboard')} />}
        {activeTab === 'settings' && <SettingsPage />}
        {activeTab === 'admin' && isAdminUser && <AdminDashboard onBack={() => setActiveTab('dashboard')} />}
        {activeTab === 'blogcreator' && isAdminUser && (
          <AdminBlogCreator
            currentUserEmail={user?.email ?? ''}
            onBack={() => setActiveTab('admin')}
          />
        )}
        </main>
      </div>{/* end desktop main wrapper */}

      {/* Floating Add Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsAddModalOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg sm:bottom-8 sm:right-8 sm:h-16 sm:w-16"
        aria-label="Add transaction"
      >
        <Plus className="h-7 w-7 sm:h-8 sm:w-8" />
      </motion.button>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <TransactionForm onClose={() => setIsAddModalOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WelcomeOverlay />
      <LocalizationProvider>
        <TransactionFeedbackProvider>
          <MonthSelectionProvider>
            <TransactionsProvider>
              <AppContent />
            </TransactionsProvider>
          </MonthSelectionProvider>
        </TransactionFeedbackProvider>
      </LocalizationProvider>
    </AuthProvider>
  );
}
