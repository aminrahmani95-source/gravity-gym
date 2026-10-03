import { GymTier } from './enums';

export interface GymPricingOverride {
  id: string;
  gymId: string;
  creditCost: number;
  monetaryPayoutTomans: number;
  offpeakCreditCost?: number;
  peakCreditCost?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
}

export interface GoldenBoundingValidation {
  isValid: boolean;
  lambdaRatio: number; // Monetary Payout / Credit Cost (Tomans / Credit)
  maxAllowedRatio: number; // e.g. 32,000 Tomans / Credit
  violationMessage?: string;
}

export interface SystemEconomicRules {
  globalMaxPayoutPerCreditRatio: number;
  defaultRolloverPercentage: number;
  defaultMaxRolloverCredits: number;
  defaultCooldownMinutes: number;
  defaultClubMonthlyVisitCap: number;
  impossibleVelocityKmhThreshold: number;
  variableCostPerSubscriberTomans: number; // VC_sub
  variableCostPerCheckinTomans: number;    // VC_checkin
  qrValiditySeconds: number;              // QR cryptographic validity (default: 45s)
  qrNonceRetentionSeconds: number;        // Nonce replay-protection retention (default: 90s)
  otpResendCooldownSeconds: number;       // SMS OTP re-dispatch interval (default: 60s)
  otpMaxAttempts: number;                 // Maximum failed attempts before OTP invalidation (default: 5)
  defaultPeakMultiplier: number;          // Peak Sans credit pricing multiplier (default: 1.25)
}

export interface TierEconomicsRecommendation {
  tier: GymTier;
  recommendedCreditCost: number;
  recommendedMonetaryPayoutTomans: number;
  tierScore: number;
}
