// ─────────────────────────────────────────────────────────────────────────────
// Gemini AI content generation for the Re-engagement Blog System
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const BASE_URL = 'https://generativelanguage.googleapis.com';

/**
 * Ordered list of model + version combinations to try.
 * gemini-2.5-flash is the primary; older 1.5/2.0 models are NOT available on
 * new API keys (they return 404). Fallbacks cover regional availability gaps.
 */
const MODEL_CANDIDATES = [
  { version: 'v1beta', model: 'gemini-2.5-flash' },
  { version: 'v1beta', model: 'gemini-2.5-flash-lite' },
  { version: 'v1beta', model: 'gemini-2.0-flash-lite' },
  { version: 'v1beta', model: 'gemini-flash-latest' },
] as const;

function buildEndpoint(version: string, model: string): string {
  return `${BASE_URL}/${version}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

export interface GeneratedBlogContent {
  title: string;
  notificationMessage: string;
  blogContent: string;
  imagePrompt: string;
  ctaText: string;
}

// Map profession IDs → Bengali labels for the AI prompt
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

function buildPrompt(userName: string, profession: string, category?: string): string {
  const profBn = getProfessionBn(profession);
  const firstName = userName.split(' ')[0] || userName;

  // When a specific spending/earning category is provided, focus the story on it
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
1. The app name is ALWAYS "Ay Bay Er GustiMari". NEVER use "GustiMari" alone — always write the full name.
2. Respond ONLY with a valid JSON object — no markdown, no code fences, no extra text before or after the JSON.

Generate re-engagement content for a user. Respond ONLY with a valid JSON object.

User context:
- First name: ${firstName}
- Full name: ${userName}
- Profession: ${profession} (Bengali: ${profBn})${categoryContext}

Required JSON keys (all values are strings):
{
  "title": "Catchy Bengali title ≤ 70 chars. Must address the user by profession label. Example: ${titleExample}",
  "notificationMessage": "Short Bengali notification body ≤ 120 chars. Conversational, friendly, creates curiosity. If a target category was given, hint at it.",
  "blogContent": "A 200-word funny and relatable Bengali story about the user's profession and money struggles${category ? `, specifically focused on the '${category}' category` : ''}. Use Bangla slang, humor, and a warm tone. End with a motivational sentence encouraging them to track their finances. Pure Bengali prose — no English sentences.",
  "imagePrompt": "English description for a fun 3D illustration${category ? ` related to '${category}' and the user's profession` : ' matching the profession'}. Pixar/cartoon style, bright pastel background.",
  "ctaText": "Bengali call-to-action button text ≤ 35 chars. Example: 'হিসাব দেখতে এখানে ক্লিক করুন'"
}

Be creative, funny, and culturally relevant to Bangladesh. The story should make the user smile and feel understood.`;
}

/** Parse and validate the raw text returned by Gemini */
function parseResponse(raw: string): GeneratedBlogContent {
  if (!raw) throw new Error('Gemini returned an empty response. Please try again.');

  // Primary strategy: extract the first {...} JSON object using a regex.
  // This handles responses wrapped in markdown code fences or with extra preamble text.
  let jsonString: string;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonString = jsonMatch[0];
  } else {
    // Fallback: strip markdown code fences manually
    jsonString = raw
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
  }

  let parsed: Partial<GeneratedBlogContent>;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error(
      `Could not parse Gemini's response as JSON. The AI may have returned an unexpected format.\nSnippet: ${raw.slice(0, 300)}`
    );
  }

  const required: (keyof GeneratedBlogContent)[] = [
    'title',
    'notificationMessage',
    'blogContent',
    'imagePrompt',
    'ctaText',
  ];
  for (const key of required) {
    if (!parsed[key] || typeof parsed[key] !== 'string') {
      parsed[key] = `[${key} not generated]`;
    }
  }

  return parsed as GeneratedBlogContent;
}

/**
 * Calls the Gemini API with automatic model fallback.
 * Tries each candidate in MODEL_CANDIDATES order; skips 404s and moves on.
 * Throws a descriptive Error only when all candidates are exhausted.
 */
export async function generateBlogContent(
  userName: string,
  profession: string,
  category?: string
): Promise<GeneratedBlogContent> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Gemini API key is not configured. Add VITE_GEMINI_API_KEY to your .env file.'
    );
  }

  const requestBody = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(userName, profession, category) }] }],
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 1500,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  });

  const errors: string[] = [];

  for (const { version, model } of MODEL_CANDIDATES) {
    const endpoint = buildEndpoint(version, model);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
    } catch (networkErr) {
      errors.push(`${model} (${version}): network error — ${String(networkErr)}`);
      continue;
    }

    // 404 → model not available for this key/region, try next candidate
    if (response.status === 404) {
      errors.push(`${model} (${version}): 404 not found`);
      continue;
    }

    // 429 → quota exceeded — surface immediately, no point retrying other models
    if (response.status === 429) {
      throw new Error(
        'Gemini API quota exceeded (429). Please wait a moment and try again.'
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Gemini API error (${response.status}) with model "${model}": ${body.slice(0, 300)}`
      );
    }

    const data: any = await response.json();
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    console.info(`[Gemini] Used model: ${model} (${version})`);
    return parseResponse(raw);
  }

  // All candidates failed
  throw new Error(
    `All Gemini model candidates returned 404.\nTried:\n${errors.join('\n')}\n\nVerify that VITE_GEMINI_API_KEY is valid and the Gemini API is enabled in your Google Cloud project.`
  );
}
