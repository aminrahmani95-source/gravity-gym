import { CheckinStatus, Gender } from './enums';

export interface DynamicQrPayload {
  sub: string;       // user_id
  gymId: string;     // gym_id
  iat: number;       // issued at timestamp (seconds)
  exp: number;       // expiration timestamp (seconds)
  nonce: string;     // cryptographic single-use nonce
  sig: string;       // HMAC-SHA256 signature
}

export interface GenerateQrRequestDto {
  gymId: string;
  clientLat?: number;
  clientLng?: number;
}

export interface GenerateQrResponseDto {
  qrToken: string;
  expiresInSeconds: number;
  expiresAt: string;
}

export interface VerifyCheckinRequestDto {
  qrToken: string;
  terminalId?: string;
}

// Reception counter verification screen (Privacy Compliant: Suppresses National ID & Phone)
export interface ReceptionVerificationResult {
  status: 'APPROVED' | 'REJECTED';
  checkinId?: string;
  rejectionReason?: string;
  rejectionCode?: string;
  member?: {
    userId: string;
    fullName: string;
    gender: Gender;
    avatarUrl?: string;
    subscriptionTitle: string;
    monthlyVisitsAtThisClub: number;
    maxMonthlyCap: number;
  };
  visitDetails?: {
    gymName: string;
    creditsDebited: number;
    checkinTime: string;
  };
}

export interface CheckinRecord {
  id: string;
  userId: string;
  gymId: string;
  staffUserId?: string;
  creditsDebited: number;
  monetaryPayoutTomans: number;
  status: CheckinStatus;
  rejectionReason?: string;
  clientLat?: number;
  clientLng?: number;
  createdAt: string;
}

export interface MemberCheckinHistoryItem {
  id: string;
  gymId: string;
  gymName: string;
  gymTier: string;
  creditsDebited: number;
  status: CheckinStatus;
  createdAt: string;
}

