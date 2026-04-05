import { db } from '../firebaseConfig';
import { doc, setDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';

/**
 * Atomically updates the user_intelligence document for a given user
 * every time they record an expense transaction.
 *
 * Fields written (all via merge so nothing is overwritten):
 *   - totalSpentByCategory.<category>  — running sum of amounts
 *   - frequency.<category>             — number of times spent in this category
 *   - lastSpentCategory                — most recent category used
 *   - lastUpdated                      — server timestamp
 *   - customCategories (array)         — set if the category was user-created
 */
export async function updateUserIntelligence(
  userId: string,
  category: string,
  amount: number,
  isCustomCategory = false,
): Promise<void> {
  if (!userId || !category) return;

  const ref = doc(db, 'user_intelligence', userId);

  const payload: Record<string, unknown> = {
    userId,
    [`totalSpentByCategory.${category}`]: increment(amount),
    [`frequency.${category}`]: increment(1),
    lastSpentCategory: category,
    lastUpdated: serverTimestamp(),
  };

  if (isCustomCategory) {
    payload.customCategories = arrayUnion(category);
  }

  await setDoc(ref, payload, { merge: true });
}
