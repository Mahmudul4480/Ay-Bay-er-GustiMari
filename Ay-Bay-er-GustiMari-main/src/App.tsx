import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocalizationProvider, useLocalization } from './contexts/LocalizationContext';
import { loginWithGoogle, logout } from './firebaseConfig';
import { LogIn, LogOut, LayoutDashboard, CreditCard, Settings, Plus, Menu, X, Globe, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import TransactionForm from './components/TransactionForm';
import DebtTracker from './components/DebtTracker';
import SettingsPage from './components/SettingsPage';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { language, setLanguage, t } = useLocalization();
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

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
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 p-4 transition-colors overflow-hidden relative">
        {/* Background decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/40 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-gray-400/20 rounded-full blur-[120px] animate-pulse" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/30 backdrop-blur-md p-10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-white/50 max-w-md w-full text-center transition-all flex flex-col items-center justify-center gap-8"
        >
          <div className="logo-container inline-block mx-auto">
            <motion.img
              src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
              alt="Logo"
              className="w-64 h-auto object-contain cursor-pointer drop-shadow-lg"
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
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Ay Bay Er GustiMari</h1>
            <p className="text-gray-500 font-medium text-sm">Personal Finance & Debt Manager</p>
          </div>

          <button
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 py-4 px-6 rounded-2xl font-bold text-gray-800 hover:bg-gray-50 transition-all shadow-md hover:shadow-lg active:scale-95 group"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6 group-hover:scale-110 transition-transform" />
            {t('loginWithGoogle')}
          </button>

          <div className="flex justify-center gap-6 pt-2">
            <button 
              onClick={() => setLanguage('en')} 
              className={cn(
                "text-sm font-bold px-3 py-1 rounded-lg transition-all", 
                language === 'en' 
                  ? "bg-gray-200 text-gray-900" 
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              English
            </button>
            <button 
              onClick={() => setLanguage('bn')} 
              className={cn(
                "text-sm font-bold px-3 py-1 rounded-lg transition-all", 
                language === 'bn' 
                  ? "bg-gray-200 text-gray-900" 
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              বাংলা
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col md:flex-row transition-colors">
      {/* Mobile Header */}
      <header className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between sticky top-0 z-40 transition-colors">
        <div className="logo-container">
          <motion.img
            src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
            alt="Logo"
            className="w-32 h-auto object-contain cursor-pointer logo-glow"
            animate={{
              y: [0, -3, 0],
            }}
            transition={{
              duration: 3,
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
            whileTap={{ scale: 0.9 }}
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-slate-600 dark:text-slate-300">
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600 dark:text-slate-300">
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 768) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={cn(
              "fixed md:sticky top-0 left-0 h-screen w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-50 flex flex-col transition-colors",
              !isSidebarOpen && "hidden md:flex"
            )}
          >
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="logo-container">
                <motion.img
                  src="https://i.postimg.cc/K8yGqVdy/logo-png.png"
                  alt="Logo"
                  className="w-48 h-auto object-contain cursor-pointer hidden md:block logo-glow"
                  animate={{
                    y: [0, -3, 0],
                  }}
                  transition={{
                    duration: 3,
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
                  whileTap={{ scale: 0.9 }}
                />
              </div>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all hidden md:block"
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
            <nav className="flex-1 px-4 space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl font-medium transition-all",
                    activeTab === tab.id 
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  )}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              ))}
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
      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {activeTab === 'dashboard' && <Dashboard onTabChange={setActiveTab} />}
        {activeTab === 'debts' && <DebtTracker />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Floating Add Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsAddModalOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-40"
      >
        <Plus className="w-8 h-8" />
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
      <LocalizationProvider>
        <AppContent />
      </LocalizationProvider>
    </AuthProvider>
  );
}
