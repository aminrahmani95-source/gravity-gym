import { Injectable, BadRequestException, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { LedgerService } from '../ledger/ledger.service';
import { PlansService } from '../plans/plans.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClassesService } from '../classes/classes.service';
import { IPaymentGateway, MockShaparakGateway } from './payment-gateway.interface';
import {
  PaymentInitiateResponse,
  PaymentVerifyResult,
  CreditLedgerEntryType,
  SubscriptionStatus,
  PaymentStatus,
  MemberPaymentHistoryItem,
  PaymentPurpose,
  ClassSessionStatus,
} from '@gym-app/shared-types';

import * as crypto from 'crypto';

interface PaymentTransactionRow {
  id: string;
  authority: string;
  user_id: string;
  plan_id?: string | null;
  payment_purpose?: PaymentPurpose;
  reference_id?: string | null;
  amount_rials: number | string;
  status: PaymentStatus;
  provider: string;
  subscription_id?: string | null;
  reference_id_rrn?: string | null;
  card_pan_masked?: string | null;
  created_at: string;
  updated_at: string;
  paid_at?: string | null;
}

interface DatabaseUniqueError extends Error {
  code?: string;
  constraint?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private gateway: IPaymentGateway = new MockShaparakGateway();

  constructor(
    private readonly db: DatabaseService,
    private readonly ledgerService: LedgerService,
    private readonly plansService: PlansService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly redis?: RedisService,
    @Optional()
    @Inject(forwardRef(() => ClassesService))
    private readonly classesService?: ClassesService,
  ) {}

  /**
   * Allows setting a custom payment gateway implementation for testing
   */
  setGateway(gateway: IPaymentGateway) {
    this.gateway = gateway;
  }

  /**
   * Initiates payment checkout with explicit Rial boundary conversion.
   * Creates a persistent payment transaction record in PENDING state.
   */
  async initiateCheckout(userId: string, planId: string): Promise<PaymentInitiateResponse> {
    if (this.redis) {
      const lockKey = `checkout_throttle:${userId}`;
      const isThrottled = await this.redis.get(lockKey);
      if (isThrottled) {
        throw new BadRequestException('یک درخواست پرداخت در حال پردازش است. لطفاً چند لحظه صبر فرمایید.');
      }
      await this.redis.set(lockKey, '1', 2);
    }

    const plan = await this.plansService.getById(planId);

    // Explicit Currency Boundary Conversion: 1 Toman = 10 Rials
    const amountTomans = plan.priceTomans;
    const amountRials = amountTomans * 10;

    const paymentId = crypto.randomUUID();
    const callbackUrl = process.env.PAYMENT_CALLBACK_URL || 'http://localhost:3000/payments/callback';
    const description = `خرید ${plan.titleFa} - کاربر ${userId}`;
    let authority: string;
    let redirectUrl: string;
    try {
      const res = await this.gateway.initiatePayment(amountRials, callbackUrl, description);
      authority = res.authority;
      redirectUrl = res.redirectUrl;
    } catch (gatewayErr: any) {
      this.logger.error(`[Gateway Initiate Error] - ${gatewayErr.message}`);
      throw new BadRequestException('امکان برقراری ارتباط با درگاه پرداخت بانکی وجود ندارد. لطفاً دقایقی دیگر مجدداً تلاش فرمایید.');
    }

    // Persist pending payment record in PostgreSQL or in-memory DB
    const now = new Date().toISOString();
    if (this.db.isInMemory) {
      const table = this.db.getTable('payment_transactions');

      if (table.some((r: PaymentTransactionRow) => r.authority === authority)) {
        const err: DatabaseUniqueError = new Error('duplicate key value violates unique constraint "uq_payment_transactions_authority"');
        err.code = '23505';
        err.constraint = 'uq_payment_transactions_authority';
        throw err;
      }
      table.push({
        id: paymentId,
        authority,
        user_id: userId,
        plan_id: planId,
        payment_purpose: PaymentPurpose.MEMBERSHIP_PLAN,
        reference_id: planId,
        amount_rials: amountRials,
        status: PaymentStatus.PENDING,
        provider: 'SHAPARAK_EMULATOR',
        subscription_id: null,
        reference_id_rrn: null,
        card_pan_masked: null,
        created_at: now,
        updated_at: now,
        paid_at: null,
      });
    } else {
      await this.db.query(
        `INSERT INTO payment_transactions 
         (id, authority, user_id, plan_id, payment_purpose, reference_id, amount_rials, status, provider, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [paymentId, authority, userId, planId, PaymentPurpose.MEMBERSHIP_PLAN, planId, amountRials, PaymentStatus.PENDING, 'SHAPARAK_EMULATOR'],
      );
    }

    this.logger.log(
      `[Payment Initiated] PaymentId: ${paymentId} | Plan: ${plan.titleFa} | ${amountTomans.toLocaleString()} Tomans (${amountRials.toLocaleString()} Rials) | Authority: ${authority}`,
    );

    return {
      paymentId,
      amountTomans,
      amountRials,
      redirectUrl,
      gatewayAuthority: authority,
    };
  }

  /**
   * Verifies payment callback server-to-server and idempotently deposits plan credits atomically.
   * Guarantees that duplicate and concurrent verifications never double-issue credits or duplicate subscriptions.
   */
  async verifyPayment(
    userId: string,
    planId: string,
    authority: string,
    status: string,
  ): Promise<PaymentVerifyResult> {
    const plan = await this.plansService.getById(planId);
    const amountTomans = plan.priceTomans;
    const amountRials = amountTomans * 10;

    // 1. Validate callback status: if not OK, return failure immediately and update status if initiated
    if (status !== 'OK') {
      await this.markTransactionFailed(authority);
      if (this.notificationsService) {
        this.dispatchFailureNotification(userId, 'تراکنش توسط کاربر لغو گردید.');
      }
      return {
        isSuccessful: false,
        paymentId: 'FAILED',
        amountTomans: 0,
        creditsIssued: 0,
        errorMessage: 'تراکنش توسط کاربر لغو شد یا با خطا مواجه گردید.',
      };
    }

    // 2. Initial fast check on existing transaction record outside lock to catch conflicts or already-paid early
    const existingTx = await this.findTransactionByAuthority(authority);
    if (!existingTx) {
      throw new BadRequestException('شناسه پرداخت (Authority) در سیستم یافت نشد یا منقضی گردیده است.');
    }

    // If transaction is for a Coach Class or Monthly Plan, delegate directly to verifyClassPayment
    if (existingTx.payment_purpose && existingTx.payment_purpose !== PaymentPurpose.MEMBERSHIP_PLAN) {
      return this.verifyClassPayment(userId, authority, status);
    }

    // Validate conflicting attributes: User, Plan, Amount
    if (existingTx.user_id !== userId) {
      throw new BadRequestException('شناسه پرداخت با کاربر درخواست‌دهنده مغایرت دارد (تراکنش نامعتبر).');
    }
    if (existingTx.plan_id !== planId) {
      throw new BadRequestException('شناسه پرداخت با پلن درخواستی مغایرت دارد (تراکنش نامعتبر).');
    }
    if (Number(existingTx.amount_rials) !== amountRials) {
      throw new BadRequestException('مبلغ تراکنش با مبلغ پلن مغایرت دارد (تراکنش نامعتبر).');
    }

    // If already PAID, return idempotent success immediately without touching ledger or subscriptions
    if (existingTx.status === PaymentStatus.PAID) {
      this.logger.log(`[Idempotent Payment Return] Authority: ${authority} already PAID. Returning processed receipt.`);
      return {
        isSuccessful: true,
        paymentId: existingTx.subscription_id || existingTx.id,
        referenceIdRrn: existingTx.reference_id_rrn || 'RRN_ALREADY_VERIFIED',
        cardPanMasked: existingTx.card_pan_masked || '6037********1234',
        amountTomans,
        creditsIssued: plan.creditsAwarded,
      };
    }

    // If already marked FAILED, EXPIRED, REFUNDED or CANCELLED, reject re-verification
    if (existingTx.status === PaymentStatus.FAILED) {
      throw new BadRequestException('این تراکنش قبلاً لغو شده یا با خطا مواجه گردیده است و امکان تأیید مجدد آن وجود ندارد.');
    }
    if (existingTx.status === PaymentStatus.EXPIRED) {
      throw new BadRequestException('مهلت پرداخت در درگاه بانکی به پایان رسیده و این تراکنش منقضی گردیده است.');
    }
    if (existingTx.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('این تراکنش قبلاً استرداد شده است و امکان تأیید مجدد آن وجود ندارد.');
    }
    if (existingTx.status === PaymentStatus.CANCELLED) {
      throw new BadRequestException('این تراکنش لغو گردیده است و امکان تأیید مجدد آن وجود ندارد.');
    }

    // Enforce gateway session timeout (20 minutes maximum per Iranian banking regulations)
    const ageMinutes = (Date.now() - new Date(existingTx.created_at).getTime()) / (1000 * 60);
    if (ageMinutes > 20) {
      await this.markTransactionExpired(authority);
      throw new BadRequestException('مهلت پرداخت در درگاه بانکی به پایان رسیده است (حداکثر ۲۰ دقیقه). لطفاً مجدداً اقدام فرمایید.');
    }

    // 3. Verify server-to-server with PSP gateway in Rials
    let verifyRes: { isSuccessful: boolean; referenceIdRrn?: string; cardPanMasked?: string };
    try {
      verifyRes = await this.gateway.verifyPayment(authority, amountRials);
    } catch (networkErr: any) {
      this.logger.error(`[Gateway Network Timeout] Authority: ${authority} - ${networkErr.message}`);
      throw new BadRequestException('ارتباط با درگاه پرداخت بانکی برقرار نشد یا با تاخیر مواجه گردید. لطفاً دقایقی دیگر وضعیت را بررسی فرمایید.');
    }

    if (!verifyRes.isSuccessful) {
      await this.markTransactionFailed(authority);
      if (this.notificationsService) {
        this.dispatchFailureNotification(userId, 'تأیید تراکنش با درگاه بانکی ناموفق بود.');
      }
      return {
        isSuccessful: false,
        paymentId: 'VERIFICATION_FAILED',
        amountTomans,
        creditsIssued: 0,
        errorMessage: 'تأیید تراکنش با درگاه شاپرک ناموفق بود.',
      };
    }

    // 4. Atomic Execution Block with Row-Level Lock
    // Ensures concurrent duplicate verifications serialize: one mutates, the other observes PAID.
    const result = await this.db.withTransaction(async (client) => {
      let tx: PaymentTransactionRow | null = null;
      if (this.db.isInMemory) {
        const table = this.db.getTable('payment_transactions');
        tx = table.find((r: PaymentTransactionRow) => r.authority === authority) || null;
      } else {
        const res = await client.query(
          `SELECT * FROM payment_transactions WHERE authority = $1 FOR UPDATE`,
          [authority],
        );
        tx = res.rows[0] || null;
      }

      // If record exists inside lock:
      if (tx) {
        // Enforce conflict checks inside lock
        if (tx.user_id !== userId) {
          throw new BadRequestException('شناسه پرداخت با کاربر درخواست‌دهنده مغایرت دارد.');
        }
        if (tx.plan_id !== planId) {
          throw new BadRequestException('شناسه پرداخت با پلن درخواستی مغایرت دارد.');
        }
        if (Number(tx.amount_rials) !== amountRials) {
          throw new BadRequestException('مبلغ تراکنش با مبلغ پلن مغایرت دارد.');
        }

        // Check if concurrent request already completed payment
        if (tx.status === PaymentStatus.PAID) {
          this.logger.log(`[Concurrent Idempotent Return] Authority: ${authority} was already completed by concurrent request.`);
          return {
            isSuccessful: true,
            paymentId: tx.subscription_id || tx.id,
            referenceIdRrn: tx.reference_id_rrn || verifyRes.referenceIdRrn,
            cardPanMasked: tx.card_pan_masked || verifyRes.cardPanMasked,
            amountTomans,
            creditsIssued: plan.creditsAwarded,
          };
        }

        if (
          tx.status === PaymentStatus.FAILED ||
          tx.status === PaymentStatus.REFUNDED ||
          tx.status === PaymentStatus.CANCELLED
        ) {
          throw new BadRequestException(`این تراکنش در وضعیت ${tx.status} قرار دارد و امکان تأیید مجدد آن وجود ندارد.`);
        }
      }

      // Prepare subscription and timestamps
      const subscriptionId = crypto.randomUUID();
      const startsAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      // Mutation 1: Create subscription
      if (this.db.isInMemory) {
        this.db.getTable('subscriptions').push({
          id: subscriptionId,
          user_id: userId,
          plan_id: planId,
          starts_at: startsAt,
          expires_at: expiresAt,
          status: SubscriptionStatus.ACTIVE,
          auto_renew: true,
          created_at: startsAt,
        });
      } else {
        await client.query(
          `INSERT INTO subscriptions (id, user_id, plan_id, starts_at, expires_at, status, auto_renew)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [subscriptionId, userId, planId, startsAt, expiresAt, SubscriptionStatus.ACTIVE, true],
        );
      }

      // Mutation 2: Issue credits into append-only credit ledger
      await this.ledgerService.issueCredits(
        userId,
        plan.creditsAwarded,
        CreditLedgerEntryType.PLAN_PURCHASE,
        subscriptionId,
        `فعالسازی ${plan.titleFa} (${plan.creditsAwarded} اعتبار ۳۰ روزه)`,
      );

      // Mutation 3: Persist or update payment_transactions to PAID
      if (this.db.isInMemory) {
        const table = this.db.getTable('payment_transactions');
        let memTx = table.find((r: PaymentTransactionRow) => r.authority === authority);
        if (!memTx) {
          memTx = {
            id: crypto.randomUUID(),
            authority,
            user_id: userId,
            plan_id: planId,
            amount_rials: amountRials,
            status: PaymentStatus.PAID,
            provider: 'SHAPARAK_EMULATOR',
            subscription_id: subscriptionId,
            reference_id_rrn: verifyRes.referenceIdRrn,
            card_pan_masked: verifyRes.cardPanMasked,
            created_at: now,
            updated_at: now,
            paid_at: now,
          };
          table.push(memTx);
        } else {
          memTx.status = PaymentStatus.PAID;
          memTx.subscription_id = subscriptionId;
          memTx.reference_id_rrn = verifyRes.referenceIdRrn;
          memTx.card_pan_masked = verifyRes.cardPanMasked;
          memTx.paid_at = now;
          memTx.updated_at = now;
        }
      } else {
        if (tx) {
          await client.query(
            `UPDATE payment_transactions
             SET status = $1,
                 subscription_id = $2,
                 reference_id_rrn = $3,
                 card_pan_masked = $4,
                 paid_at = NOW(),
                 updated_at = NOW()
             WHERE authority = $5`,
            [PaymentStatus.PAID, subscriptionId, verifyRes.referenceIdRrn, verifyRes.cardPanMasked, authority],
          );
        } else {
          await client.query(
            `INSERT INTO payment_transactions
             (id, authority, user_id, plan_id, amount_rials, status, provider, subscription_id, reference_id_rrn, card_pan_masked, created_at, updated_at, paid_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())`,
            [
              crypto.randomUUID(),
              authority,
              userId,
              planId,
              amountRials,
              PaymentStatus.PAID,
              'SHAPARAK_EMULATOR',
              subscriptionId,
              verifyRes.referenceIdRrn,
              verifyRes.cardPanMasked,
            ],
          );
        }
      }

      this.logger.log(
        `[Payment Verified & Committed] Authority: ${authority} | User: ${userId} | Sub: ${subscriptionId} | +${plan.creditsAwarded} cr | RRN: ${verifyRes.referenceIdRrn}`,
      );

      return {
        isSuccessful: true,
        paymentId: subscriptionId,
        referenceIdRrn: verifyRes.referenceIdRrn,
        cardPanMasked: verifyRes.cardPanMasked,
        amountTomans,
        creditsIssued: plan.creditsAwarded,
      };
    });

    if (result.isSuccessful && this.notificationsService) {
      this.dispatchSuccessNotification(userId, plan.titleFa, plan.creditsAwarded, plan.validityDays);
    }

    return result;
  }

  private async dispatchSuccessNotification(userId: string, planTitle: string, credits: number, validityDays: number): Promise<void> {
    try {
      if (!this.notificationsService) return;
      let phone: string | undefined;
      if (this.db.isInMemory) {
        const u = this.db.getTable('users').find((x: any) => x.id === userId);
        phone = u?.phone_number;
      } else {
        const res = await this.db.query('SELECT phone_number FROM users WHERE id = $1', [userId]);
        phone = res.rows[0]?.phone_number;
      }
      if (phone) {
        const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();
        await this.notificationsService.notifySubscriptionActivated(phone, planTitle, credits, expiresAt);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch subscription activation notification: ${err.message}`);
    }
  }

  private async dispatchFailureNotification(userId: string, reason: string): Promise<void> {
    try {
      if (!this.notificationsService) return;
      let phone: string | undefined;
      if (this.db.isInMemory) {
        const u = this.db.getTable('users').find((x: any) => x.id === userId);
        phone = u?.phone_number;
      } else {
        const res = await this.db.query('SELECT phone_number FROM users WHERE id = $1', [userId]);
        phone = res.rows[0]?.phone_number;
      }
      if (phone) {
        await this.notificationsService.notifyPaymentFailed(phone, reason);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch payment failure notification: ${err.message}`);
    }
  }

  /**
   * Safely marks a transaction as FAILED without touching already-PAID payments
   */
  private async markTransactionFailed(authority: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.db.isInMemory) {
      const table = this.db.getTable('payment_transactions');
      const tx = table.find((r: PaymentTransactionRow) => r.authority === authority);
      if (tx && tx.status !== PaymentStatus.PAID) {
        tx.status = PaymentStatus.FAILED;
        tx.updated_at = now;
      }
      return;
    }

    // In PostgreSQL:
    await this.db.query(
      `UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE authority = $2 AND status != $3`,
      [PaymentStatus.FAILED, authority, PaymentStatus.PAID],
    );
  }

  /**
   * Safely marks an unverified pending transaction as EXPIRED
   */
  private async markTransactionExpired(authority: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.db.isInMemory) {
      const table = this.db.getTable('payment_transactions');
      const tx = table.find((r: PaymentTransactionRow) => r.authority === authority);
      if (tx && tx.status === PaymentStatus.PENDING) {
        tx.status = PaymentStatus.EXPIRED;
        tx.updated_at = now;
      }
      return;
    }

    await this.db.query(
      `UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE authority = $2 AND status = $3`,
      [PaymentStatus.EXPIRED, authority, PaymentStatus.PENDING],
    );
  }

  /**
   * Retrieves transaction record by authority
   */
  async findTransactionByAuthority(authority: string): Promise<PaymentTransactionRow | null> {
    if (this.db.isInMemory) {
      const table = this.db.getTable('payment_transactions');
      return table.find((r: PaymentTransactionRow) => r.authority === authority) || null;
    }
    const res = await this.db.query(
      `SELECT * FROM payment_transactions WHERE authority = $1`,
      [authority],
    );
    return (res.rows[0] as PaymentTransactionRow) || null;
  }

  /**
   * Initiates payment checkout for Coach Classes (Single Session or Monthly Plan).
   */
  async initiateClassCheckout(
    userId: string,
    purpose: PaymentPurpose,
    referenceId: string,
  ): Promise<PaymentInitiateResponse> {
    if (!this.classesService) {
      throw new BadRequestException('سرویس کلاس‌ها در دسترس نمی‌باشد.');
    }

    let amountTomans = 0;
    let title = '';

    if (purpose === PaymentPurpose.CLASS_SINGLE_SESSION) {
      const session = await this.classesService.getSessionById(referenceId);
      if (session.status !== ClassSessionStatus.SCHEDULED) {
        throw new BadRequestException('این جلسه در وضعیت فعال و قابل رزرو قرار ندارد.');
      }
      if (session.bookedCount >= session.capacity) {
        throw new BadRequestException('ظرفیت این جلسه تکمیل شده است.');
      }
      amountTomans = session.priceTomans;
      title = `رزرو جلسه کلاس ${session.classTitle || ''} (${session.sessionDate})`;
    } else if (purpose === PaymentPurpose.COACH_MONTHLY_PLAN) {
      let plan: any = null;
      if (this.db.isInMemory) {
        plan = this.db.getTable('coach_monthly_plans').find((p: any) => p.id === referenceId);
      } else {
        const res = await this.db.query('SELECT * FROM coach_monthly_plans WHERE id = $1', [referenceId]);
        plan = res.rows[0];
      }
      if (!plan || !plan.is_active) {
        throw new BadRequestException('پلن ماهانه مربی یافت نشد یا غیرفعال است.');
      }
      amountTomans = Number(plan.price_tomans);
      title = `خرید بسته ماهانه ${plan.title}`;
    } else {
      throw new BadRequestException('هدف پرداخت نامعتبر است.');
    }

    const amountRials = amountTomans * 10;
    const paymentId = crypto.randomUUID();
    const callbackUrl = process.env.PAYMENT_CALLBACK_URL || 'http://localhost:3000/payments/callback';
    const description = `${title} - کاربر ${userId}`;

    let authority: string;
    let redirectUrl: string;
    try {
      const res = await this.gateway.initiatePayment(amountRials, callbackUrl, description);
      authority = res.authority;
      redirectUrl = res.redirectUrl;
    } catch (gatewayErr: any) {
      this.logger.error(`[Gateway Initiate Error] - ${gatewayErr.message}`);
      throw new BadRequestException('امکان برقراری ارتباط با درگاه پرداخت بانکی وجود ندارد. لطفاً دقایقی دیگر مجدداً تلاش فرمایید.');
    }

    const now = new Date().toISOString();
    if (this.db.isInMemory) {
      const table = this.db.getTable('payment_transactions');
      table.push({
        id: paymentId,
        authority,
        user_id: userId,
        plan_id: null,
        payment_purpose: purpose,
        reference_id: referenceId,
        amount_rials: amountRials,
        status: PaymentStatus.PENDING,
        provider: 'SHAPARAK_EMULATOR',
        subscription_id: null,
        reference_id_rrn: null,
        card_pan_masked: null,
        created_at: now,
        updated_at: now,
        paid_at: null,
      });
    } else {
      await this.db.query(
        `INSERT INTO payment_transactions 
         (id, authority, user_id, plan_id, payment_purpose, reference_id, amount_rials, status, provider, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [paymentId, authority, userId, purpose, referenceId, amountRials, PaymentStatus.PENDING, 'SHAPARAK_EMULATOR'],
      );
    }

    this.logger.log(`[Class Payment Initiated] Authority: ${authority} | Purpose: ${purpose} | Ref: ${referenceId} | Amount: ${amountTomans.toLocaleString()} Tomans`);

    return {
      paymentId,
      amountTomans,
      amountRials,
      redirectUrl,
      gatewayAuthority: authority,
    };
  }

  /**
   * Verifies Coach Class payments (Single session or Monthly plan) server-to-server.
   */
  async verifyClassPayment(
    userId: string,
    authority: string,
    status: string,
  ): Promise<PaymentVerifyResult> {
    if (!this.classesService) {
      throw new BadRequestException('سرویس کلاس‌ها در دسترس نمی‌باشد.');
    }

    if (status !== 'OK') {
      await this.markTransactionFailed(authority);
      return {
        isSuccessful: false,
        paymentId: 'FAILED',
        amountTomans: 0,
        creditsIssued: 0,
        errorMessage: 'تراکنش توسط کاربر لغو گردید.',
      };
    }

    const existingTx = await this.findTransactionByAuthority(authority);
    if (!existingTx) {
      throw new BadRequestException('شناسه پرداخت (Authority) یافت نشد.');
    }
    if (existingTx.user_id !== userId) {
      throw new BadRequestException('شناسه پرداخت با کاربر درخواست‌دهنده مغایرت دارد.');
    }

    const amountRials = Number(existingTx.amount_rials);
    const amountTomans = Math.round(amountRials / 10);

    if (existingTx.status === PaymentStatus.PAID) {
      return {
        isSuccessful: true,
        paymentId: existingTx.reference_id || existingTx.id,
        referenceIdRrn: existingTx.reference_id_rrn || 'RRN_ALREADY_VERIFIED',
        cardPanMasked: existingTx.card_pan_masked || '6037********1234',
        amountTomans,
        creditsIssued: 0,
      };
    }

    if (existingTx.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`این تراکنش در وضعیت ${existingTx.status} قرار دارد.`);
    }

    let verifyRes = await this.gateway.verifyPayment(authority, amountRials);
    if (!verifyRes.isSuccessful) {
      await this.markTransactionFailed(authority);
      return {
        isSuccessful: false,
        paymentId: 'VERIFICATION_FAILED',
        amountTomans,
        creditsIssued: 0,
        errorMessage: 'تأیید تراکنش با درگاه بانکی ناموفق بود.',
      };
    }

    return this.db.withTransaction(async (client) => {
      let tx: any = null;
      if (this.db.isInMemory) {
        tx = this.db.getTable('payment_transactions').find((r: any) => r.authority === authority);
      } else {
        const res = await client.query('SELECT * FROM payment_transactions WHERE authority = $1 FOR UPDATE', [authority]);
        tx = res.rows[0];
      }

      if (tx.status === PaymentStatus.PAID) {
        return {
          isSuccessful: true,
          paymentId: tx.reference_id || tx.id,
          referenceIdRrn: tx.reference_id_rrn || verifyRes.referenceIdRrn,
          cardPanMasked: tx.card_pan_masked || verifyRes.cardPanMasked,
          amountTomans,
          creditsIssued: 0,
        };
      }

      let referenceResultId = '';
      if (tx.payment_purpose === PaymentPurpose.CLASS_SINGLE_SESSION) {
        const booking = await this.classesService!.completeSingleSessionBooking(
          userId,
          tx.reference_id,
          tx.id,
          amountTomans,
        );
        referenceResultId = booking.id;
      } else if (tx.payment_purpose === PaymentPurpose.COACH_MONTHLY_PLAN) {
        const enrollment = await this.classesService!.completeCoachPlanEnrollment(
          userId,
          tx.reference_id,
          tx.id,
          amountTomans,
        );
        referenceResultId = enrollment.id;
      }

      const now = new Date().toISOString();
      const rrn = verifyRes.referenceIdRrn || 'RRN_' + Date.now().toString().slice(-8);
      const pan = verifyRes.cardPanMasked || '6037********1234';

      if (this.db.isInMemory) {
        tx.status = PaymentStatus.PAID;
        tx.paid_at = now;
        tx.reference_id_rrn = rrn;
        tx.card_pan_masked = pan;
        tx.updated_at = now;
      } else {
        await client.query(
          `UPDATE payment_transactions 
           SET status = $1, paid_at = NOW(), reference_id_rrn = $2, card_pan_masked = $3, updated_at = NOW() 
           WHERE authority = $4`,
          [PaymentStatus.PAID, rrn, pan, authority],
        );
      }

      this.logger.log(`[Class Payment Verified] Authority: ${authority} | TxId: ${tx.id} | ResultId: ${referenceResultId} | Amount: ${amountTomans.toLocaleString()} Tomans`);

      return {
        isSuccessful: true,
        paymentId: referenceResultId || tx.id,
        referenceIdRrn: rrn,
        cardPanMasked: pan,
        amountTomans,
        creditsIssued: 0,
      };
    });
  }

  /**
   * Retrieves the member's payment and invoice history.
   * Scoped strictly to the requesting member's userId.
   */
  async getUserPaymentHistory(userId: string): Promise<MemberPaymentHistoryItem[]> {
    if (this.db.isInMemory) {
      const txs = this.db.getTable('payment_transactions').filter((t: PaymentTransactionRow) => t.user_id === userId);
      const plans = this.db.getTable('plans');
      const sorted = [...txs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return sorted.map((t: PaymentTransactionRow) => {
        const plan = plans.find((p: any) => p.id === t.plan_id);
        const amountRials = Number(t.amount_rials);
        let planTitle = plan?.title_fa;
        if (!planTitle) {
          if (t.payment_purpose === PaymentPurpose.CLASS_SINGLE_SESSION) planTitle = 'رزرو تک‌جلسه کلاس ورزشی';
          else if (t.payment_purpose === PaymentPurpose.COACH_MONTHLY_PLAN) planTitle = 'بسته ماهانه کلاس مربی';
          else planTitle = 'پرداخت گراویتی';
        }
        return {
          id: t.id,
          planId: t.plan_id || t.reference_id || '',
          planTitle,
          amountTomans: Math.round(amountRials / 10),
          amountRials,
          status: t.status as PaymentStatus,
          provider: t.provider,
          referenceIdRrn: t.reference_id_rrn,
          cardPanMasked: t.card_pan_masked,
          createdAt: t.created_at,
          paidAt: t.paid_at,
        };
      });
    }

    const res = await this.db.query(
      `SELECT pt.*, p.title_fa as plan_title
       FROM payment_transactions pt
       LEFT JOIN plans p ON pt.plan_id = p.id
       WHERE pt.user_id = $1
       ORDER BY pt.created_at DESC`,
      [userId]
    );

    return res.rows.map((r: any) => {
      const amountRials = Number(r.amount_rials);
      let planTitle = r.plan_title;
      if (!planTitle) {
        if (r.payment_purpose === PaymentPurpose.CLASS_SINGLE_SESSION) planTitle = 'رزرو تک‌جلسه کلاس ورزشی';
        else if (r.payment_purpose === PaymentPurpose.COACH_MONTHLY_PLAN) planTitle = 'بسته ماهانه کلاس مربی';
        else planTitle = 'پرداخت گراویتی';
      }
      return {
        id: r.id,
        planId: r.plan_id || r.reference_id || '',
        planTitle,
        amountTomans: Math.round(amountRials / 10),
        amountRials,
        status: r.status as PaymentStatus,
        provider: r.provider,
        referenceIdRrn: r.reference_id_rrn,
        cardPanMasked: r.card_pan_masked,
        createdAt: r.created_at,
        paidAt: r.paid_at,
      };
    });
  }

  /**
   * Sweeps stale unverified pending transactions older than maxAgeMinutes
   */
  async cleanupStaleTransactions(maxAgeMinutes: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
    let cleanedCount = 0;

    if (this.db.isInMemory) {
      const table = this.db.getTable('payment_transactions');
      table.forEach((t: PaymentTransactionRow) => {
        if (t.status === PaymentStatus.PENDING && t.created_at < cutoffDate) {
          t.status = PaymentStatus.EXPIRED;
          t.updated_at = new Date().toISOString();
          cleanedCount++;
        }
      });
      return cleanedCount;
    }

    const res = await this.db.query(
      `UPDATE payment_transactions 
       SET status = $1, updated_at = NOW() 
       WHERE status = $2 AND created_at < $3`,
      [PaymentStatus.EXPIRED, PaymentStatus.PENDING, cutoffDate]
    );
    return res.rowCount || 0;
  }

  /**
   * Administratively refunds a verified payment, atomically revoking the associated
   * subscription and clawing back issued credits from the member's wallet.
   * Enforces financial invariants:
   * 1. Transaction must exist and be in PAID status.
   * 2. Cannot double-refund (terminal rejection).
   * 3. Member wallet must have sufficient credits to claw back (cannot refund if credits were consumed).
   * 4. Associated subscription is marked CANCELLED.
   * 5. Credit ledger records REFUND_DEBIT.
   */
  async refundPayment(
    identifier: string,
    adminUserId: string,
    reason: string,
  ): Promise<{
    success: boolean;
    paymentId: string;
    subscriptionId: string;
    amountTomans: number;
    creditsClawedBack: number;
  }> {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('ثبت دلیل استرداد وجه الزامی است.');
    }

    return this.db.withTransaction(async (client) => {
      let tx: PaymentTransactionRow | null = null;
      if (this.db.isInMemory) {
        const table = this.db.getTable('payment_transactions');
        tx = table.find((r: PaymentTransactionRow) => r.id === identifier || r.authority === identifier) || null;
      } else {
        const res = await client.query(
          `SELECT * FROM payment_transactions WHERE id = $1 OR authority = $1 FOR UPDATE`,
          [identifier],
        );
        tx = res.rows[0] || null;
      }

      if (!tx) {
        throw new BadRequestException('تراکنش پرداخت مورد نظر یافت نشد.');
      }

      if (tx.status === PaymentStatus.REFUNDED) {
        throw new BadRequestException('این تراکنش قبلاً استرداد شده است و امکان استرداد مجدد وجود ندارد.');
      }

      if (tx.status !== PaymentStatus.PAID) {
        throw new BadRequestException(`فقط تراکنش‌های موفق (PAID) قابل استرداد می‌باشند. وضعیت فعلی: ${tx.status}`);
      }

      if (!tx.subscription_id) {
        throw new BadRequestException('اشتراک مرتبط با این پرداخت یافت نشد.');
      }

      const subscriptionId = tx.subscription_id;
      let sub: any = null;
      if (this.db.isInMemory) {
        sub = this.db.getTable('subscriptions').find(s => s.id === subscriptionId);
      } else {
        const subRes = await client.query('SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE', [subscriptionId]);
        sub = subRes.rows[0];
      }

      if (!sub) {
        throw new BadRequestException('اشتراک مرتبط با این پرداخت یافت نشد.');
      }

      if (sub.status === SubscriptionStatus.EXPIRED || new Date(sub.expires_at) <= new Date()) {
        throw new BadRequestException('امکان استرداد اشتراک منقضی‌شده وجود ندارد؛ دوره زمانی ارائه خدمات به پایان رسیده است.');
      }

      if (sub.status === SubscriptionStatus.CANCELLED) {
        throw new BadRequestException('این اشتراک قبلاً لغو شده است و امکان استرداد مجدد آن وجود ندارد.');
      }

      if (!tx.plan_id) {
        throw new BadRequestException('این تراکنش مربوط به پلن‌های عضویت نمی‌باشد و امکان استرداد از این طریق وجود ندارد.');
      }
      const plan = await this.plansService.getById(tx.plan_id);
      const creditsToClawback = plan.creditsAwarded;

      // Check member balance: User must possess at least creditsToClawback to avoid negative balance
      const currentBalance = await this.ledgerService.getBalance(tx.user_id);
      if (currentBalance < creditsToClawback) {
        throw new BadRequestException(
          `امکان استرداد کامل وجود ندارد؛ بخشی از اعتبارات این اشتراک مصرف شده است (موجودی فعلی: ${currentBalance}، اعتبار مورد نیاز برای کسر: ${creditsToClawback}).`
        );
      }

      // 1. Claw back credits from user wallet
      await this.ledgerService.debitCredits(
        tx.user_id,
        creditsToClawback,
        CreditLedgerEntryType.REFUND_DEBIT,
        tx.id,
        `استرداد وجه اشتراک (${plan.titleFa}): ${reason.trim()}`
      );

      // 2. Mark subscription as CANCELLED
      const nowIso = new Date().toISOString();
      if (this.db.isInMemory) {
        sub.status = SubscriptionStatus.CANCELLED;
        sub.updated_at = nowIso;
      } else {
        await client.query(
          `UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2`,
          [SubscriptionStatus.CANCELLED, subscriptionId]
        );
      }

      // 3. Mark payment transaction as REFUNDED
      if (this.db.isInMemory) {
        tx.status = PaymentStatus.REFUNDED;
        tx.updated_at = nowIso;
        (tx as any).refunded_at = nowIso;
        (tx as any).refund_reason = reason.trim();
        (tx as any).refund_admin_id = adminUserId;
      } else {
        await client.query(
          `UPDATE payment_transactions 
           SET status = $1, updated_at = NOW(), refunded_at = NOW(), refund_reason = $3, refund_admin_id = $4 
           WHERE id = $2`,
          [PaymentStatus.REFUNDED, tx.id, reason.trim(), adminUserId]
        );
      }

      const amountTomans = Math.round(Number(tx.amount_rials) / 10);
      this.logger.log(`[Payment Refunded] TxId: ${tx.id} | Amount: ${amountTomans.toLocaleString()} Tomans | Credits Clawed Back: ${creditsToClawback} | Admin: ${adminUserId}`);

      return {
        success: true,
        paymentId: tx.id,
        subscriptionId,
        amountTomans,
        creditsClawedBack: creditsToClawback,
      };
    });
  }

  /**
   * Cancels a PENDING payment checkout (e.g. user aborts at checkout screen).
   * Enforces user ownership check.
   */
  async cancelCheckout(
    authority: string,
    userId: string,
  ): Promise<{ success: boolean; authority: string; status: PaymentStatus }> {
    return this.db.withTransaction(async (client) => {
      let tx: PaymentTransactionRow | null = null;
      if (this.db.isInMemory) {
        const table = this.db.getTable('payment_transactions');
        tx = table.find((r: PaymentTransactionRow) => r.authority === authority) || null;
      } else {
        const res = await client.query(
          `SELECT * FROM payment_transactions WHERE authority = $1 FOR UPDATE`,
          [authority],
        );
        tx = res.rows[0] || null;
      }

      if (!tx) {
        throw new BadRequestException('شناسه پرداخت مورد نظر یافت نشد.');
      }

      // Ownership check (IDOR protection)
      if (tx.user_id !== userId) {
        throw new BadRequestException('امکان لغو تراکنش کاربر دیگر وجود ندارد.');
      }

      // State machine guard
      if (tx.status === PaymentStatus.PAID) {
        throw new BadRequestException('تراکنش پرداخت‌شده قابل لغو نیست (نیاز به استرداد دارد).');
      }

      if (tx.status === PaymentStatus.CANCELLED) {
        return { success: true, authority, status: PaymentStatus.CANCELLED };
      }

      if (this.db.isInMemory) {
        tx.status = PaymentStatus.CANCELLED;
        tx.updated_at = new Date().toISOString();
      } else {
        await client.query(
          `UPDATE payment_transactions SET status = $1, updated_at = NOW() WHERE authority = $2`,
          [PaymentStatus.CANCELLED, authority],
        );
      }

      return { success: true, authority, status: PaymentStatus.CANCELLED };
    });
  }
}

