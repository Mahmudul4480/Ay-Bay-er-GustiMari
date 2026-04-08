import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

export async function upsertFinancialNetworkEntry(params: {
  userId: string;
  debtId: string;
  contactName: string;
  contactPhone: string;
  isBusiness: boolean;
  debtType: 'lent' | 'borrowed';
  amount: number;
}): Promise<void> {
  const q = query(collection(db, 'financial_network'), where('debtId', '==', params.debtId));
  const snap = await getDocs(q);
  const base = {
    userId: params.userId,
    debtId: params.debtId,
    contactName: params.contactName.trim(),
    contactPhone: params.contactPhone.trim(),
    isBusiness: params.isBusiness,
    debtType: params.debtType,
    amount: params.amount,
    updatedAt: serverTimestamp(),
  };
  if (snap.empty) {
    await addDoc(collection(db, 'financial_network'), {
      ...base,
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(snap.docs[0].ref, base);
  }
}

export async function deleteFinancialNetworkByDebtId(debtId: string): Promise<void> {
  const q = query(collection(db, 'financial_network'), where('debtId', '==', debtId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
