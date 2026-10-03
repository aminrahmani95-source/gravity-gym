import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../src/common/database/database.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { IPaymentGateway } from '../src/modules/payments/payment-gateway.interface';
import { PaymentStatus, SubscriptionStatus } from '@gym-app/shared-types';

class FailingMockGateway implements IPaymentGateway {
  async initiatePayment(amountRials: number, callbackUrl: string, description: string) {
    return {
      authority: `AUTH-FAIL-${Date.now()}`,
      redirectUrl: 'https://sandbox.shaparak.ir/pay',
    };
  }
  async verifyPayment(authority: string, expectedAmountRials: number) {
    return {
      isSuccessful: false, // Explicitly simulates PSP verification rejection
      referenceIdRrn: '',
      cardPanMasked: '',
    };
  }
}

describe('Phase 4: Payment Lifecycle Hardening', () => {
  let db: DatabaseService;
  let ledger: LedgerService;
  let plans: PlansService;
  let payments: PaymentsService;

  const testUserId = 'user-member-1';

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    ledger = new LedgerService(db);
    plans = new PlansService(db);
    payments = new PaymentsService(db, ledger, plans);
  });

  it('1. rejects verification of forged/uninitiated authority with 400 Bad Request', async () => {
    const uninitiatedAuthority = 'FORGED-AUTH-99999999';

    await expect(
      payments.verifyPayment(testUserId, 'plan-2', uninitiatedAuthority, 'OK'),
    ).rejects.toThrow(/شناسه پرداخت \(Authority\) در سیستم یافت نشد/);
  });

  it('2. handles PSP gateway verification rejection safely and marks transaction as FAILED', async () => {
    payments.setGateway(new FailingMockGateway());

    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    const balanceBefore = await ledger.getBalance(testUserId);
    const subsBefore = db.getTable('subscriptions').filter(s => s.user_id === testUserId).length;

    const result = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');

    expect(result.isSuccessful).toBe(false);
    expect(result.errorMessage).toBe('تأیید تراکنش با درگاه شاپرک ناموفق بود.');

    // Invariant assertions: Zero credits issued, Zero subscriptions created
    const balanceAfter = await ledger.getBalance(testUserId);
    expect(balanceAfter).toBe(balanceBefore);

    const subsAfter = db.getTable('subscriptions').filter(s => s.user_id === testUserId).length;
    expect(subsAfter).toBe(subsBefore);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.FAILED);
  });

  it('3. rejects callback when status is not OK and persists FAILED state', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    const res = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'CANCELLED');

    expect(res.isSuccessful).toBe(false);
    expect(res.errorMessage).toContain('لغو شد');

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.FAILED);
  });

  it('4. ensures financial consistency during repeated verification calls on failed transaction', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    // First verification failed
    await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'NOK');

    // Repeated call with NOK
    const repeated = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'NOK');
    expect(repeated.isSuccessful).toBe(false);

    const balance = await ledger.getBalance(testUserId);
    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.FAILED);
    expect(balance).toBe(await ledger.getBalance(testUserId));
  });

  it('5. guarantees atomic rollback on database failure during payment commitment', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    const balanceBefore = await ledger.getBalance(testUserId);
    const subsBefore = db.getTable('subscriptions').length;

    // Simulate failure inside transaction
    const originalWithTx = db.withTransaction.bind(db);
    db.withTransaction = async () => {
      throw new Error('CRITICAL_DATABASE_NETWORK_PARTITION');
    };

    await expect(
      payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK'),
    ).rejects.toThrow('CRITICAL_DATABASE_NETWORK_PARTITION');

    // Restore
    db.withTransaction = originalWithTx;

    // Assert zero mutations leaked
    const balanceAfter = await ledger.getBalance(testUserId);
    expect(balanceAfter).toBe(balanceBefore);

    const subsAfter = db.getTable('subscriptions').length;
    expect(subsAfter).toBe(subsBefore);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).not.toBe(PaymentStatus.PAID);
  });

  it('6. rejects verification of timed-out pending transaction (> 20 mins) and marks it EXPIRED', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');

    // Artificially age the transaction by 25 minutes
    const table = db.getTable('payment_transactions');
    const tx = table.find(r => r.authority === checkout.gatewayAuthority);
    tx.created_at = new Date(Date.now() - 25 * 60 * 1000).toISOString();

    await expect(
      payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK')
    ).rejects.toThrow('مهلت پرداخت در درگاه بانکی به پایان رسیده است');

    const updatedTx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(updatedTx?.status).toBe(PaymentStatus.EXPIRED);
  });

  it('7. rejects verification on an already FAILED transaction', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    const table = db.getTable('payment_transactions');
    const tx = table.find(r => r.authority === checkout.gatewayAuthority);
    tx.status = PaymentStatus.FAILED;

    await expect(
      payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK')
    ).rejects.toThrow('این تراکنش قبلاً لغو شده یا با خطا مواجه گردیده است');
  });

  it('8. sweeps stale pending transactions using cleanupStaleTransactions', async () => {
    // Create 1 fresh pending tx and 2 old pending txs (> 40 mins)
    const fresh = await payments.initiateCheckout(testUserId, 'plan-1');
    const old1 = await payments.initiateCheckout(testUserId, 'plan-2');
    const old2 = await payments.initiateCheckout(testUserId, 'plan-3');

    const table = db.getTable('payment_transactions');
    const tx1 = table.find(r => r.authority === old1.gatewayAuthority);
    const tx2 = table.find(r => r.authority === old2.gatewayAuthority);
    tx1.created_at = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    tx2.created_at = new Date(Date.now() - 50 * 60 * 1000).toISOString();

    const cleaned = await payments.cleanupStaleTransactions(30);
    expect(cleaned).toBe(2);

    expect((await payments.findTransactionByAuthority(old1.gatewayAuthority))?.status).toBe(PaymentStatus.EXPIRED);
    expect((await payments.findTransactionByAuthority(old2.gatewayAuthority))?.status).toBe(PaymentStatus.EXPIRED);
    expect((await payments.findTransactionByAuthority(fresh.gatewayAuthority))?.status).toBe(PaymentStatus.PENDING);
  });

  it('9. allows user to cancel their own PENDING checkout session', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    const cancelRes = await payments.cancelCheckout(checkout.gatewayAuthority, testUserId);

    expect(cancelRes.success).toBe(true);
    expect(cancelRes.status).toBe(PaymentStatus.CANCELLED);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.CANCELLED);
  });

  it('10. rejects cancellation of another user checkout session (IDOR protection)', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    const attackerUserId = 'user-member-2';

    await expect(
      payments.cancelCheckout(checkout.gatewayAuthority, attackerUserId)
    ).rejects.toThrow('امکان لغو تراکنش کاربر دیگر وجود ندارد');

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.PENDING);
  });

  it('11. rejects cancellation of an already PAID transaction', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');

    await expect(
      payments.cancelCheckout(checkout.gatewayAuthority, testUserId)
    ).rejects.toThrow('تراکنش پرداخت‌شده قابل لغو نیست');
  });

  it('12. executes administrative refund atomically: revokes subscription, claws back credits and transitions to REFUNDED', async () => {
    const balanceBefore = await ledger.getBalance(testUserId);
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2'); // 30 credits
    const verifyRes = await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');

    const balanceAfterPay = await ledger.getBalance(testUserId);
    expect(balanceAfterPay).toBe(balanceBefore + 30);

    // Administrative refund
    const refundRes = await payments.refundPayment(
      checkout.gatewayAuthority,
      'admin-super',
      'انصراف کاربر از خرید به علت عدم دسترسی به باشگاه مورد نظر'
    );

    expect(refundRes.success).toBe(true);
    expect(refundRes.creditsClawedBack).toBe(30);

    // Assert credits revoked
    const balanceAfterRefund = await ledger.getBalance(testUserId);
    expect(balanceAfterRefund).toBe(balanceBefore);

    // Assert subscription CANCELLED
    const sub = db.getTable('subscriptions').find(s => s.id === refundRes.subscriptionId);
    expect(sub?.status).toBe('CANCELLED');

    // Assert payment REFUNDED
    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.REFUNDED);
  });

  it('13. rejects double-refund on an already REFUNDED transaction', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2');
    await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');

    await payments.refundPayment(checkout.gatewayAuthority, 'admin-super', 'استرداد اول');

    // Second refund attempt must fail
    await expect(
      payments.refundPayment(checkout.gatewayAuthority, 'admin-super', 'استرداد مجدد غیرمجاز')
    ).rejects.toThrow('این تراکنش قبلاً استرداد شده است');
  });

  it('14. rejects refund when user has already consumed credits to prevent negative wallet balance', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-2'); // 30 credits
    await payments.verifyPayment(testUserId, 'plan-2', checkout.gatewayAuthority, 'OK');

    // User spends 15 credits (e.g. check-ins)
    await ledger.debitCredits(testUserId, 15, 'CHECKIN_DEBIT' as any, 'checkin-test', 'استفاده در باشگاه');

    // Attempting to refund full 30 credits when only 15 remain must be rejected
    await expect(
      payments.refundPayment(checkout.gatewayAuthority, 'admin-super', 'تلاش برای استرداد بعد از مصرف')
    ).rejects.toThrow('بخشی از اعتبارات این اشتراک مصرف شده است');
  });

  it('15. rejects verification on an already REFUNDED or CANCELLED transaction', async () => {
    // Test REFUNDED verification rejection
    const checkoutRefund = await payments.initiateCheckout(testUserId, 'plan-1');
    await payments.verifyPayment(testUserId, 'plan-1', checkoutRefund.gatewayAuthority, 'OK');
    await payments.refundPayment(checkoutRefund.gatewayAuthority, 'admin-super', 'استرداد جهت تست');

    await expect(
      payments.verifyPayment(testUserId, 'plan-1', checkoutRefund.gatewayAuthority, 'OK')
    ).rejects.toThrow('قبلاً استرداد شده است');

    // Test CANCELLED verification rejection
    const checkoutCancel = await payments.initiateCheckout(testUserId, 'plan-1');
    await payments.cancelCheckout(checkoutCancel.gatewayAuthority, testUserId);

    await expect(
      payments.verifyPayment(testUserId, 'plan-1', checkoutCancel.gatewayAuthority, 'OK')
    ).rejects.toThrow('لغو گردیده است');
  });

  it('16. rejects refund when subscription has already expired', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-1');
    const verifyRes = await payments.verifyPayment(testUserId, 'plan-1', checkout.gatewayAuthority, 'OK');

    // Simulate expiration of subscription
    const sub = db.getTable('subscriptions').find(s => s.id === verifyRes.paymentId);
    if (sub) {
      sub.status = SubscriptionStatus.EXPIRED;
      sub.expires_at = new Date(Date.now() - 1000).toISOString();
    }

    await expect(
      payments.refundPayment(checkout.gatewayAuthority, 'admin-super', 'استرداد اشتراک منقضی')
    ).rejects.toThrow('امکان استرداد اشتراک منقضی‌شده وجود ندارد');
  });

  it('17. rejects refund when subscription was already cancelled', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-1');
    const verifyRes = await payments.verifyPayment(testUserId, 'plan-1', checkout.gatewayAuthority, 'OK');

    // Manually mark subscription cancelled
    const sub = db.getTable('subscriptions').find(s => s.id === verifyRes.paymentId);
    if (sub) {
      sub.status = SubscriptionStatus.CANCELLED;
    }

    await expect(
      payments.refundPayment(checkout.gatewayAuthority, 'admin-super', 'استرداد اشتراک لغو شده')
    ).rejects.toThrow('این اشتراک قبلاً لغو شده است');
  });

  it('18. handles payment gateway network failure gracefully during checkout initiation', async () => {
    payments.setGateway({
      initiatePayment: async () => {
        throw new Error('ECONNREFUSED: Connection refused by Shaparak gateway');
      },
      verifyPayment: async () => ({ isSuccessful: true }),
    });

    await expect(
      payments.initiateCheckout(testUserId, 'plan-1')
    ).rejects.toThrow('امکان برقراری ارتباط با درگاه پرداخت بانکی وجود ندارد');
  });

  it('19. handles payment gateway timeout gracefully during verification without corrupting transaction state', async () => {
    // Normal initiate
    const checkout = await payments.initiateCheckout(testUserId, 'plan-1');

    // Simulate gateway network socket timeout during verify
    payments.setGateway({
      initiatePayment: async () => ({ authority: 'MOCK', redirectUrl: 'http://mock' }),
      verifyPayment: async () => {
        throw new Error('ETIMEDOUT: Gateway verification response timed out after 10000ms');
      },
    });

    await expect(
      payments.verifyPayment(testUserId, 'plan-1', checkout.gatewayAuthority, 'OK')
    ).rejects.toThrow('ارتباط با درگاه پرداخت بانکی برقرار نشد یا با تاخیر مواجه گردید');

    // Check that transaction was NOT marked FAILED so it can be retried/inquired
    const tx = db.getTable('payment_transactions').find(t => t.authority === checkout.gatewayAuthority);
    expect(tx?.status).toBe(PaymentStatus.PENDING);
  });

  it('20. transitions stale pending payment to EXPIRED and rejects subsequent verification', async () => {
    const checkout = await payments.initiateCheckout(testUserId, 'plan-1');

    // Simulate age > 20 minutes
    const tx = db.getTable('payment_transactions').find(t => t.authority === checkout.gatewayAuthority);
    if (tx) {
      tx.created_at = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    }

    // Verification attempt after 20 minutes triggers EXPIRED transition
    await expect(
      payments.verifyPayment(testUserId, 'plan-1', checkout.gatewayAuthority, 'OK')
    ).rejects.toThrow('مهلت پرداخت در درگاه بانکی به پایان رسیده است');

    expect(tx?.status).toBe(PaymentStatus.EXPIRED);

    // Subsequent re-verification attempt on EXPIRED status is rejected
    await expect(
      payments.verifyPayment(testUserId, 'plan-1', checkout.gatewayAuthority, 'OK')
    ).rejects.toThrow('مهلت پرداخت در درگاه بانکی به پایان رسیده و این تراکنش منقضی گردیده است');
  });
});
