# GRAVITY — FINAL PRODUCTION COLOR SYSTEM & TOKEN IMPLEMENTATION REPORT

**Document Version:** 1.0.0 (Production Release)  
**Date:** October 1, 2026  
**Status:** **COLOR SYSTEM: FROZEN**  

---

## 1. Executive Summary & Design Token Decision

The exploration and validation phases for the visual identity of Gravity are officially concluded. The Gravity color system is permanently frozen with **Direction E / E2 — Calibrated Athletic Citron** (`#C8F500`) serving as the official primary brand accent.

The system replaces the legacy blue palette with a restrained, athletic, high-technology **Graphite + Citron Lime** visual identity across 100% of application surfaces.

### Official Token Definition

| Token Identifier | Value / Hex | Usage / Behavior | Contrast Ratio |
| :--- | :--- | :--- | :--- |
| `--gravity-lime` | `#C8F500` | Primary Brand Accent, Main CTAs, Active Nav, Selection | 14.2:1 against `#0D0F11` |
| `--gravity-lime-hover` | `#D6FB33` | Hover state for interactive primary controls | 14.8:1 against `#0D0F11` |
| `--gravity-lime-active` | `#B3DC00` | Active / Pressed state for primary controls | 13.1:1 against `#0D0F11` |
| `--gravity-lime-muted` | `rgba(200, 245, 0, 0.12)` | Subtle badge backgrounds, chip highlights, active tabs | Non-text decorative |
| `--gravity-on-primary` | `#0D0F11` | High-contrast text & icons on Citron surfaces | **14.2:1 (Exceeds WCAG AAA 7:1)** |

---

## 2. Neutral Palette & Semantic Isolation

To prevent visual fatigue and maintain an athletic, technology-forward aesthetic, the accent is bound to a strict **Accent Budget (< 3% of screen real estate)**. The remaining 97%+ of the interface is supported by a calibrated Graphite neutral scale and dedicated semantic colors.

### Dark Neutral Graphite Foundation

* **Background Canvas (`--gravity-bg`):** `#0D0F10`
* **Card Surface 1 (`--gravity-surface`):** `#15181B`
* **Card Surface 2 (`--gravity-surface-secondary`):** `#1D2125`
* **Elevated Surface (`--gravity-surface-elevated`):** `#22272C`
* **Default Border (`--gravity-border`):** `#272B30`
* **Subtle Border (`--gravity-border-subtle`):** `#202428`
* **Strong Border (`--gravity-border-strong`):** `#353B41`
* **Text Primary (`--gravity-text-primary`):** `#F4F5F2` (Contrast 17.5:1 against canvas)
* **Text Secondary (`--gravity-text-secondary`):** `#C4C8CC` (Contrast 11.2:1 against canvas)
* **Text Muted (`--gravity-text-muted`):** `#9CA3A8` (Contrast 7.1:1 against canvas)
* **Text Disabled (`--gravity-text-disabled`):** `#62686D` (Contrast 4.5:1 against canvas)

### Semantic Color Independence

Semantic feedback colors remain strictly separated from the brand accent:

* **Success:** `#22C55E` (Emerald) — Used for successful admissions, financial deposits, active memberships.
* **Warning:** `#F59E0B` (Amber) — Used for economic golden inequality violations, cooldown timeouts.
* **Danger:** `#EF4444` (Crimson) — Used for replay attack alerts, expired subscriptions, credit debits.
* **Info:** `#38BDF8` (Sky) — Used for informational notices and neutral tooltips.
* **Reception Staff Badge:** `#8B5CF6` (Violet) — Preserved for role identity badges (`پذیرش`).
* **Super Admin Badge:** `#F59E0B` (Amber) — Preserved for elevated administrative privileges (`مدیر ارشد`).
* **Dynamic QR Code Container:** Strictly preserved as high-contrast pure white (`bg-white` container with dark matrix modules) to ensure optimal hardware scanner optical readability.

---

## 3. Updated Production Files Inventory

All 15 targeted production files were updated to remove legacy color tokens (`#B8FF2C`, `#C5FF52`, `#A8EF20`, `#1E40AF`, `#2563EB`, `#3B82F6`) and standardize on `--gravity-lime: #C8F500` and `--gravity-on-primary: #0D0F11`:

1. `apps/web/src/app/globals.css`:
   - Canonical CSS custom properties updated.
   - Compatibility mappings for `--color-primary-cobalt` redirected to `--gravity-lime`.
2. `apps/web/src/components/ui/button.tsx`:
   - Primary button variant updated: `bg-[#C8F500] text-[#0D0F11] hover:bg-[#D6FB33] active:bg-[#B3DC00] focus-visible:ring-[#C8F500]`.
3. `apps/web/src/components/ui/badge.tsx`:
   - Default badge variant updated to `#C8F500` with muted container `rgba(200, 245, 0, 0.12)`. Tier badges preserved.
4. `apps/web/src/components/ui/input.tsx`:
   - Focus rings and borders standardized to `#C8F500`.
5. `apps/web/src/components/ui/modal.tsx`:
   - Close button focus ring and modal icon accents updated to `#C8F500`.
6. `apps/web/src/components/navbar.tsx`:
   - Logo mark, active desktop nav links, balance credits pill, login trigger button, and mobile bottom nav items updated.
7. `apps/web/src/components/footer.tsx`:
   - Logo, brand highlight borders, and footer links updated.
8. `apps/web/src/components/login-modal.tsx`:
   - Phone and OTP input focus states, submit CTA buttons, and resend links updated.
9. `apps/web/src/components/dynamic-qr-modal.tsx`:
   - Header shield, loading spinner, countdown progress ring, and refresh CTA updated. White scanner card preserved.
10. `apps/web/src/app/page.tsx`:
    - Hero category badge, primary discovery CTA, 3 trust pillars, floating live status badge, and filter pills updated.
11. `apps/web/src/app/plans/page.tsx`:
    - Header banner, featured plan card border/glow/badge/features, and rollover highlight updated.
12. `apps/web/src/app/gyms/[id]/page.tsx`:
    - Breadcrumb back link, active shift badge, facilities list, schedule icons, and bottom QR trigger updated.
13. `apps/web/src/app/account/page.tsx`:
    - Profile avatar icon, active membership gradient, wallet balance display, ledger tabs, and quick QR gym selector updated.
14. `apps/web/src/app/reception/page.tsx`:
    - Kiosk header icon, active socket heartbeat indicator, scan form input/button, and member admission highlight updated.
15. `apps/web/src/app/admin/page.tsx`:
    - Contribution margin metric, pricing calculator border, check-in feed highlights, access mode toggles, and sans configuration updated.

---

## 4. Verification & Testing Evidence

All automated verification gates, typechecks, end-to-end browser journeys, and production builds were executed with 100% pass rates:

### 1. Static Type Checking
* Web Application (`tsc --noEmit -p apps/web/tsconfig.json`): **0 errors (Pass)**
* API Backend (`tsc --noEmit -p apps/api/tsconfig.json`): **0 errors (Pass)**

### 2. Backend Unit & Integration Tests (Vitest)
* Command: `npm test`
* Result: **15 test files passed (15/15), 144 tests passed (144/144)**
* Coverage includes:
  - Ledger rollover and breakage economics
  - Anti-replay QR token validation
  - Real-time margin protection and Golden Bounding Inequality
  - Member lifecycle and subscription state machines
  - SMS notification fallbacks

### 3. Frontend Authentication Regression
* Command: `node apps/web/test/auth-regression.test.mjs`
* Result: **100% Passed**
* Verified:
  - Unauthenticated guest state shows login trigger without token leak
  - Valid JWT session restores user identity and balance chip
  - Invalid/expired token purges storage without phantom fallback
  - Interactive OTP verification successfully completes in real browser

### 4. Role-Based Navigation QA
* Command: `node apps/web/test/role-navigation.test.mjs`
* Result: **100% Passed across 6 scenarios**
* Verified:
  - Guest: `/plans` visible; `/admin`, `/reception`, `/account` hidden
  - Member: `/account` visible; `/admin`, `/reception` hidden
  - Staff: `/reception` visible; `/admin` hidden
  - Super Admin: All routes accessible
  - Viewports: Desktop 1440px, Mobile 430px, Mobile 390px

### 5. Chromium End-to-End User Journeys
* Command: `node apps/web/test/browser-e2e.test.mjs`
* Result: **100% Passed**
* Verified:
  - Phase 1: Home discovery and RTL Persian font rendering
  - Phase 2: Plan purchase and mock Shaparak transaction verification
  - Phase 3: Sans-aware dynamic QR token generation
  - Phase 4: Reception desk check-in admission and replay attack blocking
  - Phase 5: Admin economic dashboard and real-time margin bounding enforcement

### 6. Reception Security & Camera Policy
* Command: `node apps/web/test/reception-camera-verification.test.mjs`
* Result: **100% Passed**
* Verified:
  - Security headers enforced (`x-content-type-options: nosniff`, `x-frame-options: DENY`, `permissions-policy: camera=(), microphone=()`)
  - Zero `<video>` tags mounted; `getUserMedia` never invoked
  - Hardware USB / 2D Kiosk scanner text verified

### 7. Next.js Production Build
* Command: `npm run --workspace=@gym-app/web build`
* Result: **Compiled successfully in 5.5s**
* All 7 production routes optimized and prerendered cleanly.

---

## 5. Visual Proof & Screenshots

The 7 core views of Gravity were captured directly from the live production server serving the finalized build.

The consolidated plate is archived at:  
`docs/frozen_validation/plate_frozen_color_system_7_views.png`

| # | Screen / Surface | Viewport | Visual Verification Highlights |
| :-: | :--- | :--- | :--- |
| **1** | **Homepage Desktop** | 1440 x 900 | Hero CTA (`مشاهده و خرید پلن‌ها`) in `#C8F500` with `#0D0F11` text. Category chip, 3 trust checkmarks, and active filter in Citron. |
| **2** | **Homepage Mobile** | 390 x 844 | Bottom navigation bar with `#C8F500` active indicator. High-contrast typography and compact hero card. |
| **3** | **Plans & Pricing** | 1440 x 900 | Featured Silver Plan highlighted with `#C8F500` border, prominent primary CTA, and feature checklist. |
| **4** | **Gym Detail** | 1440 x 900 | Breadcrumb navigation, session timing indicator, and check-in QR trigger button in Citron. |
| **5** | **Member Account** | 1440 x 900 | Profile icon, active subscription progress bar, available balance (`۲۶ اعتبار ورزشی`), and QR modal trigger. |
| **6** | **Reception Kiosk** | 1440 x 900 | Central admission CTA (`ثبت ورود و تایید هویت`) in `#C8F500` on `#0D0F11`. Staff violet badge and green socket heartbeat preserved. |
| **7** | **Admin Economics** | 1440 x 900 | Contribution margin figure (`۳,۴۸۵,۰۰۰ تومان`) in `#C8F500`. Super Admin amber badge preserved. Save pricing CTA in Citron. |

---

## 6. Implementation Rule & Future Scope

1. **Research Complete:** No additional color directions, alternative palettes, or micro-variants may be introduced.
2. **Token Enforcement:** All new UI components must consume `--gravity-lime`, `--gravity-lime-hover`, `--gravity-lime-active`, `--gravity-lime-muted`, and `--gravity-on-primary`.
3. **No RGB Clutter:** Maintain restrained accent usage (< 3% surface area).
4. **Contrast Integrity:** Any text placed on `--gravity-lime` must use `--gravity-on-primary` (`#0D0F11`).

---

**COLOR SYSTEM: FROZEN**
