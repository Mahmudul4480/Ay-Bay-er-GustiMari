import type { Transaction } from '../hooks/useTransactions';
import type { RowInput } from 'jspdf-autotable';

const GROUP_ORDER: Array<'income' | 'expense' | 'debt_repayment'> = [
  'income',
  'expense',
  'debt_repayment',
];

export function escapeHtml(text: string | number | undefined | null): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

/** Embeds Anek Bangla TTF from `/fonts/AnekBangla.ttf` for jsPDF Unicode (Bengali) support. */
export async function embedAnekBanglaFont(doc: {
  addFileToVFS: (name: string, data: string) => void;
  addFont: (name: string, id: string, style: string, weight?: unknown, encoding?: string) => void;
}): Promise<boolean> {
  try {
    const res = await fetch('/fonts/AnekBangla.ttf');
    if (!res.ok) throw new Error(`Font HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    doc.addFileToVFS('AnekBangla.ttf', arrayBufferToBase64(buf));
    // Identity-H enables Bengali and other Unicode scripts in jsPDF
    doc.addFont('AnekBangla.ttf', 'AnekBangla', 'normal', undefined, 'Identity-H');
    return true;
  } catch (e) {
    console.warn('Anek Bangla could not be embedded; PDF text may fall back to default font.', e);
    return false;
  }
}

function txDateMs(tx: Transaction): number {
  const d = tx.date as { toDate?: () => Date } | Date | undefined;
  if (!d) return 0;
  if (typeof (d as { toDate?: () => Date }).toDate === 'function') {
    return (d as { toDate: () => Date }).toDate().getTime();
  }
  if (d instanceof Date) return d.getTime();
  return 0;
}

function groupTitle(
  type: (typeof GROUP_ORDER)[number],
  t: (key: string) => string
): string {
  if (type === 'income') return t('income');
  if (type === 'expense') return t('expense');
  return t('debtSettlement');
}

function typeCellLabel(raw: string, t: (key: string) => string): string {
  if (raw === 'income') return t('income');
  if (raw === 'expense') return t('expense');
  if (raw === 'debt_repayment') return t('debt_repayment');
  return raw;
}

function formatTxDate(tx: Transaction): string {
  if (!tx.date) return 'N/A';
  const d = tx.date as { toDate?: () => Date } | Date;
  if (typeof (d as { toDate?: () => Date }).toDate === 'function') {
    return (d as { toDate: () => Date }).toDate().toLocaleDateString();
  }
  if (d instanceof Date) return d.toLocaleDateString();
  return 'N/A';
}

/**
 * Builds autoTable body rows: one section per transaction type with a subtotal row each.
 */
export function buildGroupedTransactionRows(
  transactions: Transaction[],
  t: (key: string) => string
): RowInput[] {
  const rows: RowInput[] = [];

  for (const type of GROUP_ORDER) {
    const group = transactions
      .filter((tx) => tx.type === type)
      .sort((a, b) => txDateMs(b) - txDateMs(a));

    if (group.length === 0) continue;

    rows.push([
      {
        content: groupTitle(type, t),
        colSpan: 5,
        styles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontStyle: 'bold',
          fontSize: 10,
        },
      },
    ]);

    for (const tx of group) {
      const noteMember = [tx.note, tx.familyMember].filter(Boolean).join(' — ');
      rows.push([
        formatTxDate(tx),
        tx.category ?? '',
        typeCellLabel(tx.type, t),
        typeof tx.amount === 'number' ? tx.amount.toFixed(2) : String(tx.amount ?? ''),
        noteMember,
      ]);
    }

    const subtotal = group.reduce(
      (sum, tx) => sum + (Number(tx.amount) || 0),
      0
    );
    rows.push([
      {
        content: `${t('subtotal')} (${groupTitle(type, t)})`,
        colSpan: 4,
        styles: {
          fontStyle: 'bold',
          halign: 'right',
          fillColor: [248, 250, 252],
          textColor: [51, 65, 85],
        },
      },
      {
        content: subtotal.toFixed(2),
        styles: {
          fontStyle: 'bold',
          fillColor: [248, 250, 252],
          textColor: [51, 65, 85],
        },
      },
    ]);
  }

  if (rows.length === 0) {
    rows.push([
      {
        content: t('noTransactions'),
        colSpan: 5,
        styles: { halign: 'center', textColor: [100, 116, 139] },
      },
    ]);
  }

  return rows;
}
