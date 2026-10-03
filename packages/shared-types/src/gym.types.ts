import { Gender, GymTier, GymAccessMode } from './enums';

export interface Facility {
  id: string;
  nameFa: string;
  slug: string;
  icon?: string;
  isPremium: boolean;
}

export interface GymSans {
  id: string;
  gymId: string;
  dayOfWeek: number; // 0 = Saturday ... 6 = Friday
  gender: Gender;
  startTime: string; // HH:mm:ss
  endTime: string;   // HH:mm:ss
  capacity?: number;
  isPeak: boolean;
}

export interface GymActiveSessionInfo {
  gender: Gender;
  startTime: string;
  endTime: string;
  isPeak: boolean;
  labelFa: string;
}

export interface Gym {
  id: string;
  nameFa: string;
  tier: GymTier;
  accessMode: GymAccessMode;
  city: string;
  district: string;
  addressFa: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  shebaNumber: string;
  bankAccountHolder: string;
  phone?: string;
  descriptionFa?: string;
  images?: string[];
  isActive: boolean;
  facilities?: Facility[];
  sans?: GymSans[];
  activeSession?: GymActiveSessionInfo;
  currentCreditCost?: number;
  distanceKm?: number;
  createdAt: string;
}

export interface CreateGymSansDto {
  dayOfWeek: number;
  gender: Gender;
  startTime: string;
  endTime: string;
  capacity?: number;
  isPeak?: boolean;
}

export interface UpdateGymAccessModeDto {
  accessMode: GymAccessMode;
}

export interface GymBranch {
  id: string;
  gymId: string;
  branchNameFa: string;
  addressFa: string;
  latitude: number;
  longitude: number;
  phone?: string;
  isActive: boolean;
}

export interface CreateGymDto {
  nameFa: string;
  tier: GymTier;
  accessMode?: GymAccessMode;
  city: string;
  district: string;
  addressFa: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters?: number;
  shebaNumber: string;
  bankAccountHolder: string;
  phone?: string;
  descriptionFa?: string;
  images?: string[];
  isActive?: boolean;
}

export interface UpdateGymDto {
  nameFa?: string;
  tier?: GymTier;
  accessMode?: GymAccessMode;
  city?: string;
  district?: string;
  addressFa?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  shebaNumber?: string;
  bankAccountHolder?: string;
  phone?: string;
  descriptionFa?: string;
  images?: string[];
  isActive?: boolean;
}

export interface GymAssignedStaff {
  id: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: string;
}

export interface GymDetailAdminResponse {
  gym: Gym;
  assignedStaff: GymAssignedStaff[];
  totalCheckins: number;
  activeCheckinsToday: number;
  pricingOverride?: {
    targetMarginRatio: number;
    fixedFloorToman: number;
    isDynamicFloorEnabled: boolean;
    customLambdaRatio?: number;
  };
  sans: GymSans[];
  hostedClasses: Array<{
    id: string;
    titleFa: string;
    coachName: string;
    scheduleFa: string;
    pricePerSessionToman: number;
    isActive: boolean;
  }>;
  hasFinancialHistory: boolean;
}

export interface GymRemovalResult {
  success: boolean;
  action: 'DELETED' | 'ARCHIVED';
  message: string;
}

export interface GymDiscoveryQuery {
  city?: string;
  district?: string;
  tier?: GymTier;
  gender?: Gender;
  facilitySlug?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: number;
  limit?: number;
}
