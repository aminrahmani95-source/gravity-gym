import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { EconomicViolationException } from '../../common/exceptions/economic-violation.exception';
import {
  GymPricingOverride,
  GoldenBoundingValidation,
  SystemEconomicRules,
  TierEconomicsRecommendation,
  GymTier,
} from '@gym-app/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class EconomicsService {
  private readonly logger = new Logger(EconomicsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves active global economic rules from system_configs
   */
  async getSystemRules(): Promise<SystemEconomicRules> {
    const defaultRules: SystemEconomicRules = {
      globalMaxPayoutPerCreditRatio: 32000, // Derived default from standard 30-credit plan: (1,000,000 - 40,000) / 30
      defaultRolloverPercentage: 0.10,
      defaultMaxRolloverCredits: 5,
      defaultCooldownMinutes: 120,
      defaultClubMonthlyVisitCap: 4,
      impossibleVelocityKmhThreshold: 70,
      variableCostPerSubscriberTomans: 40000,
      variableCostPerCheckinTomans: 500,
      qrValiditySeconds: 45,
      qrNonceRetentionSeconds: 90,
      otpResendCooldownSeconds: 60,
      otpMaxAttempts: 5,
      defaultPeakMultiplier: 1.25,
    };

    if (this.db.isInMemory) {
      const configs = this.db.getTable('system_configs');
      for (const row of configs) {
        if (row.key === 'global_max_payout_per_credit_ratio') defaultRules.globalMaxPayoutPerCreditRatio = Number(row.value_json?.value ?? 32000);
        if (row.key === 'default_rollover_percentage') defaultRules.defaultRolloverPercentage = Number(row.value_json?.value ?? 0.10);
        if (row.key === 'default_max_rollover_credits') defaultRules.defaultMaxRolloverCredits = Number(row.value_json?.value ?? 5);
        if (row.key === 'default_cooldown_minutes') defaultRules.defaultCooldownMinutes = Number(row.value_json?.value ?? 120);
        if (row.key === 'default_club_monthly_visit_cap') defaultRules.defaultClubMonthlyVisitCap = Number(row.value_json?.value ?? 4);
        if (row.key === 'impossible_velocity_kmh_threshold') defaultRules.impossibleVelocityKmhThreshold = Number(row.value_json?.value ?? 70);
        if (row.key === 'variable_cost_per_subscriber_tomans') defaultRules.variableCostPerSubscriberTomans = Number(row.value_json?.value ?? 40000);
        if (row.key === 'variable_cost_per_checkin_tomans') defaultRules.variableCostPerCheckinTomans = Number(row.value_json?.value ?? 500);
        if (row.key === 'qr_validity_seconds') defaultRules.qrValiditySeconds = Number(row.value_json?.value ?? 45);
        if (row.key === 'qr_nonce_retention_seconds') defaultRules.qrNonceRetentionSeconds = Number(row.value_json?.value ?? 90);
        if (row.key === 'otp_resend_cooldown_seconds') defaultRules.otpResendCooldownSeconds = Number(row.value_json?.value ?? 60);
        if (row.key === 'otp_max_attempts') defaultRules.otpMaxAttempts = Number(row.value_json?.value ?? 5);
        if (row.key === 'default_peak_multiplier') defaultRules.defaultPeakMultiplier = Number(row.value_json?.value ?? 1.25);
      }
      return defaultRules;
    }

    const res = await this.db.query('SELECT key, value_json FROM system_configs');
    for (const row of res.rows) {
      if (row.key === 'global_max_payout_per_credit_ratio') defaultRules.globalMaxPayoutPerCreditRatio = Number(row.value_json?.value ?? 32000);
      if (row.key === 'default_rollover_percentage') defaultRules.defaultRolloverPercentage = Number(row.value_json?.value ?? 0.10);
      if (row.key === 'default_max_rollover_credits') defaultRules.defaultMaxRolloverCredits = Number(row.value_json?.value ?? 5);
      if (row.key === 'default_cooldown_minutes') defaultRules.defaultCooldownMinutes = Number(row.value_json?.value ?? 120);
      if (row.key === 'default_club_monthly_visit_cap') defaultRules.defaultClubMonthlyVisitCap = Number(row.value_json?.value ?? 4);
      if (row.key === 'impossible_velocity_kmh_threshold') defaultRules.impossibleVelocityKmhThreshold = Number(row.value_json?.value ?? 70);
      if (row.key === 'variable_cost_per_subscriber_tomans') defaultRules.variableCostPerSubscriberTomans = Number(row.value_json?.value ?? 40000);
      if (row.key === 'variable_cost_per_checkin_tomans') defaultRules.variableCostPerCheckinTomans = Number(row.value_json?.value ?? 500);
      if (row.key === 'qr_validity_seconds') defaultRules.qrValiditySeconds = Number(row.value_json?.value ?? 45);
      if (row.key === 'qr_nonce_retention_seconds') defaultRules.qrNonceRetentionSeconds = Number(row.value_json?.value ?? 90);
      if (row.key === 'otp_resend_cooldown_seconds') defaultRules.otpResendCooldownSeconds = Number(row.value_json?.value ?? 60);
      if (row.key === 'otp_max_attempts') defaultRules.otpMaxAttempts = Number(row.value_json?.value ?? 5);
      if (row.key === 'default_peak_multiplier') defaultRules.defaultPeakMultiplier = Number(row.value_json?.value ?? 1.25);
    }

    return defaultRules;
  }

  /**
   * Validates the Golden Bounding Inequality:
   * lambda = (M_club + VC_checkin) / C_club <= lambda_max = (P_sub - VC_sub) / C_issued
   * Both numerator and denominator match the approved financial specification.
   */
  async validateGoldenBounding(creditCost: number, monetaryPayoutTomans: number): Promise<GoldenBoundingValidation> {
    const rules = await this.getSystemRules();

    if (creditCost <= 0) {
      return {
        isValid: false,
        lambdaRatio: Infinity,
        maxAllowedRatio: rules.globalMaxPayoutPerCreditRatio,
        violationMessage: 'هزینه اعتباری باشگاه باید بزرگتر از صفر باشد.',
      };
    }

    const vcCheckin = rules.variableCostPerCheckinTomans ?? 500;
    const vcSub = rules.variableCostPerSubscriberTomans ?? 40000;

    // Dynamically derive lambda_max as the minimum safe ceiling across ALL active plans:
    // lambda_max = min(lambda_max(plan) for every active plan)
    // where lambda_max(plan) = (plan.price_tomans - VC_sub) / plan.credits_awarded
    let activePlans: any[] = [];
    if (this.db.isInMemory) {
      activePlans = this.db.getTable('plans').filter(p => p.is_active);
    } else {
      const res = await this.db.query("SELECT * FROM plans WHERE is_active = true");
      activePlans = res.rows;
    }

    let minLambdaMax = rules.globalMaxPayoutPerCreditRatio;
    if (activePlans.length > 0) {
      let calculatedMin = Infinity;
      for (const plan of activePlans) {
        const price = Number(plan.price_tomans);
        const credits = Number(plan.credits_awarded);
        if (credits > 0 && price > vcSub) {
          const planLambdaMax = (price - vcSub) / credits;
          if (planLambdaMax < calculatedMin) {
            calculatedMin = planLambdaMax;
          }
        }
      }
      if (calculatedMin !== Infinity) {
        minLambdaMax = calculatedMin;
      }
    }
    const lambdaMax = minLambdaMax;

    // Exact formula matching final_business_model_specification.md:
    // lambda = (M_club + VC_checkin) / C_club
    const lambda = (monetaryPayoutTomans + vcCheckin) / creditCost;

    return {
      isValid: lambda <= lambdaMax,
      lambdaRatio: Math.round(lambda * 100) / 100,
      maxAllowedRatio: Math.round(lambdaMax * 100) / 100,
      violationMessage: lambda > lambdaMax
        ? `نسبت تسویه ناخالص به ازای هر اعتبار (${Math.round(lambda)} تومان/اعتبار با احتساب هزینه هر ورود ${vcCheckin} تومان) از سقف مجاز پلتفرم (${Math.round(lambdaMax)} تومان/اعتبار) فراتر رفته است.`
        : undefined,
    };
  }

  /**
   * Diagnostic method to inspect gym pricing configurations and detect off-peak payout asymmetry.
   * Calculates effective lambda for both peak and off-peak sessions.
   * NOTE: Current off-peak payout asymmetry remains intentionally unchanged pending the dedicated commercial Economics decision.
   */
  async auditGymPricingAsymmetry(gymId: string): Promise<{
    gymId: string;
    peakCreditCost: number;
    offpeakCreditCost: number;
    basePayoutTomans: number;
    peakLambda: number;
    offpeakLambda: number;
    hasOffpeakAsymmetry: boolean;
    asymmetryWarning?: string;
  }> {
    const rules = await this.getSystemRules();
    const vcCheckin = rules.variableCostPerCheckinTomans ?? 500;

    let override: any;
    if (this.db.isInMemory) {
      override = this.db.getTable('gym_pricing_overrides').find(
        (o: any) => o.gym_id === gymId && (!o.effective_to || new Date(o.effective_to) > new Date())
      );
    } else {
      const res = await this.db.query(
        `SELECT * FROM gym_pricing_overrides 
         WHERE gym_id = $1 AND (effective_to IS NULL OR effective_to > NOW())
         ORDER BY effective_from DESC LIMIT 1`,
        [gymId]
      );
      override = res.rows[0];
    }

    const baseCost = override?.credit_cost ?? 4;
    const peakCost = override?.peak_credit_cost ?? baseCost;
    const offpeakCost = override?.offpeak_credit_cost ?? baseCost;
    const payout = Number(override?.monetary_payout_tomans ?? 65000);

    const peakLambda = (payout + vcCheckin) / peakCost;
    const offpeakLambda = (payout + vcCheckin) / offpeakCost;

    const hasOffpeakAsymmetry = offpeakCost < peakCost;

    return {
      gymId,
      peakCreditCost: peakCost,
      offpeakCreditCost: offpeakCost,
      basePayoutTomans: payout,
      peakLambda: Math.round(peakLambda * 100) / 100,
      offpeakLambda: Math.round(offpeakLambda * 100) / 100,
      hasOffpeakAsymmetry,
      asymmetryWarning: hasOffpeakAsymmetry
        ? `ناهماهنگی سانس غیراوج: هزینه اعتباری عضو (${offpeakCost} اعتبار) کمتر از اوج (${peakCost} اعتبار) است، اما تسویه باشگاه یکسان (${payout} تومان) باقی‌مانده است. نسبت بازخرید از ${Math.round(peakLambda)} به ${Math.round(offpeakLambda)} تومان/اعتبار افزایش می‌یابد.`
        : undefined,
    };
  }

  /**
   * Admin sets or overrides a club's pricing and payout rules.
   * Throws EconomicViolationException with clear diagnostic details if Golden Inequality is violated.
   */
  async setClubPricingOverride(
    gymId: string,
    dto: {
      creditCost: number;
      monetaryPayoutTomans: number;
      offpeakCreditCost?: number;
      peakCreditCost?: number;
      notes?: string;
    },
    adminUserId?: string,
  ): Promise<GymPricingOverride> {
    const validation = await this.validateGoldenBounding(dto.creditCost, dto.monetaryPayoutTomans);
    if (!validation.isValid) {
      throw new EconomicViolationException(
        validation.lambdaRatio,
        validation.maxAllowedRatio,
        gymId,
      );
    }

    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    if (this.db.isInMemory) {
      const overrides = this.db.getTable('gym_pricing_overrides');
      // Expire previous active rule
      const active = overrides.find(o => o.gym_id === gymId && (!o.effective_to || new Date(o.effective_to) > new Date()));
      if (active) {
        active.effective_to = now;
      }

      const row = {
        id: newId,
        gym_id: gymId,
        credit_cost: dto.creditCost,
        monetary_payout_tomans: dto.monetaryPayoutTomans,
        offpeak_credit_cost: dto.offpeakCreditCost || dto.creditCost,
        peak_credit_cost: dto.peakCreditCost || dto.creditCost,
        effective_from: now,
        notes: dto.notes,
        created_by_admin_id: adminUserId,
        created_at: now,
      };
      overrides.push(row);
      return this.mapPricingOverride(row);
    }

    // Close previous active override
    await this.db.query(
      `UPDATE gym_pricing_overrides 
       SET effective_to = NOW() 
       WHERE gym_id = $1 AND (effective_to IS NULL OR effective_to > NOW())`,
      [gymId]
    );

    const res = await this.db.query(
      `INSERT INTO gym_pricing_overrides (id, gym_id, credit_cost, monetary_payout_tomans, offpeak_credit_cost, peak_credit_cost, effective_from, created_by_admin_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [newId, gymId, dto.creditCost, dto.monetaryPayoutTomans, dto.offpeakCreditCost, dto.peakCreditCost, now, adminUserId, dto.notes]
    );

    return this.mapPricingOverride(res.rows[0]);
  }

  /**
   * Calculates dynamic credit cost factoring in peak Sans and optional pool access
   */
  async calculateDynamicCreditCost(
    gymId: string,
    isPeak = false,
    hasPool = false,
  ): Promise<{ creditCost: number; monetaryPayout: number }> {
    let override: any;
    if (this.db.isInMemory) {
      override = this.db.getTable('gym_pricing_overrides').find(o => o.gym_id === gymId && (!o.effective_to || new Date(o.effective_to) > new Date()));
    } else {
      const res = await this.db.query(
        `SELECT * FROM gym_pricing_overrides 
         WHERE gym_id = $1 AND (effective_to IS NULL OR effective_to > NOW())
         ORDER BY effective_from DESC LIMIT 1`,
        [gymId]
      );
      override = res.rows[0];
    }

    let baseCost = override?.credit_cost ?? 4;
    const basePayout = Number(override?.monetary_payout_tomans ?? 65000);

    if (isPeak && override?.peak_credit_cost) {
      baseCost = override.peak_credit_cost;
    } else if (!isPeak && override?.offpeak_credit_cost) {
      baseCost = override.offpeak_credit_cost;
    }

    if (hasPool) {
      baseCost = Math.round(baseCost * 1.5);
    }

    return { creditCost: baseCost, monetaryPayout: basePayout };
  }

  /**
   * Recommends tier and parameters from objective economic indicators
   */
  calculateTierRecommendation(
    retailWalkinPrice: number,
    retailMonthlyPrice: number,
    facilityIndex: number, // 0.5 - 2.0
    locationIndex: number, // 0.5 - 2.0
  ): TierEconomicsRecommendation {
    const refWalkin = 100000;
    const refMonthly = 1500000;

    const score =
      0.35 * (retailWalkinPrice / refWalkin) +
      0.35 * (retailMonthlyPrice / refMonthly) +
      0.15 * facilityIndex +
      0.15 * locationIndex;

    let tier = GymTier.BASIC;
    let recommendedCreditCost = 2;
    let recommendedMonetaryPayoutTomans = 30000;

    const roundedScore = Math.round(score * 100) / 100;

    if (roundedScore >= 3.8) {
      tier = GymTier.ELITE;
      recommendedCreditCost = 14;
      recommendedMonetaryPayoutTomans = 230000;
    } else if (roundedScore >= 2.0) {
      tier = GymTier.PREMIUM;
      recommendedCreditCost = 7;
      recommendedMonetaryPayoutTomans = 115000;
    } else if (roundedScore >= 1.0) {
      tier = GymTier.PLUS;
      recommendedCreditCost = 4;
      recommendedMonetaryPayoutTomans = 65000;
    }

    return {
      tier,
      recommendedCreditCost,
      recommendedMonetaryPayoutTomans,
      tierScore: Math.round(score * 100) / 100,
    };
  }

  private mapPricingOverride(row: any): GymPricingOverride {
    return {
      id: row.id,
      gymId: row.gym_id,
      creditCost: row.credit_cost,
      monetaryPayoutTomans: Number(row.monetary_payout_tomans),
      offpeakCreditCost: row.offpeak_credit_cost,
      peakCreditCost: row.peak_credit_cost,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      notes: row.notes,
    };
  }
}
