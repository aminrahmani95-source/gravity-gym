export enum NotificationPattern {
  OTP = 'gravity-otp',
  SUBSCRIPTION_ACTIVATED = 'gravity-sub-active',
  PAYMENT_FAILED = 'gravity-payment-fail',
  EXPIRING_SOON = 'gravity-expiring',
  CHECKIN_APPROVED = 'gravity-checkin-success',
  CHECKIN_REJECTED = 'gravity-checkin-reject',
}

export interface DispatchedNotification {
  id: string;
  phoneNumber: string;
  pattern: NotificationPattern;
  tokens: Record<string, string>;
  dispatchedAt: string;
  success: boolean;
}

export interface ISmsProvider {
  sendPattern(phoneNumber: string, pattern: NotificationPattern, tokens: Record<string, string>): Promise<boolean>;
  getDispatchedLogs?(): DispatchedNotification[];
  clearLogs?(): void;
}

/**
 * Privacy helper to mask Iranian phone numbers in application logs.
 * Example: '09123456789' -> '0912***6789'
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 7) {
    return '***';
  }
  const clean = phone.trim();
  const start = clean.slice(0, 4);
  const end = clean.slice(-4);
  return `${start}***${end}`;
}
