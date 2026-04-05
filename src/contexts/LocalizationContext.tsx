import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

type Language = 'en' | 'bn';

interface Translations {
  [key: string]: {
    en: string;
    bn: string;
  };
}

export const translations: Translations = {
  appName: { en: 'Ay Bay Er GustiMari', bn: 'আয় ব্যায়ের গুষ্টিমারি' },
  dashboard: { en: 'Dashboard', bn: 'ড্যাশবোর্ড' },
  totalBalance: { en: 'Total Balance', bn: 'মোট ব্যালেন্স' },
  monthlyIncome: { en: 'Monthly Income', bn: 'মাসিক আয়' },
  monthlyExpense: { en: 'Monthly Expense', bn: 'মাসিক ব্যয়' },
  netDebt: { en: 'Net Debt', bn: 'মোট দেনা' },
  addTransaction: { en: 'Add Transaction', bn: 'লেনদেন যোগ করুন' },
  income: { en: 'Income', bn: 'আয়' },
  expense: { en: 'Expense', bn: 'ব্যয়' },
  debt_repayment: { en: 'Debt repayment', bn: 'ঋণ পরিশোধ' },
  amount: { en: 'Amount', bn: 'পরিমাণ' },
  category: { en: 'Category', bn: 'বিভাগ' },
  date: { en: 'Date', bn: 'তারিখ' },
  note: { en: 'Note', bn: 'নোট' },
  familyMember: { en: 'Family Member', bn: 'পরিবারের সদস্য' },
  save: { en: 'Save', bn: 'সংরক্ষণ করুন' },
  cancel: { en: 'Cancel', bn: 'বাতিল করুন' },
  settings: { en: 'Settings', bn: 'সেটিংস' },
  logout: { en: 'Logout', bn: 'লগআউট' },
  loginWithGoogle: { en: 'Login with Google', bn: 'গুগল দিয়ে লগইন করুন' },
  debtTracker: { en: 'Dena Paona (দেনা পাওনা)', bn: 'দেনা পাওনা' },
  lent: { en: 'Paona (পাওনা)', bn: 'পাওনা' },
  borrowed: { en: 'Dena (দেনা)', bn: 'দেনা' },
  personName: { en: 'Person Name', bn: 'ব্যক্তির নাম' },
  dueDate: { en: 'Due Date', bn: 'পরিশোধের তারিখ' },
  status: { en: 'Status', bn: 'অবস্থা' },
  paid: { en: 'Paid', bn: 'পরিশোধিত' },
  unpaid: { en: 'Unpaid', bn: 'অপরিশোধিত' },
  familyMembers: { en: 'Family Members', bn: 'পরিবারের সদস্য' },
  addMember: { en: 'Add Member', bn: 'সদস্য যোগ করুন' },
  addCategory: { en: 'Add Category', bn: 'বিভাগ যোগ করুন' },
  expenseByMember: { en: 'Expense by Member', bn: 'সদস্য ভিত্তিক ব্যয়' },
  incomeByMember: { en: 'Income by Member', bn: 'সদস্য ভিত্তিক আয়' },
  fixedFinances: { en: 'Fixed Finances', bn: 'স্থায়ী অর্থ' },
  manageCategories: { en: 'Manage Categories', bn: 'বিভাগ পরিচালনা' },
  incomeCategories: { en: 'Income Categories', bn: 'আয়ের বিভাগ' },
  expenseCategories: { en: 'Expense Categories', bn: 'ব্যয়ের বিভাগ' },
  dayOfMonth: { en: 'Day of Month', bn: 'মাসের দিন' },
  description: { en: 'Description', bn: 'বিবরণ' },
  addFixed: { en: 'Add Fixed Finance', bn: 'স্থায়ী অর্থ যোগ করুন' },
  backupData: { en: 'Backup Data', bn: 'ডেটা ব্যাকআপ' },
  restoreData: { en: 'Restore Data', bn: 'ডেটা রিস্টোর' },
  budgetLimit: { en: 'Budget Limit', bn: 'বাজেট সীমা' },
  warningLimit: { en: 'You have reached 80% of your budget!', bn: 'আপনি আপনার বাজেটের ৮০% এ পৌঁছেছেন!' },
  markAsPaid: { en: 'Mark as Paid', bn: 'পরিশোধিত হিসেবে চিহ্নিত করুন' },
  phoneNumber: { en: 'Phone Number', bn: 'ফোন নম্বর' },
  confirmDelete: { en: 'Are you sure you want to delete this?', bn: 'আপনি কি নিশ্চিত যে আপনি এটি মুছে ফেলতে চান?' },
  delete: { en: 'Delete', bn: 'মুছে ফেলুন' },
  action: { en: 'Action', bn: 'অ্যাকশন' },
  fillAllFields: { en: 'Please fill in all required fields', bn: 'অনুগ্রহ করে সব প্রয়োজনীয় তথ্য দিন' },
  profileLoading: { en: 'User profile is still loading. Please try again in a moment.', bn: 'ব্যবহারকারীর প্রোফাইল লোড হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।' },
  categoryExists: { en: 'This category already exists!', bn: 'এই বিভাগটি ইতিমধ্যে বিদ্যমান!' },
  errorAddingCategory: { en: 'Error adding category. Please try again.', bn: 'বিভাগ যোগ করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।' },
  edit: { en: 'Edit', bn: 'সম্পাদনা' },
  add: { en: 'Add', bn: 'যোগ করুন' },
  transactions: { en: 'Transactions', bn: 'লেনদেনসমূহ' },
  editTransaction: { en: 'Edit Transaction', bn: 'লেনদেন সম্পাদনা করুন' },
  all: { en: 'All', bn: 'সব' },
  search: { en: 'Search', bn: 'খুঁজুন' },
  noTransactions: { en: 'No transactions found', bn: 'কোন লেনদেন পাওয়া যায়নি' },
  incomeSource: { en: 'Income Source', bn: 'আয়ের উৎস' },
  expenseSource: { en: 'Expense Source', bn: 'ব্যয়ের উৎস' },
  sourceName: { en: 'Source Name', bn: 'উৎসের নাম' },
  debtSettlement: { en: 'Debt settlement', bn: 'ঋণ নিষ্পত্তি' },
  subtotal: { en: 'Subtotal', bn: 'উপমোট' },
  typeCol: { en: 'Type', bn: 'ধরন' },
  pdfStatementTitle: { en: 'Monthly Financial Statement', bn: 'মাসিক আর্থিক বিবৃতি' },
  noteAndMember: { en: 'Note / Member', bn: 'নোট / সদস্য' },
  noFixedInSection: { en: 'No entries yet.', bn: 'এখনও কোনো নেই।' },
  language: { en: 'Language', bn: 'ভাষা' },
  error: { en: 'Error', bn: 'ত্রুটি' },
  info: { en: 'Info', bn: 'তথ্য' },
  success: { en: 'Success', bn: 'সফল' },
  confirm: { en: 'Confirm', bn: 'নিশ্চিত করুন' },
  remove: { en: 'Remove', bn: 'সরান' },
  removeMember: { en: 'Remove family member', bn: 'পরিবারের সদস্য সরান' },
  memberExists: { en: 'This member is already in the list.', bn: 'এই সদস্য ইতিমধ্যে তালিকায় আছে।' },
  previousMonth: { en: 'Previous month', bn: 'আগের মাস' },
  nextMonth: { en: 'Next month', bn: 'পরের মাস' },
  selectMonth: { en: 'Select month', bn: 'মাস নির্বাচন করুন' },
  goToCurrentMonth: { en: 'This month', bn: 'এই মাস' },
  trendChartSubtitle: {
    en: 'Daily income and expense totals for the selected month.',
    bn: 'নির্বাচিত মাসের দৈনিক আয় ও ব্যয়।',
  },
  debtTotalsCumulative: {
    en: 'Net debt shows all unpaid debts (not limited to the month above).',
    bn: 'মোট দেনা সব অপরিশোধিত ঋণ দেখায় (উপরের মাসের সীমায় নয়)।',
  },
  pastDataBadge: {
    en: 'Past data',
    bn: 'অতীতের ডেটা',
  },
  monthYearPicker: {
    en: 'Month & year',
    bn: 'মাস ও বছর',
  },
  monthYearPickerHint: {
    en: 'All summary cards and charts below use this month only.',
    bn: 'নিচের সব সারাংশ ও চার্ট শুধু এই মাসের ডেটা দেখায়।',
  },
  resetCurrentMonth: { en: 'Reset current month', bn: 'বর্তমান মাস রিসেট' },
  resetCurrentMonthHint: {
    en: 'Removes every income and expense line in the current calendar month. Fixed finance templates, debt records, and transactions in other months are not changed.',
    bn: 'বর্তমান ক্যালেন্ডার মাসের সব আয় ও ব্যয় লাইন সরায়। স্থায়ী অর্থ, দেনার রেকর্ড ও অন্যান্য মাসের লেনদেন অপরিবর্তিত থাকে।',
  },
  resetCurrentMonthTitle: { en: 'Reset this calendar month?', bn: 'এই ক্যালেন্ডার মাস রিসেট করবেন?' },
  resetCurrentMonthMessage: {
    en: 'This will permanently delete all income and expense transactions in {month} for your account. Fixed finance templates, debts, and other months are not affected. Automatic fixed-finance entries for this month will not be re-created until next month.',
    bn: '{month} এর জন্য আপনার অ্যাকাউন্টের সব আয় ও ব্যয় লেনদেন স্থায়ীভাবে মুছে ফেলা হবে। স্থায়ী অর্থ টেমপ্লেট, দেনা ও অন্যান্য মাস প্রভাবিত হবে না।',
  },
  resetCurrentMonthNothing: {
    en: 'No income or expense transactions to remove for this month.',
    bn: 'এই মাসে মুছে ফেলার জন্য কোনো আয় বা ব্যয় লেনদেন নেই।',
  },
  resetCurrentMonthDone: {
    en: 'Current month transactions were deleted.',
    bn: 'বর্তমান মাসের লেনদেন মুছে ফেলা হয়েছে।',
  },
};

interface LocalizationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LocalizationContext = createContext<LocalizationContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

export const LocalizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    if (userProfile?.language) {
      setLanguageState(userProfile.language as Language);
    }
  }, [userProfile]);

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), { language: lang });
    }
  };

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <LocalizationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = () => useContext(LocalizationContext);
