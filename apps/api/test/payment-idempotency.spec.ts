import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../src/common/database/database.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PlansService } from '../src/modules/plans/plans.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { IPaymentGateway } from '../src/modules/payments/payment-gateway.interface';
import { PaymentStatus } from '@gym-app/shared-types';
import * as crypto from 'crypto';

describe('Payment Idempotency & Persistent Ledger Tests', () => {
  let db: DatabaseService;
  let ledger: LedgerService;
  let plans: PlansService;
  let payments: PaymentsService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    ledger = new LedgerService(db);
    plans = new PlansService(db);
    payments = new PaymentsService(db, ledger, plans);
  });

  it('1. should complete first successful payment with atomic subscription and credit issuance', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');
    expect(checkout.gatewayAuthority).toBeDefined();

    const balanceBefore = await ledger.getBalance('user-member-1');

    const verifyResult = await payments.verifyPayment(
      'user-member-1',
      'plan-2',
      checkout.gatewayAuthority,
      'OK',
    );

    expect(verifyResult.isSuccessful).toBe(true);
    expect(verifyResult.creditsIssued).toBe(30);

    const balanceAfter = await ledger.getBalance('user-member-1');
    expect(balanceAfter).toBe(balanceBefore + 30);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx).toBeDefined();
    expect(tx?.status).toBe(PaymentStatus.PAID);
    expect(tx?.paid_at).toBeDefined();
  });

  it('2. should idempotently handle duplicate verification without double-issuing credits or creating duplicate subscriptions', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');
    const firstVerify = await payments.verifyPayment(
      'user-member-1',
      'plan-2',
      checkout.gatewayAuthority,
      'OK',
    );
    expect(firstVerify.isSuccessful).toBe(true);

    const balanceAfterFirst = await ledger.getBalance('user-member-1');
    const subCountBefore = db.getTable('subscriptions').filter(s => s.user_id === 'user-member-1').length;

    // Duplicate verification call
    const secondVerify = await payments.verifyPayment(
      'user-member-1',
      'plan-2',
      checkout.gatewayAuthority,
      'OK',
    );
    expect(secondVerify.isSuccessful).toBe(true);
    expect(secondVerify.paymentId).toBe(firstVerify.paymentId);

    const balanceAfterSecond = await ledger.getBalance('user-member-1');
    expect(balanceAfterSecond).toBe(balanceAfterFirst); // Zero duplicate credits!

    const subCountAfter = db.getTable('subscriptions').filter(s => s.user_id === 'user-member-1').length;
    expect(subCountAfter).toBe(subCountBefore); // No duplicate subscriptions!
  });

  it('3. should handle duplicate callback webhooks safely and idempotently', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');
    await payments.verifyPayment('user-member-1', 'plan-2', checkout.gatewayAuthority, 'OK');

    const initialBalance = await ledger.getBalance('user-member-1');

    // Simulate 3 subsequent PSP callback retries
    for (let i = 0; i < 3; i++) {
      const callbackResult = await payments.verifyPayment(
        'user-member-1',
        'plan-2',
        checkout.gatewayAuthority,
        'OK',
      );
      expect(callbackResult.isSuccessful).toBe(true);
    }

    const finalBalance = await ledger.getBalance('user-member-1');
    expect(finalBalance).toBe(initialBalance);
  });

  it('4. should serialize concurrent duplicate verifications with only one financial mutation', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');
    const balanceBefore = await ledger.getBalance('user-member-1');
    const subCountBefore = db.getTable('subscriptions').filter(s => s.user_id === 'user-member-1').length;

    // Launch two concurrent verify calls
    const [res1, res2] = await Promise.all([
      payments.verifyPayment('user-member-1', 'plan-2', checkout.gatewayAuthority, 'OK'),
      payments.verifyPayment('user-member-1', 'plan-2', checkout.gatewayAuthority, 'OK'),
    ]);

    expect(res1.isSuccessful).toBe(true);
    expect(res2.isSuccessful).toBe(true);

    const balanceAfter = await ledger.getBalance('user-member-1');
    expect(balanceAfter).toBe(balanceBefore + 30); // Exactly ONE credit award!

    const subCountAfter = db.getTable('subscriptions').filter(s => s.user_id === 'user-member-1').length;
    expect(subCountAfter).toBe(subCountBefore + 1); // Exactly ONE subscription created!
  });

  it('5. should reject duplicate authority with conflicting amount without overwriting', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2'); // 1,000,000 T

    // Attempt to verify with plan-1 (550,000 T)
    await expect(
      payments.verifyPayment('user-member-1', 'plan-1', checkout.gatewayAuthority, 'OK'),
    ).rejects.toThrow(BadRequestException);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.plan_id).toBe('plan-2');
    expect(tx?.status).toBe(PaymentStatus.PENDING);
  });

  it('6. should reject duplicate authority submitted by a conflicting user', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');

    // Attempt to verify using user-member-2
    await expect(
      payments.verifyPayment('user-member-2', 'plan-2', checkout.gatewayAuthority, 'OK'),
    ).rejects.toThrow(BadRequestException);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.user_id).toBe('user-member-1');
  });

  it('7. should reject duplicate authority submitted for a conflicting plan', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');

    await expect(
      payments.verifyPayment('user-member-1', 'plan-1', checkout.gatewayAuthority, 'OK'),
    ).rejects.toThrow(BadRequestException);

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.plan_id).toBe('plan-2');
  });

  it('8. should reject re-verification on FAILED authority and succeed on fresh checkout retry', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');

    // Initial attempt failed (user cancelled or gateway NOK)
    const failRes = await payments.verifyPayment(
      'user-member-1',
      'plan-2',
      checkout.gatewayAuthority,
      'NOK',
    );
    expect(failRes.isSuccessful).toBe(false);

    const txFailed = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(txFailed?.status).toBe(PaymentStatus.FAILED);

    // Re-verification of failed authority must be rejected
    await expect(
      payments.verifyPayment('user-member-1', 'plan-2', checkout.gatewayAuthority, 'OK')
    ).rejects.toThrow('این تراکنش قبلاً لغو شده یا با خطا مواجه گردیده است');

    const balanceBeforeRetry = await ledger.getBalance('user-member-1');

    // Successful user retry via fresh checkout
    const retryCheckout = await payments.initiateCheckout('user-member-1', 'plan-2');
    const successRes = await payments.verifyPayment(
      'user-member-1',
      'plan-2',
      retryCheckout.gatewayAuthority,
      'OK',
    );
    expect(successRes.isSuccessful).toBe(true);
    expect(successRes.creditsIssued).toBe(30);

    const balanceAfterRetry = await ledger.getBalance('user-member-1');
    expect(balanceAfterRetry).toBe(balanceBeforeRetry + 30);

    const txPaid = await payments.findTransactionByAuthority(retryCheckout.gatewayAuthority);
    expect(txPaid?.status).toBe(PaymentStatus.PAID);
  });

  it('9. should completely roll back payment state when subscription or credit mutation fails', async () => {
    const checkout = await payments.initiateCheckout('user-member-1', 'plan-2');
    const balanceBefore = await ledger.getBalance('user-member-1');
    const subsBefore = db.getTable('subscriptions').length;

    // Simulate failure in ledgerService
    const originalIssueCredits = ledger.issueCredits.bind(ledger);
    ledger.issueCredits = async () => {
      throw new Error('SIMULATED_LEDGER_FAILURE');
    };

    await expect(
      payments.verifyPayment('user-member-1', 'plan-2', checkout.gatewayAuthority, 'OK'),
    ).rejects.toThrow('SIMULATED_LEDGER_FAILURE');

    // Restore method
    ledger.issueCredits = originalIssueCredits;

    // Assert complete rollback
    const balanceAfter = await ledger.getBalance('user-member-1');
    expect(balanceAfter).toBe(balanceBefore); // No phantom credits!

    const subsAfter = db.getTable('subscriptions').length;
    expect(subsAfter).toBe(subsBefore); // No phantom subscription!

    const tx = await payments.findTransactionByAuthority(checkout.gatewayAuthority);
    expect(tx?.status).not.toBe(PaymentStatus.PAID); // Not falsely marked PAID!
  });

  it('10. should enforce database UNIQUE(authority) constraint', async () => {
    const duplicateAuthority = 'MOCK_SHAPARAK_UNIQUE_TEST_123';

    // First insert succeeds
    await db.query(
      `INSERT INTO payment_transactions (id, authority, user_id, plan_id, amount_rials, status, provider, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [crypto.randomUUID(), duplicateAuthority, 'user-member-1', 'plan-2', 10000000, 'PENDING', 'SHAPARAK_EMULATOR'],
    );

    // Second insert with identical authority must throw unique constraint violation
    await expect(
      db.query(
        `INSERT INTO payment_transactions (id, authority, user_id, plan_id, amount_rials, status, provider, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [crypto.randomUUID(), duplicateAuthority, 'user-member-2', 'plan-1', 5500000, 'PENDING', 'SHAPARAK_EMULATOR'],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });
});
