import { Gender, UserRole, UserStatus } from './enums';

export interface User {
  id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  nationalCode?: string;
  gender: Gender;
  avatarUrl?: string;
  role: UserRole;
  assignedGymId?: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileResponse {
  id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  nationalCode?: string;
  gender: Gender;
  avatarUrl?: string;
  role: UserRole;
  assignedGymId?: string;
  status: UserStatus;
  currentCredits: number;
  activeSubscription?: {
    planTitle: string;
    expiresAt: string;
    status: string;
  };
}


export interface SendOtpDto {
  phoneNumber: string;
}

export interface VerifyOtpDto {
  phoneNumber: string;
  code: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfileResponse;
}
