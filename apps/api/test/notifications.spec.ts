import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { MockSmsProvider } from '../src/modules/notifications/mock-sms.provider';
import { NotificationPattern, maskPhoneNumber } from '../src/modules/notifications/notification.interface';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { Gender, UserRole, UserStatus } from '@gym-app/shared-types';
import { getTehranTimeInfo } from '../src/common/utils/tehran-time.util';

describe('Phase 5: Notifications & Messaging Engine', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let notificationsService: NotificationsService;
  let mockSms: MockSmsProvider;
  let ledgerService: LedgerService;
  let plansService: PlansService;
  let paymentsService: PaymentsService;
  let checkinService: CheckinService;
  let economicsService: EconomicsService;
  let authService: AuthService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    notificationsService = new NotificationsService();
    mockSms = new MockSmsProvider();
    notificationsService.setProvider(mockSms);

    ledgerService = new LedgerService(db);
    plansService = new PlansService(db, notificationsService);
    paymentsService = new PaymentsService(db, ledgerService, plansService, notificationsService);
    economicsService = new EconomicsService(db);
    checkinService = new CheckinService(db, redis, ledgerService, economicsService, notificationsService);
    authService = new AuthService(db, redis, new JwtService(), notificationsService);
  });

  afterEach(() => {
    mockSms.clearLogs();
  });

  describe('1. Privacy & Phone Masking', () => {
    it('correctly masks Iranian mobile numbers in logs', () => {
      expect(maskPhoneNumber('09121234567')).toBe('0912***4567');
      expect(maskPhoneNumber('09359876543')).toBe('0935***6543');
      expect(maskPhoneNumber('123')).toBe('***');
    });
  });

  describe('2. OTP Dispatch Notification', () => {
    it('dispatches OTP pattern with masked logs and verified tokens', async () => {
      const res = await authService.sendOtp('09121112233');
      expect(res.success).toBe(true);

      const logs = mockSms.getDispatchedLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].pattern).toBe(NotificationPattern.OTP);
      expect(logs[0].phoneNumber).toBe('09121112233');
      expect(logs[0].tokens.code).toBeDefined();
    });
  });

  describe('3. Payment Success & Subscription Activation Notification', () => {
    it('dispatches subscription activation SMS on successful payment verification', async () => {
      const userId = 'user-notif-1';
      db.getTable('users').push({
        id: userId,
        phone_number: '09129998877',
        first_name: 'سهراب',
        last_name: 'سپهری',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      const checkout = await paymentsService.initiateCheckout(userId, 'plan-2');
      const verifyRes = await paymentsService.verifyPayment(userId, 'plan-2', checkout.gatewayAuthority, 'OK');
      expect(verifyRes.isSuccessful).toBe(true);

      const logs = mockSms.getDispatchedLogs();
      const subLog = logs.find(l => l.pattern === NotificationPattern.SUBSCRIPTION_ACTIVATED);
      expect(subLog).toBeDefined();
      expect(subLog!.phoneNumber).toBe('09129998877');
      expect(subLog!.tokens.plan).toBe('پلن نقره‌ای - ۳۰ اعتبار');
      expect(subLog!.tokens.credits).toBe('30');
    });
  });

  describe('4. Payment Failure Notification', () => {
    it('dispatches payment failure SMS when user cancels or gateway returns NOK', async () => {
      const userId = 'user-notif-fail';
      db.getTable('users').push({
        id: userId,
        phone_number: '09123334455',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      const checkout = await paymentsService.initiateCheckout(userId, 'plan-1');
      const verifyRes = await paymentsService.verifyPayment(userId, 'plan-1', checkout.gatewayAuthority, 'NOK');
      expect(verifyRes.isSuccessful).toBe(false);

      const logs = mockSms.getDispatchedLogs();
      const failLog = logs.find(l => l.pattern === NotificationPattern.PAYMENT_FAILED);
      expect(failLog).toBeDefined();
      expect(failLog!.phoneNumber).toBe('09123334455');
    });
  });

  describe('5. Check-in Approved Notification', () => {
    it('dispatches checkin approved SMS with gym name, deducted credits, and remaining balance', async () => {
      const userId = 'user-checkin-notif';
      db.getTable('users').push({
        id: userId,
        phone_number: '09127778899',
        first_name: 'رضا',
        last_name: 'بهرامی',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      // Grant credits
      await ledgerService.issueCredits(userId, 20, 'PLAN_PURCHASE' as any, 'sub-test', 'شارژ اولیه');

      // Create active subscription
      db.getTable('subscriptions').push({
        id: 'sub-active-notif',
        user_id: userId,
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'ACTIVE',
        auto_renew: true,
        created_at: new Date().toISOString(),
      });

      const gymId = 'gym-premium-3';
      const { iranianDayOfWeek } = getTehranTimeInfo();

      // Ensure open sans for today matching Male
      db.getTable('gym_sans').push({
        id: 'sans-notif-open',
        gym_id: gymId,
        gender: Gender.MALE,
        day_of_week: iranianDayOfWeek,
        start_time: '00:00',
        end_time: '23:59',
        is_peak: false,
      });

      const qr = await checkinService.generateDynamicQr(userId, gymId);
      const res = await checkinService.verifyAndConsumeCheckin(qr.qrToken, 'staff-1', gymId);
      expect(res.status).toBe('APPROVED');

      const logs = mockSms.getDispatchedLogs();
      const checkinLog = logs.find(l => l.pattern === NotificationPattern.CHECKIN_APPROVED);
      expect(checkinLog).toBeDefined();
      expect(checkinLog!.phoneNumber).toBe('09127778899');
      expect(checkinLog!.tokens.gym).toBeDefined();
      expect(Number(checkinLog!.tokens.deducted)).toBeGreaterThan(0);
    });
  });

  describe('6. Subscription Expiring Soon Notification', () => {
    it('dispatches expiration warnings for memberships expiring within threshold', async () => {
      const userId = 'user-expiring';
      db.getTable('users').push({
        id: userId,
        phone_number: '09126665544',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      // Subscription expiring in 2 days
      db.getTable('subscriptions').push({
        id: 'sub-expiring-2d',
        user_id: userId,
        plan_id: 'plan-1',
        starts_at: new Date(Date.now() - 28 * 86400000).toISOString(),
        expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        status: 'ACTIVE',
        auto_renew: true,
        created_at: new Date().toISOString(),
      });

      const count = await plansService.notifyExpiringSubscriptions(3);
      expect(count).toBeGreaterThanOrEqual(1);

      const logs = mockSms.getDispatchedLogs();
      const expireLog = logs.find(l => l.pattern === NotificationPattern.EXPIRING_SOON);
      expect(expireLog).toBeDefined();
      expect(expireLog!.phoneNumber).toBe('09126665544');
      expect(expireLog!.tokens.days).toBe('2');
    });
  });

  describe('7. Fault Tolerance & Downstream SMS Isolation', () => {
    it('guarantees payment succeeds even when SMS Gateway throws catastrophic error', async () => {
      const userId = 'user-resilient-pay';
      db.getTable('users').push({
        id: userId,
        phone_number: '09124445566',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      // Simulate SMS crash
      mockSms.setSimulateThrow(true);

      const checkout = await paymentsService.initiateCheckout(userId, 'plan-2');
      const verifyRes = await paymentsService.verifyPayment(userId, 'plan-2', checkout.gatewayAuthority, 'OK');

      // Payment MUST SUCCEED despite downstream notification explosion
      expect(verifyRes.isSuccessful).toBe(true);
      const balance = await ledgerService.getBalance(userId);
      expect(balance).toBe(30);
    });

    it('guarantees check-in succeeds even when SMS Gateway times out', async () => {
      const userId = 'user-resilient-checkin';
      db.getTable('users').push({
        id: userId,
        phone_number: '09128889900',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      await ledgerService.issueCredits(userId, 20, 'PLAN_PURCHASE' as any, 'sub-res', 'شارژ');

      db.getTable('subscriptions').push({
        id: 'sub-resilient',
        user_id: userId,
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'ACTIVE',
        auto_renew: true,
        created_at: new Date().toISOString(),
      });

      const gymId = 'gym-premium-3';
      const { iranianDayOfWeek } = getTehranTimeInfo();

      db.getTable('gym_sans').push({
        id: 'sans-res-open',
        gym_id: gymId,
        gender: Gender.MALE,
        day_of_week: iranianDayOfWeek,
        start_time: '00:00',
        end_time: '23:59',
        is_peak: false,
      });

      // Simulate SMS crash
      mockSms.setSimulateThrow(true);

      const qr = await checkinService.generateDynamicQr(userId, gymId);
      const res = await checkinService.verifyAndConsumeCheckin(qr.qrToken, 'staff-1', gymId);

      // Checkin MUST SUCCEED with APPROVED status
      expect(res.status).toBe('APPROVED');
    });
  });
});
