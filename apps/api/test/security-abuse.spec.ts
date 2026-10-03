import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { Gender, UserRole, UserStatus } from '@gym-app/shared-types';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getTehranTimeInfo } from '../src/common/utils/tehran-time.util';

import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

describe('Phase 8: Final Security, Privacy & Abuse Audit', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let ledgerService: LedgerService;
  let economicsService: EconomicsService;
  let checkinService: CheckinService;
  let paymentsService: PaymentsService;
  let plansService: PlansService;
  let authService: AuthService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    ledgerService = new LedgerService(db);
    economicsService = new EconomicsService(db);
    checkinService = new CheckinService(db, redis, ledgerService, economicsService);
    plansService = new PlansService(db);
    paymentsService = new PaymentsService(db, ledgerService, plansService, undefined, redis);
    authService = new AuthService(db, redis, new JwtService({ secret: 'test-secret' }));
  });

  describe('1. Dynamic QR Cryptographic Abuse & Tampering', () => {
    it('rejects forged/tampered cryptographic signature in QR token', async () => {
      const userId = 'user-tamper-test';
      db.getTable('users').push({
        id: userId,
        phone_number: '09121110001',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      await ledgerService.issueCredits(userId, 20, 'PLAN_PURCHASE' as any, 'sub-tamper', 'شارژ');
      db.getTable('subscriptions').push({
        id: 'sub-tamper',
        user_id: userId,
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'ACTIVE',
        auto_renew: true,
        created_at: new Date().toISOString(),
      });

      const qr = await checkinService.generateDynamicQr(userId, 'gym-premium-3');

      // Decode, tamper with userId, re-encode without valid signature
      const decodedStr = Buffer.from(qr.qrToken, 'base64url').toString('utf8');
      const payload = JSON.parse(decodedStr);
      payload.sub = 'victim-user-id'; // Attacker attempts to check in as someone else
      const tamperedToken = Buffer.from(JSON.stringify(payload)).toString('base64url');

      await expect(
        checkinService.verifyAndConsumeCheckin(tamperedToken, 'staff-1', 'gym-premium-3'),
      ).rejects.toThrow(/امضای رمزنگاری بارکد نامعتبر یا دستکاری شده است/);
    });

    it('rejects replay attacks using the same QR token twice', async () => {
      const userId = 'user-replay-test';
      db.getTable('users').push({
        id: userId,
        phone_number: '09121110002',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      await ledgerService.issueCredits(userId, 30, 'PLAN_PURCHASE' as any, 'sub-replay', 'شارژ');
      db.getTable('subscriptions').push({
        id: 'sub-replay',
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
        id: 'sans-replay-open',
        gym_id: gymId,
        gender: Gender.MALE,
        day_of_week: iranianDayOfWeek,
        start_time: '00:00',
        end_time: '23:59',
        is_peak: false,
      });

      const qr = await checkinService.generateDynamicQr(userId, gymId);

      // First check-in: Approved
      const firstRes = await checkinService.verifyAndConsumeCheckin(qr.qrToken, 'staff-1', gymId);
      expect(firstRes.status).toBe('APPROVED');

      // Second check-in with identical token: Replay Attack rejection
      await expect(
        checkinService.verifyAndConsumeCheckin(qr.qrToken, 'staff-1', gymId),
      ).rejects.toThrow(/این بارکد قبلاً استفاده شده است/);
    });
  });

  describe('2. Payment Authorization & Cross-User Hijacking Protection', () => {
    it('prevents User B from verifying a payment initiated by User A', async () => {
      const userA = 'user-victim-a';
      const userB = 'user-attacker-b';

      db.getTable('users').push(
        { id: userA, phone_number: '09121110003', gender: Gender.MALE, role: UserRole.USER, status: UserStatus.ACTIVE },
        { id: userB, phone_number: '09121110004', gender: Gender.MALE, role: UserRole.USER, status: UserStatus.ACTIVE },
      );

      // User A initiates payment
      const checkout = await paymentsService.initiateCheckout(userA, 'plan-2');

      // Attacker User B intercepts authority and tries to verify for themselves
      await expect(
        paymentsService.verifyPayment(userB, 'plan-2', checkout.gatewayAuthority, 'OK'),
      ).rejects.toThrow(/شناسه پرداخت با کاربر درخواست‌دهنده مغایرت دارد/);
    });
  });

  describe('3. Account Status & State Firewalls', () => {
    it('blocks suspended accounts from generating dynamic QR tokens', async () => {
      const suspendedUser = 'user-suspended-test';
      db.getTable('users').push({
        id: suspendedUser,
        phone_number: '09121110005',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        checkinService.generateDynamicQr(suspendedUser, 'gym-premium-3'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks accounts with expired subscriptions from generating QR and checking in', async () => {
      const expiredUser = 'user-expired-sub-test';
      db.getTable('users').push({
        id: expiredUser,
        phone_number: '09121110006',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      // User has leftover credits but an expired subscription
      await ledgerService.issueCredits(expiredUser, 10, 'PLAN_PURCHASE' as any, 'sub-exp', 'شارژ');
      db.getTable('subscriptions').push({
        id: 'sub-exp',
        user_id: expiredUser,
        plan_id: 'plan-1',
        starts_at: new Date(Date.now() - 40 * 86400000).toISOString(),
        expires_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        status: 'EXPIRED',
        auto_renew: false,
        created_at: new Date(Date.now() - 40 * 86400000).toISOString(),
      });

      await expect(
        checkinService.generateDynamicQr(expiredUser, 'gym-premium-3'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks users with zero balance from generating dynamic QR tokens', async () => {
      const zeroBalanceUser = 'user-zero-balance';
      db.getTable('users').push({
        id: zeroBalanceUser,
        phone_number: '09121110007',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      // Active sub but 0 credits
      db.getTable('subscriptions').push({
        id: 'sub-zero',
        user_id: zeroBalanceUser,
        plan_id: 'plan-1',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 20 * 86400000).toISOString(),
        status: 'ACTIVE',
        auto_renew: true,
        created_at: new Date().toISOString(),
      });

      await expect(
        checkinService.generateDynamicQr(zeroBalanceUser, 'gym-premium-3'),
      ).rejects.toThrow(/موجودی اعتبار شما به اتمام رسیده است/);
    });
  });

  describe('4. Privacy & Data Leakage Prevention', () => {
    it('guarantees member check-in history never exposes cryptographic nonces or internal payout sums', async () => {
      const memberId = 'user-privacy-test';
      db.getTable('users').push({
        id: memberId,
        phone_number: '09121110008',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      db.getTable('checkins').push({
        id: 'chk-priv-1',
        user_id: memberId,
        gym_id: 'gym-premium-3',
        staff_user_id: 'staff-priv',
        credits_debited: 6,
        monetary_payout_tomans: 115000,
        status: 'COMPLETED',
        qr_nonce: 'SECRET_NONCE_ABC_123',
        created_at: new Date().toISOString(),
      });

      const history = await checkinService.getUserCheckinHistory(memberId);
      expect(history.length).toBe(1);
      const item = history[0] as any;

      expect(item.id).toBe('chk-priv-1');
      expect(item.creditsDebited).toBe(6);
      expect(item.qr_nonce).toBeUndefined();
      expect(item.qrNonce).toBeUndefined();
      expect(item.monetary_payout_tomans).toBeUndefined();
      expect(item.monetaryPayoutTomans).toBeUndefined();
    });
  });

  describe('5. Geographical Velocity & Impossible Travel Fraud Detection', () => {
    it('detects and blocks impossible transit velocity between disparate gym locations', async () => {
      const velocityUser = 'user-velocity-fraud';
      db.getTable('users').push({
        id: velocityUser,
        phone_number: '09121110009',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      await ledgerService.issueCredits(velocityUser, 50, 'PLAN_PURCHASE' as any, 'sub-vel', 'شارژ');
      db.getTable('subscriptions').push({
        id: 'sub-vel',
        user_id: velocityUser,
        plan_id: 'plan-3',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        status: 'ACTIVE',
        auto_renew: true,
        created_at: new Date().toISOString(),
      });

      const { iranianDayOfWeek } = getTehranTimeInfo();
      // Ensure sans is open at gym-elite-4 for male
      db.getTable('gym_sans').push({
        id: 'sans-vel-elite',
        gym_id: 'gym-elite-4',
        gender: Gender.MALE,
        day_of_week: iranianDayOfWeek,
        start_time: '00:00',
        end_time: '23:59',
        is_peak: false,
      });

      // Previous completed checkin at gym-basic-1 (Navvab, southern Tehran: 35.672, 51.385) exactly 3 minutes ago
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      db.getTable('checkins').push({
        id: 'chk-prev-south',
        user_id: velocityUser,
        gym_id: 'gym-basic-1',
        staff_user_id: 'staff-basic',
        credits_debited: 3,
        monetary_payout_tomans: 40000,
        status: 'COMPLETED',
        qr_nonce: 'nonce-prev-1',
        created_at: threeMinutesAgo,
      });

      // User attempts to check in at gym-elite-4 (Espinas Palace, northern Tehran: 35.795, 51.378)
      // Distance is ~14 km. 14 km in 3 minutes (0.05 h) = ~280 km/h > 70 km/h threshold!
      const qr = await checkinService.generateDynamicQr(velocityUser, 'gym-elite-4');

      await expect(
        checkinService.verifyAndConsumeCheckin(qr.qrToken, 'staff-elite', 'gym-elite-4'),
      ).rejects.toThrow(/جابجایی ناممکن جغرافیایی ثبت شد/);
    });
  });

  describe('6. Relational Engine Query & Order Integrity', () => {
    it('correctly executes multi-row ORDER BY created_at DESC with LIMIT 1', async () => {
      const testUser = 'user-order-test';
      const t1 = new Date(Date.now() - 10000).toISOString();
      const t2 = new Date(Date.now() - 5000).toISOString();
      const t3 = new Date(Date.now()).toISOString();

      db.getTable('credit_ledger').push(
        { id: 'cl-1', user_id: testUser, delta_credits: 20, balance_after: 20, entry_type: 'PLAN_PURCHASE', created_at: t1 },
        { id: 'cl-2', user_id: testUser, delta_credits: -4, balance_after: 16, entry_type: 'CHECKIN_DEBIT', created_at: t2 },
        { id: 'cl-3', user_id: testUser, delta_credits: -5, balance_after: 11, entry_type: 'CHECKIN_DEBIT', created_at: t3 },
      );

      const res = await db.query(
        'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [testUser]
      );

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].balance_after).toBe(11); // Must be the newest entry (11), NOT oldest (20)
    });

    it('correctly executes 2-table JOIN between subscriptions and plans', async () => {
      const subUser = 'user-sub-join-test';
      const subId = 'sub-join-1';
      db.getTable('subscriptions').push({
        id: subId,
        user_id: subUser,
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 20 * 86400000).toISOString(),
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
      });

      const res = await db.query(
        `SELECT s.*, p.title_fa as plan_title 
         FROM subscriptions s 
         JOIN plans p ON s.plan_id = p.id 
         WHERE s.user_id = $1 AND s.status = 'ACTIVE' 
         ORDER BY s.expires_at DESC LIMIT 1`,
        [subUser]
      );

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].id).toBe(subId);
      expect(res.rows[0].plan_title).toBe('پلن نقره‌ای - ۳۰ اعتبار');
    });
  });

  describe('7. Phone Number Normalization, Persian/Arabic Digits & Format Security', () => {
    it('correctly converts Persian digits to ASCII and normalizes mobile format', () => {
      const normalized = authService.normalizePhoneNumber('۰۹۱۲۰۰۰۰۰۰۳');
      expect(normalized).toBe('09120000003');
    });

    it('correctly converts Arabic digits to ASCII', () => {
      const normalized = authService.normalizePhoneNumber('٠٩١٢٣٤٥٦٧٨٩');
      expect(normalized).toBe('09123456789');
    });

    it('correctly normalizes +98, 0098, and 98 prefixes', () => {
      expect(authService.normalizePhoneNumber('+989123456789')).toBe('09123456789');
      expect(authService.normalizePhoneNumber('00989123456789')).toBe('09123456789');
      expect(authService.normalizePhoneNumber('989123456789')).toBe('09123456789');
      expect(authService.normalizePhoneNumber(' 0912-345-6789 ')).toBe('09123456789');
    });

    it('rejects invalid mobile numbers and non-numeric garbage', () => {
      expect(() => authService.normalizePhoneNumber('12345')).toThrow(BadRequestException);
      expect(() => authService.normalizePhoneNumber('08123456789')).toThrow(BadRequestException);
      expect(() => authService.normalizePhoneNumber('0912345678')).toThrow(BadRequestException); // 10 digits
      expect(() => authService.normalizePhoneNumber('091234567890')).toThrow(BadRequestException); // 12 digits
      expect(() => authService.normalizePhoneNumber('abcdefghijk')).toThrow(BadRequestException);
    });
  });

  describe('8. OTP Rate Limiting & SMS Abuse Protection', () => {
    it('blocks OTP dispatch when hourly rate limit (10 requests) is exceeded', async () => {
      const targetPhone = '09129998877';

      // Simulate 10 successful requests by pre-populating hourly counter
      await redis.set(`otp_rate_hour:${targetPhone}`, '10', 3600);

      await expect(
        authService.sendOtp(targetPhone),
      ).rejects.toThrow(/تعداد درخواست.*کد ت[اأ]یید در یک ساعت گذشته بیش از حد مجاز است/);
    });

    it('enforces brute force lockout after max failed OTP verification attempts', async () => {
      const targetPhone = '09129998866';
      await redis.set(`otp:${targetPhone}`, '54321', 120);

      // 4 wrong attempts
      for (let i = 0; i < 4; i++) {
        await expect(authService.verifyOtp(targetPhone, '00000')).rejects.toThrow(BadRequestException);
      }

      // 5th wrong attempt triggers lockout and purges OTP
      await expect(authService.verifyOtp(targetPhone, '00000')).rejects.toThrow(/تعداد تلاش‌های ناموفق بیش از حد مجاز است/);

      // Subsequent attempt with even the CORRECT code fails because OTP is purged
      await expect(authService.verifyOtp(targetPhone, '54321')).rejects.toThrow(/کد ت[اأ]یید منقضی شده یا درخواست نشده است/);
    });
  });

  describe('9. Concurrent Checkout Spam Throttling', () => {
    it('prevents rapid concurrent checkout requests from the same user', async () => {
      const testUser = 'user-spam-checkout';
      db.getTable('users').push({
        id: testUser,
        phone_number: '09129998855',
        gender: Gender.MALE,
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      });

      // First checkout: Success
      const first = await paymentsService.initiateCheckout(testUser, 'plan-1');
      expect(first.paymentId).toBeDefined();

      // Second checkout immediately after: Throttled by Redis
      await expect(
        paymentsService.initiateCheckout(testUser, 'plan-1'),
      ).rejects.toThrow(/یک درخواست پرداخت در حال پردازش است/);
    });
  });
});
