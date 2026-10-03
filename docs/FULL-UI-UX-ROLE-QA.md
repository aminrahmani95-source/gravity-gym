# FULL UI/UX + ROLE-BASED QA AUDIT — GRAVITY

**Platform:** Gravity Fitness (Iranian Multi-Gym Network)  
**Date:** September 30, 2026  
**Auditor:** Antigravity Autonomous Agent  
**Overall Status:** **GREEN**  
**Business Logic Changes:** NONE  
**Economics Changes:** NONE  
**RBAC Semantics Changes:** NONE  

---

## 1. Audit Scope

This audit performed an exhaustive inspection across all client routes, components, authentication lifecycles, role-based visibility, hydration behaviors, responsive layouts, and API boundaries in `@gym-app/web` and `@gym-app/api`.

Key audit goals:
* Detect and eliminate any state where an unauthorized role or guest can view privileged UI, actions, or data.
* Eliminate hydration flashes of privileged shells during SSR, page reload, or high-latency token resolution.
* Ensure deep-link / direct navigation to protected routes (`/admin`, `/reception`, `/account`) displays dedicated, secure denial or login prompts without exposing operational shells or forms.
* Verify responsive layouts across standard devices (390x844, 430x932, 768x1024, 1440x900) without horizontal overflow or clipped interactions.
* Verify token revocation, logout transitions, and invalid session purges.

---

## 2. Complete Route Inventory

Every route under `apps/web/src/app` was audited and classified:

| Route Path | Classification | Target Audience | Direct Guest Behavior | Direct Unauthorized Role Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `/` | PUBLIC / GUEST & AUTHENTICATED | Everyone | Full Gym Discovery, Hero, Sans & Tiers filter. Login CTA in Navbar. | Same discovery, plus role-specific controls (Credits chip, Role badge). |
| `/plans` | PUBLIC / GUEST & AUTHENTICATED | Everyone | Plan tiers & pricing cards. Clicking "خرید" triggers Login Modal. | Active athletes can purchase & commit membership via Shaparak gateway. |
| `/gyms/[id]` | PUBLIC / GUEST & AUTHENTICATED | Everyone | Gym profile, photos, sans schedules, admission rules. Clicking QR triggers Login. | Active members can open Dynamic QR check-in modal. |
| `/account` | AUTHENTICATED MEMBER | `USER`, `GYM_STAFF`, `ADMIN` | Displays `EmptyState` login requirement. Zero athlete data or active badge shown. | Displays full wallet, active subscription status, check-in history, and payment receipts. |
| `/reception` | PROTECTED: GYM STAFF & ADMIN | `GYM_STAFF`, `ADMIN`, `SUPER_ADMIN` | Displays `EmptyState` staff login requirement. Scanner form & shift logs are **completely omitted from DOM**. | **Members (`USER`) see Access Denied screen** (`ShieldAlert`), zero scanner controls. |
| `/admin` | PROTECTED: ADMIN ONLY | `ADMIN`, `SUPER_ADMIN` | Displays `EmptyState` admin login requirement. Zero financial metrics or pricing controls rendered. | **Members and Staff see Access Denied screen**, zero pricing forms, zero sans editor forms. |

---

## 3. Issues Found & Root Causes

### Issue 1: Protected Shell & Sensitive Controls Leak on `/admin`
* **Symptoms**: When a Guest visited `/admin` directly, the Executive Header and Pricing Override form were rendered in the DOM with only an inline warning banner. When a regular Member (`USER`) or Staff (`GYM_STAFF`) visited `/admin`, the inline banner did not even show because `user` was non-null, completely exposing the admin page shell and pricing forms.
* **Root Cause**: `apps/web/src/app/admin/page.tsx` lacked full-page role gating. It only evaluated `user || hasToken` for a minor warning banner, leaving the entire form tree rendered in the virtual DOM. Furthermore, `useEffect` unconditionally dispatched requests to `/admin/dashboard-metrics` on mount regardless of role.

### Issue 2: Operational Scanner Terminal Leak on `/reception`
* **Symptoms**: Unauthenticated visitors could see the scanner terminal header and input textarea. Authenticated Members (`USER`) who typed `/reception` saw the operational reception terminal and shift logs table because `user` was non-null.
* **Root Cause**: `apps/web/src/app/reception/page.tsx` lacked full-page role gating for `UserRole.USER` and rendered the terminal UI for all logged-in users regardless of role.

### Issue 3: Hydration / Loading Flash on `/account`
* **Symptoms**: On initial page load or slow network, `/account` rendered a flash of "ورزشکار گراویتی - حساب فعال" with "کد ملی: ثبت نشده" before authentication state finished resolving from `localStorage`.
* **Root Cause**: `apps/web/src/app/account/page.tsx` checked `if (!isAuthLoading && !user)`. While `isAuthLoading === true`, the condition evaluated to `false`, causing the component to fall through and render the member profile template before knowing if the user was authenticated.

### Issue 4: Duplicate Sticky Navbar on `/gyms/[id]`
* **Symptoms**: Visiting any gym detail page displayed two sticky navigation bars stacked on top of each other.
* **Root Cause**: `apps/web/src/app/layout.tsx` already renders `<Navbar />` globally. `apps/web/src/app/gyms/[id]/page.tsx` had a redundant `<Navbar />` call in its local template.

### Issue 5: Missing Footer Consistency
* **Symptoms**: The `/account` and `/gyms/[id]` pages lacked the platform footer, resulting in an inconsistent footer experience compared to `/` and `/plans`.
* **Root Cause**: `<Footer />` was only included on `/` and `/plans`.

---

## 4. Fixes Applied

1. **Gated `/admin` Route ([admin/page.tsx](file:///C:/Users/P30/Desktop/Gravity/gym%20app/apps/web/src/app/admin/page.tsx))**:
   - Added `isLoading` skeleton guard to eliminate privileged shell flash.
   - Added `!user` unauthenticated guard rendering an `EmptyState` with admin login action.
   - Added strict role guard: `user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN` renders a clear Access Denied screen with redirect buttons.
   - Gated `fetchDashboard()` behind authorized admin role check in `useEffect`, eliminating 401 console errors.
2. **Gated `/reception` Route ([reception/page.tsx](file:///C:/Users/P30/Desktop/Gravity/gym%20app/apps/web/src/app/reception/page.tsx))**:
   - Added `isLoading` skeleton guard.
   - Added `!user` unauthenticated guard rendering an `EmptyState` with staff login action.
   - Added role guard: `user.role !== UserRole.GYM_STAFF && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN` renders an Access Denied screen. Scanner form and shift logs are completely excluded from the DOM.
3. **Fixed `/account` Hydration Flash ([account/page.tsx](file:///C:/Users/P30/Desktop/Gravity/gym%20app/apps/web/src/app/account/page.tsx))**:
   - Added explicit `if (isAuthLoading)` skeleton state that matches the dashboard layout during token resolution.
   - Cleaned `if (!user)` guard to render `EmptyState` login prompt only after loading is complete.
   - Added `<Footer />` to the bottom of the account page.
4. **Resolved Double Navbar on `/gyms/[id]` ([gyms/[id]/page.tsx](file:///C:/Users/P30/Desktop/Gravity/gym%20app/apps/web/src/app/gyms/%5Bid%5D/page.tsx))**:
   - Removed duplicate `<Navbar />` component call and unused import.
   - Added `<Footer />` to the bottom of the gym detail page.

---

## 5. Final Role Matrix

| Capability / Route | Guest (Public) | Member (`USER`) | Staff (`GYM_STAFF`) | Admin (`SUPER_ADMIN`) |
| :--- | :---: | :---: | :---: | :---: |
| **Home & Discovery (`/`)** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Plans & Pricing (`/plans`)** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Gym Detail (`/gyms/[id]`)** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Account (`/account`)** | 🔒 Auth Required | ✅ Full Access | ✅ Full Access | ✅ Full Access |
| **Dynamic QR Check-in** | 🔒 Requires Login | ✅ Active (45s TTL) | ❌ N/A | ✅ Permitted |
| **Reception Counter (`/reception`)** | 🔒 Auth Required | 🚫 **Access Denied** | ✅ Active Terminal | ✅ Active Terminal |
| **Admin Dashboard (`/admin`)** | 🔒 Auth Required | 🚫 **Access Denied** | 🚫 **Access Denied** | ✅ Full Access |
| **Navbar Privileged Links** | ❌ Omitted from DOM | ❌ Omitted from DOM | ✅ Reception Only | ✅ Admin + Reception |
| **Footer Privileged Links** | ❌ Omitted from DOM | ❌ Omitted from DOM | ✅ Reception Only | ✅ Admin + Reception |

---

## 6. Real Browser Automated QA Results

Automated headless Chromium testing was executed via `apps/web/test/full-ui-ux-role-audit.test.mjs` and `apps/web/test/role-navigation.test.mjs`:

```
================ FULL UI/UX + ROLE-BASED QA AUDIT ================
1. Provisioning sessions for Member, Staff, Admin...

--- SECTION 1: Guest Access on Protected Routes ---
✅ PASSED: Guest on /account sees login required EmptyState
✅ PASSED: Guest on /account does NOT leak profile or active account status
✅ PASSED: Guest on /reception sees staff login required EmptyState
✅ PASSED: Guest on /reception does NOT see QR scanner input form
✅ PASSED: Guest on /admin sees admin login required EmptyState
✅ PASSED: Guest on /admin does NOT see pricing override controls
✅ PASSED: Gym detail page has exactly 1 header/navbar (found: 1)
✅ PASSED: Gym detail page renders platform footer

--- SECTION 2: Member Access on Staff & Admin Routes ---
✅ PASSED: Member on /account sees full account dashboard
✅ PASSED: Member on /reception sees Access Denied screen
✅ PASSED: Member on /reception is strictly blocked from scanner terminal
✅ PASSED: Member on /admin sees Access Denied screen
✅ PASSED: Member on /admin is strictly blocked from pricing engine

--- SECTION 3: Gym Staff Access on Reception & Admin ---
✅ PASSED: Staff on /reception sees operational scanner terminal
✅ PASSED: Staff on /reception has active QR input field
✅ PASSED: Staff on /admin sees Access Denied screen
✅ PASSED: Staff on /admin is strictly blocked from pricing engine

--- SECTION 4: Super Admin Access on Admin & Reception ---
✅ PASSED: Admin on /admin sees full management dashboard
✅ PASSED: Admin on /admin has pricing override selector
✅ PASSED: Admin on /reception can access counter terminal

--- SECTION 5: Responsive Viewport Testing ---
✅ PASSED: Mobile 390x844: No horizontal overflow on homepage
✅ PASSED: Mobile 430x932: No horizontal overflow on homepage
✅ PASSED: Tablet 768x1024: No horizontal overflow on homepage
✅ PASSED: Desktop 1440x900: No horizontal overflow on homepage

--- SECTION 6: Logout and Expiry Transition ---
✅ PASSED: Logout immediately purges gym_app_token from localStorage
✅ PASSED: Post-logout navigation to /admin immediately requires authentication
✅ PASSED: Invalid/expired token is automatically purged on initial fetchProfile failure
✅ PASSED: Invalid token falls back cleanly to unauthenticated state

================ AUDIT SUMMARY: ALL PASSED ✅ ================
```

---

## 7. Visual Artifacts Produced

The following verification screenshots were captured:
* `guest_account_denial.png` — Guest on `/account`: clean empty state, no leaked balance or badges.
* `guest_reception_denial.png` — Guest on `/reception`: staff auth prompt, scanner form omitted.
* `guest_admin_denial.png` — Guest on `/admin`: admin auth prompt, metrics and pricing forms omitted.
* `member_reception_denied.png` — Member on `/reception`: Access Denied card, zero kiosk leakage.
* `member_admin_denied.png` — Member on `/admin`: Access Denied card, zero pricing engine leakage.
* `gym_detail_single_navbar.png` — `/gyms/gym-basic-1`: exactly one sticky navbar, clean layout.
* `staff_reception_active.png` — Staff on `/reception`: fully functional scanner kiosk.
* `admin_dashboard_active.png` — Admin on `/admin`: executive dashboard with real metrics.
* `responsive_tablet_768.png` — Tablet 768x1024 viewport: Persian RTL alignment, no overflow.

---

## 8. Comprehensive Regression Results

| Test Command | Status | Result / Details |
| :--- | :---: | :--- |
| `npm run typecheck` | **PASS** | 0 TypeScript errors across all 3 workspaces |
| `npm test` | **PASS** | 15 test files, 144 unit tests passing |
| `npm run build` | **PASS** | Turbopack production build succeeded for all 7 routes |
| `node apps/api/test/validate-e2e.mjs` | **PASS** | 4 complete user lifecycles validated |
| `node apps/api/test/audit-negative-tests.mjs` | **PASS** | 8 negative security tests verified |
| `node apps/web/test/auth-regression.test.mjs` | **PASS** | OTP, token lifecycle, demo opt-in invariants |
| `node apps/web/test/browser-e2e.test.mjs` | **PASS** | Real Chromium checkout, dynamic QR, kiosk check-in |
| `node apps/web/test/role-navigation.test.mjs` | **PASS** | 6 role navigation isolation scenarios |
| `node apps/web/test/full-ui-ux-role-audit.test.mjs` | **PASS** | Complete route, role denial, and responsive audit |
| `npm run test:integration` | **SKIPPED / BLOCKED** | Requires local PostgreSQL 18 & Redis services on localhost:5432/6379 |

---

## 9. Final Report Summary

### Overall Status
**GREEN**

### Critical Issues
**NONE** (All identified route exposures and hydration glitches are resolved).

### Fixed Issues
1. **Admin Route Exposure**: Guest & non-admin users could view the administrative page shell and pricing forms on `/admin`. Fixed by introducing an early `isLoading` skeleton, an unauthenticated `EmptyState` guard, and a role-based Access Denied screen.
2. **Reception Terminal Exposure**: Guests and regular athletes (`USER`) could view the receptionist scanner terminal on `/reception`. Fixed by adding role gating that renders an Access Denied screen for members and an Auth Required screen for guests.
3. **Account Hydration Flash**: `/account` flashed member profile templates before `isAuthLoading` resolved. Fixed by adding an explicit loading skeleton guard.
4. **Duplicate Sticky Navbar on Gym Detail**: `/gyms/[id]` rendered two headers stacked on top of each other. Fixed by removing the redundant local `<Navbar />` call.
5. **Inconsistent Footers**: `/account` and `/gyms/[id]` lacked `<Footer />`. Fixed by integrating `<Footer />` across all views.

### Browser QA
- **Roles Tested**: Guest, Member (`USER`), Staff (`GYM_STAFF`), Super Admin (`SUPER_ADMIN`).
- **Routes Tested**: `/`, `/plans`, `/gyms/[id]`, `/account`, `/reception`, `/admin`.
- **Viewports Tested**: 390x844 (Mobile), 430x932 (Mobile Pro Max), 768x1024 (Tablet iPad), 1440x900 (Desktop).

### Remaining Risks
None identified. Local integration tests require external PostgreSQL 18 and Redis daemons to be provisioned on host machine.

### Invariants
* **Business Logic Changes**: NONE
* **Economics Changes**: NONE
* **RBAC Semantics Changes**: NONE
