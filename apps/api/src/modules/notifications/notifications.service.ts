import { Injectable, Logger } from '@nestjs/common';
import { ISmsProvider, NotificationPattern, maskPhoneNumber } from './notification.interface';
import { MockSmsProvider } from './mock-sms.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private smsProvider: ISmsProvider;

  constructor() {
    this.smsProvider = new MockSmsProvider();
  }

  setProvider(provider: ISmsProvider) {
    this.smsProvider = provider;
  }

  getProvider(): ISmsProvider {
    return this.smsProvider;
  }

  /**
   * Dispatches OTP pattern SMS
   * Hardened: failure never disrupts auth flow
   */
  async sendOtp(phone: string, code: string): Promise<boolean> {
    try {
      return await this.smsProvider.sendPattern(phone, NotificationPattern.OTP, {
        code,
      });
    } catch (err: any) {
      this.logger.error(
        `[Notification Error] Failed to send OTP to ${maskPhoneNumber(phone)}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Notifies member of newly activated subscription & issued credits
   */
  async notifySubscriptionActivated(
    phone: string,
    planTitle: string,
    credits: number,
    expiresAt: string,
  ): Promise<boolean> {
    try {
      const formattedDate = new Date(expiresAt).toLocaleDateString('fa-IR');
      return await this.smsProvider.sendPattern(
        phone,
        NotificationPattern.SUBSCRIPTION_ACTIVATED,
        {
          plan: planTitle,
          credits: credits.toString(),
          expiresAt: formattedDate,
        },
      );
    } catch (err: any) {
      this.logger.error(
        `[Notification Error] Failed to send subscription activation to ${maskPhoneNumber(phone)}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Notifies member of payment failure or cancellation
   */
  async notifyPaymentFailed(phone: string, reason: string): Promise<boolean> {
    try {
      return await this.smsProvider.sendPattern(phone, NotificationPattern.PAYMENT_FAILED, {
        reason: reason || 'تراکنش ناموفق بود',
      });
    } catch (err: any) {
      this.logger.error(
        `[Notification Error] Failed to send payment failure alert to ${maskPhoneNumber(phone)}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Notifies member of imminent subscription expiration
   */
  async notifyExpiringSoon(
    phone: string,
    planTitle: string,
    daysRemaining: number,
  ): Promise<boolean> {
    try {
      return await this.smsProvider.sendPattern(phone, NotificationPattern.EXPIRING_SOON, {
        plan: planTitle,
        days: daysRemaining.toString(),
      });
    } catch (err: any) {
      this.logger.error(
        `[Notification Error] Failed to send expiration notice to ${maskPhoneNumber(phone)}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Notifies member of successful check-in with consumed credits and remaining balance
   */
  async notifyCheckinApproved(
    phone: string,
    gymName: string,
    creditsDeducted: number,
    remainingCredits: number,
  ): Promise<boolean> {
    try {
      return await this.smsProvider.sendPattern(phone, NotificationPattern.CHECKIN_APPROVED, {
        gym: gymName,
        deducted: creditsDeducted.toString(),
        balance: remainingCredits.toString(),
      });
    } catch (err: any) {
      this.logger.error(
        `[Notification Error] Failed to send checkin approval to ${maskPhoneNumber(phone)}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Notifies member or records check-in rejection reason
   */
  async notifyCheckinRejected(
    phone: string,
    gymName: string,
    reason: string,
  ): Promise<boolean> {
    try {
      return await this.smsProvider.sendPattern(phone, NotificationPattern.CHECKIN_REJECTED, {
        gym: gymName,
        reason,
      });
    } catch (err: any) {
      this.logger.error(
        `[Notification Error] Failed to send checkin rejection notice to ${maskPhoneNumber(phone)}: ${err.message}`,
      );
      return false;
    }
  }
}
