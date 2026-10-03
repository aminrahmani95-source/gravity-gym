import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
  CreditLedgerEntry,
  GymPayableLedgerEntry,
  CreditLedgerEntryType,
  GymPayableEntryType,
  WalletSummary,
} from '@gym-app/shared-types';
import * as crypto from 'crypto';

/**
 * LedgerService: Manages platform financial and credit state.
 *
 * ARCHITECTURAL CLARIFICATION (AUDIT COMPLIANCE):
 * This service implements an "Append-Only Event Ledger with Dual Subledgers":
 * 1. `credit_ledger`: Subledger denominated exclusively in integer "Credits" for member balances.
 * 2. `gym_payable_ledger`: Subledger denominated exclusively in "Tomans" (BIGINT) for club payables.
 *
 * It is NOT a traditional accounting Double-Entry General Ledger (Chart of Accounts with balanced
 * debits and credits in a single currency).
 *
 * Requirements for adding a full accounting double-entry General Ledger (GL) in a later phase:
 * - A unified Chart of Accounts (Assets, Liabilities, Equity, Revenue, Expense).
 * - A single base accounting currency (IRR/IRT) for all double-entry ledger postings.
 * - Unified `journal_entries` and `journal_entry_lines` tables where sum(debits) === sum(credits).
 * - Deferred revenue liability accounts (پیش‌دریافت درآمد) for purchased unspent credits.
 * - Formal revenue recognition journal entries upon check-in consumption and expiration.
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves the current verified credit balance for a user.
   * Derived from the append-only ledger snapshot.
   */
  async getBalance(userId: string): Promise<number> {
    if (this.db.isInMemory) {
      const userEntries = this.db
        .getTable('credit_ledger')
        .filter(e => e.user_id === userId);
      if (userEntries.length === 0) return 0;
      return userEntries[userEntries.length - 1].balance_after;
    }

    const res = await this.db.query(
      'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return res.rows[0]?.balance_after ?? 0;
  }

  /**
   * Retrieves the current accrued payable balance (in Tomans) for a partner gym.
   */
  async getGymPayableBalance(gymId: string): Promise<number> {
    if (this.db.isInMemory) {
      const gymEntries = this.db
        .getTable('gym_payable_ledger')
        .filter(e => e.gym_id === gymId);
      if (gymEntries.length === 0) return 0;
      return Number(gymEntries[gymEntries.length - 1].balance_after);
    }

    const res = await this.db.query(
      'SELECT balance_after FROM gym_payable_ledger WHERE gym_id = $1 ORDER BY created_at DESC LIMIT 1',
      [gymId]
    );
    return Number(res.rows[0]?.balance_after ?? 0);
  }

  /**
   * Issues credits to a user (e.g. Plan Purchase or Top-up).
   * Executes inside an atomic transaction.
   */
  async issueCredits(
    userId: string,
    amount: number,
    entryType: CreditLedgerEntryType,
    referenceId?: string,
    description?: string,
  ): Promise<CreditLedgerEntry> {
    if (amount <= 0) {
      throw new BadRequestException('مقدار اعتبار افزایشی باید بزرگتر از صفر باشد.');
    }

    return this.db.withTransaction(async (client) => {
      // 1. Lock parent user row to serialize ledger mutations and prevent concurrent insert race conditions
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      let currentBalance = 0;
      if (this.db.isInMemory) {
        currentBalance = await this.getBalance(userId);
      } else {
        const res = await client.query(
          'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        );
        currentBalance = res.rows[0]?.balance_after ?? 0;
      }

      const balanceAfter = currentBalance + amount;
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      if (this.db.isInMemory) {
        const row = {
          id: newId,
          user_id: userId,
          delta_credits: amount,
          balance_after: balanceAfter,
          entry_type: entryType,
          reference_id: referenceId,
          description: description || 'افزایش اعتبار حساب',
          created_at: now,
        };
        this.db.getTable('credit_ledger').push(row);
        return this.mapCreditEntry(row);
      }

      const insertRes = await client.query(
        `INSERT INTO credit_ledger (id, user_id, delta_credits, balance_after, entry_type, reference_id, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [newId, userId, amount, balanceAfter, entryType, referenceId, description, now]
      );
      return this.mapCreditEntry(insertRes.rows[0]);
    });
  }

  /**
   * Debits credits from a user (e.g. Check-in visit).
   * Strict invariant: Balance CANNOT drop below zero.
   */
  async debitCredits(
    userId: string,
    amount: number,
    entryType: CreditLedgerEntryType,
    referenceId?: string,
    description?: string,
  ): Promise<CreditLedgerEntry> {
    if (amount <= 0) {
      throw new BadRequestException('مقدار کسر اعتبار باید بزرگتر از صفر باشد.');
    }

    return this.db.withTransaction(async (client) => {
      // 1. Lock parent user row to serialize ledger mutations and prevent concurrent debit race conditions
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

      let currentBalance = 0;
      if (this.db.isInMemory) {
        currentBalance = await this.getBalance(userId);
      } else {
        const res = await client.query(
          'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId]
        );
        currentBalance = res.rows[0]?.balance_after ?? 0;
      }

      if (currentBalance < amount) {
        throw new BadRequestException(
          `اعتبار ناکافی است. موجودی فعلی: ${currentBalance} اعتبار، اعتبار مورد نیاز: ${amount} اعتبار.`
        );
      }

      const balanceAfter = currentBalance - amount;
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      if (this.db.isInMemory) {
        const row = {
          id: newId,
          user_id: userId,
          delta_credits: -amount,
          balance_after: balanceAfter,
          entry_type: entryType,
          reference_id: referenceId,
          description: description || 'کسر اعتبار جهت ورود به مجموعه',
          created_at: now,
        };
        this.db.getTable('credit_ledger').push(row);
        return this.mapCreditEntry(row);
      }

      const insertRes = await client.query(
        `INSERT INTO credit_ledger (id, user_id, delta_credits, balance_after, entry_type, reference_id, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [newId, userId, -amount, balanceAfter, entryType, referenceId, description, now]
      );
      return this.mapCreditEntry(insertRes.rows[0]);
    });
  }

  /**
   * Credits a partner gym's payable account in Tomans per verified visit.
   */
  async creditGymPayable(
    gymId: string,
    amountTomans: number,
    checkinId?: string,
    entryType = GymPayableEntryType.CHECKIN_EARNING,
    description?: string,
  ): Promise<GymPayableLedgerEntry> {
    return this.db.withTransaction(async (client) => {
      // 1. Lock parent gym row to serialize payable ledger mutations
      await client.query('SELECT id FROM gyms WHERE id = $1 FOR UPDATE', [gymId]);

      let currentBalance = 0;
      if (this.db.isInMemory) {
        currentBalance = await this.getGymPayableBalance(gymId);
      } else {
        const res = await client.query(
          'SELECT balance_after FROM gym_payable_ledger WHERE gym_id = $1 ORDER BY created_at DESC LIMIT 1',
          [gymId]
        );
        currentBalance = Number(res.rows[0]?.balance_after ?? 0);
      }

      const balanceAfter = currentBalance + amountTomans;
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      if (this.db.isInMemory) {
        const row = {
          id: newId,
          gym_id: gymId,
          checkin_id: checkinId,
          delta_amount_tomans: amountTomans,
          balance_after: balanceAfter,
          entry_type: entryType,
          description: description || 'درآمد حاصل از پذیرش عضو پلتفرم',
          created_at: now,
        };
        this.db.getTable('gym_payable_ledger').push(row);
        return this.mapPayableEntry(row);
      }

      const insertRes = await client.query(
        `INSERT INTO gym_payable_ledger (id, gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [newId, gymId, checkinId, amountTomans, balanceAfter, entryType, description, now]
      );
      return this.mapPayableEntry(insertRes.rows[0]);
    });
  }

  /**
   * Debits a partner gym's payable account in Tomans upon banking Paya disbursement.
   * Executes within an atomic transaction with row-level locking on the gym.
   */
  async debitGymPayable(
    gymId: string,
    amountTomans: number,
    settlementId?: string,
    entryType = GymPayableEntryType.DISBURSEMENT_PAYA,
    description?: string,
  ): Promise<GymPayableLedgerEntry> {
    if (amountTomans <= 0) {
      throw new BadRequestException('مبلغ کسر از بستانکاری باشگاه باید بزرگتر از صفر باشد.');
    }

    return this.db.withTransaction(async (client) => {
      // 1. Lock parent gym row to serialize payable ledger mutations
      await client.query('SELECT id FROM gyms WHERE id = $1 FOR UPDATE', [gymId]);

      let currentBalance = 0;
      if (this.db.isInMemory) {
        currentBalance = await this.getGymPayableBalance(gymId);
      } else {
        const res = await client.query(
          'SELECT balance_after FROM gym_payable_ledger WHERE gym_id = $1 ORDER BY created_at DESC LIMIT 1',
          [gymId]
        );
        currentBalance = Number(res.rows[0]?.balance_after ?? 0);
      }

      if (currentBalance < amountTomans) {
        throw new BadRequestException(
          `موجودی بستانکاری باشگاه (${currentBalance.toLocaleString()} تومان) برای پرداخت (${amountTomans.toLocaleString()} تومان) کافی نمی‌باشد.`
        );
      }

      const balanceAfter = currentBalance - amountTomans;
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();

      if (this.db.isInMemory) {
        const row = {
          id: newId,
          gym_id: gymId,
          checkin_id: null,
          delta_amount_tomans: -amountTomans,
          balance_after: balanceAfter,
          entry_type: entryType,
          settlement_id: settlementId,
          description: description || 'واریز پایا بانکی به حساب باشگاه',
          created_at: now,
        };
        this.db.getTable('gym_payable_ledger').push(row);
        return this.mapPayableEntry(row);
      }

      const insertRes = await client.query(
        `INSERT INTO gym_payable_ledger (id, gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, settlement_id, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [newId, gymId, null, -amountTomans, balanceAfter, entryType, settlementId, description, now]
      );
      return this.mapPayableEntry(insertRes.rows[0]);
    });
  }

  /**
   * Executes the partial rollover policy at the 30-day billing cycle boundary.
   * Preserves up to floor(unspent * rolloverPercentage), capped at maxCap.
   * Residual unspent credits expire as an operational EXPIRED_CREDIT / CREDIT_BREAKAGE_EVENT.
   * NOTE: This is an operational inventory expiration event. Accounting revenue recognition
   * requires separate financial/legal treatment under IFRS 15 / Iranian Accounting Standard 43.
   */
  async executeMonthlyRolloverSweep(
    userId: string,
    rolloverPercentage = 0.10,
    maxCap = 5,
    subscriptionId?: string,
  ): Promise<{ preserved: number; expiredBreakage: number }> {
    return this.db.withTransaction(async () => {
      const unspent = await this.getBalance(userId);
      if (unspent <= 0) {
        return { preserved: 0, expiredBreakage: 0 };
      }

      // Calculate capped rollover
      const eligible = Math.min(Math.floor(unspent * rolloverPercentage), maxCap);
      const expiredBreakage = unspent - eligible;

      // 1. Drain current unspent balance
      await this.debitCredits(
        userId,
        unspent,
        CreditLedgerEntryType.CYCLE_EXPIRATION_SETTLEMENT,
        subscriptionId,
        'تسویه پایان دوره اشتراک ۳۰ روزه'
      );

      // 2. Re-credit preserved rollover amount
      if (eligible > 0) {
        await this.issueCredits(
          userId,
          eligible,
          CreditLedgerEntryType.ROLLOVER_PRESERVED,
          subscriptionId,
          `انتقال مجاز ${Math.round(rolloverPercentage * 100)}٪ اعتبار باقیمانده به دوره بعد (${eligible} اعتبار)`
        );
      }

      // 3. Record audit row for expired breakage
      if (expiredBreakage > 0) {
        const now = new Date().toISOString();
        const currentBal = await this.getBalance(userId);
        const row = {
          id: crypto.randomUUID(),
          user_id: userId,
          delta_credits: 0, // Zero delta snapshot to preserve balance parity
          balance_after: currentBal,
          entry_type: CreditLedgerEntryType.EXPIRED_CREDIT,
          reference_id: subscriptionId,
          description: `انقضای عملیاتی ${expiredBreakage} اعتبار باقیمانده مازاد بر سقف مجاز انتقال (رویداد بریکج عملیاتی)`,
          created_at: now,
        };

        if (this.db.isInMemory) {
          this.db.getTable('credit_ledger').push(row);
        } else {
          await this.db.query(
            `INSERT INTO credit_ledger (id, user_id, delta_credits, balance_after, entry_type, reference_id, description, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [row.id, row.user_id, row.delta_credits, row.balance_after, row.entry_type, row.reference_id, row.description, row.created_at]
          );
        }
      }

      this.logger.log(`[Rollover Sweep] User: ${userId} | Unspent: ${unspent} | Preserved: ${eligible} | Expired (Operational Breakage Event): ${expiredBreakage}`);
      return { preserved: eligible, expiredBreakage };
    });
  }

  /**
   * Reverses a fraudulent or disputed check-in.
   * Atomically refunds user credits and debits gym payable.
   */
  async refundCheckin(checkinId: string, adminReason: string): Promise<boolean> {
    return this.db.withTransaction(async () => {
      let checkin: any;
      if (this.db.isInMemory) {
        checkin = this.db.getTable('checkins').find(c => c.id === checkinId);
      } else {
        const res = await this.db.query('SELECT * FROM checkins WHERE id = $1', [checkinId]);
        checkin = res.rows[0];
      }

      if (!checkin || checkin.status !== 'COMPLETED') {
        throw new BadRequestException('ترکنش ورود معتبری جهت لغو یافت نشد.');
      }

      // 1. Refund user credits
      await this.issueCredits(
        checkin.user_id,
        checkin.credits_debited,
        CreditLedgerEntryType.REFUND_CREDIT,
        checkinId,
        `استرداد اعتبار به علت لغو ورود: ${adminReason}`
      );

      // 2. Adjust gym payable ledger (Debit liability)
      const currentGymBal = await this.getGymPayableBalance(checkin.gym_id);
      const balanceAfter = Math.max(0, currentGymBal - Number(checkin.monetary_payout_tomans));
      const payaRow = {
        id: crypto.randomUUID(),
        gym_id: checkin.gym_id,
        checkin_id: checkinId,
        delta_amount_tomans: -Number(checkin.monetary_payout_tomans),
        balance_after: balanceAfter,
        entry_type: GymPayableEntryType.DISPUTE_ADJUSTMENT,
        description: `تعدیل بستانکاری به علت لغو ورود: ${adminReason}`,
        created_at: new Date().toISOString(),
      };

      if (this.db.isInMemory) {
        this.db.getTable('gym_payable_ledger').push(payaRow);
        checkin.status = 'CANCELLED';
        checkin.rejection_reason = adminReason;
      } else {
        await this.db.query(
          `INSERT INTO gym_payable_ledger (id, gym_id, checkin_id, delta_amount_tomans, balance_after, entry_type, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [payaRow.id, payaRow.gym_id, payaRow.checkin_id, payaRow.delta_amount_tomans, payaRow.balance_after, payaRow.entry_type, payaRow.description, payaRow.created_at]
        );
        await this.db.query(
          `UPDATE checkins SET status = 'CANCELLED', rejection_reason = $1 WHERE id = $2`,
          [adminReason, checkinId]
        );
      }

      return true;
    });
  }

  /**
   * Verifies the core financial invariant: Sum(Deltas) === Latest Balance
   */
  async verifyLedgerInvariants(userId: string): Promise<{ isValid: boolean; sumDeltas: number; currentBalance: number }> {
    let sumDeltas = 0;
    let currentBalance = 0;

    if (this.db.isInMemory) {
      const entries = this.db.getTable('credit_ledger').filter(e => e.user_id === userId);
      sumDeltas = entries.reduce((acc, curr) => acc + curr.delta_credits, 0);
      currentBalance = await this.getBalance(userId);
    } else {
      const sumRes = await this.db.query(
        'SELECT COALESCE(SUM(delta_credits), 0) as total FROM credit_ledger WHERE user_id = $1',
        [userId]
      );
      sumDeltas = parseInt(sumRes.rows[0].total, 10);
      currentBalance = await this.getBalance(userId);
    }

    return {
      isValid: sumDeltas === currentBalance,
      sumDeltas,
      currentBalance,
    };
  }

  async getWalletSummary(userId: string): Promise<WalletSummary> {
    const currentCredits = await this.getBalance(userId);
    let entries: any[] = [];
    let totalEarnedCredits = 0;
    let totalSpentCredits = 0;

    if (this.db.isInMemory) {
      const allUserEntries = this.db
        .getTable('credit_ledger')
        .filter(e => e.user_id === userId);

      totalEarnedCredits = allUserEntries
        .filter(e => e.delta_credits > 0)
        .reduce((sum, e) => sum + e.delta_credits, 0);

      totalSpentCredits = allUserEntries
        .filter(e => e.delta_credits < 0)
        .reduce((sum, e) => sum + Math.abs(e.delta_credits), 0);

      const checkins = this.db.getTable('checkins');
      const gyms = this.db.getTable('gyms');
      const plans = this.db.getTable('plans');
      const subscriptions = this.db.getTable('subscriptions');

      entries = [...allUserEntries]
        .reverse()
        .slice(0, 50)
        .map(e => {
          let relatedTitle: string | undefined;
          if (e.entry_type === 'CHECKIN_DEBIT' && e.reference_id) {
            const c = checkins.find(x => x.id === e.reference_id);
            if (c) {
              const g = gyms.find(x => x.id === c.gym_id);
              relatedTitle = g?.name_fa;
            }
          } else if (e.entry_type === 'PLAN_PURCHASE' && e.reference_id) {
            const sub = subscriptions.find(s => s.id === e.reference_id);
            const planId = sub?.plan_id || e.reference_id;
            const p = plans.find(x => x.id === planId);
            relatedTitle = p?.title_fa;
          } else if (e.entry_type === 'REFUND_DEBIT' && e.reference_id) {
            const txs = this.db.getTable('payment_transactions');
            const tx = txs.find((t: any) => t.id === e.reference_id);
            if (tx) {
              const p = plans.find(x => x.id === tx.plan_id);
              relatedTitle = p ? `استرداد ${p.title_fa}` : 'استرداد وجه اشتراک';
            } else {
              relatedTitle = 'استرداد وجه اشتراک';
            }
          }
          return {
            ...this.mapCreditEntry(e),
            relatedTitle,
          };
        });
    } else {
      const statsRes = await this.db.query(
        `SELECT 
           COALESCE(SUM(CASE WHEN delta_credits > 0 THEN delta_credits ELSE 0 END), 0) as total_earned,
           COALESCE(SUM(CASE WHEN delta_credits < 0 THEN ABS(delta_credits) ELSE 0 END), 0) as total_spent
         FROM credit_ledger WHERE user_id = $1`,
        [userId]
      );
      totalEarnedCredits = Number(statsRes.rows[0]?.total_earned ?? 0);
      totalSpentCredits = Number(statsRes.rows[0]?.total_spent ?? 0);

      const res = await this.db.query(
        `SELECT cl.*,
           CASE 
             WHEN cl.entry_type = 'CHECKIN_DEBIT' THEN (SELECT g.name_fa FROM checkins c JOIN gyms g ON c.gym_id = g.id WHERE c.id = cl.reference_id LIMIT 1)
             WHEN cl.entry_type = 'PLAN_PURCHASE' THEN (
               COALESCE(
                 (SELECT p.title_fa FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.id = cl.reference_id LIMIT 1),
                 (SELECT p.title_fa FROM plans p WHERE p.id = cl.reference_id LIMIT 1)
               )
             )
             WHEN cl.entry_type = 'REFUND_DEBIT' THEN (
               SELECT CONCAT('استرداد ', p.title_fa) FROM payment_transactions pt JOIN plans p ON pt.plan_id = p.id WHERE pt.id = cl.reference_id LIMIT 1
             )
             ELSE NULL
           END as related_title
         FROM credit_ledger cl
         WHERE cl.user_id = $1 
         ORDER BY cl.created_at DESC 
         LIMIT 50`,
        [userId]
      );
      entries = res.rows.map(r => ({
        ...this.mapCreditEntry(r),
        relatedTitle: r.related_title || undefined,
      }));
    }

    return {
      userId,
      currentCredits,
      totalEarnedCredits,
      totalSpentCredits,
      recentTransactions: entries,
    };
  }

  private mapCreditEntry(row: any): CreditLedgerEntry {
    return {
      id: row.id,
      userId: row.user_id,
      deltaCredits: row.delta_credits,
      balanceAfter: row.balance_after,
      entryType: row.entry_type as CreditLedgerEntryType,
      referenceId: row.reference_id,
      description: row.description,
      relatedTitle: row.related_title || row.relatedTitle,
      createdAt: row.created_at,
    };
  }


  private mapPayableEntry(row: any): GymPayableLedgerEntry {
    return {
      id: row.id,
      gymId: row.gym_id,
      checkinId: row.checkin_id,
      deltaAmountTomans: Number(row.delta_amount_tomans),
      balanceAfter: Number(row.balance_after),
      entryType: row.entry_type as GymPayableEntryType,
      settlementId: row.settlement_id,
      description: row.description,
      createdAt: row.created_at,
    };
  }
}
