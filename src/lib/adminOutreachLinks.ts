/**
 * Admin outreach — User Monitoring Board (draft links + future API hooks).
 *
 * Wired now (no backend):
 * - App push → `queueNotificationForUser` + Cloud Function (see fcmUtils).
 * - SMS → `sms:` URI (opens default messenger on phone / some desktops).
 * - Email → `mailto:` (opens default mail client).
 * - WhatsApp → `https://wa.me/{digits}?text=` (WhatsApp Web/App).
 *
 * Integrate later (call from admin Cloud Function or trusted backend):
 * - SMS: Twilio, MessageBird, local gateway.
 * - Email: SendGrid, Resend, SES, Firebase Extension "Trigger Email".
 * - WhatsApp: Meta WhatsApp Business Cloud API / Twilio WhatsApp.
 */

/** E.164-style digits only (no +). */
function digitsOnly(phoneRaw: string | undefined | null): string {
  return String(phoneRaw ?? '').replace(/\D/g, '');
}

export function buildSmsDraftHref(phoneRaw: string | undefined, body: string): string | null {
  const d = digitsOnly(phoneRaw);
  if (d.length < 10) return null;
  return `sms:${d}?body=${encodeURIComponent(body.trim() || ' ')}`;
}

export function buildMailtoHref(
  email: string | undefined,
  subject: string,
  body: string,
): string | null {
  const e = String(email ?? '').trim();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return `mailto:${e}?subject=${encodeURIComponent(subject.trim() || 'Ay Bay Er GustiMari')}&body=${encodeURIComponent(body)}`;
}

/**
 * WhatsApp wa.me expects country code without + (e.g. 8801712345678).
 * Bangladesh: 01XXXXXXXXX → 8801XXXXXXXXX; 10-digit local (1XXXXXXXXX) → 880 + digits.
 */
export function buildWhatsAppWebHref(phoneRaw: string | undefined, text: string): string | null {
  let d = digitsOnly(phoneRaw);
  if (d.length < 10) return null;
  if (d.startsWith('880') && d.length >= 12) {
    /* already E.164-style BD */
  } else if (d.startsWith('0') && d.length === 11) {
    d = `880${d.slice(1)}`;
  } else if (d.length === 10 && d.startsWith('1')) {
    d = `880${d}`;
  } else if (d.length === 10 && !d.startsWith('880')) {
    d = `880${d}`;
  }
  return `https://wa.me/${d}?text=${encodeURIComponent(text.trim() || ' ')}`;
}
