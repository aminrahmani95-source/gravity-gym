# Notification & Product Messaging Engine Implementation

## Overview
Phase 5 introduced a centralized, decoupled, and fault-tolerant Notification engine for the Gravity fitness platform. It standardizes Iranian SMS pattern dispatch (compatible with FarazSMS / KavehNegar), enforces user privacy through automated telephone number masking, and guarantees that downstream SMS gateway failures never disrupt user authentication, payment processing, or physical gym check-ins.

---

## 1. Architectural Components

### A. Notification Interfaces & Patterns (`apps/api/src/modules/notifications/notification.interface.ts`)
- **Patterns**:
  - `gravity-otp`: Transactional 5-digit verification code.
  - `gravity-sub-active`: Subscription activated (plan title, credits awarded, Persian expiry date).
  - `gravity-payment-fail`: Payment cancellation or PSP failure notice.
  - `gravity-expiring`: Subscription expiration warning (days remaining).
  - `gravity-checkin-success`: Check-in approval confirmation (gym name, credits debited, remaining balance).
  - `gravity-checkin-reject`: Check-in rejection notice (reason).
- **Privacy Masking**: `maskPhoneNumber(phone: string)` masks sensitive recipient numbers in all application logs (e.g., `09121234567` -> `0912***4567`).

### B. Mock SMS Provider (`apps/api/src/modules/notifications/mock-sms.provider.ts`)
- Implements `ISmsProvider` with pattern tracking, log capture, and controllable failure simulations (`setSimulateFailure`, `setSimulateThrow`) for automated fault-tolerance testing.

### C. Notifications Service (`apps/api/src/modules/notifications/notifications.service.ts`)
- Provides isolated, typed dispatch methods:
  - `sendOtp(phone, code)`
  - `notifySubscriptionActivated(phone, planTitle, credits, expiresAt)`
  - `notifyPaymentFailed(phone, reason)`
  - `notifyExpiringSoon(phone, planTitle, daysRemaining)`
  - `notifyCheckinApproved(phone, gymName, creditsDeducted, remainingCredits)`
  - `notifyCheckinRejected(phone, gymName, reason)`
- **Downstream Isolation Guarantee**: All methods wrap provider calls in isolated `try/catch` blocks. Failures are logged at `WARN` or `ERROR` level with masked telephone numbers. An exception from the SMS gateway will **NEVER** propagate up to the caller.

---

## 2. System Integration Points

1. **`AuthService.sendOtp`**:
   - Dispatches transactional OTP via `notificationsService.sendOtp`.
   - Preserves 120s cooldown and failed verification attempt limits.
2. **`PaymentsService.verifyPayment`**:
   - On successful transaction commit: dispatches `notifySubscriptionActivated` with Persian date format.
   - On gateway verification failure or user cancellation (`Status = NOK`): dispatches `notifyPaymentFailed`.
3. **`CheckinService.verifyAndConsumeCheckin`**:
   - On approved check-in: dispatches `notifyCheckinApproved` with gym name, deducted credits, and updated balance.
   - On verification failure: dispatches `notifyCheckinRejected` without affecting error responses to reception.
4. **`PlansService.notifyExpiringSubscriptions`**:
   - Traverses active subscriptions expiring within the warning threshold (default: 3 days) and dispatches `notifyExpiringSoon`.

---

## 3. Verification & Fault Tolerance

Suite: `apps/api/test/notifications.spec.ts` (8 tests passing):
- Iranian phone number privacy masking verified.
- OTP dispatch recorded with pattern code.
- Payment activation and cancellation SMS notifications verified.
- Check-in approval SMS verified with credit balances.
- Expiring subscription sweep verified.
- **Fault-Tolerance Verification**:
  - Simulated gateway crash (504 Gateway Timeout / unhandled exception) during payment verification did **NOT** roll back or throw; payment succeeded with exact credit grant.
  - Simulated gateway crash during check-in verification did **NOT** interrupt check-in; verification succeeded with `APPROVED` status.
