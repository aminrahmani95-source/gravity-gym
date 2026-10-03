import {
  ClassVenueType,
  ClassDifficulty,
  ClassSessionStatus,
  ClassBookingStatus,
  ClassAttendanceStatus,
  CoachPlanStatus,
  CoachPlanUsageAction,
  CoachPayableEntryType,
  CoachVerificationStatus,
} from './enums';

export interface CoachProfile {
  id: string;
  userId: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  specialties: string[];
  sports: string[];
  experienceYears: number;
  verificationStatus: CoachVerificationStatus;
  isActive: boolean;
  shebaNumber?: string | null;
  bankAccountHolder?: string | null;
  contactPhone?: string | null;
  commissionRate: number; // e.g. 0.15 for 15%
  payableBalanceTomans: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassCategory {
  id: string;
  slug: string;
  nameFa: string;
  icon?: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ClassVenue {
  id: string;
  venueType: ClassVenueType;
  gymId?: string | null;
  gymNameFa?: string | null;
  nameFa: string;
  city: string;
  district?: string | null;
  addressFa?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  onlineMeetingUrl?: string | null;
  createdByCoachId?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CoachClass {
  id: string;
  coachId: string;
  coach?: CoachProfile;
  categorySlug: string;
  categoryNameFa?: string;
  title: string;
  description: string;
  difficulty: ClassDifficulty;
  durationMinutes: number;
  defaultCapacity: number;
  venueId: string;
  venue?: ClassVenue;
  singleSessionPriceTomans: number;
  hasMonthlyPlan: boolean;
  cancellationDeadlineHours: number;
  isActive: boolean;
  isPublic: boolean;
  coverImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  upcomingSessionsCount?: number;
  monthlyPlan?: CoachMonthlyPlan | null;
}

export interface ClassSession {
  id: string;
  classId: string;
  classTitle?: string;
  coachId: string;
  coachName?: string;
  venueId: string;
  venueName?: string;
  venueType?: ClassVenueType;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
  capacity: number;
  bookedCount: number;
  availableSeats: number;
  priceTomans: number;
  status: ClassSessionStatus;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachMonthlyPlan {
  id: string;
  coachId: string;
  classId: string;
  classTitle?: string;
  title: string;
  description?: string | null;
  includedSessions: number;
  priceTomans: number;
  validityDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface CoachPlanEnrollment {
  id: string;
  userId: string;
  coachId: string;
  coachName?: string;
  classId: string;
  classTitle?: string;
  planId: string;
  planTitle?: string;
  startsAt: string;
  expiresAt: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  status: CoachPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CoachPlanUsageEntry {
  id: string;
  enrollmentId: string;
  userId: string;
  deltaSessions: number;
  remainingAfter: number;
  actionType: CoachPlanUsageAction;
  referenceBookingId?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface ClassBooking {
  id: string;
  bookingCode: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  sessionId: string;
  session?: ClassSession;
  classId: string;
  classTitle?: string;
  coachId: string;
  coachName?: string;
  venueId: string;
  venueName?: string;
  venueType?: ClassVenueType;
  paymentMethod: 'DIRECT_PAYMENT' | 'MONTHLY_PLAN_QUOTA';
  enrollmentId?: string | null;
  paymentTransactionId?: string | null;
  pricePaidTomans: number;
  gravityCommissionTomans: number;
  coachEarningTomans: number;
  status: ClassBookingStatus;
  attendanceStatus: ClassAttendanceStatus;
  attendedAt?: string | null;
  checkinToken?: string | null;
  qr_token?: string | null;
  seatNumber?: string | null;
  seat_number?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoachPayableLedgerEntry {
  id: string;
  coachId: string;
  deltaAmountTomans: number;
  balanceAfter: number;
  entryType: CoachPayableEntryType;
  referenceId?: string | null;
  description?: string | null;
  createdAt: string;
}

export interface CoachSettlementBatch {
  id: string;
  coachId: string;
  coachName?: string;
  coachSheba?: string;
  cycleStart: string;
  cycleEnd: string;
  totalBookings: number;
  totalGrossTomans: number;
  totalCommissionTomans: number;
  totalNetPayoutTomans: number;
  status: 'PENDING_APPROVAL' | 'APPROVED_FOR_PAYA' | 'PAID' | 'REJECTED';
  bankReferenceRrn?: string | null;
  payaTrackingId?: string | null;
  disbursedAt?: string | null;
  createdAt: string;
}

// DTOs
export interface CreateCoachProfileDto {
  displayName: string;
  bio?: string;
  specialties?: string[];
  sports?: string[];
  experienceYears?: number;
  shebaNumber?: string;
  bankAccountHolder?: string;
  contactPhone?: string;
}

export interface UpdateCoachProfileDto {
  displayName?: string;
  bio?: string;
  specialties?: string[];
  sports?: string[];
  experienceYears?: number;
  shebaNumber?: string;
  bankAccountHolder?: string;
  contactPhone?: string;
  avatarUrl?: string;
}

export interface CreateAdminCoachDto {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  bio?: string;
  specialties?: string[];
  sports?: string[];
  experienceYears?: number;
  shebaNumber?: string;
  bankAccountHolder?: string;
  contactPhone?: string;
  commissionRate?: number;
}

export interface CreateClassCategoryDto {
  slug: string;
  nameFa: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
}

export interface CreateClassVenueDto {
  venueType: ClassVenueType;
  gymId?: string;
  nameFa: string;
  city?: string;
  district?: string;
  addressFa?: string;
  latitude?: number;
  longitude?: number;
  onlineMeetingUrl?: string;
}

export interface CreateClassDto {
  title: string;
  categorySlug: string;
  description: string;
  difficulty?: ClassDifficulty;
  durationMinutes: number;
  defaultCapacity: number;
  venueId: string;
  singleSessionPriceTomans: number;
  hasMonthlyPlan?: boolean;
  cancellationDeadlineHours?: number;
  coverImageUrl?: string;
  isPublic?: boolean;
}

export interface UpdateClassDto {
  title?: string;
  categorySlug?: string;
  description?: string;
  difficulty?: ClassDifficulty;
  durationMinutes?: number;
  defaultCapacity?: number;
  venueId?: string;
  singleSessionPriceTomans?: number;
  hasMonthlyPlan?: boolean;
  cancellationDeadlineHours?: number;
  coverImageUrl?: string;
  isActive?: boolean;
  isPublic?: boolean;
}

export interface CreateClassSessionDto {
  classId: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
  capacity?: number;
  priceTomans?: number;
}

export interface CreateCoachMonthlyPlanDto {
  classId: string;
  title: string;
  description?: string;
  includedSessions: number;
  priceTomans: number;
  validityDays?: number;
}

export interface BookClassSessionDto {
  sessionId: string;
  useMonthlyPlan?: boolean; // if true, consumes 1 session quota from active enrollment
  enrollmentId?: string;
}

export interface ClassDiscoveryFilter {
  category?: string;
  coachId?: string;
  city?: string;
  district?: string;
  date?: string;
  venueType?: ClassVenueType;
  difficulty?: ClassDifficulty;
  maxPrice?: number;
  search?: string;
}
