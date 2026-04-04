import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization, translations } from '../contexts/LocalizationContext';
import { useTransactions, FixedFinance } from '../hooks/useTransactions';
import { db } from '../firebaseConfig';
import { doc, updateDoc, collection, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion } from 'motion/react';
import { Download, Upload, FileText, Save, Globe, Shield, Bell, AlertCircle, User, X, Plus } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { convertBengaliToAscii, sanitizeDecimal, sanitizeInteger } from '../lib/numberUtils';
import {
  buildGroupedTransactionRows,
  embedAnekBanglaFont,
  escapeHtml,
} from '../lib/pdfStatement';

const SettingsPage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { language, setLanguage, t } = useLocalization();
  const { transactions = [], debts = [], fixedFinances = [] } = useTransactions();

  const fixedIncomeItems = useMemo(
    () =>
      fixedFinances
        .filter((f) => (f.type ?? 'expense') === 'income')
        .sort((a, b) => (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0)),
    [fixedFinances]
  );

  const fixedExpenseItems = useMemo(
    () =>
      fixedFinances
        .filter((f) => (f.type ?? 'expense') !== 'income')
        .sort((a, b) => (a.dayOfMonth ?? 0) - (b.dayOfMonth ?? 0)),
    [fixedFinances]
  );

  const renderFixedCard = (fixed: FixedFinance) => (
    <div
      key={fixed.id}
      className={cn(
        'group relative cursor-pointer rounded-2xl border p-6 transition-all hover:border-blue-200 dark:hover:border-blue-800',
        (fixed.type ?? 'expense') === 'income'
          ? 'border-green-200/90 bg-gradient-to-br from-green-50/90 to-white dark:border-green-800/50 dark:from-green-950/30 dark:to-slate-900'
          : 'border-red-200/90 bg-gradient-to-br from-red-50/90 to-white dark:border-red-800/50 dark:from-red-950/25 dark:to-slate-900'
      )}
      onClick={() => openEditFixed(fixed)}
    >
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          setConfirmModal({
            title: t('delete'),
            message: t('confirmDelete'),
            onConfirm: async () => {
              try {
                await deleteDoc(doc(db, 'fixedFinances', fixed.id));
              } catch (error) {
                handleFirestoreError(error, OperationType.DELETE, `fixedFinances/${fixed.id}`);
              }
              setConfirmModal(null);
            },
          });
        }}
        className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full p-0 text-slate-400 opacity-0 transition-all hover:bg-slate-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-slate-700"
        aria-label={t('delete')}
      >
        <X className="h-4 w-4 pointer-events-none" />
      </button>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            'rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
            (fixed.type ?? 'expense') === 'income'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          )}
        >
          {t((fixed.type ?? 'expense') === 'income' ? 'income' : 'expense')}
        </span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {t('dayOfMonth')}: {fixed.dayOfMonth}
        </span>
      </div>
      <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100">{fixed.category}</h4>
      <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
        {formatCurrency(fixed.amount, language)}
      </p>
      {fixed.description && (
        <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{fixed.description}</p>
      )}
    </div>
  );
  const [budgetLimit, setBudgetLimit] = useState(userProfile?.budgetLimit || 0);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingFixed, setIsAddingFixed] = useState(false);
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ type: 'income' | 'expense', oldName: string, newName: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null);
  const [alertModal, setAlertModal] = useState<{ title: string, message: string } | null>(null);
  const [fixedForm, setFixedForm] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '',
    description: '',
    dayOfMonth: '1'
  });

  const [newMemberInput, setNewMemberInput] = useState('');
  const [newIncomeCategoryInput, setNewIncomeCategoryInput] = useState('');
  const [newExpenseCategoryInput, setNewExpenseCategoryInput] = useState('');

  const handleAddMember = async () => {
    const trimmed = newMemberInput.trim();
    if (!trimmed || !user) return;
    
    const currentMembers = userProfile?.familyMembers || [];
    if (!currentMembers.includes(trimmed)) {
      const updated = [...currentMembers, trimmed];
      try {
        await updateDoc(doc(db, 'users', user.uid), { familyMembers: updated });
        setNewMemberInput('');
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    } else {
      setAlertModal({ title: t('info'), message: t('memberExists') || 'Member already exists' });
    }
  };

  const handleRemoveMember = async (member: string) => {
    if (!user || !userProfile?.familyMembers) return;
    
    setConfirmModal({
      title: t('removeMember') || 'Remove Family Member',
      message: `Are you sure you want to remove ${member}?`,
      onConfirm: async () => {
        const updated = userProfile.familyMembers.filter((m: string) => m !== member);
        try {
          await updateDoc(doc(db, 'users', user.uid), { familyMembers: updated });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        }
        setConfirmModal(null);
      }
    });
  };

  const handleAddCategory = async (type: 'income' | 'expense') => {
    const input = type === 'income' ? newIncomeCategoryInput : newExpenseCategoryInput;
    const field = type === 'income' ? 'incomeCategories' : 'expenseCategories';
    
    if (!user || !userProfile) {
      setAlertModal({ title: t('error'), message: t('profileLoading') });
      return;
    }

    if (input && input.trim()) {
      const trimmedInput = input.trim();
      const currentCategories = userProfile[field] || [];
      
      if (!currentCategories.map((c: string) => c.toLowerCase()).includes(trimmedInput.toLowerCase())) {
        const updated = [...currentCategories, trimmedInput];
        try {
          await updateDoc(doc(db, 'users', user.uid), { [field]: updated });
          if (type === 'income') setNewIncomeCategoryInput('');
          else setNewExpenseCategoryInput('');
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        }
      } else {
        setAlertModal({ title: t('info'), message: t('categoryExists') });
      }
    }
  };

  const handleEditCategory = async () => {
    if (!user || !userProfile || !editingCategory || !editingCategory.newName.trim()) return;
    try {
      const field = editingCategory.type === 'income' ? 'incomeCategories' : 'expenseCategories';
      const currentCategories = userProfile[field] || [];
      const updated = currentCategories.map((c: string) => 
        c === editingCategory.oldName ? editingCategory.newName.trim() : c
      );
      try {
        await updateDoc(doc(db, 'users', user.uid), { [field]: updated });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
      setEditingCategory(null);
    } catch (error) {
      console.error('Error editing category:', error);
    }
  };

  const handleAddFixed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile) return;
    
    const amountNum = parseFloat(fixedForm.amount);
    const dayNum = parseInt(fixedForm.dayOfMonth);
    
    if (isNaN(amountNum) || amountNum <= 0) {
      setAlertModal({ title: t('error'), message: 'Please enter a valid amount' });
      return;
    }
    
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      setAlertModal({ title: t('error'), message: 'Please enter a valid day of month (1-31)' });
      return;
    }

    if (!fixedForm.category) {
      setAlertModal({ title: t('error'), message: 'Please select a category' });
      return;
    }

    try {
      const data = {
        userId: user.uid,
        amount: amountNum,
        type: fixedForm.type,
        category: fixedForm.category,
        description: fixedForm.description,
        dayOfMonth: dayNum,
        updatedAt: serverTimestamp()
      };

      if (editingFixedId) {
        try {
          await updateDoc(doc(db, 'fixedFinances', editingFixedId), data);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `fixedFinances/${editingFixedId}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'fixedFinances'), {
            ...data,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'fixedFinances');
        }
      }
      
      setIsAddingFixed(false);
      setEditingFixedId(null);
      setFixedForm({ amount: '', type: 'expense', category: '', description: '', dayOfMonth: '1' });
    } catch (error) {
      console.error('Error saving fixed finance:', error);
    }
  };

  const openEditFixed = (fixed: any) => {
    setEditingFixedId(fixed.id);
    setFixedForm({
      amount: fixed.amount.toString(),
      type: fixed.type,
      category: fixed.category,
      description: fixed.description || '',
      dayOfMonth: fixed.dayOfMonth.toString()
    });
    setIsAddingFixed(true);
  };

  const handleSaveBudget = async () => {
    if (!user || !userProfile) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { budgetLimit: parseFloat(budgetLimit.toString()) });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  const exportData = () => {
    const data = {
      transactions,
      debts,
      exportDate: new Date().toISOString(),
      user: user?.email,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amar-hisab-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setConfirmModal({
          title: t('restoreData'),
          message: 'This will import all records from the file. Continue?',
          onConfirm: async () => {
            // Import transactions
            for (const tx of data.transactions || []) {
              try {
                await addDoc(collection(db, 'transactions'), {
                  ...tx,
                  userId: user.uid,
                  date: tx.date?.seconds ? new Date(tx.date.seconds * 1000) : new Date(),
                  createdAt: serverTimestamp(),
                });
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, 'transactions');
              }
            }
            // Import debts
            for (const debt of data.debts || []) {
              try {
                await addDoc(collection(db, 'debts'), {
                  ...debt,
                  userId: user.uid,
                  dueDate: debt.dueDate?.seconds ? new Date(debt.dueDate.seconds * 1000) : new Date(),
                  createdAt: serverTimestamp(),
                });
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, 'debts');
              }
            }
            setConfirmModal(null);
            setAlertModal({ title: 'Success', message: 'Data imported successfully!' });
          }
        });
      } catch (error) {
        console.error('Error importing data:', error);
        setAlertModal({ title: 'Error', message: 'Invalid backup file.' });
      }
    };
    reader.readAsText(file);
  };

  const generatePDF = async () => {
    const doc = new jsPDF() as any;

    const hasAnek = await embedAnekBanglaFont(doc);
    const pdfFont = hasAnek ? 'AnekBangla' : 'helvetica';
    doc.setFont(pdfFont, 'normal');

    const appTitleEn = translations.appName.en;
    const appTitleBn = translations.appName.bn;

    const headerEl = document.createElement('div');
    headerEl.style.position = 'absolute';
    headerEl.style.left = '-9999px';
    headerEl.style.top = '-9999px';
    headerEl.style.width = '720px';
    headerEl.style.boxSizing = 'border-box';
    headerEl.style.padding = '28px 32px';
    headerEl.style.backgroundColor = '#ffffff';

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@400;600;700&subset=bengali,latin&display=swap';
    headerEl.appendChild(fontLink);

    const wrap = document.createElement('div');
    wrap.style.fontFamily = '"Anek Bangla", system-ui, sans-serif';
    wrap.style.color = '#0f172a';
    wrap.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #3b82f6; padding-bottom: 16px;">
        <div style="flex-shrink: 0; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border-radius: 12px;">
          <img crossorigin="anonymous" src="https://i.postimg.cc/K8yGqVdy/logo-png.png" alt=""
            style="display: block; max-width: 52px; max-height: 52px; width: auto; height: auto; object-fit: contain;" />
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 17px; font-weight: 700; letter-spacing: -0.04em; word-spacing: 0; margin: 0; line-height: 1.12; color: #0f172a;">
            ${escapeHtml(appTitleEn)}
          </div>
          <div style="font-size: 19px; font-weight: 600; margin: 4px 0 0 0; line-height: 1.2; color: #1e293b;">
            ${escapeHtml(appTitleBn)}
          </div>
          <p style="font-size: 12px; color: #64748b; margin: 6px 0 0 0; letter-spacing: 0;">
            ${escapeHtml(t('pdfStatementTitle'))}
          </p>
        </div>
      </div>
      <div style="margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 13px; color: #475569;">
        <div><strong>User:</strong> ${escapeHtml(userProfile?.displayName || user?.displayName || '')}</div>
        <div><strong>Date:</strong> ${escapeHtml(new Date().toLocaleDateString())}</div>
        <div><strong>Mobile:</strong> ${escapeHtml(userProfile?.phoneNumber || 'N/A')}</div>
        <div><strong>Email:</strong> ${escapeHtml(userProfile?.email || user?.email || '')}</div>
      </div>
    `;
    headerEl.appendChild(wrap);

    document.body.appendChild(headerEl);

    await new Promise<void>((resolve) => {
      if (fontLink.sheet) resolve();
      else {
        fontLink.onload = () => resolve();
        fontLink.onerror = () => resolve();
        setTimeout(resolve, 2500);
      }
    });
    try {
      await document.fonts.ready;
      await document.fonts.load('16px "Anek Bangla"');
    } catch {
      /* ignore */
    }

    const logoImg = headerEl.querySelector('img');
    if (logoImg) {
      await new Promise<void>((resolve) => {
        if (logoImg.complete) resolve();
        else {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => resolve();
        }
      });
    }

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(headerEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styles.forEach((s) => {
            const isGoogleFont =
              s.tagName === 'LINK' &&
              (s as HTMLLinkElement).href?.includes('fonts.googleapis.com');
            if (!isGoogleFont) {
              s.remove();
            }
          });
        },
      });
      const imgData = canvas.toDataURL('image/png');

      const pageW = doc.internal.pageSize.getWidth();
      const marginX = 14;
      const maxImgW = pageW - marginX * 2;
      const imgWidth = maxImgW;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      doc.addImage(imgData, 'PNG', marginX, 10, imgWidth, imgHeight);

      const tableBody = buildGroupedTransactionRows(transactions, t);

      autoTable(doc, {
        startY: 12 + imgHeight + 8,
        margin: { left: marginX, right: marginX },
        head: [
          [
            t('date'),
            t('category'),
            t('typeCol'),
            t('amount'),
            t('noteAndMember'),
          ],
        ],
        body: tableBody,
        headStyles: {
          fillColor: [59, 130, 246],
          font: pdfFont,
          fontStyle: 'bold',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        styles: {
          font: pdfFont,
          fontSize: 9,
          cellPadding: 3,
        },
        columnStyles: {
          0: { cellWidth: 28 },
          3: { halign: 'right' },
        },
      });

      doc.save(`amar-hisab-report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      document.body.removeChild(headerEl);
    }
  };

  const resetOnboarding = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { onboardingCompleted: false });
      window.location.reload();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white">{t('settings')}</h2>
        <button
          onClick={resetOnboarding}
          className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-lg hover:bg-red-100 hover:text-red-600 transition-all"
        >
          Reset Onboarding (Test)
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Language & Profile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-6 h-6 text-blue-600" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('language')}</h3>
          </div>
          <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-2xl">
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                "flex-1 py-3 rounded-xl font-semibold transition-all",
                language === 'en' ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
              )}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('bn')}
              className={cn(
                "flex-1 py-3 rounded-xl font-semibold transition-all",
                language === 'bn' ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
              )}
            >
              বাংলা
            </button>
          </div>
        </motion.div>

        {/* Budgeting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('budgetLimit')}</h3>
          </div>
          <div className="space-y-4">
            <input
              type="text"
              inputMode="decimal"
              value={budgetLimit}
              onChange={(e) => {
                const val = e.target.value;
                const sanitized = sanitizeDecimal(val);
                console.log('Budget Limit Input:', { val, sanitized });
                setBudgetLimit(sanitized);
              }}
              placeholder="Enter monthly limit"
              className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
            />
            <button
              onClick={handleSaveBudget}
              disabled={isSaving}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              {t('save')}
            </button>
          </div>
        </motion.div>

        {/* Backup & Restore */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-green-600" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('backupData')}</h3>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <button
              onClick={exportData}
              className="w-full py-4 px-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3"
            >
              <Download className="w-5 h-5 text-blue-600" />
              {t('backupData')} (JSON)
            </button>
            <label className="w-full py-4 px-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3 cursor-pointer">
              <Upload className="w-5 h-5 text-green-600" />
              {t('restoreData')}
              <input type="file" accept=".json" onChange={importData} className="hidden" />
            </label>
          </div>
        </motion.div>

        {/* Reports */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-purple-600" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Reports</h3>
          </div>
          <button
            onClick={generatePDF}
            className="w-full py-4 px-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3"
          >
            <FileText className="w-5 h-5 text-red-600" />
            Export Monthly Report (PDF)
          </button>
        </motion.div>

        {/* Family Members */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6 md:col-span-2"
        >
          <div className="flex items-center gap-3 mb-4">
            <User className="w-6 h-6 text-indigo-600" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('familyMembers')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {userProfile?.familyMembers?.map((member: string) => (
              <div key={member} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-4 py-2 rounded-xl font-medium">
                {member}
                {member !== 'Self' && (
                  <button 
                    onClick={() => handleRemoveMember(member)}
                    className="hover:text-red-500 transition-colors"
                    title={t('remove')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t('addMember')}
              value={newMemberInput}
              onChange={(e) => setNewMemberInput(e.target.value)}
              className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMember();
              }}
            />
            <button 
              onClick={handleAddMember}
              className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all active:scale-95"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </motion.div>

        {/* Manage Categories */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-8 md:col-span-2"
        >
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-6 h-6 text-teal-600" />
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('manageCategories')}</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                {t('incomeCategories')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {userProfile?.incomeCategories?.map((cat: string) => (
                  <div key={cat} className="flex items-center gap-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-4 py-2 rounded-xl font-medium">
                    {editingCategory?.type === 'income' && editingCategory?.oldName === cat ? (
                      <input
                        autoFocus
                        className="bg-transparent border-b border-green-300 dark:border-green-700 outline-none w-24 text-slate-800 dark:text-slate-100"
                        value={editingCategory.newName}
                        onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                        onBlur={handleEditCategory}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditCategory();
                          if (e.key === 'Escape') setEditingCategory(null);
                        }}
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:underline"
                        onClick={() => setEditingCategory({ type: 'income', oldName: cat, newName: cat })}
                      >
                        {cat}
                      </span>
                    )}
                    <button 
                      onClick={async () => {
                        if (!userProfile?.incomeCategories) return;
                        const updated = userProfile.incomeCategories.filter((c: string) => c !== cat);
                        try {
                          await updateDoc(doc(db, 'users', user!.uid), { incomeCategories: updated });
                        } catch (error) {
                          handleFirestoreError(error, OperationType.UPDATE, `users/${user!.uid}`);
                        }
                      }}
                      className="hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('addCategory')}
                  value={newIncomeCategoryInput}
                  onChange={(e) => setNewIncomeCategoryInput(e.target.value)}
                  className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCategory('income');
                  }}
                />
                <button 
                  onClick={() => handleAddCategory('income')}
                  className="p-4 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition-all active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                {t('expenseCategories')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {userProfile?.expenseCategories?.map((cat: string) => (
                  <div key={cat} className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-2 rounded-xl font-medium">
                    {editingCategory?.type === 'expense' && editingCategory?.oldName === cat ? (
                      <input
                        autoFocus
                        className="bg-transparent border-b border-red-300 dark:border-red-700 outline-none w-24 text-slate-800 dark:text-slate-100"
                        value={editingCategory.newName}
                        onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                        onBlur={handleEditCategory}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditCategory();
                          if (e.key === 'Escape') setEditingCategory(null);
                        }}
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:underline"
                        onClick={() => setEditingCategory({ type: 'expense', oldName: cat, newName: cat })}
                      >
                        {cat}
                      </span>
                    )}
                    <button 
                      onClick={async () => {
                        if (!userProfile?.expenseCategories) return;
                        const updated = userProfile.expenseCategories.filter((c: string) => c !== cat);
                        try {
                          await updateDoc(doc(db, 'users', user!.uid), { expenseCategories: updated });
                        } catch (error) {
                          handleFirestoreError(error, OperationType.UPDATE, `users/${user!.uid}`);
                        }
                      }}
                      className="hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t('addCategory')}
                  value={newExpenseCategoryInput}
                  onChange={(e) => setNewExpenseCategoryInput(e.target.value)}
                  className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCategory('expense');
                  }}
                />
                <button 
                  onClick={() => handleAddCategory('expense')}
                  className="p-4 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition-all active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Fixed Finances */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 space-y-6 md:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Bell className="w-6 h-6 text-orange-600" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('fixedFinances')}</h3>
            </div>
            <button
              onClick={() => {
                setEditingFixedId(null);
                setFixedForm({ amount: '', type: 'expense', category: '', description: '', dayOfMonth: '1' });
                setIsAddingFixed(true);
              }}
              className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 transition-all active:scale-95"
            >
              + {t('addFixed')}
            </button>
          </div>

          <div className="space-y-10">
            <div>
              <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-green-600 dark:text-green-400">
                <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                {t('income')}
              </h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {fixedIncomeItems.length === 0 ? (
                  <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">
                    {t('noFixedInSection')}
                  </p>
                ) : (
                  fixedIncomeItems.map((fixed) => renderFixedCard(fixed))
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                {t('expense')}
              </h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {fixedExpenseItems.length === 0 ? (
                  <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">
                    {t('noFixedInSection')}
                  </p>
                ) : (
                  fixedExpenseItems.map((fixed) => renderFixedCard(fixed))
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Add Fixed Finance Modal */}
      {isAddingFixed && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {editingFixedId ? t('edit') : t('addFixed')}
              </h2>
              <button 
                onClick={() => {
                  setIsAddingFixed(false);
                  setEditingFixedId(null);
                }} 
                className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full text-slate-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddFixed} className="p-8 space-y-6">
              <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setFixedForm({ ...fixedForm, type: 'income' })}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-semibold transition-all",
                    fixedForm.type === 'income' ? "bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
                  )}
                >
                  {t('income')}
                </button>
                <button
                  type="button"
                  onClick={() => setFixedForm({ ...fixedForm, type: 'expense' })}
                  className={cn(
                    "flex-1 py-3 rounded-xl font-semibold transition-all",
                    fixedForm.type === 'expense' ? "bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
                  )}
                >
                  {t('expense')}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('amount')}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={fixedForm.amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      const sanitized = sanitizeDecimal(val);
                      console.log('Fixed Amount Input:', { val, sanitized });
                      setFixedForm({ ...fixedForm, amount: sanitized });
                    }}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('dayOfMonth')}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={fixedForm.dayOfMonth}
                    onChange={(e) => {
                      const val = e.target.value;
                      const sanitized = sanitizeInteger(val);
                      console.log('Fixed Day Input:', { val, sanitized });
                      const num = parseInt(sanitized);
                      if (sanitized === '' || (num >= 1 && num <= 31)) {
                        setFixedForm({ ...fixedForm, dayOfMonth: sanitized });
                      }
                    }}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

      <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('category')}</label>
                <select
                  required
                  value={fixedForm.category}
                  onChange={(e) => setFixedForm({ ...fixedForm, category: e.target.value })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
                >
                  <option value="">Select Category</option>
                  {(fixedForm.type === 'income' 
                    ? (userProfile?.incomeCategories || []) 
                    : (userProfile?.expenseCategories || [])
                  ).map((c: string) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('description')}</label>
                <textarea
                  value={fixedForm.description}
                  onChange={(e) => setFixedForm({ ...fixedForm, description: e.target.value })}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none text-slate-800 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all"
              >
                {t('save')}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6"
          >
            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-blue-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{confirmModal.title}</h3>
              <p className="text-slate-500 dark:text-slate-400">{confirmModal.message}</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-3 px-6 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="flex-1 py-3 px-6 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
              >
                {t('confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Alert Modal */}
      {alertModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6"
          >
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto",
              alertModal.title === 'Error' ? "bg-red-50 dark:bg-red-900/30" : "bg-green-50 dark:bg-green-900/30"
            )}>
              {alertModal.title === 'Error' ? (
                <AlertCircle className="w-8 h-8 text-red-500" />
              ) : (
                <Shield className="w-8 h-8 text-green-500" />
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{alertModal.title}</h3>
              <p className="text-slate-500 dark:text-slate-400">{alertModal.message}</p>
            </div>
            <button
              onClick={() => setAlertModal(null)}
              className="w-full py-3 px-6 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
            >
              OK
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
