import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { scanForIntelligence } from './intelligenceKeywords';

/**
 * Scans multiple text fields, merges unique tags onto `users/{userId}.marketingTags` via arrayUnion.
 */
export async function mergeMarketingTagsFromTexts(
  userId: string,
  parts: (string | null | undefined)[],
): Promise<void> {
  if (!userId) return;
  const text = parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join('\n');
  if (!text) return;
  const tags = scanForIntelligence(text);
  if (tags.length === 0) return;
  try {
    await updateDoc(doc(db, 'users', userId), {
      marketingTags: arrayUnion(...tags),
    });
  } catch (e) {
    console.warn('mergeMarketingTagsFromTexts:', e);
  }
}
