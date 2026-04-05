import type { LucideIcon } from 'lucide-react';
import {
  Landmark,
  Scale,
  FileBadge,
  Briefcase,
  Stethoscope,
  GraduationCap,
  Laptop,
  BookOpen,
  Home,
  Building2,
  Globe,
  Users,
} from 'lucide-react';

export type ProfessionId =
  | 'banker'
  | 'lawyer'
  | 'tax_lawyer'
  | 'businessman'
  | 'mnc_employee'
  | 'doctor'
  | 'teacher'
  | 'freelancer_it'
  | 'student'
  | 'housewife'
  | 'govt_employee'
  | 'other';

export interface ProfessionDefinition {
  id: ProfessionId;
  label: string;
  /** Bengali translation shown as a subtitle on the card */
  sublabel: string;
  icon: LucideIcon;
  /** Tailwind classes for card surface (gradient + border) */
  cardClass: string;
  /** Icon circle background + text */
  iconWrapClass: string;
}

export const PROFESSIONS: ProfessionDefinition[] = [
  {
    id: 'banker',
    label: 'Banker',
    sublabel: 'ব্যাংকার',
    icon: Landmark,
    cardClass:
      'border-indigo-200/90 bg-gradient-to-br from-indigo-50 via-white to-slate-50 dark:border-indigo-800/60 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  },
  {
    id: 'lawyer',
    label: 'Lawyer',
    sublabel: 'আইনজীবী',
    icon: Scale,
    cardClass:
      'border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-zinc-50 dark:border-slate-600 dark:from-slate-900 dark:via-slate-900 dark:to-zinc-950',
    iconWrapClass: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
  },
  {
    id: 'tax_lawyer',
    label: 'Tax Lawyer',
    sublabel: 'কর আইনজীবী',
    icon: FileBadge,
    cardClass:
      'border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/80 dark:border-amber-800/50 dark:from-amber-950/35 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  },
  {
    id: 'businessman',
    label: 'Businessman',
    sublabel: 'ব্যবসায়ী',
    icon: Briefcase,
    cardClass:
      'border-violet-200/90 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/70 dark:border-violet-800/50 dark:from-violet-950/40 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  },
  {
    id: 'mnc_employee',
    label: 'MNC',
    sublabel: 'বহুজাতিক কর্মী',
    icon: Globe,
    cardClass:
      'border-teal-200/90 bg-gradient-to-br from-teal-50 via-white to-cyan-50/60 dark:border-teal-800/50 dark:from-teal-950/35 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
  },
  {
    id: 'doctor',
    label: 'Doctor',
    sublabel: 'ডাক্তার',
    icon: Stethoscope,
    cardClass:
      'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 dark:border-emerald-800/50 dark:from-emerald-950/35 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  },
  {
    id: 'teacher',
    label: 'Teacher',
    sublabel: 'শিক্ষক',
    icon: GraduationCap,
    cardClass:
      'border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-blue-50/70 dark:border-sky-800/50 dark:from-sky-950/35 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200',
  },
  {
    id: 'freelancer_it',
    label: 'Freelancer / IT',
    sublabel: 'ফ্রিল্যান্সার',
    icon: Laptop,
    cardClass:
      'border-cyan-200/90 bg-gradient-to-br from-cyan-50 via-white to-slate-50 dark:border-cyan-800/50 dark:from-cyan-950/35 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
  },
  {
    id: 'student',
    label: 'Student',
    sublabel: 'ছাত্র/ছাত্রী',
    icon: BookOpen,
    cardClass:
      'border-rose-200/90 bg-gradient-to-br from-rose-50 via-white to-pink-50/70 dark:border-rose-800/50 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
  },
  {
    id: 'housewife',
    label: 'Housewife',
    sublabel: 'গৃহিণী',
    icon: Home,
    cardClass:
      'border-fuchsia-200/90 bg-gradient-to-br from-fuchsia-50 via-white to-pink-50/60 dark:border-fuchsia-800/45 dark:from-fuchsia-950/30 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/45 dark:text-fuchsia-200',
  },
  {
    id: 'govt_employee',
    label: 'Govt. Employee',
    sublabel: 'সরকারি কর্মচারী',
    icon: Building2,
    cardClass:
      'border-blue-200/90 bg-gradient-to-br from-blue-50 via-white to-slate-50 dark:border-blue-800/55 dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  },
  {
    id: 'other',
    label: 'Other',
    sublabel: 'অন্যান্য',
    icon: Users,
    cardClass:
      'border-slate-300/90 bg-gradient-to-br from-slate-100 via-white to-gray-50 dark:border-slate-600/70 dark:from-slate-800/60 dark:via-slate-900 dark:to-slate-900',
    iconWrapClass: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  },
];

/**
 * Universal expense categories merged with every profession's defaults (deduped, case-insensitive).
 */
export const UNIVERSAL_EXPENSE_CATEGORIES: string[] = [
  'Medicine',
  'Hospital',
  'Kacabazar',
  'Sukna Bazar',
  'Family Entertainment',
  'Credit Card Bill',
  'Loan Installment',
  'Shopping',
  'Food',
  'Gift',
  'Utilities',
  'Mobile/Internet',
  'Transport',
  'Travel',
];

/** Universal income categories merged with profession-specific income lists. */
export const UNIVERSAL_INCOME_CATEGORIES: string[] = [
  'Salary',
  'Freelance',
  'Business',
  'Investment',
  'Gift',
];

export function mergeUniqueCategoryLists(lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const s = raw.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/** Ensures universal expense categories are always present (e.g. after profession change without reset). */
export function mergeExpenseCategoriesWithUniversals(existing: string[] | undefined): string[] {
  return mergeUniqueCategoryLists([UNIVERSAL_EXPENSE_CATEGORIES, existing || []]);
}

/** Ensures universal income categories are always present. */
export function mergeIncomeCategoriesWithUniversals(existing: string[] | undefined): string[] {
  return mergeUniqueCategoryLists([UNIVERSAL_INCOME_CATEGORIES, existing || []]);
}

/**
 * 'other' profession categories — only generic personal categories merged with universals.
 * No profession-specific labels so the user can customize freely.
 */
const DEFAULT_BY_PROFESSION: Record<ProfessionId, { income: string[]; expense: string[] }> = {
  banker: {
    income: ['Salary', 'Bonus', 'Commission', 'Investment'],
    expense: ['Rent', 'Transport', 'Dining', 'Professional Attire', 'Utilities'],
  },
  lawyer: {
    income: ['Salary', 'Legal Fees', 'Retainer'],
    expense: ['Court Fees', 'Legal Research', 'Office Rent', 'Transport', 'Subscriptions'],
  },
  tax_lawyer: {
    income: ['Salary', 'Tax Advisory Fees', 'Compliance Services'],
    expense: ['Software', 'Subscriptions', 'Office', 'Professional Development', 'Transport'],
  },
  businessman: {
    income: ['Business', 'Sales', 'Partnership', 'Investment'],
    expense: ['Inventory', 'Rent', 'Marketing', 'Salaries', 'Utilities'],
  },
  mnc_employee: {
    income: ['Salary', 'Bonus', 'Performance Pay', 'Stock Options', 'Allowance'],
    expense: ['Rent', 'Transport', 'Team Lunch', 'Professional Development', 'Subscriptions', 'Healthcare', 'Tech Equipment'],
  },
  doctor: {
    income: ['Salary', 'Consultation', 'Surgery'],
    expense: ['Clinic Rent', 'Medical Supplies', 'Equipment', 'Staff', 'Utilities'],
  },
  teacher: {
    income: ['Salary', 'Tuition', 'Private Lessons'],
    expense: ['Books', 'Transport', 'Stationery', 'Education', 'Food'],
  },
  freelancer_it: {
    income: ['Projects', 'Retainer', 'Consulting'],
    expense: ['Software', 'Hardware', 'Co-working', 'Internet', 'Taxes'],
  },
  student: {
    income: ['Pocket Money', 'Scholarship', 'Part-time'],
    expense: ['Books', 'Stationery', 'Food', 'Transport', 'Education'],
  },
  housewife: {
    income: ['Family Support', 'Side Income', 'Gifts'],
    expense: ['Groceries', 'Utilities', 'Household', 'Kids', 'Health'],
  },
  govt_employee: {
    income: ['Salary', 'Allowance', 'Pension'],
    expense: ['Rent', 'Transport', 'Utilities', 'Food', 'Healthcare'],
  },
  // 'other' gets only universal + generic personal categories — no profession-specific lists
  other: {
    income: ['Salary', 'Business', 'Part-time', 'Gift'],
    expense: ['Rent', 'Groceries', 'Household', 'Bills', 'Education', 'Health', 'Travel'],
  },
};

export function getDefaultCategoriesForProfession(
  id: ProfessionId
): { income: string[]; expense: string[] } {
  const d = DEFAULT_BY_PROFESSION[id];
  return {
    income: mergeUniqueCategoryLists([UNIVERSAL_INCOME_CATEGORIES, d.income]),
    expense: mergeUniqueCategoryLists([UNIVERSAL_EXPENSE_CATEGORIES, d.expense]),
  };
}

/**
 * Universal + profession defaults, merged with any existing user lists (deduped).
 * Use when saving a newly selected profession so custom labels are kept and universals stay.
 */
export function buildMergedCategoriesForProfession(
  professionId: ProfessionId,
  existingIncome: string[] | undefined,
  existingExpense: string[] | undefined
): { income: string[]; expense: string[] } {
  const defaults = getDefaultCategoriesForProfession(professionId);
  return {
    income: mergeUniqueCategoryLists([defaults.income, existingIncome || []]),
    expense: mergeUniqueCategoryLists([defaults.expense, existingExpense || []]),
  };
}

/** Categories for brand-new Firestore profiles (before profession is chosen). */
export function getDefaultCategoriesForNewUser(): { income: string[]; expense: string[] } {
  return {
    income: mergeUniqueCategoryLists([UNIVERSAL_INCOME_CATEGORIES, ['Salary', 'Business', 'Gift', 'Investment']]),
    expense: mergeUniqueCategoryLists([
      UNIVERSAL_EXPENSE_CATEGORIES,
      ['Food', 'Rent', 'Utilities', 'Transport', 'Entertainment', 'Health', 'Education', 'Shopping', 'Travel'],
    ]),
  };
}

/**
 * Placeholder 3D-style character art (replace URLs with your transparent PNGs).
 * DiceBear avataaars — distinct seeds per profession; swap for custom assets anytime.
 */
export const WELCOME_CHARACTER_URLS: Record<ProfessionId, string> = {
  banker: 'https://api.dicebear.com/9.x/avataaars/svg?seed=BankerMira&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairStraight&backgroundColor=transparent',
  lawyer: 'https://api.dicebear.com/9.x/avataaars/svg?seed=LawyerSara&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairCurly&backgroundColor=transparent',
  tax_lawyer: 'https://api.dicebear.com/9.x/avataaars/svg?seed=TaxLawyerNia&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairBun&backgroundColor=transparent',
  businessman: 'https://api.dicebear.com/9.x/avataaars/svg?seed=BizLeela&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairStraight2&backgroundColor=transparent',
  mnc_employee: 'https://api.dicebear.com/9.x/avataaars/svg?seed=MNCRiya&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairBun&accessories%5B%5D=wayfarers&backgroundColor=transparent',
  doctor: 'https://api.dicebear.com/9.x/avataaars/svg?seed=DoctorAnika&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairStraight&accessories%5B%5D=prescription01&backgroundColor=transparent',
  teacher: 'https://api.dicebear.com/9.x/avataaars/svg?seed=TeacherRina&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairBigHair&backgroundColor=transparent',
  freelancer_it: 'https://api.dicebear.com/9.x/avataaars/svg?seed=DevPriya&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairShavedSides&backgroundColor=transparent',
  student: 'https://api.dicebear.com/9.x/avataaars/svg?seed=StudentTisha&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairCurvy&backgroundColor=transparent',
  housewife: 'https://api.dicebear.com/9.x/avataaars/svg?seed=HomeNusrat&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairDreads&backgroundColor=transparent',
  govt_employee: 'https://api.dicebear.com/9.x/avataaars/svg?seed=GovtFarah&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairFroBands&backgroundColor=transparent',
  other: 'https://api.dicebear.com/9.x/avataaars/svg?seed=OtherAsha&mouth%5B%5D=smile&facialHairProbability=0&top%5B%5D=longHairStraight&backgroundColor=transparent',
};

export function getProfessionLabel(id: string | undefined | null): string {
  if (!id) return 'Unspecified';
  const p = PROFESSIONS.find((x) => x.id === id);
  return p?.label ?? id;
}
