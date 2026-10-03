import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { IPaymentGateway } from '../src/modules/payments/payment-gateway.interface';
import { CreditLedgerEntryType, SubscriptionStatus, PaymentStatus } from '@gym-app/shared-types';
import { AppConfigService } from '../src/common/config/app-config.service';

class MockGateway implements IPaymentGateway {
  async initiatePayment(amountRials: number, callbackUrl: string, description: string) {
    return {
      authority: `AUTH-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      redirectUrl: 'https://sandbox.shaparak.ir/pay',
    };
  }
  async verifyPayment(authority: string, expectedAmountRials: number) {
    return {
      isSuccessful: true,
      referenceIdRrn: 'RRN-99887766',
      cardPanMasked: '6037********4321',
    };
  }
}

describe('Phase 3: Subscription Lifecycle & State Hardening', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let ledger: LedgerService;
  let economics: EconomicsService;
  let checkin: CheckinService;
  let plans: PlansService;
  let payments: PaymentsService;

  const testUserId = 'user-sub-lifecycle';
  const staffUserId = 'user-staff';
  const testGymId = 'gym-plus-2';

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    await redis.onModuleInit();
    ledger = new LedgerService(db);
    economics = new EconomicsService(db);
    checkin = new CheckinService(db, redis, ledger, economics);
    plans = new PlansService(db);
    payments = new PaymentsService(db, ledger, plans);
    payments.setGateway(new MockGateway());

    // Register active user
    db.getTable('users').push({
      id: testUserId,
      phone_number: '09121112233',
      first_name: 'رضا',
      last_name: 'امیدی',
      gender: 'MALE',
      role: 'USER',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    });

    // Ensure active Male sans for test gym
    const sansTable = db.getTable('gym_sans');
    sansTable.push({
      id: `sans-sub-test-${testGymId}`,
      gym_id: testGymId,
      day_of_week: (new Date().getDay() + 1) % 7,
      gender: 'MALE',
      start_time: '00:00:00',
      end_time: '23:59:59',
      capacity: 50,
      is_peak: false,
    });
  });

  // =========================================================================
  // 1. Activation on Verified Payment
  // =========================================================================
  describe('Subscription Activation', () => {
    it('creates active subscription and issues plan credits upon payment verification', async () => {
      const checkout = await payments.initiateCheckout(testUserId, 'plan-2'); // plan-2 = 30 credits, 30 days
      const verifyRes = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');

      expect(verifyRes.isSuccessful).toBe(true);
      expect(verifyRes.creditsIssued).toBe(30);

      const sub = await plans.getUserSubscription(testUserId);
      expect(sub).toBeDefined();
      expect(sub?.status).toBe(SubscriptionStatus.ACTIVE);
      expect(sub?.planId).toBe('plan-2');

      const balance = await ledger.getBalance(testUserId);
      expect(balance).toBe(30);
    });

    it('remains idempotent on duplicate payment verification callbacks', async () => {
      const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
      const first = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');
      expect(first.isSuccessful).toBe(true);

      const subsCount1 = db.getTable('subscriptions').filter(s => s.user_id === testUserId).length;
      const balance1 = await ledger.getBalance(testUserId);

      // Duplicate verification
      const second = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');
      expect(second.isSuccessful).toBe(true);

      const subsCount2 = db.getTable('subscriptions').filter(s => s.user_id === testUserId).length;
      const balance2 = await ledger.getBalance(testUserId);

      expect(subsCount2).toBe(subsCount1); // No duplicate subscriptions!
      expect(balance2).toBe(balance1);     // No duplicate credit issuance!
    });
  });

  // =========================================================================
  // 2. Expiration Gate (Check-in & QR Rejection)
  // =========================================================================
  describe('Expiration Enforcement', () => {
    it('rejects dynamic QR generation when subscription is EXPIRED', async () => {
      // Seed an expired subscription with residual balance
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      db.getTable('subscriptions').push({
        id: 'sub-expired-test',
        user_id: testUserId,
        plan_id: 'plan-1',
        starts_at: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.EXPIRED,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits(testUserId, 10, CreditLedgerEntryType.PLAN_PURCHASE);

      await expect(
        checkin.generateDynamicQr(testUserId, testGymId)
      ).rejects.toThrow(/اشتراک ورزشی شما منقضی شده است/);
    });

    it('rejects check-in verification at reception gate when subscription is EXPIRED', async () => {
      // Give valid QR payload signed by secret, but member subscription is expired in DB
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      db.getTable('subscriptions').push({
        id: 'sub-expired-gate',
        user_id: testUserId,
        plan_id: 'plan-1',
        starts_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.EXPIRED,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits(testUserId, 15, CreditLedgerEntryType.PLAN_PURCHASE);

      // Temporarily bypass generateDynamicQr to test the gate itself
      const nowSec = Math.floor(Date.now() / 1000);
      const crypto = await import('crypto');
      const qrSecret = AppConfigService.getQrSecret();
      const nonce = 'test-nonce-expired';
      const exp = nowSec + 45;
      const sig = crypto.createHmac('sha256', qrSecret).update(`${testUserId}:${testGymId}:${nowSec}:${exp}:${nonce}`).digest('hex');
      const token = Buffer.from(JSON.stringify({ sub: testUserId, gymId: testGymId, iat: nowSec, exp, nonce, sig })).toString('base64url');

      await expect(
        checkin.verifyAndConsumeCheckin(token, staffUserId, testGymId)
      ).rejects.toThrow(/عضو دارای اشتراک ورزشی معتبر نمی‌باشد/);
    });
  });

  // =========================================================================
  // 3. Rollover (10% capped at 5 credits) & Excess Expiry
  // =========================================================================
  describe('Rollover (10% capped at 5 credits) & Excess Expiry', () => {
    it('preserves up to 5 credits and expires excess unconsumed credits on expiration sweep', async () => {
      // User has plan-3 (60 credits). Suppose 12 credits remain unconsumed at end of cycle.
      const subId = 'sub-sweep-test';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      db.getTable('subscriptions').push({
        id: subId,
        user_id: testUserId,
        plan_id: 'plan-3', // 60 credits awarded, rollover percentage 10%
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits(testUserId, 12, CreditLedgerEntryType.PLAN_PURCHASE, subId);

      const result = await plans.processSubscriptionExpiration(subId);

      expect(result.newStatus).toBe(SubscriptionStatus.EXPIRED);
      expect(result.preservedRolloverCredits).toBe(5); // Capped at exactly 5 credits!
      expect(result.expiredExcessCredits).toBe(7);     // 12 - 5 = 7 credits expired

      // Check ledger balance after sweep
      const balanceAfter = await ledger.getBalance(testUserId);
      expect(balanceAfter).toBe(5);

      // Verify excess debit entry in ledger
      const entries = db.getTable('credit_ledger').filter(e => e.user_id === testUserId);
      const excessEntry = entries.find(e => e.entry_type === CreditLedgerEntryType.CREDIT_EXPIRATION_EXCESS);
      expect(excessEntry).toBeDefined();
      expect(excessEntry?.delta_credits).toBe(-7);
    });

    it('preserves all remaining credits when remaining balance is within 5-credit cap', async () => {
      const subId = 'sub-sweep-small';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      db.getTable('subscriptions').push({
        id: subId,
        user_id: testUserId,
        plan_id: 'plan-2', // 30 credits awarded, 10% = 3 credits (cap 5)
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits(testUserId, 3, CreditLedgerEntryType.PLAN_PURCHASE, subId);

      const result = await plans.processSubscriptionExpiration(subId);

      expect(result.newStatus).toBe(SubscriptionStatus.EXPIRED);
      expect(result.preservedRolloverCredits).toBe(3);
      expect(result.expiredExcessCredits).toBe(0);

      const balanceAfter = await ledger.getBalance(testUserId);
      expect(balanceAfter).toBe(3);
    });

    // =========================================================================
    // Phase 12 Regression Suites (Cases A through F)
    // =========================================================================

    it('Case A: Old subscription expires with no newer subscription', async () => {
      const subId = 'sub-case-a';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      db.getTable('subscriptions').push({
        id: subId,
        user_id: 'user-case-a',
        plan_id: 'plan-2', // 30 credits, cap = 3
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits('user-case-a', 7, CreditLedgerEntryType.PLAN_PURCHASE, subId);

      const result = await plans.processSubscriptionExpiration(subId);

      expect(result.newStatus).toBe(SubscriptionStatus.EXPIRED);
      expect(result.preservedRolloverCredits).toBe(3);
      expect(result.expiredExcessCredits).toBe(4); // 7 - 3 = 4

      const balance = await ledger.getBalance('user-case-a');
      expect(balance).toBe(3);
    });

    it('Case B: Old subscription has 4 Credits remaining and new subscription has already been purchased (early renewal)', async () => {
      const oldSubId = 'sub-case-b-old';
      const newSubId = 'sub-case-b-new';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const futureDate = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();

      // Old sub: plan-2 (30 cr, cap = 3). User had 4 unconsumed credits.
      db.getTable('subscriptions').push({
        id: oldSubId,
        user_id: 'user-case-b',
        plan_id: 'plan-2',
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits('user-case-b', 4, CreditLedgerEntryType.PLAN_PURCHASE, oldSubId);

      // New sub purchased early: plan-2 (+30 credits). Global balance becomes 34.
      db.getTable('subscriptions').push({
        id: newSubId,
        user_id: 'user-case-b',
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: futureDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: true,
        created_at: new Date().toISOString(),
      });
      await ledger.issueCredits('user-case-b', 30, CreditLedgerEntryType.PLAN_PURCHASE, newSubId);

      const balanceBefore = await ledger.getBalance('user-case-b');
      expect(balanceBefore).toBe(34);

      // Expire old subscription
      const result = await plans.processSubscriptionExpiration(oldSubId);

      expect(result.newStatus).toBe(SubscriptionStatus.EXPIRED);
      expect(result.preservedRolloverCredits).toBe(3); // Cap of 3 from old sub
      expect(result.expiredExcessCredits).toBe(1);     // Only 4 - 3 = 1 credit expired! NOT 29!

      // Final balance must be 33: 3 rolled over from old sub + all 30 from new sub
      const balanceAfter = await ledger.getBalance('user-case-b');
      expect(balanceAfter).toBe(33);
    });

    it('Case C: Old subscription has more than allowed rollover (10 credits, cap 3) with new subscription', async () => {
      const oldSubId = 'sub-case-c-old';
      const newSubId = 'sub-case-c-new';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Old sub: plan-2 (30 cr, cap = 3). 10 credits remaining.
      db.getTable('subscriptions').push({
        id: oldSubId,
        user_id: 'user-case-c',
        plan_id: 'plan-2',
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits('user-case-c', 10, CreditLedgerEntryType.PLAN_PURCHASE, oldSubId);

      // New sub: plan-2 (+30 cr). Global balance = 40.
      db.getTable('subscriptions').push({
        id: newSubId,
        user_id: 'user-case-c',
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: futureDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: true,
        created_at: new Date().toISOString(),
      });
      await ledger.issueCredits('user-case-c', 30, CreditLedgerEntryType.PLAN_PURCHASE, newSubId);

      const result = await plans.processSubscriptionExpiration(oldSubId);

      expect(result.preservedRolloverCredits).toBe(3);
      expect(result.expiredExcessCredits).toBe(7); // 10 - 3 = 7 credits expired

      const balanceAfter = await ledger.getBalance('user-case-c');
      expect(balanceAfter).toBe(33); // 3 rollover + 30 new sub credits
    });

    it('Case D: New subscription exists but is still pending (status = PENDING)', async () => {
      const oldSubId = 'sub-case-d-old';
      const pendingSubId = 'sub-case-d-pending';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.getTable('subscriptions').push({
        id: oldSubId,
        user_id: 'user-case-d',
        plan_id: 'plan-2', // cap = 3
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits('user-case-d', 5, CreditLedgerEntryType.PLAN_PURCHASE, oldSubId);

      // Pending subscription (unverified payment, no credits awarded)
      db.getTable('subscriptions').push({
        id: pendingSubId,
        user_id: 'user-case-d',
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: futureDate,
        status: 'PENDING' as any,
        auto_renew: false,
        created_at: new Date().toISOString(),
      });

      const result = await plans.processSubscriptionExpiration(oldSubId);

      expect(result.preservedRolloverCredits).toBe(3);
      expect(result.expiredExcessCredits).toBe(2); // 5 - 3 = 2

      const balanceAfter = await ledger.getBalance('user-case-d');
      expect(balanceAfter).toBe(3);
    });

    it('Case E: Multiple subscriptions overlap', async () => {
      const oldSubId = 'sub-case-e-old';
      const activeSubB = 'sub-case-e-b';
      const activeSubC = 'sub-case-e-c';
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Old sub: plan-2 (30 cr, cap = 3). 4 credits remaining.
      db.getTable('subscriptions').push({
        id: oldSubId,
        user_id: 'user-case-e',
        plan_id: 'plan-2',
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits('user-case-e', 4, CreditLedgerEntryType.PLAN_PURCHASE, oldSubId);

      // Active sub B: plan-2 (+30 cr)
      db.getTable('subscriptions').push({
        id: activeSubB,
        user_id: 'user-case-e',
        plan_id: 'plan-2',
        starts_at: new Date().toISOString(),
        expires_at: futureDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: true,
        created_at: new Date().toISOString(),
      });
      await ledger.issueCredits('user-case-e', 30, CreditLedgerEntryType.PLAN_PURCHASE, activeSubB);

      // Active sub C: plan-1 (+15 cr)
      db.getTable('subscriptions').push({
        id: activeSubC,
        user_id: 'user-case-e',
        plan_id: 'plan-1',
        starts_at: new Date().toISOString(),
        expires_at: futureDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: true,
        created_at: new Date().toISOString(),
      });
      await ledger.issueCredits('user-case-e', 15, CreditLedgerEntryType.PLAN_PURCHASE, activeSubC);

      const balanceBefore = await ledger.getBalance('user-case-e');
      expect(balanceBefore).toBe(49); // 4 + 30 + 15

      const result = await plans.processSubscriptionExpiration(oldSubId);

      expect(result.preservedRolloverCredits).toBe(3);
      expect(result.expiredExcessCredits).toBe(1); // 4 - 3 = 1

      const balanceAfter = await ledger.getBalance('user-case-e');
      expect(balanceAfter).toBe(48); // 3 + 30 + 15
    });

    it('Case F: Repeated expiration processing is idempotent', async () => {
      const subId = 'sub-case-f';
      const pastDate = new Date(Date.now() - 1000).toISOString();

      db.getTable('subscriptions').push({
        id: subId,
        user_id: 'user-case-f',
        plan_id: 'plan-2', // cap = 3
        starts_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastDate,
        status: SubscriptionStatus.ACTIVE,
        auto_renew: false,
        created_at: pastDate,
      });
      await ledger.issueCredits('user-case-f', 6, CreditLedgerEntryType.PLAN_PURCHASE, subId);

      // First run: expires 3, preserves 3
      const firstRun = await plans.processSubscriptionExpiration(subId);
      expect(firstRun.preservedRolloverCredits).toBe(3);
      expect(firstRun.expiredExcessCredits).toBe(3);
      expect(await ledger.getBalance('user-case-f')).toBe(3);

      // Second run: must be completely idempotent, no extra debit!
      const secondRun = await plans.processSubscriptionExpiration(subId);
      expect(secondRun.newStatus).toBe(SubscriptionStatus.EXPIRED);
      expect(secondRun.expiredExcessCredits).toBe(0);
      expect(await ledger.getBalance('user-case-f')).toBe(3);

      // Third run: still 3 credits, no negative balance, no duplicate debits
      const thirdRun = await plans.processSubscriptionExpiration(subId);
      expect(thirdRun.expiredExcessCredits).toBe(0);
      expect(await ledger.getBalance('user-case-f')).toBe(3);

      const excessEntries = db.getTable('credit_ledger').filter(
        e => e.user_id === 'user-case-f' && e.entry_type === CreditLedgerEntryType.CREDIT_EXPIRATION_EXCESS
      );
      expect(excessEntries.length).toBe(1); // Exactly 1 debit record!
    });
  });
});
