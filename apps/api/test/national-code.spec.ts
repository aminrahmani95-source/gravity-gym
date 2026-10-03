import { describe, it, expect } from 'vitest';
import {
  normalizePersianDigits,
  isValidIranianNationalCode,
  cleanIranianNationalCode,
} from '../src/common/utils/iranian-national-code.util';

describe('Iranian National Code & Digit Normalization Utility', () => {
  describe('normalizePersianDigits', () => {
    it('should correctly convert Persian digits to ASCII', () => {
      expect(normalizePersianDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
      expect(normalizePersianDigits('۱۲۳۴۵')).toBe('12345');
    });

    it('should correctly convert Arabic digits to ASCII', () => {
      expect(normalizePersianDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    });

    it('should preserve standard ASCII and non-digit characters unchanged', () => {
      expect(normalizePersianDigits('abc-123-آب')).toBe('abc-123-آب');
    });

    it('should handle empty or null values gracefully', () => {
      expect(normalizePersianDigits('')).toBe('');
      expect(normalizePersianDigits(null as any)).toBe('');
      expect(normalizePersianDigits(undefined as any)).toBe('');
    });
  });

  describe('isValidIranianNationalCode', () => {
    it('should validate mathematically valid 10-digit codes', () => {
      // 1234567891: Sum=210, Remainder=1, Check=1
      expect(isValidIranianNationalCode('1234567891')).toBe(true);
      // 0084567899: Sum=222, Remainder=2, Check=11-2=9
      expect(isValidIranianNationalCode('0084567899')).toBe(true);
    });

    it('should validate valid codes with Persian and Arabic digits', () => {
      expect(isValidIranianNationalCode('۱۲۳۴۵۶۷۸۹۱')).toBe(true);
      expect(isValidIranianNationalCode('۰۰۸۴۵۶۷۸۹۹')).toBe(true);
      expect(isValidIranianNationalCode('٠٠٨٤٥٦٧٨٩٩')).toBe(true);
    });

    it('should accept 8 or 9 digit codes with omitted leading zeroes', () => {
      // '84567899' with padded '00' becomes '0084567899'
      expect(isValidIranianNationalCode('84567899')).toBe(true);
    });

    it('should reject repetitive digit test patterns', () => {
      expect(isValidIranianNationalCode('0000000000')).toBe(false);
      expect(isValidIranianNationalCode('1111111111')).toBe(false);
      expect(isValidIranianNationalCode('2222222222')).toBe(false);
      expect(isValidIranianNationalCode('9999999999')).toBe(false);
    });

    it('should reject invalid checksum codes', () => {
      expect(isValidIranianNationalCode('1234567890')).toBe(false);
      expect(isValidIranianNationalCode('1234567892')).toBe(false);
      expect(isValidIranianNationalCode('0012345678')).toBe(false);
    });

    it('should reject non-numeric and bad-length strings', () => {
      expect(isValidIranianNationalCode('')).toBe(false);
      expect(isValidIranianNationalCode(null)).toBe(false);
      expect(isValidIranianNationalCode('12345')).toBe(false);
      expect(isValidIranianNationalCode('123456789012')).toBe(false);
      expect(isValidIranianNationalCode('123456789a')).toBe(false);
      expect(isValidIranianNationalCode('abcdefghij')).toBe(false);
    });
  });

  describe('cleanIranianNationalCode', () => {
    it('should return normalized 10-digit zero-padded string for valid codes', () => {
      expect(cleanIranianNationalCode('1234567891')).toBe('1234567891');
      expect(cleanIranianNationalCode('۱۲۳۴۵۶۷۸۹۱')).toBe('1234567891');
      expect(cleanIranianNationalCode('84567899')).toBe('0084567899');
    });

    it('should return null for invalid codes', () => {
      expect(cleanIranianNationalCode('0000000000')).toBeNull();
      expect(cleanIranianNationalCode('invalid')).toBeNull();
      expect(cleanIranianNationalCode('')).toBeNull();
      expect(cleanIranianNationalCode(null)).toBeNull();
    });
  });
});
