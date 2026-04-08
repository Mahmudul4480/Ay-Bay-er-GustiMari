// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI content generation for the Re-engagement Blog System
// Uses the official @google/generative-ai SDK with JSON Mode enabled.
// JSON Mode (responseMimeType: 'application/json') forces Gemini to emit a
// bare JSON object — no markdown fences, no preamble prose — eliminating the
// most common parse failure at the source.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FinishReason,
  GoogleGenerativeAI,
  SchemaType,
} from '@google/generative-ai';
import type {
  EnhancedGenerateContentResponse,
  ResponseSchema,
} from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

/**
 * Ordered list of model names to try.
 * The SDK uses the v1beta endpoint internally; we just supply model IDs.
 * Newer/preferred models come first; the loop falls through on 404s.
 */
const MODEL_CANDIDATES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
] as const;

export interface GeneratedBlogContent {
  title: string;
  notificationMessage: string;
  blogContent: string;
  imagePrompt: string;
  ctaText: string;
}

// ─── Profession map → Bengali labels ─────────────────────────────────────────

const PROFESSION_BN: Record<string, string> = {
  banker:        'ব্যাংকার',
  lawyer:        'আইনজীবী',
  tax_lawyer:    'কর আইনজীবী',
  businessman:   'ব্যবসায়ী',
  doctor:        'ডাক্তার',
  teacher:       'শিক্ষক',
  freelancer_it: 'ফ্রিল্যান্সার',
  student:       'ছাত্র/ছাত্রী',
  housewife:     'গৃহিণী',
  govt_employee: 'সরকারি কর্মচারী',
  engineer:      'ইঞ্জিনিয়ার',
  farmer:        'কৃষক',
  military:      'সেনা কর্মকর্তা',
  journalist:    'সাংবাদিক',
  accountant:    'হিসাবরক্ষক',
  nurse:         'নার্স',
  pharmacist:    'ফার্মাসিস্ট',
  architect:     'আর্কিটেক্ট',
  pilot:         'পাইলট',
  chef:          'শেফ',
  artist:        'শিল্পী',
  other:         'পেশাজীবী',
};

function getProfessionBn(profession: string): string {
  const key = (profession || 'other').toLowerCase();
  return PROFESSION_BN[key] ?? PROFESSION_BN['other'];
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(userName: string, profession: string, category?: string): string {
  const profBn = getProfessionBn(profession);
  const firstName = userName.split(' ')[0] || userName;

  const categoryContext = category
    ? `\nTarget category (IMPORTANT): "${category}"
The title, story, and CTA must revolve specifically around this financial category.
Make the content feel like it was written just for someone who regularly spends/earns in "${category}".`
    : '';

  const titleExample = category
    ? `'${profBn} ${firstName}, আপনার "${category}" খরচ কি নিয়ন্ত্রণে আছে?'`
    : `'${profBn} ${firstName}, আপনার কি খরচের হিসাব মিলছে?'`;

  return `You are a witty, warm Bangladeshi content writer for a personal finance app called "Ay Bay Er GustiMari".

IMPORTANT RULES:
1. The app name is ALWAYS written as "Ay Bay Er GustiMari" — never abbreviated, never shortened. Every mention must use the full name.
2. You are in JSON Mode. Output ONLY the raw JSON object. No markdown, no code fences, no extra text before or after the JSON.
3. Every string value must be complete (no placeholders like "...") and non-empty.

Generate re-engagement content for a user.

User context:
- First name: ${firstName}
- Full name: ${userName}
- Profession: ${profession} (Bengali: ${profBn})${categoryContext}

Required JSON keys (all values must be non-empty strings):
{
  "title": "Catchy Bengali title ≤ 70 chars. Must address the user by profession label. Example: ${titleExample}",
  "notificationMessage": "Short Bengali notification body ≤ 120 chars. Conversational, friendly, creates curiosity. If a target category was given, hint at it.",
  "blogContent": "A 200-word funny and relatable Bengali story about the user's profession and money struggles${category ? `, specifically focused on the '${category}' category` : ''}. Use Bangla slang, humor, and a warm tone. End with a motivational sentence encouraging them to track their finances. Pure Bengali prose — no English sentences.",
  "imagePrompt": "English description for a fun 3D illustration${category ? ` related to '${category}' and the user's profession` : ' matching the profession'}. Pixar/cartoon style, bright pastel background.",
  "ctaText": "Bengali call-to-action button text. Must end with 'Ay Bay Er GustiMari-তে যান'. Example: 'আপনার হিসাব দেখুন - Ay Bay Er GustiMari-তে যান'"
}

Be creative, funny, and culturally relevant to Bangladesh. The story should make the user smile and feel understood.`;
}

// ─── JSON sanitizer (safety net even with JSON Mode) ─────────────────────────
// JSON Mode all but eliminates format errors, but edge cases still exist
// (e.g. unescaped newlines inside long Bengali strings, trailing commas from
// fine-tuned models). This runs as a second-pass fallback inside parseResponse.

function sanitizeJson(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (_match, inner: string) =>
      `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`,
    );
}

// ─── Response parser — 4-stage bulletproof pipeline ──────────────────────────

function parseResponse(raw: string): GeneratedBlogContent {
  if (!raw || !raw.trim()) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  // Stage 1 — extract outermost { … } block
  // With JSON Mode this is usually the entire string, but we still strip any
  // accidental wrapper text just in case.
  const cleanedText =
    raw.match(/\{[\s\S]*\}/)?.[0] ??
    raw
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();

  // Stage 2 — direct parse (succeeds >99% of the time with JSON Mode)
  let parsed: Partial<GeneratedBlogContent> | null = null;
  try {
    parsed = JSON.parse(cleanedText);
  } catch {
    // Stage 3 — sanitize common AI formatting quirks and retry
    try {
      parsed = JSON.parse(sanitizeJson(cleanedText));
    } catch {
      throw new Error(
        "Could not parse Gemini's response as JSON even after sanitization.\n" +
          'The AI may have returned a severely malformed format.\n' +
          `Raw snippet: ${raw.slice(0, 400)}`,
      );
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'Gemini returned a valid JSON value but it was not an object. Please try again.',
    );
  }

  // Stage 4 — validate & fill required keys
  const required: (keyof GeneratedBlogContent)[] = [
    'title',
    'notificationMessage',
    'blogContent',
    'imagePrompt',
    'ctaText',
  ];
  for (const key of required) {
    if (!parsed[key] || typeof parsed[key] !== 'string' || !(parsed[key] as string).trim()) {
      parsed[key] = `[${key} — not generated, please edit before sending]`;
    }
  }

  // Stage 5 — enforce app name in ctaText fallback
  // If Gemini forgot to include the app name in the CTA, append it.
  const cta = parsed.ctaText as string;
  if (!cta.includes('Ay Bay Er GustiMari') && !cta.startsWith('[')) {
    parsed.ctaText = `${cta.replace(/[-–—]\s*$/, '').trim()} — Ay Bay Er GustiMari-তে যান`;
  }

  return parsed as GeneratedBlogContent;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates personalised re-engagement blog content via the Gemini SDK.
 *
 * Strategy:
 * - JSON Mode (responseMimeType: 'application/json') is set on every call so
 *   Gemini never wraps its output in markdown fences.
 * - maxOutputTokens is raised to 2000 so long Bengali blog posts are never
 *   truncated mid-sentence.
 * - The model list is tried in order; 404 responses (model unavailable for
 *   this API key / region) are skipped silently.
 * - 429 (quota exceeded) surfaces immediately — no point retrying other models.
 * - parseResponse provides a 4-stage fallback even if JSON Mode somehow slips.
 */
export async function generateBlogContent(
  userName: string,
  profession: string,
  category?: string,
): Promise<GeneratedBlogContent> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file.',
    );
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const prompt = buildPrompt(userName, profession, category);
  const errors: string[] = [];

  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          // JSON Mode: Gemini outputs bare JSON — no markdown, no fences
          responseMimeType: 'application/json',
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 2000,
        },
      });

      const result = await model.generateContent(prompt);
      const raw = result.response.text();

      console.info(`[Gemini] Used model: ${modelName} — JSON Mode ✓`);
      return parseResponse(raw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // 429 — quota exceeded: surface immediately, retrying won't help
      if (msg.includes('429') || /quota/i.test(msg)) {
        throw new Error(
          'Gemini API quota exceeded (429). Please wait a moment and try again.',
        );
      }

      // 404 — model unavailable for this key/region: try next candidate
      if (msg.includes('404') || /not found/i.test(msg)) {
        errors.push(`${modelName}: 404 — not available for this API key`);
        continue;
      }

      // Any other error: surface with context
      throw new Error(`Gemini API error with model "${modelName}": ${msg.slice(0, 400)}`);
    }
  }

  // All candidates exhausted
  throw new Error(
    `All Gemini model candidates returned 404.\nTried:\n${errors.join('\n')}\n\n` +
      'Verify that VITE_GEMINI_API_KEY is valid and the Gemini API is enabled in your Google Cloud project.',
  );
}

/** Prefer Gemini 1.5 Flash for admin Direct Notify; fall back if unavailable. */
const TIP_MODEL_CANDIDATES = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite'] as const;

/** Forces valid `{ title, message }` JSON from the API (fixes broken / partial JSON strings). */
const DIRECT_NOTIFY_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: {
      type: SchemaType.STRING,
      description: 'Bengali notification title from user spending category',
    },
    message: {
      type: SchemaType.STRING,
      description: 'Bengali personalized tip body',
    },
  },
  required: ['title', 'message'],
} as ResponseSchema;

/**
 * Prefer concatenating `parts[].text` (same as SDK getText) so JSON mode always yields the full payload.
 */
function getDirectNotifyRawText(response: EnhancedGenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts;
  if (parts?.length) {
    const joined = parts
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('')
      .replace(/^\uFEFF/, '')
      .trim();
    if (joined) return joined;
  }
  try {
    return response.text().replace(/^\uFEFF/, '').trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fr = response.candidates?.[0]?.finishReason;
    throw new Error(
      `No text in Gemini response (${fr ?? 'no candidate'}). ${msg}`,
    );
  }
}

export type DirectNotifyUserType = 'Ghost User' | 'Irregular User' | 'Power User';

export type DirectNotifyCategoryBucket =
  | 'loan_debt_installment'
  | 'shopping_food_entertainment'
  | 'rent_utilities'
  | 'general';

export interface PersonalFinanceTipParams {
  displayName: string;
  /** Human-readable profession label (e.g., Banker, Doctor). */
  profession: string;
  /** Where they spend most this month; omit or N/A if unknown. */
  topCategory?: string;
  userType: DirectNotifyUserType;
  /**
   * Whole days since their last transaction anywhere in the app.
   * `null` means they have never logged an entry (Ghost).
   */
  daysSinceLastEntry: number | null;
}

export interface PersonalFinanceTipResult {
  title: string;
  message: string;
}

/** Appended to AI push body so users see a non-advice disclaimer (Bangla). */
export const REENGAGEMENT_NOTIFICATION_DISCLAIMER_BN =
  ' বিঃদ্রঃ এটি কোনো আর্থিক পরামর্শ বা সিদ্ধান্তের বিকল্প নয়—শুধু ভাবনার খোরাক।';

export interface ReengagementPushParams extends PersonalFinanceTipParams {
  allTimeIncome: number;
  allTimeExpense: number;
  top3ExpenseCategories: { category: string; amount: number }[];
  entriesPerWeekApprox: number;
  recentNotesSample: string[];
}

const TIP_TITLE_MAX_CHARS = 52;
const TIP_MESSAGE_MAX_CHARS = 140;

const REENGAGE_TITLE_MAX = 56;
const REENGAGE_CORE_MSG_MAX = 210;
const REENGAGE_TOTAL_MSG_MAX = 380;

function mergeDisclaimerIntoPushBody(core: string, disclaimer: string): string {
  const c = core.trim();
  if (!c) return disclaimer.trim();
  if (/বিঃদ্রঃ|ভাবনার খোরাক|সিদ্ধান্তের বিকল্প/i.test(c)) {
    return c.length > REENGAGE_TOTAL_MSG_MAX ? c.slice(0, REENGAGE_TOTAL_MSG_MAX - 1) + '…' : c;
  }
  let body = c.replace(/[।.!?\s]+$/u, '') + disclaimer;
  if (body.length > REENGAGE_TOTAL_MSG_MAX) {
    const budget = REENGAGE_TOTAL_MSG_MAX - disclaimer.length - 2;
    const trimmed = c.slice(0, Math.max(80, budget)).trim();
    body = trimmed + (trimmed.endsWith('।') ? '' : '…') + disclaimer;
    if (body.length > REENGAGE_TOTAL_MSG_MAX) {
      body = body.slice(0, REENGAGE_TOTAL_MSG_MAX - 1) + '…';
    }
  }
  return body;
}

function buildReengagementPushPrompt(p: ReengagementPushParams, bucket: DirectNotifyCategoryBucket): string {
  const name = p.displayName.trim() || 'বন্ধু';
  const prof = p.profession.trim() || 'পেশাজীবী';
  const cat =
    p.topCategory && String(p.topCategory).trim() && String(p.topCategory).trim() !== 'N/A'
      ? String(p.topCategory).trim()
      : 'তথ্য নেই';
  const daysLine =
    p.daysSinceLastEntry === null
      ? 'কোনো হিসাবের এন্ট্রি এখনো নেই (Ghost).'
      : `শেষ এন্ট্রির পর ${p.daysSinceLastEntry} দিন।`;
  const top3 =
    p.top3ExpenseCategories.length > 0
      ? p.top3ExpenseCategories.map((x) => `${x.category}: ${Math.round(x.amount)}`).join(' · ')
      : 'তথ্য নেই';
  const notes =
    p.recentNotesSample.length > 0
      ? p.recentNotesSample.slice(0, 8).join(' | ')
      : 'নোট নেই';

  const behaviorHint =
    p.userType === 'Ghost User'
      ? 'অগ্রাধিকার: প্রথম এন্ট্রির জন্য উৎসাহ; অ্যাপে ফিরে আসার আমন্ত্রণ।'
      : p.userType === 'Irregular User'
        ? `অগ্রাধিকার: নিষ্ক্রিয়তা (${p.daysSinceLastEntry ?? '—'} দিন) মাথায় রেখে মৃদু রি-এনগেজমেন্ট; হিসাব রাখার সুবিধা।`
        : 'অগ্রাধিকার: ধারাবাহিকতার প্রশংসা + এক লাইনের ছোট টিপ।';

  return `You write a mobile PUSH notification for the user of "Ay Bay Er GustiMari" (personal finance app). The user will read this on their phone.

Admin analytics (do not mention "admin" or "analytics" to the user):
- displayName: ${name}
- profession: ${prof}
- userType: ${p.userType}
- days since last transaction entry: ${p.daysSinceLastEntry ?? 'never'}
- thisMonthTopCategory label: ${cat}
- allTimeIncome (number): ${p.allTimeIncome}
- allTimeExpense (number): ${p.allTimeExpense}
- top3 expense categories (all-time): ${top3}
- approx entries per week (all-time): ${p.entriesPerWeekApprox}
- sample notes from their entries: ${notes}

${bucketInstructions(bucket)}

Engagement instructions:
- ${behaviorHint}
- Warm, conversational Chalito Bengali; address by first name or "আপনি" naturally.
- If they are inactive or Ghost, nudge them to open the app and log one small expense/income—no guilt.
- Include ONE short, practical money thought (not a command to invest/borrow).
- Do NOT include any disclaimer text in your JSON (a fixed disclaimer will be appended later by the app).
- Do NOT claim to be a licensed advisor.

Return ONLY raw JSON, no markdown:
{
  "title": "Short catchy Bangla title, max ${REENGAGE_TITLE_MAX} chars",
  "message": "Body only, max ${REENGAGE_CORE_MSG_MAX} Unicode chars, one or two sentences, end with । or ! — no line breaks inside the string."
}`;
}

/** Maps app category labels (e.g. Loan Installment, Debt) into prompt buckets. */
export function classifyDirectNotifyCategoryBucket(raw: string): DirectNotifyCategoryBucket {
  const c = raw.trim().toLowerCase();
  if (!c || c === 'n/a') return 'general';
  if (
    /\b(loan|debt|installment|instalment|emi|repayment|borrow|mortgage|overdraft|bnpl)\b/i.test(c) ||
    /\b(credit\s*card)\b/i.test(c) ||
    /লোন|ঋণ|কিস্তি|ডেবট/i.test(raw)
  ) {
    return 'loan_debt_installment';
  }
  if (
    /\b(shop|shopping|food|grocery|restaurant|dining|entertain|movie|cinema|fashion|clothes|snack|coffee|takeout|online\s*order)\b/i.test(c) ||
    /খাবার|শপিং|বিনোদন/i.test(raw)
  ) {
    return 'shopping_food_entertainment';
  }
  if (
    /\b(rent|utility|utilities|electric|electricity|gas|water|internet|broadband|phone\s*bill|subscription)\b/i.test(c) ||
    /ভাড়া|বিদ্যুৎ|ইউটিলিটি/i.test(raw)
  ) {
    return 'rent_utilities';
  }
  return 'general';
}

function bucketInstructions(bucket: DirectNotifyCategoryBucket): string {
  switch (bucket) {
    case 'loan_debt_installment':
      return `CATEGORY WEIGHT — LOAN / DEBT / INSTALLMENT:
- Title: if topCategory is "Loan Installment" (or equivalent), the JSON "title" must be natural Bangla such as "লোন ইন্সটলমেন্ট" or "ঋণের কিস্তি" (pick one; do not use English in title).
- Message: one personalized tip — sympathetic (মানসিক চাপ বোঝা) but disciplined (সময়মতো কিস্তি, বাড়তি সুদ/জরিমানা এড়ানো); use displayName, profession, days inactive naturally. Never copy example lines verbatim.`;
    case 'shopping_food_entertainment':
      return `CATEGORY WEIGHT — SHOPPING / FOOD / ENTERTAINMENT:
- Focus: impulse control; small spends adding up.
- Tone vibe example: "পকেট খালি হওয়ার আগে একটু লাগাম টানুন।" (fresh wording each time).`;
    case 'rent_utilities':
      return `CATEGORY WEIGHT — RENT / UTILITIES:
- Focus: essential budgeting for fixed bills; clarity, not guilt.`;
    default:
      return `CATEGORY WEIGHT — GENERAL:
- Blend userType with one concrete angle from topCategory when known.`;
  }
}

function buildDirectNotifyJsonPrompt(p: PersonalFinanceTipParams, bucket: DirectNotifyCategoryBucket): string {
  const name = p.displayName.trim() || 'বন্ধু';
  const prof = p.profession.trim() || 'পেশাজীবী';
  const cat =
    p.topCategory && String(p.topCategory).trim() && String(p.topCategory).trim() !== 'N/A'
      ? String(p.topCategory).trim()
      : 'তথ্য নেই';

  const daysLine =
    p.daysSinceLastEntry === null
      ? 'কোনো হিসাবের এন্ট্রি এখনো নেই (Ghost / no entries yet).'
      : `শেষ এন্ট্রির পর ${p.daysSinceLastEntry} দিন (days since last entry: ${p.daysSinceLastEntry}).`;

  const behaviorHint =
    p.userType === 'Ghost User'
      ? `User type: Ghost — motivate first expense/income entry; explain হিসাব রাখার উপকার in a fresh way.`
      : p.userType === 'Irregular User'
        ? `User type: Irregular — gently reference inactivity (${p.daysSinceLastEntry ?? 'N/A'} days) and tie to topCategory.`
        : `User type: Power User — praise consistency; add one sharp saving/mindset line (can combine with category bucket).`;

  return `You are Gemini 1.5 Flash acting as a witty, smart Bengali financial advisor for "Ay-Bay-er-GustiMari" / "Ay Bay Er GustiMari". Friendly, sometimes slightly cheeky, always respectful. Standard/Chalito Bengali, conversational.

User context:
- displayName: ${name}
- profession: ${prof}
- topCategory (label from app, may be English): ${cat}
- userType: ${p.userType}
- Activity: ${daysLine}

${bucketInstructions(bucket)}

Also: ${behaviorHint}

Return ONLY a raw JSON object. No markdown, no introductory text, no backticks. The format MUST be exactly:
{
  "title": "Bengali translation of the category",
  "message": "The personalized tip in Bengali"
}

Hard rules:
- Keys must be exactly "title" and "message" (English keys only).
- "title": translate/summarize topCategory into natural Bangla. Max ${TIP_TITLE_MAX_CHARS} characters. If category unknown, use: আপনার আর্থিক আপডেট
- "message": single notification body in Bengali. Max ${TIP_MESSAGE_MAX_CHARS} Unicode characters. One or two complete sentences; must end with । or ! or ? — no truncation mid-sentence; plan wording to fit.
- Bengali only in the string values — no English sentences inside "title" or "message".
- CRITICAL for valid JSON: do not put raw line breaks inside "title" or "message" strings. Keep each value on one line, or use \\n if you must break a line. Escape any " inside a value as \\".
- The entire output must be one compact JSON object with both keys present — never truncate before the final closing brace.`;
}

/**
 * Remove markdown code fences (e.g. ```json … ```) and isolate the outermost `{ … }` before JSON.parse.
 * For incomplete JSON (MAX_TOKENS), avoid slicing at a stray `}` inside a string — prefer full text.
 */
function stripMarkdownCodeBlocksForDirectNotifyJson(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (/^```/.test(t)) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const start = t.indexOf('{');
  if (start < 0) return t;
  const rest = t.slice(start);
  const end = rest.lastIndexOf('}');
  if (end > 0) {
    const candidate = rest.slice(0, end + 1);
    try {
      JSON.parse(candidate);
      return candidate.trim();
    } catch {
      /* likely truncated or invalid — keep from first { to end so recovery can scan */
    }
  }
  return rest.trim();
}

/**
 * Scan a JSON string value starting at `start` (first char after opening `"`).
 * Handles escapes; if the closing `"` is missing (truncated output), returns everything until EOF.
 */
function scanJsonStringValueChars(text: string, start: number): string {
  let out = '';
  let j = start;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\' && j + 1 < text.length) {
      const n = text[j + 1];
      if (n === 'n') {
        out += '\n';
        j += 2;
        continue;
      }
      if (n === 'r') {
        out += '\r';
        j += 2;
        continue;
      }
      if (n === 't') {
        out += '\t';
        j += 2;
        continue;
      }
      if (n === '"' || n === '\\' || n === '/') {
        out += n;
        j += 2;
        continue;
      }
      if (n === 'u' && j + 5 < text.length) {
        const hex = text.slice(j + 2, j + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          j += 6;
          continue;
        }
      }
      out += c;
      j++;
      continue;
    }
    if (c === '"') break;
    out += c;
    j++;
  }
  return out;
}

/** Extract "key": "value" string when JSON.parse fails (truncated MAX_TOKENS, bad escapes). */
function extractJsonStringField(text: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`"${esc}"\\s*:\\s*"`, 'm');
  const m = re.exec(text);
  if (!m || m.index === undefined) return null;
  const valueStart = m.index + m[0].length;
  const value = scanJsonStringValueChars(text, valueStart).trim();
  return value.length ? value : null;
}

function recoverDirectNotifyFieldsFromBrokenJson(
  raw: string,
  fallbackTitle: string,
): PersonalFinanceTipResult | null {
  const title = extractJsonStringField(raw, 'title') ?? fallbackTitle;
  const message = extractJsonStringField(raw, 'message');
  if (!message?.trim()) return null;
  return clampPersonalFinanceTipResult(
    title.trim() || fallbackTitle,
    message.trim(),
    fallbackTitle,
  );
}

function clampPersonalFinanceTipResult(
  title: string,
  message: string,
  fallbackTitle: string,
  limits?: { maxTitle: number; maxMessage: number },
): PersonalFinanceTipResult {
  const maxT = limits?.maxTitle ?? TIP_TITLE_MAX_CHARS;
  const maxM = limits?.maxMessage ?? TIP_MESSAGE_MAX_CHARS;
  let t = title.trim() || fallbackTitle;
  let m = message.trim();
  if (!m) {
    throw new Error('AI returned an empty message.');
  }
  if (t.length > maxT) {
    t = t.slice(0, maxT - 1).trim() + '…';
  }
  if (m.length > maxM) {
    m = m.slice(0, maxM);
    const sp = m.lastIndexOf(' ');
    if (sp > maxM * 0.55) m = m.slice(0, sp).trim();
    if (m.length > maxM) {
      m = m.slice(0, maxM - 1).trim() + '…';
    }
  }
  return { title: t, message: m };
}

function parsePersonalFinanceTipJson(
  raw: string,
  fallbackTitle: string,
  limits?: { maxTitle: number; maxMessage: number },
): PersonalFinanceTipResult {
  const cleaned = stripMarkdownCodeBlocksForDirectNotifyJson(raw);

  let parsed: { title?: unknown; message?: unknown; titleBn?: unknown; messageBn?: unknown };
  try {
    parsed = JSON.parse(cleaned) as typeof parsed;
  } catch {
    try {
      parsed = JSON.parse(sanitizeJson(cleaned)) as typeof parsed;
    } catch {
      const recovered = recoverDirectNotifyFieldsFromBrokenJson(raw, fallbackTitle);
      if (recovered) {
        console.warn('[DirectNotify AI] Used tolerant JSON recovery (truncated or malformed output).');
        return recovered;
      }
      console.error('[DirectNotify AI] JSON.parse failed. Raw model output:', raw);
      const hint =
        'Could not parse the AI response as JSON (invalid format or extra text). ' +
        'Open the browser developer console (F12) to see the full raw response. ' +
        `Snippet: ${raw.slice(0, 280)}${raw.length > 280 ? '…' : ''}`;
      throw new Error(hint);
    }
  }

  let title =
    typeof parsed.title === 'string'
      ? parsed.title.trim()
      : typeof parsed.titleBn === 'string'
        ? parsed.titleBn.trim()
        : '';
  let message =
    typeof parsed.message === 'string'
      ? parsed.message.trim()
      : typeof parsed.messageBn === 'string'
        ? parsed.messageBn.trim()
        : '';

  if (!message) {
    const recovered = recoverDirectNotifyFieldsFromBrokenJson(raw, fallbackTitle);
    if (recovered) return recovered;
    throw new Error('AI returned an empty message.');
  }

  if (!title) title = fallbackTitle;

  return clampPersonalFinanceTipResult(title, message, fallbackTitle, limits);
}

/**
 * Bengali notification title + body for admin Direct Notify — category-aware (loan/debt, shopping/food, rent/utilities).
 * JSON mode; message capped at 140 characters.
 */
export async function generatePersonalFinanceTip(params: PersonalFinanceTipParams): Promise<PersonalFinanceTipResult> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file.',
    );
  }

  const catRaw =
    params.topCategory && String(params.topCategory).trim() && String(params.topCategory).trim() !== 'N/A'
      ? String(params.topCategory).trim()
      : '';
  const bucket = classifyDirectNotifyCategoryBucket(catRaw);
  const fallbackTitle = 'আপনার আর্থিক আপডেট';

  const prompt = buildDirectNotifyJsonPrompt(params, bucket);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const errors: string[] = [];

  const baseTipConfig = {
    responseMimeType: 'application/json' as const,
    temperature: 0.78,
    topP: 0.9,
    /** Small JSON only, but Flash sometimes needed extra headroom to finish closing braces. */
    maxOutputTokens: 2048,
  };

  for (const modelName of TIP_MODEL_CANDIDATES) {
    try {
      const run = async (useSchema: boolean) => {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: useSchema
            ? { ...baseTipConfig, responseSchema: DIRECT_NOTIFY_RESPONSE_SCHEMA }
            : baseTipConfig,
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const cand = response.candidates?.[0];
        const raw = getDirectNotifyRawText(response);
        if (!raw) {
          const fr = cand?.finishReason ?? 'unknown';
          throw new Error(
            `Gemini returned empty output (finishReason: ${fr}). Try again or pick another model.`,
          );
        }
        if (cand?.finishReason === FinishReason.MAX_TOKENS) {
          console.warn(
            `[DirectNotify AI] ${modelName} hit MAX_TOKENS; output may be truncated.`,
          );
        }
        return parsePersonalFinanceTipJson(raw, fallbackTitle);
      };

      try {
        return await run(true);
      } catch (first: unknown) {
        const msg = first instanceof Error ? first.message : String(first);
        if (
          /responseSchema|schema|invalid argument|400|unsupported/i.test(msg) &&
          !/parse|JSON|empty/i.test(msg)
        ) {
          return await run(false);
        }
        throw first;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || /quota/i.test(msg)) {
        throw new Error('Gemini API quota exceeded (429). Please wait and try again.');
      }
      if (msg.includes('404') || /not found/i.test(msg)) {
        errors.push(`${modelName}: unavailable`);
        continue;
      }
      throw new Error(`Gemini: ${msg.slice(0, 400)}`);
    }
  }

  throw new Error(
    `No Gemini model available for tips. Tried: ${TIP_MODEL_CANDIDATES.join(', ')}`,
  );
}

/**
 * Rich-context re-engagement push for one user (all-time stats + notes).
 * Appends {@link REENGAGEMENT_NOTIFICATION_DISCLAIMER_BN} to the body automatically.
 */
export async function generateReengagementPushForUser(
  params: ReengagementPushParams,
): Promise<PersonalFinanceTipResult> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file.',
    );
  }

  const catRaw =
    params.topCategory && String(params.topCategory).trim() && String(params.topCategory).trim() !== 'N/A'
      ? String(params.topCategory).trim()
      : '';
  const bucket = classifyDirectNotifyCategoryBucket(catRaw);
  const fallbackTitle = 'Ay Bay Er GustiMari';

  const prompt = buildReengagementPushPrompt(params, bucket);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const errors: string[] = [];

  const baseReengageConfig = {
    responseMimeType: 'application/json' as const,
    temperature: 0.82,
    topP: 0.92,
    maxOutputTokens: 2048,
  };

  for (const modelName of TIP_MODEL_CANDIDATES) {
    try {
      const run = async (useSchema: boolean) => {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: useSchema
            ? { ...baseReengageConfig, responseSchema: DIRECT_NOTIFY_RESPONSE_SCHEMA }
            : baseReengageConfig,
        });
        const result = await model.generateContent(prompt);
        const raw = getDirectNotifyRawText(result.response);
        const parsed = parsePersonalFinanceTipJson(raw, fallbackTitle, {
          maxTitle: REENGAGE_TITLE_MAX,
          maxMessage: REENGAGE_CORE_MSG_MAX,
        });
        return {
          title: parsed.title,
          message: mergeDisclaimerIntoPushBody(parsed.message, REENGAGEMENT_NOTIFICATION_DISCLAIMER_BN),
        };
      };

      try {
        return await run(true);
      } catch (first: unknown) {
        const msg = first instanceof Error ? first.message : String(first);
        if (
          /responseSchema|schema|invalid argument|400|unsupported/i.test(msg) &&
          !/parse|JSON|empty/i.test(msg)
        ) {
          return await run(false);
        }
        throw first;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || /quota/i.test(msg)) {
        throw new Error('Gemini API quota exceeded (429). Please wait and try again.');
      }
      if (msg.includes('404') || /not found/i.test(msg)) {
        errors.push(`${modelName}: unavailable`);
        continue;
      }
      throw new Error(`Gemini: ${msg.slice(0, 400)}`);
    }
  }

  throw new Error(
    `No Gemini model available for re-engagement push. Tried: ${TIP_MODEL_CANDIDATES.join(', ')}`,
  );
}

/** Prefer Gemini 1.5 Flash for admin User Monitoring Board strategic insight. */
const ADMIN_STRATEGIC_MODEL_CANDIDATES = [
  'gemini-1.5-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
] as const;

/**
 * Admin-only insight: financial persona + one concrete marketing move.
 * Model speaks to the administrator, not the end user.
 */
export async function generateAdminUserStrategicInsight(adminDataSummary: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file.',
    );
  }

  const prompt = `You are a growth and product strategist assisting the ADMINISTRATOR of the personal finance app "Ay Bay Er GustiMari".

CRITICAL RULES:
- Do NOT address the end user. Never write "you" meaning the customer.
- Write only for the ADMIN: use "This user", "They", and imperative advice to the admin ("Offer them…", "Consider sending…").
- Plain text only. No markdown headings, no bullet markdown, no JSON.

User data summary (may include JSON with fields such as monthlyIncome, estimatedOutstandingBorrowedDebt, topExpenseCategories, lqiScore, leadTier):
---
${adminDataSummary}
---

You are optimizing lead generation for "Ay Bay Er GustiMari" (personal finance app with optional Pro / premium features).

1) Using their income, debt (borrowed/outstanding if provided), and top expense categories, assign a concise persona label (examples: Aspiring Entrepreneur, Wealthy Professional, Budget-Conscious Salaried, Side-Hustle Earner, Debt-Focused User — pick one that fits best).

2) In 2–4 sentences, describe their financial behavior and what that implies for upsell risk/reward.

3) Recommend one specific product or Pro feature to push next via in-app or push notification (name the feature plainly, e.g. "export & reports", "category budgets", "debt reminders", "family multi-user", etc.) and one sentence on why it fits this persona.

4) Still give ONE concrete marketing angle or campaign hook the admin can use (can overlap with (3) if tight).

Keep speaking only to the admin. Plain text, no markdown.`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const errors: string[] = [];

  for (const modelName of ADMIN_STRATEGIC_MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.72,
          topP: 0.9,
          maxOutputTokens: 1024,
        },
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/^\uFEFF/, '').trim();
      if (!text) {
        throw new Error('Gemini returned an empty response.');
      }
      console.info(`[Gemini] Admin strategic insight — model: ${modelName}`);
      return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('429') || /quota/i.test(msg)) {
        throw new Error('Gemini API quota exceeded (429). Please wait and try again.');
      }
      if (msg.includes('404') || /not found/i.test(msg)) {
        errors.push(`${modelName}: unavailable`);
        continue;
      }
      throw new Error(`Gemini API error (${modelName}): ${msg.slice(0, 400)}`);
    }
  }

  throw new Error(
    `No Gemini model available for admin insight.\nTried: ${ADMIN_STRATEGIC_MODEL_CANDIDATES.join(', ')}\n${errors.join('\n')}`,
  );
}
