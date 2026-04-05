// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI content generation for the Re-engagement Blog System
// Uses the official @google/generative-ai SDK with JSON Mode enabled.
// JSON Mode (responseMimeType: 'application/json') forces Gemini to emit a
// bare JSON object — no markdown fences, no preamble prose — eliminating the
// most common parse failure at the source.
// ─────────────────────────────────────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';

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
