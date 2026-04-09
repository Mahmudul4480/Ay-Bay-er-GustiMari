/**
 * Client device fingerprint from `navigator.userAgent` + display mode (OS, browser, access surface, brand).
 * Persisted on `users/{uid}.deviceInfo` from AuthContext after sign-in.
 */

export type DetectedOs = 'Android' | 'iOS' | 'Windows' | 'Mac' | 'Linux' | 'Unknown';

/** Stored on Firestore `deviceInfo.accessType`. */
export type DeviceAccessType =
  | 'Installed App'
  | 'Mobile Browser'
  | 'Desktop'
  | 'In-App Browser (FB/WA)';

export interface ClientDeviceInfo {
  os: DetectedOs;
  browser: string;
  accessType: DeviceAccessType;
  deviceBrand: string;
}

function detectBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera\b/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS/i.test(ua)) return 'Safari';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/FxiOS/i.test(ua)) return 'Firefox';
  if (/UCBrowser/i.test(ua)) return 'UC Browser';
  return 'Other';
}

function detectOs(ua: string): DetectedOs {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows NT|Win64|Win32|WOW64/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'Mac';
  if (/Linux|X11|CrOS/i.test(ua)) return 'Linux';
  return 'Unknown';
}

/** Facebook / Messenger / WhatsApp in-app WebViews (common UA markers). */
export function detectInAppFacebookOrWhatsApp(ua: string): boolean {
  const u = ua.trim();
  if (!u) return false;
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS|\[FB;/i.test(u)) return true;
  if (/WhatsApp/i.test(u)) return true;
  return false;
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* matchMedia unavailable */
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function resolveAccessType(ua: string, os: DetectedOs): DeviceAccessType {
  if (detectInAppFacebookOrWhatsApp(ua)) return 'In-App Browser (FB/WA)';
  if (isStandaloneDisplayMode()) return 'Installed App';
  if (os === 'Android' || os === 'iOS') return 'Mobile Browser';
  return 'Desktop';
}

/** Best-effort handset / platform label for admin analytics. */
export function detectDeviceBrand(ua: string, os: DetectedOs): string {
  const u = ua.trim();
  if (!u) return 'Unknown';
  if (/iPhone/i.test(u)) return 'iPhone';
  if (/iPad/i.test(u)) return 'iPad';
  if (/iPod/i.test(u)) return 'iPod';
  if (os === 'Android') {
    if (/SamsungBrowser/i.test(u) || /Samsung|SM-[A-Z0-9]/i.test(u)) return 'Samsung';
    if (/\bXiaomi\b|\bRedmi\b|\bPOCO\b|MiuiBrowser/i.test(u)) return 'Xiaomi';
    if (/OPPO|\bRealme\b/i.test(u)) return 'OPPO / Realme';
    if (/\bvivo\b/i.test(u)) return 'vivo';
    if (/OnePlus/i.test(u)) return 'OnePlus';
    if (/Pixel/i.test(u)) return 'Google Pixel';
    if (/Huawei|HONOR/i.test(u)) return 'Huawei';
    if (/LG-|; LG/i.test(u)) return 'LG';
    if (/Motorola|Moto\s/i.test(u)) return 'Motorola';
    return 'Android device';
  }
  if (os === 'Mac') return 'Mac';
  if (os === 'Windows') return 'Windows PC';
  if (os === 'Linux') return 'Linux';
  return 'Unknown';
}

/**
 * Reads `navigator.userAgent` (or an override), display-mode standalone / iOS `navigator.standalone`,
 * and returns OS, browser, access surface, and device brand.
 */
export function detectClientDevice(userAgent?: string): ClientDeviceInfo {
  if (typeof navigator === 'undefined' && userAgent == null) {
    return {
      os: 'Unknown',
      browser: 'Unknown',
      accessType: 'Desktop',
      deviceBrand: 'Unknown',
    };
  }
  const ua = String(userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''));
  if (!ua.trim()) {
    const at: DeviceAccessType = isStandaloneDisplayMode() ? 'Installed App' : 'Desktop';
    return { os: 'Unknown', browser: 'Unknown', accessType: at, deviceBrand: 'Unknown' };
  }
  const osDetected = detectOs(ua);
  return {
    os: osDetected,
    browser: detectBrowser(ua),
    accessType: resolveAccessType(ua, osDetected),
    deviceBrand: detectDeviceBrand(ua, osDetected),
  };
}

/**
 * Handset / tablet (or touch + narrow viewport) — used when `beforeinstallprompt`
 * may never fire but we still want an “install / add to home screen” hint.
 */
export function isMobileOrTabletBrowserClient(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    const narrow = window.matchMedia?.('(max-width: 1023px)')?.matches;
    if (coarse && narrow) return true;
  } catch {
    /* matchMedia unavailable */
  }
  return false;
}

/** Normalize stored Firestore string to a known OS bucket for UI. */
export function normalizeStoredOs(os: string | undefined | null): DetectedOs {
  const s = String(os ?? '').trim().toLowerCase();
  if (!s) return 'Unknown';
  if (s.includes('android')) return 'Android';
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 'iOS';
  if (s.includes('windows') || s === 'win32') return 'Windows';
  if (s.includes('mac')) return 'Mac';
  if (s.includes('linux')) return 'Linux';
  return 'Unknown';
}
