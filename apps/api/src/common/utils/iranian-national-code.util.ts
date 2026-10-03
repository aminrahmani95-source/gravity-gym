/**
 * Iranian National Code (کد ملی) and Persian Digits Normalization Utility
 * Complies with the Civil Registration Organization of Iran (سازمان ثبت احوال کشور) algorithm.
 */

/**
 * Normalizes Persian and Arabic numbers in a string to standard ASCII English digits (0-9).
 */
export function normalizePersianDigits(input: string): string {
  if (!input) return '';
  return input
    .replace(/[۰-۹]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 1728))
    .replace(/[٠-٩]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 1584));
}

/**
 * Validates an Iranian National Code (کد ملی) using the official Modulo 11 checksum algorithm.
 *
 * Rules:
 * 1. Must be exactly 10 digits after normalization and zero-padding.
 * 2. Cannot consist of all identical digits (e.g., 0000000000, 1111111111, ..., 9999999999 are invalid).
 * 3. Check digit d[9] calculation:
 *    Sum = sum(d[i] * (10 - i)) for i from 0 to 8
 *    Remainder = Sum % 11
 *    If Remainder < 2: Check Digit must equal Remainder
 *    If Remainder >= 2: Check Digit must equal (11 - Remainder)
 *
 * @param code Input code string (supports Persian digits and optional leading zeroes)
 * @returns boolean indicating validity
 */
export function isValidIranianNationalCode(code: string | undefined | null): boolean {
  if (!code) return false;

  const normalized = normalizePersianDigits(code.trim());

  // Check 1: Must contain only digits and be between 8 and 10 digits (allowing omitted leading zeroes)
  if (!/^\d{8,10}$/.test(normalized)) {
    return false;
  }

  // Zero-pad to exactly 10 digits if 8 or 9 digits were entered
  const padded = normalized.padStart(10, '0');

  // Check 2: All identical digits are invalid test patterns (0000000000, 1111111111, etc.)
  if (/^(\d)\1{9}$/.test(padded)) {
    return false;
  }

  // Check 3: Modulo 11 checksum calculation
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(padded.charAt(i), 10) * (10 - i);
  }

  const remainder = sum % 11;
  const checkDigit = parseInt(padded.charAt(9), 10);

  if (remainder < 2) {
    return checkDigit === remainder;
  } else {
    return checkDigit === (11 - remainder);
  }
}

/**
 * Formats and normalizes a national code to standard 10-digit zero-padded string.
 * Returns null if the code is invalid.
 */
export function cleanIranianNationalCode(code: string | undefined | null): string | null {
  if (!code) return null;
  const normalized = normalizePersianDigits(code.trim());
  if (!isValidIranianNationalCode(normalized)) {
    return null;
  }
  return normalized.padStart(10, '0');
}
