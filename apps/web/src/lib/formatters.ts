/**
 * Centralized Typography & Number Formatting Utilities
 * Iranian Multi-Gym Platform (Gravity Fitness)
 * 
 * Rules:
 * 1. UI Prose & Counts: Persian digits (۰-۹)
 * 2. Financial: 3-digit comma separated with Persian numerals + 'تومان'
 * 3. Credits: Persian numerals + 'اعتبار'
 * 4. Technical IDs / Hashes / Nonces: Latin ASCII preserved with LTR direction
 * 5. Phone numbers: Normalized Persian or readable grouped format
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const LATIN_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Converts any number or string of Latin digits into Persian digits.
 */
export function toPersianDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const str = input.toString();
  return str.replace(/\d/g, d => PERSIAN_DIGITS[parseInt(d, 10)] ?? d);
}

/**
 * Converts any string of Persian digits into standard Latin digits (useful for inputs).
 */
export function toLatinDigits(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/[۰-۹]/g, d => {
    const idx = PERSIAN_DIGITS.indexOf(d);
    return idx >= 0 ? LATIN_DIGITS[idx] : d;
  });
}

/**
 * Formats a generic count or integer into Persian digits.
 * e.g., 45 -> "۴۵"
 */
export function formatPersianNumber(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '۰';
  return toPersianDigits(val);
}

/**
 * Formats monetary amounts in Tomans with Persian comma separators.
 * e.g., 1000000 -> "۱٬۰۰۰٬۰۰۰ تومان"
 */
export function formatMoney(tomans: number | string | null | undefined, includeUnit = true): string {
  if (tomans === null || tomans === undefined) return includeUnit ? '۰ تومان' : '۰';
  const num = typeof tomans === 'string' ? parseInt(toLatinDigits(tomans), 10) : tomans;
  if (isNaN(num)) return includeUnit ? '۰ تومان' : '۰';

  const parts = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const persianFormatted = toPersianDigits(parts);
  return includeUnit ? `${persianFormatted} تومان` : persianFormatted;
}

export const formatTomans = formatMoney;

/**
 * Formats credit units with Persian digits.
 * e.g., 30 -> "۳۰ اعتبار"
 */
export function formatCredits(credits: number | string | null | undefined, includeUnit = true): string {
  if (credits === null || credits === undefined) return includeUnit ? '۰ اعتبار' : '۰';
  const persianNum = toPersianDigits(credits);
  return includeUnit ? `${persianNum} اعتبار` : persianNum;
}

/**
 * Formats mobile phone numbers into readable Persian presentation.
 * e.g., "09123456789" -> "۰۹۱۲-۳۴۵-۶۷۸۹" or "۰۹۱۲۳۴۵۶۷۸۹"
 */
export function formatPhone(phone: string | null | undefined, grouped = false): string {
  if (!phone) return '';
  const clean = toLatinDigits(phone).replace(/\s+/g, '');
  if (!grouped) {
    return toPersianDigits(clean);
  }
  if (clean.length === 11 && clean.startsWith('09')) {
    const g = `${clean.slice(0, 4)}-${clean.slice(4, 7)}-${clean.slice(7)}`;
    return toPersianDigits(g);
  }
  return toPersianDigits(clean);
}

/**
 * Formats distance in kilometers.
 * e.g., 2.5 -> "۲٫۵ کیلومتر"
 */
export function formatDistance(km: number | string | null | undefined): string {
  if (km === null || km === undefined) return '';
  const str = km.toString().replace('.', '٫');
  return `${toPersianDigits(str)} کیلومتر`;
}

/**
 * Formats seconds for countdown timer.
 * e.g., 45 -> "۴۵ ثانیه"
 */
export function formatSeconds(sec: number | string | null | undefined): string {
  if (sec === null || sec === undefined) return '۰ ثانیه';
  return `${toPersianDigits(sec)} ثانیه`;
}

/**
 * Formats an ISO date into Persian localized date string.
 * e.g., "1405/07/08" or "۸ مهر ۱۴۰۵"
 */
export function formatDateFa(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Formats an ISO date into Persian date and time string.
 */
export function formatDateTimeFa(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}

