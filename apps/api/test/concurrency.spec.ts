import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { RedisService } from '../src/common/redis/redis.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { CheckinService } from '../src/modules/checkin/checkin.service';
import { SettlementsService } from '../src/modules/settlements/settlements.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { CreditLedgerEntryType } from '@gym-app/shared-types';

describe('Concurrency, Race Condition & Cryptographic Integrity Tests', () => {
  let db: DatabaseService;
  let redis: RedisService;
  let ledger: LedgerService;
  let economics: EconomicsService;
  let checkin: CheckinService;
  let settlements: SettlementsService;
  let plans: PlansService;

  const testUserId = 'user-member-1';
  const testStaffId = 'user-staff';
  const testGymId = 'gym-plus-2';

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    redis = new RedisService();
    await redis.onModuleInit();
    ledger = new LedgerService(db);
    economics = new EconomicsService(db);
    checkin = new CheckinService(db, redis, ledger, economics);
    settlements = new SettlementsService(db, ledger);
    plans = new PlansService(db);

    // Initial issue of 30 credits
    await ledger.issueCredits(testUserId, 30, CreditLedgerEntryType.PLAN_PURCHASE);

    // Ensure active Male sans for test gym during test execution regardless of time of day
    const now = new Date();
    const currentTimeStr = now.toTimeString().split(' ')[0];
    const day = (now.getDay() + 1) % 7;
    const sansTable = db.getTable('gym_sans');
    const idx = sansTable.findIndex(s => s.gym_id === testGymId && s.day_of_week === day && s.start_time <= currentTimeStr && s.end_time >= currentTimeStr);
    if (idx !== -1) {
      sansTable.splice(idx, 1);
    }
    sansTable.unshift({
      id: `sans-test-${testGymId}`,
      gym_id: testGymId,
      day_of_week: day,
      gender: 'MALE',
      start_time: '00:00:00',
      end_time: '23:59:59',
      capacity: 50,
      is_peak: false,
    });
  });

  it('should prevent double-spending under high concurrent QR scan bursts', async () => {
    const { qrToken } = await checkin.generateDynamicQr(testUserId, testGymId);
    const initialBalance = await ledger.getBalance(testUserId);
    const initialPayable = await ledger.getGymPayableBalance(testGymId);

    // Fire 5 simultaneous verifyAndConsumeCheckin requests with the same QR token
    const attempts = Array.from({ length: 5 }, () =>
      checkin.verifyAndConsumeCheckin(qrToken, testStaffId, testGymId)
    );

    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed
    expect(fulfilled.length).toBe(1);
    // The other 4 must be rejected due to distributed lock contention or nonce replay
    expect(rejected.length).toBe(4);

    // Verify ledger integrity: exactly one debit occurred
    const finalBalance = await ledger.getBalance(testUserId);
    const finalPayable = await ledger.getGymPayableBalance(testGymId);

    expect(finalBalance).toBeLessThan(initialBalance);
    expect(finalPayable).toBeGreaterThan(initialPayable);

    // Check checkins table: exactly 1 COMPLETED record created
    const checkinRecords = db.getTable('checkins').filter((c) => c.user_id === testUserId);
    expect(checkinRecords.length).toBe(1);
    expect(checkinRecords[0].qr_nonce).toBeDefined();
  });

  it('should enforce database UNIQUE constraint on checkin qr_nonce', async () => {
    const testNonce = 'nonce_db_unique_test_' + Date.now();
    
    // First insert succeeds
    await db.query(
      `INSERT INTO checkins (user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testUserId, testGymId, testStaffId, 4, 65000, 'COMPLETED', testNonce]
    );

    // Direct second insert with duplicate qr_nonce MUST be rejected by DB constraint
    await expect(
      db.query(
        `INSERT INTO checkins (user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [testUserId, testGymId, testStaffId, 4, 65000, 'COMPLETED', testNonce]
      )
    ).rejects.toThrow(/uq_checkins_qr_nonce/);
  });

  it('should enforce database UNIQUE constraint preventing duplicate financial mutations for same checkin', async () => {
    const testCheckinId = 'checkin-uuid-' + Date.now();

    // 1. Credit Ledger: first debit succeeds
    await db.query(
      `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testUserId, -4, 26, CreditLedgerEntryType.CHECKIN_DEBIT, testCheckinId, 'Checkin debit']
    );

    // Duplicate debit with same reference_id MUST be rejected by DB unique index
    await expect(
      db.query(
        `INSERT INTO credit_ledger (user_id, delta_credits, balance_after, entry_type, reference_id, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testUserId, -4, 22, CreditLedgerEntryType.CHECKIN_DEBIT, testCheckinId, 'Duplicate checkin debit']
      )
    ).rejects.toThrow(/uq_credit_ledger_checkin_debit/);

    // 2. Gym Payable Ledger: first earning succeeds
    await db.query(
      `INSERT INTO gym_payable_ledger (gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [testGymId, testCheckinId, 65000, 65000, 'CHECKIN_EARNING', 'Checkin earning']
    );

    // Duplicate earning with same checkin_id MUST be rejected by DB unique index
    await expect(
      db.query(
        `INSERT INTO gym_payable_ledger (gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testGymId, testCheckinId, 65000, 130000, 'CHECKIN_EARNING', 'Duplicate checkin earning']
      )
    ).rejects.toThrow(/uq_gym_payable_checkin_earning/);
  });

  it('should rollback transaction completely if financial mutation fails during checkin', async () => {
    const initialCheckinCount = db.getTable('checkins').length;
    const initialCreditEntries = db.getTable('credit_ledger').length;
    const initialPayableEntries = db.getTable('gym_payable_ledger').length;

    // Simulate checkin transaction that fails on the second step
    const checkinId = 'checkin-fail-' + Date.now();
    await expect(
      db.withTransaction(async (client) => {
        await client.query(
          `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [checkinId, testUserId, testGymId, testStaffId, 4, 65000, 'COMPLETED', 'rollback-nonce']
        );
        // Step 2 fails deliberately
        throw new Error('SIMULATED_FINANCIAL_MUTATION_CRASH');
      })
    ).rejects.toThrow('SIMULATED_FINANCIAL_MUTATION_CRASH');

    // Assert that rollback cleaned up everything: no partial records left
    expect(db.getTable('checkins').length).toBe(initialCheckinCount);
    expect(db.getTable('credit_ledger').length).toBe(initialCreditEntries);
    expect(db.getTable('gym_payable_ledger').length).toBe(initialPayableEntries);
  });

  it('should prevent ledger overdraft when concurrent debits exceed available balance', async () => {
    // Reset test user to exactly 10 credits
    const current = await ledger.getBalance(testUserId);
    if (current > 0) {
      await ledger.debitCredits(
        testUserId,
        current - 10,
        CreditLedgerEntryType.ADMIN_ADJUSTMENT,
        'Adjust balance for overdraft test'
      );
    }
    expect(await ledger.getBalance(testUserId)).toBe(10);

    // Attempt 3 simultaneous debits of 6 credits each (total 18 > 10 available)
    const debitAttempts = [
      ledger.debitCredits(testUserId, 6, CreditLedgerEntryType.CHECKIN_DEBIT, 'Debit attempt 1'),
      ledger.debitCredits(testUserId, 6, CreditLedgerEntryType.CHECKIN_DEBIT, 'Debit attempt 2'),
      ledger.debitCredits(testUserId, 6, CreditLedgerEntryType.CHECKIN_DEBIT, 'Debit attempt 3'),
    ];

    const results = await Promise.allSettled(debitAttempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // At most 1 debit of 6 can succeed from a balance of 10
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(2);

    // Balance must be exactly 10 - 6 = 4 credits, NEVER negative
    const balance = await ledger.getBalance(testUserId);
    expect(balance).toBe(4);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it('should validate ISO 7064 Mod 97-10 Sheba checksums accurately', () => {
    // Valid Iranian Shebas with correct check digits:
    expect(settlements.isValidIranianSheba('IR430120000000000000000001')).toBe(true);
    expect(settlements.isValidIranianSheba('IR160120000000000000000002')).toBe(true);
    expect(settlements.isValidIranianSheba('IR860120000000000000000003')).toBe(true);
    expect(settlements.isValidIranianSheba('IR590120000000000000000004')).toBe(true);

    // Invalid check digits on same accounts:
    expect(settlements.isValidIranianSheba('IR110120000000000000000001')).toBe(false);
    expect(settlements.isValidIranianSheba('IR000120000000000000000001')).toBe(false);

    // Malformed formats:
    expect(settlements.isValidIranianSheba('IR43012000000000000000000')).toBe(false); // 25 chars
    expect(settlements.isValidIranianSheba('IR4301200000000000000000019')).toBe(false); // 27 chars
    expect(settlements.isValidIranianSheba('GB430120000000000000000001')).toBe(false); // Not IR
    expect(settlements.isValidIranianSheba('')).toBe(false);
  });

  it('should prevent double disbursement when concurrent settlement approvals occur', async () => {
    // Accrue payable balance for test gym
    await ledger.creditGymPayable(testGymId, 130000, 'test-checkin-settle-1');
    const payableBefore = await ledger.getGymPayableBalance(testGymId);
    expect(payableBefore).toBeGreaterThan(0);

    // Generate settlement batch
    const batch = await settlements.generateSettlementBatch(testGymId, '2026-09-01', '2026-09-30');
    expect(batch.id).toBeDefined();

    // Fire 3 simultaneous approveAndDisburse calls
    const attempts = [
      settlements.approveAndDisburse(batch.id, 'RRN-111111'),
      settlements.approveAndDisburse(batch.id, 'RRN-222222'),
      settlements.approveAndDisburse(batch.id, 'RRN-333333'),
    ];

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed
    expect(fulfilled.length).toBe(1);
    // The other 2 must be rejected
    expect(rejected.length).toBe(2);

    // Verify batch status is PAID
    const updatedBatch = db.getTable('settlement_batches').find((b) => b.id === batch.id);
    expect(updatedBatch.status).toBe('PAID');

    // Verify gym payable ledger has exactly ONE DISBURSEMENT_PAYA entry for this settlement batch
    const disbursements = db
      .getTable('gym_payable_ledger')
      .filter((l) => l.entry_type === 'DISBURSEMENT_PAYA' && l.settlement_id === batch.id);
    expect(disbursements.length).toBe(1);
  });

  it('should prevent double-expiration and duplicate debit under concurrent expiration sweeps', async () => {
    const subId = 'sub-concurrency-exp-test';
    const expiresPast = new Date(Date.now() - 3600 * 1000).toISOString();
    const startsPast = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    db.getTable('subscriptions').push({
      id: subId,
      user_id: testUserId,
      plan_id: 'plan-2', // silver 30 credits, max rollover cap = min(5, 30*0.1) = 3 credits
      status: 'ACTIVE',
      starts_at: startsPast,
      expires_at: expiresPast,
      auto_renew: false,
      created_at: startsPast,
    });

    const balanceBefore = await ledger.getBalance(testUserId);
    expect(balanceBefore).toBe(30);

    // Fire 3 simultaneous expiration requests on the exact same subscription
    const expAttempts = [
      plans.processSubscriptionExpiration(subId),
      plans.processSubscriptionExpiration(subId),
      plans.processSubscriptionExpiration(subId),
    ];

    const expResults = await Promise.all(expAttempts);

    // All should resolve gracefully without throwing or crashing
    expect(expResults.length).toBe(3);

    // Final balance must be exactly 3 credits (the preserved cap), NOT debited multiple times into negative
    const finalBalance = await ledger.getBalance(testUserId);
    expect(finalBalance).toBe(3);

    // Exactly ONE excess expiration ledger entry must exist for this subscription
    const excessEntries = db
      .getTable('credit_ledger')
      .filter((e) => e.entry_type === 'CREDIT_EXPIRATION_EXCESS' && e.reference_id === subId);
    expect(excessEntries.length).toBe(1);
    expect(excessEntries[0].delta_credits).toBe(-27);

    // The subscription status must be EXPIRED
    const sub = db.getTable('subscriptions').find((s) => s.id === subId);
    expect(sub?.status).toBe('EXPIRED');
  });

  it('should prevent duplicate settlement batch generation for the same gym and cycle under concurrency', async () => {
    // Credit gym payable balance so a settlement can be generated
    await ledger.creditGymPayable(testGymId, 75000, 'test-checkin-settle-dup-1');

    const cycleStart = '2026-11-01';
    const cycleEnd = '2026-11-30';

    // Fire 2 concurrent batch generation requests for the same gym and identical cycle
    const batchAttempts = [
      settlements.generateSettlementBatch(testGymId, cycleStart, cycleEnd),
      settlements.generateSettlementBatch(testGymId, cycleStart, cycleEnd),
    ];

    const results = await Promise.allSettled(batchAttempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed
    expect(fulfilled.length).toBe(1);
    // The duplicate must be rejected due to existing batch rule / unique constraint
    expect(rejected.length).toBe(1);

    // Verify exactly 1 batch exists for this cycle
    const batches = db
      .getTable('settlement_batches')
      .filter((b) => b.gym_id === testGymId && b.cycle_start === cycleStart && b.cycle_end === cycleEnd);
    expect(batches.length).toBe(1);
  });
});
