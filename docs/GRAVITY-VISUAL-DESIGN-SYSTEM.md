# Gravity — Visual Design System & Brand Identity

> **Version**: 3.0.0 (Production Release)  
> **Brand Identity**: Graphite + Lime (`#0D0F10` & `#B8FF2C`)  
> **Core Theme**: Premium, Athletic, Dark, Restrained, High-Contrast  
> **Typography**: Vazirmatn (Farsi Text) & Vazirmatn-FD (Native Persian Digits)

---

## 1. Design Philosophy

Gravity is an Iranian multi-gym membership and credit network. Its visual identity communicates:
* **Fitness & Athletics**: Dynamic, confident, and energetic without gaming RGB excess.
* **Technology & Trust**: Clean dark graphite architecture with cryptographic and transactional security accents.
* **Restrained Accent Principle**: **Lime is strictly an accent color (`#B8FF2C`)**. The majority of the interface remains deep neutral Graphite (`#0D0F10`, `#15181B`, `#1D2125`), ensuring high readability, timeless aesthetics, and prolonged visual comfort.

---

## 2. Color Palette & Tokens

### 2.1 Backgrounds & Surfaces (Graphite Scale)
| Token Name | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--gravity-bg` | `#0D0F10` | Primary application root canvas and viewport background |
| `--gravity-surface` | `#15181B` | Primary cards, panels, modals, and container surfaces |
| `--gravity-surface-secondary` | `#1D2125` | Nested sections, inputs, table rows, and secondary cards |
| `--gravity-surface-elevated` | `#22272C` | Hover states, dropdowns, and elevated contextual popovers |

### 2.2 Brand Lime (Signature Athletic Accent)
| Token Name | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--gravity-lime` | `#B8FF2C` | Primary CTA buttons, active state indicators, highlighted values |
| `--gravity-lime-hover` | `#C5FF52` | Primary CTA button hover states |
| `--gravity-lime-active` | `#A8EF20` | Active button press and focus rings |
| `--gravity-lime-muted` | `rgba(184, 255, 44, 0.12)` | Subtle pill background highlights and glow effects |

### 2.3 Typography & Contrast Hierarchy
| Token Name | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--gravity-text-primary` | `#F4F5F2` | Headings, primary labels, main body text (AAA contrast) |
| `--gravity-text-secondary` | `#C4C8CC` | Secondary labels, descriptions, sub-headings |
| `--gravity-text-muted` | `#9CA3A8` | Supporting metadata, timestamps, captions |
| `--gravity-text-disabled` | `#62686D` | Inactive items, placeholder text, disabled states |

### 2.4 Structural Borders & Dividers
| Token Name | Hex Code | Purpose |
| :--- | :--- | :--- |
| `--gravity-border` | `#272B30` | Default card borders, input borders, structural dividers |
| `--gravity-border-subtle` | `#202428` | Inner row dividers, quiet list separators |
| `--gravity-border-strong` | `#353B41` | Hover border state, elevated boundaries |

### 2.5 Distinct Semantic Colors (Unmerged with Brand Lime)
| Semantic Intent | Hex Code | Dark Background Tint | Purpose |
| :--- | :--- | :--- | :--- |
| **Success** | `#22C55E` | `bg-emerald-950/60` | Successful admissions, payments, active subscriptions |
| **Warning** | `#F59E0B` | `bg-amber-950/60` | Expiring soon alerts, economic cautions, admin badges |
| **Danger** | `#EF4444` | `bg-red-950/60` | Replay attacks, failed payments, expired passes, errors |
| **Info / Tech** | `#38BDF8` | `bg-sky-950/60` | Telemetry notifications, system specifications |

---

## 3. UI Primitive Specifications

### 3.1 Button Hierarchy
1. **Primary Button**:
   * Background: `#B8FF2C` (Lime)
   * Typography: `#0D0F10` (Deep Graphite, `font-black`) — AAA accessibility contrast
   * Hover: `#C5FF52`
   * Focus Ring: `#B8FF2C` with 2px offset
2. **Secondary Button**:
   * Background: `#1D2125`
   * Border: `#272B30`
   * Text: `#F4F5F2`
   * Hover: `#22272C` with border `#353B41`
3. **Outline Button**:
   * Background: Transparent
   * Border: `#353B41`
   * Text: `#F4F5F2`
   * Hover: `#1D2125`
4. **Danger Button**:
   * Background: `#EF4444`
   * Text: `#FFFFFF`

### 3.2 Form Inputs
* Background: `#1D2125` / `#15181B`
* Border: `#272B30`
* Text: `#F4F5F2`
* Focus State: Border `#B8FF2C`, Focus Ring `#B8FF2C`/20%

### 3.3 Dynamic QR Modal Scanner Contrast
* **Physical Hardware Invariant**:
  The QR Code SVG container inside `DynamicQrModal` is explicitly preserved as **Solid White (`bg-white p-4 rounded-3xl`)**.
  This guarantees that 2D barcode cameras and kiosk laser scanners achieve 100% optical readability regardless of ambient gym reception lighting.

---

## 4. Verification & Quality Assurance Suite

All automated test suites pass with 100% success on the new Graphite + Lime design system:
* `npm run typecheck` — 0 TypeScript errors across `@gym-app/shared-types`, `@gym-app/api`, `@gym-app/web`.
* `npm test` — 144 / 144 unit and service tests passing.
* `npm run build` — Optimized Next.js 16 production build compiled with 0 errors.
* `node apps/api/test/validate-e2e.mjs` — All real UI & API journeys validated.
* `node apps/api/test/audit-negative-tests.mjs` — All 8 negative security scenarios enforced.
* `node apps/web/test/auth-regression.test.mjs` — Zero demo user leakage, real OTP login validated.
* `node apps/web/test/role-navigation.test.mjs` — Guest, Member, Staff, Admin navigation strictly isolated.
* `node apps/web/test/full-ui-ux-role-audit.test.mjs` — Route gating, responsive viewports (390, 430, 768, 1440), and empty states validated.
* `node apps/web/test/browser-e2e.test.mjs` — Real Chromium browser purchase, admission, and admin monitoring validated.
