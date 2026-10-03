import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { SettlementsService } from '../src/modules/settlements/settlements.service';
import { SettlementStatus, GymPayableEntryType } from '@gym-app/shared-types';
import { BadRequestException } from '@nestjs/common';

describe('Settlements & Paya Banking Engine Invariant Tests', () => {
  let db: DatabaseService;
  let ledger: LedgerService;
  let settlements: SettlementsService;

  const testGymId = 'gym-basic-1'; // Seeded with valid Sheba IR430120000000000000000001

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    ledger = new LedgerService(db);
    settlements = new SettlementsService(db, ledger);
  });

  describe('1. Iranian Sheba (ISO 7064 Mod 97-10) Checksum Validation', () => {
    it('validates a mathematically correct Iranian Sheba', () => {
      expect(settlements.isValidIranianSheba('IR430120000000000000000001')).toBe(true);
      expect(settlements.isValidIranianSheba('ir43 0120 0000 0000 0000 0000 01')).toBe(true); // handles whitespace/case
    });

    it('rejects Sheba with invalid check digits', () => {
      expect(settlements.isValidIranianSheba('IR440120000000000000000001')).toBe(false);
      expect(settlements.isValidIranianSheba('IR000120000000000000000001')).toBe(false);
    });

    it('rejects Sheba with invalid length or non-digit characters', () => {
      expect(settlements.isValidIranianSheba('IR4301200000')).toBe(false);
      expect(settlements.isValidIranianSheba('IR430120000000000000000001999')).toBe(false);
      expect(settlements.isValidIranianSheba('US430120000000000000000001')).toBe(false);
      expect(settlements.isValidIranianSheba('')).toBe(false);
    });
  });

  describe('2. Settlement Batch Generation & Billing Window Cutoff', () => {
    it('rejects batch generation when accrued payable balance is zero', async () => {
      const cycleStart = '2026-09-01T00:00:00.000Z';
      const cycleEnd = '2026-09-30T23:59:59.000Z';

      await expect(
        settlements.generateSettlementBatch(testGymId, cycleStart, cycleEnd)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid cycle date ranges where cycleStart >= cycleEnd', async () => {
      // First accrue some payable earnings
      await ledger.creditGymPayable(testGymId, 150000, 'chk-1');

      await expect(
        settlements.generateSettlementBatch(testGymId, '2026-10-15T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
      ).rejects.toThrow('بازه زمانی دوره تسویه نامعتبر است');
    });

    it('accurately counts visits strictly within the billing cycle cutoff window', async () => {
      const cycleStart = '2026-09-01T00:00:00.000Z';
      const cycleEnd = '2026-09-30T23:59:59.000Z';

      // Accrue 2 checkins within the cycle window
      db.getTable('checkins').push(
        {
          id: 'chk-in-window-1',
          user_id: 'user-1',
          gym_id: testGymId,
          status: 'COMPLETED',
          created_at: '2026-09-10T10:00:00.000Z',
        },
        {
          id: 'chk-in-window-2',
          user_id: 'user-2',
          gym_id: testGymId,
          status: 'COMPLETED',
          created_at: '2026-09-25T14:00:00.000Z',
        },
        // 1 checkin before the window (older cycle)
        {
          id: 'chk-before-window',
          user_id: 'user-3',
          gym_id: testGymId,
          status: 'COMPLETED',
          created_at: '2026-08-20T10:00:00.000Z',
        },
        // 1 checkin after the window (next cycle)
        {
          id: 'chk-after-window',
          user_id: 'user-4',
          gym_id: testGymId,
          status: 'COMPLETED',
          created_at: '2026-10-05T10:00:00.000Z',
        },
        // 1 failed checkin within the window (should not be counted)
        {
          id: 'chk-failed',
          user_id: 'user-5',
          gym_id: testGymId,
          status: 'REJECTED',
          created_at: '2026-09-15T10:00:00.000Z',
        }
      );

      // Accrue payable amount in ledger
      await ledger.creditGymPayable(testGymId, 250000, 'chk-in-window-1');

      const batch = await settlements.generateSettlementBatch(testGymId, cycleStart, cycleEnd);

      expect(batch).toBeDefined();
      expect(batch.gym_id).toBe(testGymId);
      expect(batch.total_visits).toBe(2); // strictly the 2 completed checkins in September
      expect(batch.total_amount_tomans).toBe(250000);
      expect(batch.status).toBe(SettlementStatus.PENDING_APPROVAL);
      expect(batch.sheba_number).toBe('IR430120000000000000000001');
      expect(batch.bank_account_holder).toBe('محمد رستمی');
    });
  });

  describe('3. Settlement Approval & Paya Banking Disbursement', () => {
    it('approves settlement batch and debits gym payable ledger with DISBURSEMENT_PAYA', async () => {
      const cycleStart = '2026-09-01T00:00:00.000Z';
      const cycleEnd = '2026-09-30T23:59:59.000Z';

      await ledger.creditGymPayable(testGymId, 500000, 'chk-batch');
      const batch = await settlements.generateSettlementBatch(testGymId, cycleStart, cycleEnd);

      const payaRrn = 'PAYA-REF-99887766';
      const result = await settlements.approveAndDisburse(batch.id, payaRrn);

      expect(result.success).toBe(true);
      expect(result.bankReferenceRrn).toBe(payaRrn);
      expect(result.disbursedAmountTomans).toBe(500000);

      // Verify batch status is PAID
      const updatedBatch = await settlements.getSettlementBatchById(batch.id);
      expect(updatedBatch.status).toBe(SettlementStatus.PAID);
      expect(updatedBatch.bank_reference_rrn).toBe(payaRrn);
      expect(updatedBatch.disbursed_at).toBeDefined();

      // Verify payable balance is now zero
      const remainingPayable = await ledger.getGymPayableBalance(testGymId);
      expect(remainingPayable).toBe(0);

      // Verify ledger entry
      const ledgerEntries = db.getTable('gym_payable_ledger').filter(e => e.gym_id === testGymId);
      const payaEntry = ledgerEntries.find(e => e.entry_type === GymPayableEntryType.DISBURSEMENT_PAYA);
      expect(payaEntry).toBeDefined();
      expect(payaEntry!.delta_amount_tomans).toBe(-500000);
      expect(payaEntry!.balance_after).toBe(0);
      expect(payaEntry!.settlement_id).toBe(batch.id);
    });

    it('rejects approving a settlement batch that was already disbursed', async () => {
      await ledger.creditGymPayable(testGymId, 300000, 'chk-twice');
      const batch = await settlements.generateSettlementBatch(testGymId, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z');

      await settlements.approveAndDisburse(batch.id, 'PAYA-1111');

      // Attempt second approval
      await expect(
        settlements.approveAndDisburse(batch.id, 'PAYA-2222')
      ).rejects.toThrow('این دسته تسویه قبلاً پرداخت شده است');
    });

    it('rejects approval when bank reference RRN is missing', async () => {
      await ledger.creditGymPayable(testGymId, 100000, 'chk-rrn');
      const batch = await settlements.generateSettlementBatch(testGymId, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z');

      await expect(
        settlements.approveAndDisburse(batch.id, '')
      ).rejects.toThrow('شماره پیگیری پرداخت بانکی الزامی است');
    });
  });

  describe('4. Historical Settlement Batches Querying', () => {
    it('retrieves settlement batches with gym metadata attached', async () => {
      await ledger.creditGymPayable(testGymId, 200000, 'chk-query');
      await settlements.generateSettlementBatch(testGymId, '2026-09-01T00:00:00.000Z', '2026-09-30T23:59:59.000Z');

      const batches = await settlements.getSettlementBatches(testGymId);
      expect(batches.length).toBeGreaterThan(0);
      expect(batches[0].gymNameFa).toBe('باشگاه بدنسازی کارو');
      expect(batches[0].shebaNumber).toBe('IR430120000000000000000001');
      expect(batches[0].bankAccountHolder).toBe('محمد رستمی');
    });
  });
});
