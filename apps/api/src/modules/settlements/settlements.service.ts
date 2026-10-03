import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { LedgerService } from '../ledger/ledger.service';
import { SettlementStatus, GymPayableEntryType } from '@gym-app/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly ledgerService: LedgerService,
  ) {}

  /**
   * Generates a settlement batch for a gym for the current billing cutoff cycle
   */
  async generateSettlementBatch(gymId: string, cycleStart: string, cycleEnd: string): Promise<any> {
    return this.db.withTransaction(async (client) => {
      let gym: any;
      if (this.db.isInMemory) {
        gym = this.db.getTable('gyms').find(g => g.id === gymId);
      } else {
        const gymRes = await client.query('SELECT * FROM gyms WHERE id = $1 FOR UPDATE', [gymId]);
        gym = gymRes.rows[0];
      }
      if (!gym) throw new BadRequestException('باشگاه مورد نظر یافت نشد.');

      // Validate Sheba format (IR + 24 digits)
      if (!this.isValidIranianSheba(gym.sheba_number)) {
        throw new BadRequestException(`شماره شبا ثبت شده برای باشگاه نامعتبر است: ${gym.sheba_number}`);
      }

      // Calculate accrued payable amount
      const payableBalance = await this.ledgerService.getGymPayableBalance(gymId);
      if (payableBalance <= 0) {
        throw new BadRequestException('مبلغ تسویه قابل پرداختی برای این باشگاه وجود ندارد.');
      }

      // Validate cycle dates
      if (!cycleStart || !cycleEnd || new Date(cycleStart) >= new Date(cycleEnd)) {
        throw new BadRequestException('بازه زمانی دوره تسویه نامعتبر است (تاریخ شروع باید قبل از تاریخ پایان باشد).');
      }

      // Check if an active or paid settlement batch already exists for this gym and cycle
      if (this.db.isInMemory) {
        const existingBatch = this.db.getTable('settlement_batches').find(
          (b: any) =>
            b.gym_id === gymId &&
            b.cycle_start === cycleStart &&
            b.cycle_end === cycleEnd &&
            b.status !== SettlementStatus.REJECTED
        );
        if (existingBatch) {
          throw new BadRequestException('برای این باشگاه در این بازه زمانی، دسته تسویه فعال یا پرداخت‌شده وجود دارد.');
        }
      } else {
        const existingRes = await client.query(
          `SELECT id FROM settlement_batches 
           WHERE gym_id = $1 AND cycle_start = $2 AND cycle_end = $3 AND status != $4`,
          [gymId, cycleStart, cycleEnd, SettlementStatus.REJECTED]
        );
        if (existingRes.rows && existingRes.rows.length > 0) {
          throw new BadRequestException('برای این باشگاه در این بازه زمانی، دسته تسویه فعال یا پرداخت‌شده وجود دارد.');
        }
      }

      // Count visits within the billing cycle cutoff window
      let visitCount = 0;
      if (this.db.isInMemory) {
        const checkins = this.db.getTable('checkins');
        visitCount = checkins.filter(
          c => c.gym_id === gymId && c.status === 'COMPLETED' && c.created_at >= cycleStart && c.created_at <= cycleEnd
        ).length;
      } else {
        const res = await client.query(
          'SELECT COUNT(*) as count FROM checkins WHERE gym_id = $1 AND status = $2 AND created_at >= $3 AND created_at <= $4',
          [gymId, 'COMPLETED', cycleStart, cycleEnd]
        );
        visitCount = parseInt(res.rows[0].count, 10);
      }

      const batchId = crypto.randomUUID();
      const batch = {
        id: batchId,
        gym_id: gymId,
        cycle_start: cycleStart,
        cycle_end: cycleEnd,
        total_visits: visitCount,
        total_amount_tomans: payableBalance,
        status: SettlementStatus.PENDING_APPROVAL,
        sheba_number: gym.sheba_number,
        bank_account_holder: gym.bank_account_holder,
        created_at: new Date().toISOString(),
      };

      if (this.db.isInMemory) {
        this.db.getTable('settlement_batches').push(batch);
      } else {
        await client.query(
          `INSERT INTO settlement_batches (id, gym_id, cycle_start, cycle_end, total_visits, total_amount_tomans, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [batchId, gymId, cycleStart, cycleEnd, visitCount, payableBalance, SettlementStatus.PENDING_APPROVAL, batch.created_at]
        );
      }

      this.logger.log(`[Settlement Batch Created] Gym: ${gym.name_fa} | Amount: ${payableBalance.toLocaleString()} Tomans | Visits: ${visitCount}`);
      return batch;
    });
  }

  /**
   * Retrieves settlement batches, optionally filtered by gymId
   */
  async getSettlementBatches(gymId?: string): Promise<any[]> {
    let batches: any[] = [];
    if (this.db.isInMemory) {
      const all = this.db.getTable('settlement_batches');
      batches = gymId ? all.filter(b => b.gym_id === gymId) : [...all];
      batches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      const query = gymId
        ? 'SELECT * FROM settlement_batches WHERE gym_id = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM settlement_batches ORDER BY created_at DESC';
      const params = gymId ? [gymId] : [];
      const res = await this.db.query(query, params);
      batches = res.rows;
    }

    // Attach gym metadata
    return Promise.all(
      batches.map(async b => {
        let gym: any;
        if (this.db.isInMemory) {
          gym = this.db.getTable('gyms').find(g => g.id === b.gym_id);
        } else {
          const res = await this.db.query('SELECT name_fa, bank_account_holder, sheba_number FROM gyms WHERE id = $1', [b.gym_id]);
          gym = res.rows[0];
        }
        return {
          ...b,
          gymNameFa: gym?.name_fa,
          bankAccountHolder: b.bank_account_holder || gym?.bank_account_holder,
          shebaNumber: b.sheba_number || gym?.sheba_number,
        };
      })
    );
  }

  /**
   * Retrieves a specific settlement batch by ID
   */
  async getSettlementBatchById(batchId: string): Promise<any> {
    let batch: any;
    if (this.db.isInMemory) {
      batch = this.db.getTable('settlement_batches').find(b => b.id === batchId);
    } else {
      const res = await this.db.query('SELECT * FROM settlement_batches WHERE id = $1', [batchId]);
      batch = res.rows[0];
    }

    if (!batch) {
      throw new BadRequestException('دسته تسویه مورد نظر یافت نشد.');
    }

    let gym: any;
    if (this.db.isInMemory) {
      gym = this.db.getTable('gyms').find(g => g.id === batch.gym_id);
    } else {
      const res = await this.db.query('SELECT name_fa, bank_account_holder, sheba_number FROM gyms WHERE id = $1', [batch.gym_id]);
      gym = res.rows[0];
    }

    return {
      ...batch,
      gymNameFa: gym?.name_fa,
      bankAccountHolder: batch.bank_account_holder || gym?.bank_account_holder,
      shebaNumber: batch.sheba_number || gym?.sheba_number,
    };
  }

  /**
   * Approves settlement and generates Paya banking export
   */
  async approveAndDisburse(batchId: string, bankReferenceRrn: string): Promise<any> {
    if (!bankReferenceRrn || !bankReferenceRrn.trim()) {
      throw new BadRequestException('شماره پیگیری پرداخت بانکی الزامی است.');
    }

    return await this.db.withTransaction(async (client) => {
      let batch: any;
      if (this.db.isInMemory) {
        batch = this.db.getTable('settlement_batches').find(b => b.id === batchId);
      } else {
        const res = await client.query('SELECT * FROM settlement_batches WHERE id = $1 FOR UPDATE', [batchId]);
        batch = res.rows[0];
      }

      if (!batch) throw new BadRequestException('دسته تسویه مورد نظر یافت نشد.');
      if (batch.status === SettlementStatus.PAID) {
        throw new BadRequestException('این دسته تسویه قبلاً پرداخت شده است.');
      }

      const disbursedAt = new Date().toISOString();

      // Atomically debit gym payable ledger with row-level locking
      await this.ledgerService.debitGymPayable(
        batch.gym_id,
        Number(batch.total_amount_tomans),
        batchId,
        GymPayableEntryType.DISBURSEMENT_PAYA,
        `واریز پایا بانکی با شماره پیگیری ${bankReferenceRrn}`
      );

      if (this.db.isInMemory) {
        batch.status = SettlementStatus.PAID;
        batch.bank_reference_rrn = bankReferenceRrn;
        batch.disbursed_at = disbursedAt;
      } else {
        await client.query(
          `UPDATE settlement_batches SET status = $1, bank_reference_rrn = $2, disbursed_at = $3 WHERE id = $4`,
          [SettlementStatus.PAID, bankReferenceRrn, disbursedAt, batchId]
        );
      }

      return {
        success: true,
        batchId,
        disbursedAmountTomans: batch.total_amount_tomans,
        bankReferenceRrn,
        disbursedAt,
      };
    });
  }

  /**
   * Validates Iranian Sheba (IBAN) using ISO 7064 Mod 97-10 checksum:
   * 1. Format: IR + 2 check digits + 22 digits (26 characters total)
   * 2. Rearrange: move first 4 characters (IR + check digits) to end
   * 3. Replace letters: I -> 18, R -> 27
   * 4. Modulo 97 on the resulting 28-digit integer must equal 1
   */
  isValidIranianSheba(sheba: string): boolean {
    if (!sheba) return false;
    const clean = sheba.toUpperCase().replace(/[\s-]+/g, '');
    const regex = /^IR\d{24}$/;
    if (!regex.test(clean)) return false;

    // Move first 4 characters (IR + 2 check digits) to the end
    const rearranged = clean.slice(4) + clean.slice(0, 4);

    // Convert I -> 18, R -> 27
    const numericStr = rearranged
      .split('')
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) {
          return (code - 55).toString();
        }
        return char;
      })
      .join('');

    try {
      return BigInt(numericStr) % 97n === 1n;
    } catch {
      return false;
    }
  }
}
