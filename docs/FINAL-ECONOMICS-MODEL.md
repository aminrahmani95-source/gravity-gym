# Final Economics & Mathematical Financial Model

## Executive Summary
This document provides the definitive mathematical and economic audit for the Gravity fitness platform. It models unit economics, validates the Golden Bounding inequality across all network tiers, simulates 5 distinct subscriber utilization scenarios, and establishes the breakage and rollover mechanics governing platform profitability.

---

## 1. Mathematical Notation & Financial Grounding

| Symbol | Parameter | Value | Definition & Derivation |
| :--- | :--- | :--- | :--- |
| $P_{sub}$ | Reference Subscription Price | **1,000,000 Tomans** | Standard 30-credit plan monthly retail fee |
| $C_{issued}$ | Reference Credits Issued | **30 Credits** | Credits allocated upon plan activation |
| $VC_{sub}$ | Direct Subscriber Variable Cost | **40,000 Tomans** | Payment gateway fees, OTP SMS, customer service |
| $VC_{checkin}$ | Variable Check-in Cost | **500 Tomans** | SMS confirmation, network routing, transaction processing |
| $\lambda_{max}$ | Golden Bounding Ceiling | **32,000 Tomans/Credit** | Maximum permissible gross payout ratio |
| $\lambda_{club}$ | Club Real Valuation Ratio | Computed per club | $\lambda_{club} = \frac{M_{club} + VC_{checkin}}{C_{club}}$ |
| $M_{club}$ | Monetary Payout to Club | Set per tier | B2B cash payable accrued to partner venue |
| $C_{club}$ | Credit Cost to Member | Set per tier | Credits debited from member wallet per entry |

---

## 2. Golden Bounding Inequality

The fundamental economic axiom guaranteeing platform solvency is:
$$\lambda_{club} = \frac{M_{club} + VC_{checkin}}{C_{club}} \le \lambda_{max} = \frac{P_{sub} - VC_{sub}}{C_{issued}} = 32,000\text{ Tomans/Credit}$$

### Audit of Network Tier Economics
| Tier | Representative Venue | $C_{club}$ (cr) | $M_{club}$ (Tomans) | Effective Payout ($M + VC$) | Real $\lambda$ | Golden Bound Margin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BASIC** | باشگاه بدنسازی کارو | 2 | 30,000 | 30,500 | **15,250** | **+52.3%** |
| **PLUS** | مجموعه ورزشی ستاره ونک | 4 | 65,000 | 65,500 | **16,375** | **+48.8%** |
| **PREMIUM** | باشگاه اکسیژن رویال | 7 | 115,000 | 115,500 | **16,500** | **+48.4%** |
| **ELITE** | کلاب هتل اسپیناس پالاس | 14 | 230,000 | 230,500 | **16,464** | **+48.5%** |

**Key Finding**:
Across all 4 tiers, the effective redemption cost per credit is tightly grouped between **15,250 and 16,500 Tomans/credit**—less than **52%** of the allowable 32,000 Tomans limit. This guarantees that Gravity earns an operating gross margin of **48% to 52%** even under 100% credit consumption.

---

## 3. Five Subscriber Utilization Scenarios (Standard 30-Credit Plan)

```
Gross Plan Revenue: 1,000,000 Tomans
Direct Overhead (VC_sub): 40,000 Tomans
Net Plan Pool Available: 960,000 Tomans
```

### Scenario 1: Low / Dormant Utilization (30% Consumption — 9 Credits)
- **Activity**: ~3 to 4 visits at Basic/Plus venues.
- **Payables Accrued**: $9 \times 16,375 = 147,375\text{ Tomans}$.
- **Unspent Credits**: 21 credits.
- **Rollover**: 3 credits rolled over (liability $\le 49,500\text{ T}$).
- **Breakage**: 18 credits permanently expired (`CREDIT_EXPIRATION_EXCESS`).
- **Platform Contribution**: $1,000,000 - 40,000 - 147,375 = \mathbf{812,625\text{ Tomans}}$ (**81.3% Net Margin**).

### Scenario 2: Moderate Utilization (60% Consumption — 18 Credits)
- **Activity**: ~4 to 5 visits across Plus and Premium venues.
- **Payables Accrued**: $18 \times 16,450 = 296,100\text{ Tomans}$.
- **Unspent Credits**: 12 credits.
- **Rollover**: 3 credits rolled over.
- **Breakage**: 9 credits permanently expired.
- **Platform Contribution**: $1,000,000 - 40,000 - 296,100 = \mathbf{663,900\text{ Tomans}}$ (**66.4% Net Margin**).

### Scenario 3: Target Baseline Utilization (80% Consumption — 24 Credits)
- **Activity**: 6 visits at PLUS tier ($6 \times 4 = 24\text{ cr}$).
- **Payables Accrued**: $6 \times (65,000 + 500) = 393,000\text{ Tomans}$.
- **Unspent Credits**: 6 credits.
- **Rollover**: 3 credits rolled over.
- **Breakage**: 3 credits permanently expired.
- **Platform Contribution**: $1,000,000 - 40,000 - 393,000 = \mathbf{567,000\text{ Tomans}}$ (**56.7% Net Margin**).

### Scenario 4: Heavy Utilization (100% Consumption — 30 Credits)
- **Activity**: Full consumption of all 30 credits (e.g. 2 visits at ELITE + 1 at BASIC).
- **Payables Accrued**: $2 \times 230,500 + 1 \times 30,500 = 491,500\text{ Tomans}$.
- **Unspent Credits**: 0 credits.
- **Rollover & Breakage**: 0 credits.
- **Platform Contribution**: $1,000,000 - 40,000 - 491,500 = \mathbf{468,500\text{ Tomans}}$ (**46.9% Net Margin**).

### Scenario 5: Theoretical Worst-Case Boundary Stress Test ($\lambda = \lambda_{max}$)
- **Condition**: All credits redeemed at the theoretical ceiling ($32,000\text{ T/cr}$).
- **Payables Accrued**: $30 \times 32,000 = 960,000\text{ Tomans}$.
- **Platform Contribution**: $1,000,000 - 40,000 - 960,000 = \mathbf{0\text{ Tomans}}$ (**0.0% Floor**).
- **Mathematical Guarantee**: Net contribution margin can never become negative under any legitimate user behavior.

---

## 4. Rollover & Breakage Architecture

1. **Strict 10% Cap**:
   $$\text{Preserved Rollover} = \min(C_{unspent}, \text{Cap})$$
   Where $\text{Cap} = \min(5, \lfloor C_{issued} \times 0.10 \rfloor)$.
2. **Breakage Realization**:
   Unpreserved credits are swept and recorded as `CREDIT_EXPIRATION_EXCESS`.
3. **Retention Flywheel**:
   Members keep up to 5 credits upon renewal, providing strong psychological incentive to purchase a new monthly plan before cycle expiration.
