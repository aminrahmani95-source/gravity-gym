import { SubscriptionStatus } from './enums';

export interface Plan {
  id: string;
  slug: string;
  titleFa: string;
  priceTomans: number;
  creditsAwarded: number;
  validityDays: number;
  rolloverPercentage: number;
  maxRolloverCredits: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  plan?: Plan;
  startsAt: string;
  expiresAt: string;
  status: SubscriptionStatus;
  autoRenew: boolean;
}

export type SubscriptionLifecycleState = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_ACTIVE_SUBSCRIPTION';

export interface MemberSubscriptionDetails {
  state: SubscriptionLifecycleState;
  subscription?: {
    id: string;
    planId: string;
    planTitle: string;
    startsAt: string;
    expiresAt: string;
    status: SubscriptionStatus;
    autoRenew: boolean;
    remainingDays: number;
    totalDays: number;
  };
  plan?: Plan;
  stats: {
    totalCreditsAwarded: number;
    availableCredits: number;
    consumedCredits: number;
  };
}

