import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import {
  CreditLedgerEntryType,
  CheckinStatus,
  SubscriptionStatus,
  PaymentStatus,
} from '@gym-app/shared-types';

describe('Member Lifecycle & Credit Wallet Integration Spec', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let plansService: PlansService;
  let checkinService: CheckinService;
  let paymentsService: PaymentsService;
  let ledgerService: LedgerService;
  let economicsService: EconomicsService;

  const testUserId = 'user-member-1';
  const otherUserId = 'user-member-2';

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    await redis.onModuleInit();
    ledgerService = new LedgerService(db);
    economicsService = new EconomicsService(db);
    checkinService = new CheckinService(db, redis, ledgerService, economicsService);
    plansService = new PlansService(db);
    paymentsService = new PaymentsService(db, ledgerService, plansService);
  });

  describe('1. Member Subscription Lifecycle States', () => {
    it('returns NO_ACTIVE_SUBSCRIPTION when user has no prior subscriptions', async () => {
      // Clear subscriptions for test user
      const subs = db.getTable('subscriptions');
      const filtered = subs.filter(s => s.user_id !== testUserId);
      db.getTable('subscriptions').length = 0;
      db.getTable('subscriptions').push(...filtered);

      const res = await plansService.getMemberSubscriptionDetails(testUserId);
      expect(res.state).toBe('NO_ACTIVE_SUBSCRIPTION');
      expect(res.subscription).toBeUndefined();
      expect(res.stats.consumedCredits).toBe(0);
    });

    it('returns ACTIVE state with correct remaining days and credit stats', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000); // 20 days ahead

      db.getTable('subscriptions').push({
        id: 'sub-active-1',
        user_id: testUserId,
        plan_id: 'plan-2', // standard_30
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: SubscriptionStatus.ACTIVE,
        auto_renew: true,
        created_at: now.toISOString(),
      });

      // Issue 30 credits to user
      await ledgerService.issueCredits(testUserId, 30, CreditLedgerEntryType.PLAN_PURCHASE, 'sub-active-1');

      const res = await plansService.getMemberSubscriptionDetails(testUserId);
      expect(res.state).toBe('ACTIVE');
      expect(res.subscription?.planTitle).toBe('پلن نقره‌ای - ۳۰ اعتبار');
      expect(res.subscription?.remainingDays).toBe(20);
      expect(res.stats.totalCreditsAwarded).toBe(30);
      expect(res.stats.availableCredits).toBe(30);
      expect(res.stats.consumedCredits).toBe(0);
    });

    it('returns EXPIRING_SOON when remaining days <= 3', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days ahead

      db.getTable('subscriptions').push({
        id: 'sub-expiring-soon',
        user_id: testUserId,
        plan_id: 'plan-1', // starter_15
        starts_at: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: expiresAt.toISOString(),
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const res = await plansService.getMemberSubscriptionDetails(testUserId);
      expect(res.state).toBe('EXPIRING_SOON');
      expect(res.subscription?.remainingDays).toBeLessThanOrEqual(3);
    });

    it('returns EXPIRED when past expiration date or status is EXPIRED', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

      db.getTable('subscriptions').push({
        id: 'sub-expired-1',
        user_id: testUserId,
        plan_id: 'plan-1',
        starts_at: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: expiresAt.toISOString(),
        status: SubscriptionStatus.EXPIRED,
        auto_renew: false,
        created_at: now.toISOString(),
      });

      const res = await plansService.getMemberSubscriptionDetails(testUserId);
      expect(res.state).toBe('EXPIRED');
    });
  });

  describe('2. Member Check-in History & Security Boundary', () => {
    it('returns member checkins while strictly suppressing security tokens and payouts', async () => {
      const checkinTime = new Date().toISOString();
      db.getTable('checkins').push({
        id: 'chk-sec-1',
        user_id: testUserId,
        gym_id: 'gym-plus-2',
        staff_user_id: 'user-staff',
        credits_debited: 4,
        monetary_payout_tomans: 65000,
        status: CheckinStatus.COMPLETED,
        qr_nonce: 'super-secret-nonce-12345678',
        created_at: checkinTime,
      });

      const history = await checkinService.getUserCheckinHistory(testUserId);
      expect(history.length).toBeGreaterThanOrEqual(1);

      const item = history.find(c => c.id === 'chk-sec-1');
      expect(item).toBeDefined();
      expect(item?.gymName).toBe('مجموعه ورزشی ستاره ونک');
      expect(item?.gymTier).toBe('PLUS');
      expect(item?.creditsDebited).toBe(4);
      expect(item?.status).toBe(CheckinStatus.COMPLETED);

      // SECURITY AUDIT ASSERTIONS:
      expect((item as any).qr_nonce).toBeUndefined();
      expect((item as any).nonce).toBeUndefined();
      expect((item as any).monetary_payout_tomans).toBeUndefined();
      expect((item as any).monetaryPayoutTomans).toBeUndefined();
      expect((item as any).staff_user_id).toBeUndefined();
    });

    it('enforces strict IDOR isolation in checkin history', async () => {
      db.getTable('checkins').push({
        id: 'chk-other-user',
        user_id: otherUserId,
        gym_id: 'gym-elite-4',
        credits_debited: 14,
        monetary_payout_tomans: 230000,
        status: CheckinStatus.COMPLETED,
        created_at: new Date().toISOString(),
      });

      const testUserHistory = await checkinService.getUserCheckinHistory(testUserId);
      expect(testUserHistory.some(c => c.id === 'chk-other-user')).toBe(false);
    });
  });

  describe('3. Member Payment History & IDOR Isolation', () => {
    it('returns member payment transactions with converted Tomans and plan titles', async () => {
      const now = new Date().toISOString();
      db.getTable('payment_transactions').push({
        id: 'pay-tx-1',
        authority: 'SHP-MOCK-TEST-123',
        user_id: testUserId,
        plan_id: 'plan-2', // price: 1000000 Tomans = 10000000 Rials
        amount_rials: 10000000,
        status: PaymentStatus.PAID,
        provider: 'SHAPARAK_EMULATOR',
        reference_id_rrn: 'RRN-99887766',
        card_pan_masked: '603799******1234',
        created_at: now,
        paid_at: now,
      });

      const history = await paymentsService.getUserPaymentHistory(testUserId);
      const item = history.find(p => p.id === 'pay-tx-1');
      expect(item).toBeDefined();
      expect(item?.planTitle).toBe('پلن نقره‌ای - ۳۰ اعتبار');
      expect(item?.amountTomans).toBe(1000000);
      expect(item?.amountRials).toBe(10000000);
      expect(item?.status).toBe(PaymentStatus.PAID);
      expect(item?.referenceIdRrn).toBe('RRN-99887766');
      expect(item?.cardPanMasked).toBe('603799******1234');
    });

    it('enforces strict IDOR isolation in payment history', async () => {
      db.getTable('payment_transactions').push({
        id: 'pay-tx-other',
        authority: 'SHP-OTHER-456',
        user_id: otherUserId,
        plan_id: 'plan-3',
        amount_rials: 19000000,
        status: PaymentStatus.PAID,
        provider: 'SHAPARAK_EMULATOR',
        created_at: new Date().toISOString(),
      });

      const history = await paymentsService.getUserPaymentHistory(testUserId);
      expect(history.some(p => p.id === 'pay-tx-other')).toBe(false);
    });
  });

  describe('4. Enriched Wallet Summary & Ledger Totals', () => {
    it('calculates totalEarnedCredits and totalSpentCredits correctly', async () => {
      // Setup isolated ledger entries
      await ledgerService.issueCredits(testUserId, 30, CreditLedgerEntryType.PLAN_PURCHASE, 'plan-2');
      await ledgerService.issueCredits(testUserId, 5, CreditLedgerEntryType.REFUND_CREDIT, 'chk-refund');
      await ledgerService.debitCredits(testUserId, 4, CreditLedgerEntryType.CHECKIN_DEBIT, 'chk-1');
      await ledgerService.debitCredits(testUserId, 7, CreditLedgerEntryType.CHECKIN_DEBIT, 'chk-2');

      const summary = await ledgerService.getWalletSummary(testUserId);
      expect(summary.currentCredits).toBe(24);
      expect(summary.totalEarnedCredits).toBe(35); // 30 + 5
      expect(summary.totalSpentCredits).toBe(11);  // 4 + 7
      expect(summary.recentTransactions.length).toBeGreaterThanOrEqual(4);
    });
  });
});
