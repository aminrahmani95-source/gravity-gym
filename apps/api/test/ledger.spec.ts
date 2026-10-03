import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { CreditLedgerEntryType } from '@gym-app/shared-types';

describe('Credit Engine & Ledger Invariant Tests', () => {
  let db: DatabaseService;
  let ledger: LedgerService;
  const testUserId = 'test-user-ledger-1';

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    ledger = new LedgerService(db);
  });

  it('should start with zero balance for a new user', async () => {
    const balance = await ledger.getBalance(testUserId);
    expect(balance).toBe(0);
  });

  it('should issue credits and correctly update balance snapshot', async () => {
    const entry = await ledger.issueCredits(
      testUserId,
      30,
      CreditLedgerEntryType.PLAN_PURCHASE,
      'sub-101',
      'خرید پلن استاندارد'
    );

    expect(entry.deltaCredits).toBe(30);
    expect(entry.balanceAfter).toBe(30);

    const currentBal = await ledger.getBalance(testUserId);
    expect(currentBal).toBe(30);
  });

  it('should enforce strict ledger invariant: Sum(Deltas) === Current Balance', async () => {
    await ledger.issueCredits(testUserId, 30, CreditLedgerEntryType.PLAN_PURCHASE);
    await ledger.debitCredits(testUserId, 4, CreditLedgerEntryType.CHECKIN_DEBIT);
    await ledger.debitCredits(testUserId, 7, CreditLedgerEntryType.CHECKIN_DEBIT);
    await ledger.issueCredits(testUserId, 10, CreditLedgerEntryType.TOPUP_PURCHASE);

    const audit = await ledger.verifyLedgerInvariants(testUserId);
    expect(audit.isValid).toBe(true);
    expect(audit.currentBalance).toBe(29);
    expect(audit.sumDeltas).toBe(29);
  });

  it('should prevent balance from dropping below zero (Overdraft Prevention)', async () => {
    await ledger.issueCredits(testUserId, 5, CreditLedgerEntryType.PLAN_PURCHASE);

    // Attempt to debit 10 credits when only 5 exist
    await expect(
      ledger.debitCredits(testUserId, 10, CreditLedgerEntryType.CHECKIN_DEBIT)
    ).rejects.toThrow(/اعتبار ناکافی است/);

    // Balance must remain strictly 5
    const balance = await ledger.getBalance(testUserId);
    expect(balance).toBe(5);
  });

  it('should correctly execute the approved 10% capped rollover policy', async () => {
    // User has 22 unspent credits out of 30
    await ledger.issueCredits(testUserId, 22, CreditLedgerEntryType.PLAN_PURCHASE);

    // Default policy: 10% capped rollover, max 5 credits
    // 22 * 0.10 = 2.2 -> floor = 2 credits preserved, 20 credits expired
    const result = await ledger.executeMonthlyRolloverSweep(testUserId, 0.10, 5, 'sub-renewal-1');

    expect(result.preserved).toBe(2);
    expect(result.expiredBreakage).toBe(20);

    // New active balance should be exactly 2
    const balance = await ledger.getBalance(testUserId);
    expect(balance).toBe(2);

    // Invariant must hold
    const audit = await ledger.verifyLedgerInvariants(testUserId);
    expect(audit.isValid).toBe(true);
    expect(audit.currentBalance).toBe(2);
  });

  it('should accrue gym monetary payables independently from user credits', async () => {
    const gymId = 'gym-test-1';
    const entry = await ledger.creditGymPayable(gymId, 65000, 'chk-1');

    expect(entry.deltaAmountTomans).toBe(65000);
    expect(entry.balanceAfter).toBe(65000);

    const currentPayable = await ledger.getGymPayableBalance(gymId);
    expect(currentPayable).toBe(65000);
  });

  it('should correctly resolve relatedTitle for both checkin debits and plan purchases in getWalletSummary', async () => {
    // 1. Create a subscription for plan-2 ('پلن نقره‌ای - ۳۰ اعتبار')
    const subId = 'sub-test-summary-1';
    db.getTable('subscriptions').push({
      id: subId,
      user_id: testUserId,
      plan_id: 'plan-2',
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      status: 'ACTIVE',
    });

    // 2. Issue credits referencing the subscriptionId
    await ledger.issueCredits(testUserId, 30, CreditLedgerEntryType.PLAN_PURCHASE, subId, 'خرید پلن نقره‌ای');

    // 3. Create a checkin at gym-basic-1 ('باشگاه بدنسازی کارو')
    const checkinId = 'chk-test-summary-1';
    db.getTable('checkins').push({
      id: checkinId,
      user_id: testUserId,
      gym_id: 'gym-basic-1',
      staff_user_id: 'staff-1',
      credits_debited: 4,
      monetary_payout_tomans: 55000,
      status: 'COMPLETED',
      created_at: new Date().toISOString(),
    });

    // 4. Debit credits referencing checkinId
    await ledger.debitCredits(testUserId, 4, CreditLedgerEntryType.CHECKIN_DEBIT, checkinId, 'ورود به باشگاه');

    // 5. Query wallet summary
    const summary = await ledger.getWalletSummary(testUserId);
    expect(summary.currentCredits).toBe(26);
    expect(summary.totalEarnedCredits).toBe(30);
    expect(summary.totalSpentCredits).toBe(4);
    expect(summary.recentTransactions.length).toBe(2);

    // Latest entry is the check-in debit
    const debitEntry = summary.recentTransactions[0];
    expect(debitEntry.entryType).toBe(CreditLedgerEntryType.CHECKIN_DEBIT);
    expect(debitEntry.deltaCredits).toBe(-4);
    expect(debitEntry.relatedTitle).toBe('باشگاه بدنسازی کارو');

    // Earlier entry is the plan purchase
    const purchaseEntry = summary.recentTransactions[1];
    expect(purchaseEntry.entryType).toBe(CreditLedgerEntryType.PLAN_PURCHASE);
    expect(purchaseEntry.deltaCredits).toBe(30);
    expect(purchaseEntry.relatedTitle).toBe('پلن نقره‌ای - ۳۰ اعتبار');
  });
});
