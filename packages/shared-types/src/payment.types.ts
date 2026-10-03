import { PaymentStatus } from './enums';

export interface PaymentInitiateDto {
  planId: string;
  gateway?: 'MOCK' | 'SEP' | 'ZARINPAL';
}

export interface PaymentInitiateResponse {
  paymentId: string;
  amountTomans: number;
  amountRials: number; // Explicit Rial boundary: amountTomans * 10
  redirectUrl: string;
  gatewayAuthority: string;
}

export interface PaymentVerifyDto {
  paymentId: string;
  gatewayAuthority: string;
  status: 'OK' | 'NOK';
}

export interface PaymentVerifyResult {
  isSuccessful: boolean;
  paymentId: string;
  referenceIdRrn?: string;
  cardPanMasked?: string;
  amountTomans: number;
  creditsIssued: number;
  errorMessage?: string;
}

export interface PaymentTransaction {
  id: string;
  authority: string;
  userId: string;
  planId: string;
  amountRials: number;
  status: PaymentStatus;
  provider: string;
  subscriptionId?: string | null;
  referenceIdRrn?: string | null;
  cardPanMasked?: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt?: string | null;
}

export interface MemberPaymentHistoryItem {
  id: string;
  planId: string;
  planTitle: string;
  amountTomans: number;
  amountRials: number;
  status: PaymentStatus;
  provider: string;
  referenceIdRrn?: string | null;
  cardPanMasked?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

