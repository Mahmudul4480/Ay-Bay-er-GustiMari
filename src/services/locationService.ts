/**
 * IP-based approximate location via ipapi.co (no API key for basic JSON endpoint).
 * All failures are non-throwing so the app keeps running.
 */

const IPAPI_URL = 'https://ipapi.co/json/';
const FETCH_TIMEOUT_MS = 12_000;

export interface UserLocationData {
  ip: string;
  city: string;
  region: string;
  postalCode: string;
}

interface IpApiSuccess {
  ip?: string;
  city?: string;
  region?: string;
  postal?: string;
  error?: boolean;
  reason?: string;
}

function normalizeStr(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/**
 * Fetches the client’s public IP and coarse location (city, region, postal).
 * Returns `null` if the request fails, times out, or the API reports an error — never throws.
 */
export async function getUserLocation(): Promise<UserLocationData | null> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(IPAPI_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const data = raw as IpApiSuccess;
    if (data.error === true) {
      return null;
    }

    const ip = normalizeStr(data.ip);
    if (!ip) {
      return null;
    }

    return {
      ip,
      city: normalizeStr(data.city),
      region: normalizeStr(data.region),
      postalCode: normalizeStr(data.postal),
    };
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
