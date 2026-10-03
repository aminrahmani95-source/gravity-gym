import { CreditLedgerEntryType, GymPayableEntryType } from './enums';

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  deltaCredits: number;
  balanceAfter: number;
  entryType: CreditLedgerEntryType;
  referenceId?: string;
  description?: string;
  relatedTitle?: string;
  createdAt: string;
}

export interface GymPayableLedgerEntry {
  id: string;
  gymId: string;
  checkinId?: string;
  deltaAmountTomans: number;
  balanceAfter: number;
  entryType: GymPayableEntryType;
  settlementId?: string;
  description?: string;
  createdAt: string;
}

export interface WalletSummary {
  userId: string;
  currentCredits: number;
  totalEarnedCredits?: number;
  totalSpentCredits?: number;
  recentTransactions: CreditLedgerEntry[];
}

