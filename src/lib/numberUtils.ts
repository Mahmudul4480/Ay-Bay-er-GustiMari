/**
 * Converts Bengali digits to ASCII digits.
 * @param str The string containing Bengali digits.
 * @returns The string with Bengali digits replaced by ASCII digits.
 */
export const convertBengaliToAscii = (str: string): string => {
  if (!str) return '';
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.split('').map(char => {
    const index = bengaliDigits.indexOf(char);
    if (index !== -1) return index.toString();
    if (char === ',') return '.';
    return char;
  }).join('');
};

export const sanitizeDecimal = (str: string): string => {
  if (!str) return '';
  const ascii = convertBengaliToAscii(str);
  // Remove everything except digits and dots
  let filtered = ascii.replace(/[^0-9.]/g, '');
  // Ensure only one dot
  const parts = filtered.split('.');
  if (parts.length > 2) {
    filtered = parts[0] + '.' + parts.slice(1).join('');
  }
  return filtered;
};

export const sanitizeInteger = (str: string): string => {
  if (!str) return '';
  const ascii = convertBengaliToAscii(str);
  // Remove everything except digits
  return ascii.replace(/[^0-9]/g, '');
};

export const isValidDecimal = (str: string): boolean => {
  if (!str) return true;
  const asciiStr = convertBengaliToAscii(str);
  // Allow digits and at most one dot
  return /^[0-9.]*$/.test(asciiStr) && (asciiStr.match(/\./g) || []).length <= 1;
};

export const isValidInteger = (str: string): boolean => {
  if (!str) return true;
  const asciiStr = convertBengaliToAscii(str);
  return /^[0-9]*$/.test(asciiStr);
};
