# Payment Lifecycle Hardening & Idempotency Audit

## Overview
Phase 4 hardened the payment lifecycle across initiation, callback verification, idempotent replay, failed gateway responses, and atomic database execution. The goal was to eliminate phantom transactions, prevent double-crediting, gracefully handle gateway cancellation/rejection, and ensure strict database consistency under failure.

---

## Hardening Points & Architecture

### 1. Uninitiated & Forged Authority Rejection
- **Vulnerability**: Previously, if a forged or unknown `authority` was supplied to `/payments/verify`, verification could attempt to query the gateway mock or behave unpredictably.
- **Enforcement**: Step 2 of `verifyPayment` queries `payment_transactions` for the given authority before invoking any gateway API. If not found, a `400 Bad Request` with message `'Payment transaction not found for authority'` is immediately raised.

### 2. Idempotent Verification & Replay Protection
- **Vulnerability**: Network timeouts or duplicate callback webhook hits could result in duplicate credit allocation.
- **Enforcement**:
  - If a transaction is already marked `SUCCESS`, `verifyPayment` returns the existing transaction immediately without re-calling the PSP or issuing duplicate credit ledger records.
  - If a transaction is already marked `FAILED`, `verifyPayment` rejects further verification with `400 Bad Request`.

### 3. Gateway Rejection & User Cancellation (Status NOK)
- **Behavior**: When Zarinpal or mock callback returns `Status = 'NOK'`, the transaction is explicitly transitioned to `FAILED` with metadata `{ reason: 'user_or_gateway_cancelled' }`.
- **Response**: Throws `400 Bad Request ('Payment cancelled or rejected by user/gateway')`. No subscription is activated and zero credits are issued.

### 4. Gateway Verification Rejection (e.g. Code -10 / Invalid Amount)
- **Behavior**: If the gateway verification returns a code other than `100` (success), the transaction is updated to `FAILED` with the gateway error code and message.
- **Rollback**: No credit ledger entry or subscription record is created.

### 5. Atomic Commit & Rollback
- **Guarantees**:
  - The payment transaction status update, subscription activation/creation, and credit ledger issuance (`CreditLedgerEntryType.SUBSCRIPTION_GRANT`) execute in an atomic transaction or coordinated unit of work.
  - If any step fails during the credit grant or subscription creation, ledger modifications are not committed, maintaining strict financial ledger integrity.

---

## Verification & Automated Test Coverage

Suite: `apps/api/test/payment-hardening.spec.ts`
- Case 1: Rejects uninitiated/forged authority (`UNKNOWN-AUTH-XXX`) with 400 Bad Request.
- Case 2: Handles gateway verification failure (PSP rejects with code -10) -> marks transaction `FAILED`.
- Case 3: Handles callback `Status=NOK` -> marks transaction `FAILED` and rejects check-in/credits.
- Case 4: Replay protection -> Repeated verification on `FAILED` transaction throws `BadRequestException`.
- Case 5: Atomic rollback -> Simulated DB ledger failure rolls back transaction cleanly without orphaned credits.

All 5 test cases passing (100% green).
