import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { EconomicsService } from '../src/modules/economics/economics.service';
import { EconomicViolationException } from '../src/common/exceptions/economic-violation.exception';
import { GymTier } from '@gym-app/shared-types';

describe('Club Economics & Golden Bounding Inequality Tests', () => {
  let db: DatabaseService;
  let economics: EconomicsService;

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    economics = new EconomicsService(db);
  });

  it('should accept valid club pricing conforming to the Golden Bounding Inequality', async () => {
    // Basic gym: C = 2, M = 30,000 T, VC_checkin = 500 T -> lambda = (30,000 + 500) / 2 = 15,250 <= 31,000
    const validation = await economics.validateGoldenBounding(2, 30000);
    expect(validation.isValid).toBe(true);
    expect(validation.lambdaRatio).toBe(15250);
    expect(validation.maxAllowedRatio).toBe(31000); // Dynamically bounded by most restrictive active plan (pro_60 = 31,000)
  });

  it('should reject pricing violating the Golden Bounding Inequality with clear exception', async () => {
    // Unviable rule: C = 3, M = 150,000 T, VC_checkin = 500 T -> lambda = 150,500 / 3 = 50,166.67 > 31,000
    const validation = await economics.validateGoldenBounding(3, 150000);
    expect(validation.isValid).toBe(false);
    expect(validation.lambdaRatio).toBe(50166.67);

    // Attempting to set this override in DB must throw EconomicViolationException
    await expect(
      economics.setClubPricingOverride('gym-basic-1', {
        creditCost: 3,
        monetaryPayoutTomans: 150000,
      })
    ).rejects.toThrow(EconomicViolationException);
  });

  // =========================================================================
  // Phase 12: Dynamic Multi-Plan Safety & Off-Peak Asymmetry Diagnostics
  // =========================================================================

  it('Test 1: Current seeded configuration passes Golden Bounding across all venues', async () => {
    // Basic: 2 cr, 30k -> 15,250 <= 31k
    expect((await economics.validateGoldenBounding(2, 30000)).isValid).toBe(true);
    // Plus: 4 cr, 65k -> 16,375 <= 31k
    expect((await economics.validateGoldenBounding(4, 65000)).isValid).toBe(true);
    // Premium: 7 cr, 115k -> 16,500 <= 31k
    expect((await economics.validateGoldenBounding(7, 115000)).isValid).toBe(true);
    // Elite: 14 cr, 230k -> 16,464.29 <= 31k
    expect((await economics.validateGoldenBounding(14, 230000)).isValid).toBe(true);
  });

  it('Test 2: A hypothetical override of 31,500 T/credit must be rejected while pro_60 exists', async () => {
    // Override: C = 2, M = 62,500 T -> lambda = (62,500 + 500) / 2 = 31,500 T/cr
    // While pro_60 is active, ceiling is 31,000 T/cr. Must be REJECTED!
    const validation = await economics.validateGoldenBounding(2, 62500);
    expect(validation.isValid).toBe(false);
    expect(validation.lambdaRatio).toBe(31500);
    expect(validation.maxAllowedRatio).toBe(31000);

    await expect(
      economics.setClubPricingOverride('gym-basic-1', {
        creditCost: 2,
        monetaryPayoutTomans: 62500,
      })
    ).rejects.toThrow(EconomicViolationException);
  });

  it('Test 3: A value at or below the minimum safe ceiling passes', async () => {
    // Exact ceiling: lambda = 31,000 T/cr (C = 2, M = 61,500 T -> (61,500 + 500) / 2 = 31,000)
    const validationAtCeiling = await economics.validateGoldenBounding(2, 61500);
    expect(validationAtCeiling.isValid).toBe(true);
    expect(validationAtCeiling.lambdaRatio).toBe(31000);
    expect(validationAtCeiling.maxAllowedRatio).toBe(31000);

    // Below ceiling: lambda = 30,000 T/cr (C = 2, M = 59,500 T -> (59,500 + 500) / 2 = 30,000)
    const validationBelow = await economics.validateGoldenBounding(2, 59500);
    expect(validationBelow.isValid).toBe(true);
    expect(validationBelow.lambdaRatio).toBe(30000);
  });

  it('Test 4: If active plans change dynamically, ceiling recalculates dynamically', async () => {
    // Deactivate pro_60
    const plans = db.getTable('plans');
    const proPlan = plans.find(p => p.slug === 'pro_60');
    if (proPlan) proPlan.is_active = false;

    // Remaining active: starter_15 (34,000) and standard_30 (32,000)
    // New minimum ceiling must become 32,000!
    const validationWithProInactive = await economics.validateGoldenBounding(2, 62500); // 31,500 T/cr
    expect(validationWithProInactive.isValid).toBe(true); // Now passes under 32,000 limit!
    expect(validationWithProInactive.maxAllowedRatio).toBe(32000);

    // Restore pro_60
    if (proPlan) proPlan.is_active = true;
    const validationRestored = await economics.validateGoldenBounding(2, 62500);
    expect(validationRestored.isValid).toBe(false); // Rejected again under 31,000 limit
    expect(validationRestored.maxAllowedRatio).toBe(31000);
  });

  it('Test 5: Inactive/retired plans must not constrain active configuration', async () => {
    // Add an inactive legacy plan with a hypothetical low price
    db.getTable('plans').push({
      id: 'legacy-cheap-plan',
      slug: 'legacy_super_cheap',
      title_fa: 'پلن منسوخ',
      price_tomans: 200000,
      credits_awarded: 10, // (200,000 - 40,000) / 10 = 16,000 T/cr
      validity_days: 30,
      is_active: false, // INACTIVE!
      sort_order: 99,
    });

    // The inactive plan must NOT lower the ceiling to 16,000! Active pro_60 limit (31,000) must prevail.
    const validation = await economics.validateGoldenBounding(2, 30000);
    expect(validation.maxAllowedRatio).toBe(31000);
  });

  it('Fix 3 Diagnostic: System exposes off-peak payout asymmetry without changing commercial values', async () => {
    // Inspect gym-plus-2:
    // Peak: 5 credits, Payout: 65,000 T -> lambda = 13,100 T/cr
    // Off-Peak: 3 credits, Payout: 65,000 T -> lambda = 21,833.33 T/cr
    const audit = await economics.auditGymPricingAsymmetry('gym-plus-2');
    expect(audit.hasOffpeakAsymmetry).toBe(true);
    expect(audit.peakCreditCost).toBe(5);
    expect(audit.offpeakCreditCost).toBe(3);
    expect(audit.basePayoutTomans).toBe(65000); // Payout remains intentionally unchanged!
    expect(audit.peakLambda).toBe(13100);
    expect(audit.offpeakLambda).toBe(21833.33);
    expect(audit.asymmetryWarning).toContain('ناهماهنگی سانس غیراوج');
  });

  it('should verify that all default seeded gym contracts satisfy the Golden Inequality', async () => {
    // Basic: 2 cr, 30,000 T -> 15,000 T/cr
    const basicVal = await economics.validateGoldenBounding(2, 30000);
    expect(basicVal.isValid).toBe(true);

    // Plus: 4 cr, 65,000 T -> 16,250 T/cr
    const plusVal = await economics.validateGoldenBounding(4, 65000);
    expect(plusVal.isValid).toBe(true);

    // Premium: 7 cr, 115,000 T -> 16,428 T/cr
    const premVal = await economics.validateGoldenBounding(7, 115000);
    expect(premVal.isValid).toBe(true);

    // Elite: 14 cr, 230,000 T -> 16,428 T/cr
    const eliteVal = await economics.validateGoldenBounding(14, 230000);
    expect(eliteVal.isValid).toBe(true);
  });

  it('should objectively recommend Tier and Credit Cost based on market indicators', () => {
    // Luxury Hotel Club: walkin = 500,000 T, monthly = 7,000,000 T, pool = 2.0, North Tehran = 2.0
    const recElite = economics.calculateTierRecommendation(500000, 7000000, 2.0, 2.0);
    expect(recElite.tier).toBe(GymTier.ELITE);
    expect(recElite.recommendedCreditCost).toBe(14);
    expect(recElite.recommendedMonetaryPayoutTomans).toBe(230000);

    // Neighborhood Gym: walkin = 50,000 T, monthly = 800,000 T, basic = 0.5, South Tehran = 0.5
    const recBasic = economics.calculateTierRecommendation(50000, 800000, 0.5, 0.5);
    expect(recBasic.tier).toBe(GymTier.BASIC);
    expect(recBasic.recommendedCreditCost).toBe(2);
    expect(recBasic.recommendedMonetaryPayoutTomans).toBe(30000);
  });

  it('should stress-test Scenario D: 100% Credit exhaustion under the maximum allowed payout mix guarantees positive subscriber contribution margin', () => {
    // Model assumptions from final_business_model_specification.md
    const P_sub = 1000000; // 1,000,000 Tomans subscription
    const C_issued = 30;   // 30 credits
    const VC_sub = 40000;  // 40,000 Tomans direct variable costs per subscriber
    const VC_checkin = 500;// 500 Tomans per check-in

    // User visits Elite club 2 times (2 x 14 = 28 credits) + 1 Basic visit (2 credits) = 30 credits (100% exhaustion)
    // Note: Visit mix is 66.7% Elite (2 visits) and 33.3% Basic (1 visit)
    const elitePayout = 2 * 230000; // 460,000 T
    const basicPayout = 1 * 30000;  // 30,000 T
    const totalClubPayout = elitePayout + basicPayout; // 490,000 T
    const totalCheckinFriction = 3 * VC_checkin; // 1,500 T

    // Total direct platform variable costs
    const totalDirectCosts = totalClubPayout + totalCheckinFriction + VC_sub; // 531,500 T

    // Realized payout-to-credit ratio:
    const realizedLambda = (totalClubPayout + totalCheckinFriction) / C_issued;
    expect(realizedLambda).toBeCloseTo(16383.33, 1);

    // Derived theoretical ceiling for standard 30-credit plan:
    const lambdaMax = (P_sub - VC_sub) / C_issued; // 32,000 T/credit
    expect(lambdaMax).toBe(32000);

    // Verify Golden Bounding Inequality holds:
    expect(realizedLambda).toBeLessThan(lambdaMax);

    // Subscriber-level contribution margin remains non-negative under the modeled assumptions:
    // NOTE: This protects unit economics, but does not guarantee overall enterprise profitability
    // (fixed operating costs, CAC, office overhead, and taxes are handled separately).
    const CM_sub = P_sub - totalDirectCosts;
    expect(CM_sub).toBe(468500); // Exactly +468,500 Tomans margin

    const CMR_sub = (CM_sub / P_sub) * 100;
    expect(CMR_sub).toBeCloseTo(46.85, 1);
    expect(CMR_sub).toBeGreaterThan(45);
  });

  it('should stress-test pure Elite preference: 100% of visits are Elite, distinguishing visit mix, credit exhaustion, payout, and contribution margin', () => {
    const P_sub = 1000000; // 1,000,000 Tomans subscription
    const C_issued = 30;   // 30 credits allocated
    const VC_sub = 40000;  // 40,000 Tomans direct variable costs per subscriber
    const VC_checkin = 500;// 500 Tomans per check-in

    // 100% of visits are Elite:
    // Each Elite visit costs 14 credits. With 30 credits, user can make exactly 2 visits (2 x 14 = 28 credits).
    const eliteVisits = 2;
    const basicVisits = 0;
    const totalVisits = eliteVisits + basicVisits; // 2 visits

    // 1. Visit Mix: 100% Elite visits (2/2)
    const eliteVisitMixPercent = (eliteVisits / totalVisits) * 100;
    expect(eliteVisitMixPercent).toBe(100);

    // 2. Credit Exhaustion: 28 credits consumed out of 30 (93.33% exhaustion, 2 unspent credits)
    const creditsConsumed = eliteVisits * 14; // 28 credits
    const creditExhaustionPercent = (creditsConsumed / C_issued) * 100;
    expect(creditExhaustionPercent).toBeCloseTo(93.33, 1);
    expect(C_issued - creditsConsumed).toBe(2); // 2 unspent credits

    // 3. Monetary Payout:
    const totalClubPayout = eliteVisits * 230000; // 460,000 Tomans
    const totalCheckinFriction = totalVisits * VC_checkin; // 1,000 Tomans
    expect(totalClubPayout).toBe(460000);

    // 4. Subscriber-level Contribution Margin:
    const totalDirectCosts = totalClubPayout + totalCheckinFriction + VC_sub; // 501,000 Tomans
    const CM_sub = P_sub - totalDirectCosts; // 1,000,000 - 501,000 = +499,000 Tomans
    expect(CM_sub).toBe(499000);

    const CMR_sub = (CM_sub / P_sub) * 100;
    expect(CMR_sub).toBe(49.9);
    expect(CMR_sub).toBeGreaterThan(45);
  });
});
