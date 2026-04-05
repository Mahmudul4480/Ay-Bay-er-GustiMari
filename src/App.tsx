import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocalizationProvider, useLocalization } from './contexts/LocalizationContext';
import { TransactionFeedbackProvider } from './contexts/TransactionFeedbackContext';
import { TransactionsProvider } from './hooks/useTransactions';
import { MonthSelectionProvider } from './contexts/MonthSelectionContext';
import { loginWithGoogle, logout, isInAppBrowser, isConfigValid } from './firebaseConfig';
import { LogOut, LayoutDashboard, CreditCard, Settings, Plus, Menu, X, Sun, Moon, AlertTriangle, Users, ArrowLeft, Home, Megaphone, BookOpen, Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import DebtTracker from './components/DebtTracker';
import SettingsPage from './components/SettingsPage';
import Onboarding from './components/Onboarding';
import ProfessionSelector from './components/ProfessionSelector';
import AdminDashboard from './pages/AdminDashboard';
import AdminEngagement from './pages/AdminEngagement';
import AdminBlogCreator from './pages/AdminBlogCreator';
import BlogPage from './pages/BlogPage';
import SmartTipsList from './components/SmartTipsList';
import WelcomeOverlay from './components/WelcomeOverlay';
import { useFcmToken } from './hooks/useFcmToken';

const ADMIN_EMAIL = 'chotan4480@gmail.com';

function needsProfession(profile: { profession?: string } | null): boolean {
  if (!profile) return true;
  const p = profile.profession;
  return p == null || String(p).trim() === '';
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

  // Register FCM token & foreground listener
  useFcmToken();

  // Blog deep-link routing
  const { blogId, closeBlog } = useBlogRoute();
  if (blogId) {
    return <BlogPage blogId={blogId} onBack={closeBlog} />;
  }
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
  const [isMdUp, setIsMdUp] = React.useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  );

  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsMdUp(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
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

  if (loading) {
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
              src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
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

  if (userProfile && needsProfession(userProfile)) {
    return <ProfessionSelector />;
  }

  if (userProfile && !userProfile.onboardingCompleted) {
    return <Onboarding />;
  }

  const isAdminUser = user?.email === ADMIN_EMAIL && userProfile?.role === 'admin';

  const tabs: { id: string; label: string; icon: React.ElementType; neon?: boolean }[] = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'transactions', label: t('transactions'), icon: CreditCard },
    { id: 'smarttips', label: language === 'bn' ? 'আর্থিক টিপস' : 'Smart Tips', icon: Lightbulb, neon: true },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  if (isAdminUser) {
    tabs.push({ id: 'admin', label: 'Analytics', icon: Users });
    tabs.push({ id: 'engagement', label: 'Engage', icon: Megaphone });
    tabs.push({ id: 'blogcreator', label: 'Blogs', icon: BookOpen });
  }

  const goDashboard = () => {
    setActiveTab('dashboard');
    setIsSidebarOpen(false);
  };

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-slate-50 transition-colors dark:bg-slate-900 md:flex-row">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white p-3 transition-colors dark:border-slate-700 dark:bg-slate-800 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {(activeTab === 'transactions' || activeTab === 'settings') && (
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
          <button
            type="button"
            onClick={goDashboard}
            className="logo-container min-w-0 text-left"
            aria-label="Go to dashboard"
          >
            <motion.img
              src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
              alt="Ay Bay Er GustiMari"
              className="logo-glow h-auto max-h-10 w-auto max-w-[9rem] object-contain"
              animate={{
                y: [0, -3, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              whileTap={{ scale: 0.95 }}
            />
          </button>
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
              'fixed top-0 left-0 z-50 flex h-screen w-[min(16rem,85vw)] flex-col border-r border-slate-200 bg-white transition-colors dark:border-slate-700 dark:bg-slate-800 md:sticky md:flex md:w-64',
              !isSidebarOpen && 'hidden md:flex'
            )}
          >
            <div className="flex flex-col items-center gap-4 p-6">
              <button
                type="button"
                onClick={goDashboard}
                className="logo-container hidden w-full md:block"
                aria-label="Go to dashboard"
              >
                <motion.img
                  src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
                  alt="Ay Bay Er GustiMari"
                  className="logo-glow mx-auto h-auto w-48 cursor-pointer object-contain"
                  animate={{
                    y: [0, -3, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  whileTap={{ scale: 0.95 }}
                />
              </button>
              <button
                type="button"
                onClick={goDashboard}
                className="logo-container w-full md:hidden"
                aria-label="Go to dashboard"
              >
                <motion.img
                  src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
                  alt="Ay Bay Er GustiMari"
                  className="logo-glow mx-auto h-auto max-w-[10rem] cursor-pointer object-contain"
                  whileTap={{ scale: 0.95 }}
                />
              </button>
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
            <nav className="flex-1 px-4 space-y-2">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                if (tab.neon) {
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                      className={cn(
                        'smart-tips-sidebar-btn relative w-full flex items-center gap-3 p-3 rounded-xl font-bold transition-all hover:scale-[1.03] active:scale-[0.97]',
                        isActive
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.55)]'
                          : 'bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 border border-purple-200/60 dark:from-purple-950/40 dark:to-indigo-950/40 dark:text-purple-300 dark:border-purple-700/40 hover:from-purple-100 hover:to-indigo-100 dark:hover:from-purple-900/50 dark:hover:to-indigo-900/50'
                      )}
                    >
                      {/* Live ping dot */}
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
                    onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                    )}
                  >
                    <tab.icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 p-3 mb-4">
                <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-600" />
                <div className="overflow-hidden">
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

      {/* Main Content */}
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 overflow-x-hidden p-3 pb-24 sm:p-4 md:p-8 md:pb-8">
        {activeTab === 'dashboard' && <Dashboard onTabChange={setActiveTab} />}
        {activeTab === 'transactions' && <TransactionList />}
        {activeTab === 'debts' && <DebtTracker />}
        {activeTab === 'smarttips' && <SmartTipsList onBack={() => setActiveTab('dashboard')} />}
        {activeTab === 'settings' && <SettingsPage />}
        {activeTab === 'admin' && isAdminUser && <AdminDashboard onBack={() => setActiveTab('dashboard')} />}
        {activeTab === 'engagement' && isAdminUser && (
          <AdminEngagement
            currentUserEmail={user?.email ?? ''}
            onBack={() => setActiveTab('dashboard')}
          />
        )}
        {activeTab === 'blogcreator' && isAdminUser && (
          <AdminBlogCreator
            currentUserEmail={user?.email ?? ''}
            onBack={() => setActiveTab('dashboard')}
          />
        )}
      </main>

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
