# Reception & Staff Operations Audit

## Executive Summary
This audit inspects the gym front-desk reception workflow (`/reception`) and its backend authorization pipeline (`/checkin/reception-verify`). The reception desk is the operational frontline of the Gravity platform, responsible for validating digital membership tokens, preventing gender non-compliance and fraud, and protecting member privacy while providing staff with instantaneous feedback.

---

## 1. Role-Based Access Control (RBAC) & Scope
- **Backend Guard**: `@Roles(UserRole.GYM_STAFF, UserRole.GYM_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)`.
- **Enforcement**: Regular members (`role: 'USER'`) attempting to hit `/checkin/reception-verify` receive `403 Forbidden`.
- **Venue Scoping**: Receptionists have an `assigned_gym_id`. If `assigned_gym_id` is set in their JWT, check-in validation evaluates against that specific venue rather than arbitrary venues, preventing cross-venue unauthorized check-ins.

---

## 2. Validation Pipeline Error Taxonomy & Persian Error Messaging

| Stage | Validation Category | Persian Error Message | Actionable Guidance for Staff |
| :--- | :--- | :--- | :--- |
| **Stage 1 & 2** | Nonce Replay / Double Scan | `این بارکد قبلاً استفاده شده است (حمله تکرار/Replay Attack).` | Request athlete refresh QR from app. |
| **Stage 3** | Token Cryptographic Expiration | `بارکد ورود منقضی شده است (مدت اعتبار ۴۵ ثانیه به پایان رسیده است).` | Request athlete generate new dynamic QR. |
| **Stage 4** | Account / Subscription Expiry | `عضو دارای اشتراک ورزشی معتبر نمی‌باشد یا مدت اعتبار اشتراک به پایان رسیده است.` | Direct athlete to renew subscription via mobile app. |
| **Stage 5** | Gender Schedule Conflict | `تداخل سانس جنسیتی: در حال حاضر سانس اختصاصی [بانوان/آقایان] برقرار است...` | Inform member of operating hours for their gender. |
| **Stage 5b** | Gym Closed / Shift Break | `مجموعه ورزشی در این ساعت دارای سانس فعال نمی‌باشد.` | Inform member of shift start time. |
| **Stage 6** | Monthly Venue Quota Exceeded | `سقف مجاز ورود ماهانه به این مجموعه تکمیل شده است (۴ از ۴ جلسه).` | Member must visit another partner club or wait for new cycle. |
| **Stage 7** | Cooldown Limit | `فاصله زمانی مجاز تا ورود بعدی در این مجموعه رعایت نشده است (حداقل ۲ ساعت).` | Minimum 2-hour interval between visits to same club. |
| **Stage 8** | Insufficient Credits | `موجودی اعتبار کاربر کافی نیست.` | Member must purchase additional credits/plan. |

---

## 3. Privacy & Compliance Mandates
- **Suppression of Sensitive PII**: National Identification Number (`national_code`) and mobile phone number (`phone_number`) are **STRICTLY EXCLUDED** from the reception payload and UI.
- **Physical Verification Elements**: Avatar photo, Full Name, Subscription Tier, and Monthly Club Visit Count are presented clearly for reception personnel to visually verify the member.

---

## 4. Operational Gaps Identified
1. **Error Categorization on Terminal**: The UI previously rendered all errors in an undifferentiated red block. Staff needs categorized visual cards (e.g. Gender Alert vs Expired Subscription vs Replay).
2. **Session & Shift History**: Reception staff currently lose visibility into members checked in during the current session once a new token is scanned. A local shift log (showing approved check-ins during the current browser session) is essential.
3. **Audio-Visual Feedback**: High-throughput front-desks benefit from instant visual state indicators (approved green state vs denied state) and quick clear buttons for rapid scanning.
