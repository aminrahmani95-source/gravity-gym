import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from '../src/common/database/database.service';
import { CoachesService } from '../src/modules/coaches/coaches.service';
import { ClassesService } from '../src/modules/classes/classes.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { PlansService } from '../src/modules/plans/plans.service';
import {
  CoachVerificationStatus,
  ClassVenueType,
  ClassDifficulty,
  ClassSessionStatus,
  ClassBookingStatus,
  ClassAttendanceStatus,
  CoachPlanStatus,
  CoachPlanUsageAction,
  CoachPayableEntryType,
  PaymentPurpose,
  PaymentStatus,
  UserRole,
} from '@gym-app/shared-types';

describe('Coach Classes Domain — Single Session & Monthly Plan Engine', () => {
  let db: DatabaseService;
  let coachesService: CoachesService;
  let classesService: ClassesService;
  let paymentsService: PaymentsService;
  let ledgerService: LedgerService;
  let plansService: PlansService;

  const testCoachUserId = 'usr-coach-001';
  const testMemberUserId = 'usr-member-001';
  const testMemberUserId2 = 'usr-member-002';
  const testAdminUserId = 'usr-admin-001';

  beforeEach(async () => {
    db = new DatabaseService();
    await db.onModuleInit();
    ledgerService = new LedgerService(db);
    plansService = new PlansService(db);
    coachesService = new CoachesService(db);
    classesService = new ClassesService(db, coachesService);
    paymentsService = new PaymentsService(
      db,
      ledgerService,
      plansService,
      undefined,
      undefined,
      classesService,
    );

    // Setup base users
    db.getTable('users').push(
      {
        id: testCoachUserId,
        phone: '09121112233',
        role: UserRole.USER,
        full_name: 'آرش توانگر',
        national_code: '0012345678',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: testMemberUserId,
        phone: '09124445566',
        role: UserRole.USER,
        full_name: 'سارا راد',
        national_code: '0087654321',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: testMemberUserId2,
        phone: '09127778899',
        role: UserRole.USER,
        full_name: 'امید نوری',
        national_code: '0098765432',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: testAdminUserId,
        phone: '09120000001',
        role: UserRole.ADMIN,
        full_name: 'مدیر کل سیستم',
        national_code: '0011223344',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
  });

  describe('1. Coach Profile Lifecycle & Verification', () => {
    it('creates coach profile in PENDING status without self-privilege escalation', async () => {
      const coach = await coachesService.applyForCoach(testCoachUserId, {
        displayName: 'استاد آرش توانگر',
        bio: 'مربی رسمی فانکشنال و تی‌آر‌ایکس',
        specialties: ['TRX', 'Functional Training'],
        sports: ['FITNESS'],
        experienceYears: 8,
        shebaNumber: 'IR120170000000123456789012',
        bankAccountHolder: 'آرش توانگر',
      });

      expect(coach).toBeDefined();
      expect(coach.displayName).toBe('استاد آرش توانگر');
      expect(coach.verificationStatus).toBe(CoachVerificationStatus.PENDING);
      expect(coach.isActive).toBe(false);

      // Verify user NOT escalated: role remains USER
      const user = db.getTable('users').find(u => u.id === testCoachUserId);
      expect(user.role).toBe(UserRole.USER);

      // Verify unverified applicant cannot publish classes
      await expect(
        classesService.createClass(testCoachUserId, {
          title: 'تست کلاس غیرمجاز',
          categorySlug: 'fitness',
          description: 'توضیحات کلاس تستی',
          durationMinutes: 60,
          defaultCapacity: 10,
          venueId: 'v-1',
          singleSessionPriceTomans: 100000,
        }),
      ).rejects.toThrow('درخواست مربیگری شما در انتظار بررسی و تأیید تیم مدیریت است.');
    });

    it('admin verifies coach, sets commission, and promotes user role to COACH', async () => {
      const coach = await coachesService.applyForCoach(testCoachUserId, {
        displayName: 'استاد آرش توانگر',
      });

      const verified = await coachesService.verifyCoach(
        testAdminUserId,
        coach.id,
        CoachVerificationStatus.VERIFIED,
        0.12, // 12% commission
      );

      expect(verified.verificationStatus).toBe(CoachVerificationStatus.VERIFIED);
      expect(verified.commissionRate).toBe(0.12);
      expect(verified.isActive).toBe(true);

      // Verify user promoted to COACH
      const user = db.getTable('users').find(u => u.id === testCoachUserId);
      expect(user.role).toBe(UserRole.COACH);
    });

    it('admin suspends coach and demotes user role back to USER', async () => {
      const coach = await coachesService.applyForCoach(testCoachUserId, {
        displayName: 'استاد آرش توانگر',
      });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED);

      // Suspend coach
      const suspended = await coachesService.verifyCoach(
        testAdminUserId,
        coach.id,
        CoachVerificationStatus.SUSPENDED,
      );

      expect(suspended.verificationStatus).toBe(CoachVerificationStatus.SUSPENDED);
      expect(suspended.isActive).toBe(false);

      const user = db.getTable('users').find(u => u.id === testCoachUserId);
      expect(user.role).toBe(UserRole.USER);
    });
  });

  describe('2. Class & Session Publishing', () => {
    it('verified coach publishes a class and schedules sessions', async () => {
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, {
        displayName: 'آرش توانگر',
      });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED);

      const venue = await classesService.createVenue(coach.id, {
        nameFa: 'باشگاه مستقل اکسیژن نیاوران',
        venueType: ClassVenueType.EXTERNAL_GYM,
        city: 'تهران',
        district: 'نیاوران',
        addressFa: 'خیابان باهنر، پلاک ۱۰',
      });

      const coachClass = await classesService.createClass(testCoachUserId, {
        title: 'تمرینات فانکشنال پیشرفته و چربی‌سوزی',
        categorySlug: 'fitness',
        description: 'کلاس تخصصی با استانداردهای بین‌المللی',
        difficulty: ClassDifficulty.INTERMEDIATE,
        durationMinutes: 75,
        defaultCapacity: 2, // Low capacity to test limits
        venueId: venue.id,
        singleSessionPriceTomans: 350000,
        hasMonthlyPlan: true,
        cancellationDeadlineHours: 2,
      });

      expect(coachClass.id).toBeDefined();
      expect(coachClass.singleSessionPriceTomans).toBe(350000);

      // Schedule session
      const session = await classesService.createSession(testCoachUserId, {
        classId: coachClass.id,
        sessionDate: '2026-10-15',
        startTime: '18:00:00',
        endTime: '19:15:00',
        capacity: 2,
        priceTomans: 350000,
      });

      expect(session.id).toBeDefined();
      expect(session.status).toBe(ClassSessionStatus.SCHEDULED);
      expect(session.bookedCount).toBe(0);
      expect(session.availableSeats).toBe(2);
    });
  });

  describe('3. Single Session Discovery & Payment Flow', () => {
    it('member discovers, checks out, and books a single session with coach earning split', async () => {
      // Setup verified coach, venue, class, session
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, {
        displayName: 'مونا راد',
      });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED, 0.15); // 15% commission

      const venue = await classesService.createVenue(coach.id, {
        nameFa: 'استودیو پیلاتس آرامش',
        venueType: ClassVenueType.INDEPENDENT_VENUE,
      });

      const coachClass = await classesService.createClass(testCoachUserId, {
        title: 'پیلاتس ریفورمر تخصصی',
        categorySlug: 'pilates-yoga',
        description: 'تمرین با دستگاه ریفورمر',
        durationMinutes: 60,
        defaultCapacity: 10,
        venueId: venue.id,
        singleSessionPriceTomans: 400000,
      });

      const session = await classesService.createSession(testCoachUserId, {
        classId: coachClass.id,
        sessionDate: '2026-10-20',
        startTime: '10:00:00',
        endTime: '11:00:00',
        capacity: 5,
        priceTomans: 400000,
      });

      // 1. Member initiates single session checkout
      const checkoutRes = await paymentsService.initiateClassCheckout(
        testMemberUserId,
        PaymentPurpose.CLASS_SINGLE_SESSION,
        session.id,
      );

      expect(checkoutRes.gatewayAuthority).toBeDefined();
      expect(checkoutRes.amountTomans).toBe(400000);
      expect(checkoutRes.amountRials).toBe(4000000);

      // 2. Member verifies payment callback
      const verifyRes = await paymentsService.verifyClassPayment(
        testMemberUserId,
        checkoutRes.gatewayAuthority,
        'OK',
      );

      expect(verifyRes.isSuccessful).toBe(true);

      // 3. Verify session booked count incremented
      const updatedSession = await classesService.getSessionById(session.id);
      expect(updatedSession.bookedCount).toBe(1);
      expect(updatedSession.availableSeats).toBe(4);

      // 4. Verify booking record
      const bookings = await classesService.getUserBookings(testMemberUserId);
      expect(bookings.length).toBe(1);
      const booking = bookings[0];
      expect(booking.status).toBe(ClassBookingStatus.CONFIRMED);
      expect(booking.checkinToken).toContain('QRC_');
      expect(booking.pricePaidTomans).toBe(400000);
      expect(booking.gravityCommissionTomans).toBe(60000); // 15% of 400,000
      expect(booking.coachEarningTomans).toBe(340000); // 85% of 400,000

      // 5. Verify Coach Payable Ledger & Balance
      const coachProfile = await coachesService.getById(coach.id);
      expect(coachProfile.payableBalanceTomans).toBe(340000);

      // 6. Verify Idempotent callback re-run
      const idempotentRes = await paymentsService.verifyClassPayment(
        testMemberUserId,
        checkoutRes.gatewayAuthority,
        'OK',
      );
      expect(idempotentRes.isSuccessful).toBe(true);
      const recheckedSession = await classesService.getSessionById(session.id);
      expect(recheckedSession.bookedCount).toBe(1); // Not incremented twice
    });

    it('enforces seat capacity and strictly rejects overbooking', async () => {
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, { displayName: 'مربی نوید' });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED);
      const venue = await classesService.createVenue(coach.id, { nameFa: 'باکس کراس‌فیت' });
      const cls = await classesService.createClass(testCoachUserId, {
        title: 'کراس‌فیت فشرده',
        categorySlug: 'crossfit',
        description: 'تمرین استقامتی',
        durationMinutes: 60,
        defaultCapacity: 1, // Only 1 seat!
        venueId: venue.id,
        singleSessionPriceTomans: 200000,
      });

      const session = await classesService.createSession(testCoachUserId, {
        classId: cls.id,
        sessionDate: '2026-10-25',
        startTime: '17:00:00',
        endTime: '18:00:00',
        capacity: 1,
        priceTomans: 200000,
      });

      // Member 1 books the only seat
      await classesService.completeSingleSessionBooking(testMemberUserId, session.id, 'tx-1', 200000);

      const fullSession = await classesService.getSessionById(session.id);
      expect(fullSession.bookedCount).toBe(1);
      expect(fullSession.availableSeats).toBe(0);

      // Member 2 tries to book the full session -> REJECTED
      await expect(
        classesService.completeSingleSessionBooking(testMemberUserId2, session.id, 'tx-2', 200000),
      ).rejects.toThrow('ظرفیت این جلسه تکمیل شده است');
    });
  });

  describe('4. Coach Monthly Plan — Funnel & Quota Ledger Engine', () => {
    it('member purchases coach monthly plan and reserves sessions using quota', async () => {
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, { displayName: 'آرش توانگر' });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED, 0.20); // 20% commission
      const venue = await classesService.createVenue(coach.id, { nameFa: 'سالن گراویتی زعفرانیه' });
      const cls = await classesService.createClass(testCoachUserId, {
        title: 'تی‌آر‌ایکس بالاتنه',
        categorySlug: 'fitness',
        description: 'تمرین عضلات بالاتنه',
        durationMinutes: 60,
        defaultCapacity: 10,
        venueId: venue.id,
        singleSessionPriceTomans: 300000,
        hasMonthlyPlan: true,
      });

      // Coach creates monthly plan: 8 sessions for 2,000,000 Tomans (discounted vs 2,400,000 single sessions)
      const monthlyPlan = await classesService.createMonthlyPlan(testCoachUserId, {
        classId: cls.id,
        title: 'بسته طلایی ماهانه ۸ جلسه',
        includedSessions: 8,
        priceTomans: 2000000,
        validityDays: 30,
      });

      expect(monthlyPlan.includedSessions).toBe(8);
      expect(monthlyPlan.priceTomans).toBe(2000000);

      // 1. Member buys the Monthly Plan
      const checkoutRes = await paymentsService.initiateClassCheckout(
        testMemberUserId,
        PaymentPurpose.COACH_MONTHLY_PLAN,
        monthlyPlan.id,
      );

      await paymentsService.verifyClassPayment(testMemberUserId, checkoutRes.gatewayAuthority, 'OK');

      // Check member's active enrollment
      const enrollments = await classesService.getUserEnrollments(testMemberUserId);
      expect(enrollments.length).toBe(1);
      const enrollment = enrollments[0];
      expect(enrollment.totalSessions).toBe(8);
      expect(enrollment.remainingSessions).toBe(8);
      expect(enrollment.usedSessions).toBe(0);
      expect(enrollment.status).toBe(CoachPlanStatus.ACTIVE);

      // Verify Coach earned 80% (1,600,000 Tomans)
      const coachFin = await coachesService.getById(coach.id);
      expect(coachFin.payableBalanceTomans).toBe(1600000);

      // Verify quota usage ledger logged initial purchase
      const ledgerTable = db.getTable('coach_plan_usage_ledger');
      expect(ledgerTable.length).toBe(1);
      expect(ledgerTable[0].action_type).toBe(CoachPlanUsageAction.PURCHASE_INITIAL);
      expect(ledgerTable[0].delta_sessions).toBe(8);

      // 2. Member reserves a session using their active plan quota
      const session1 = await classesService.createSession(testCoachUserId, {
        classId: cls.id,
        sessionDate: '2026-10-18',
        startTime: '19:00:00',
        endTime: '20:00:00',
        capacity: 5,
        priceTomans: 300000,
      });

      const booking = await classesService.bookSessionUsingMonthlyPlan(
        testMemberUserId,
        session1.id,
        enrollment.id,
      );

      expect(booking.status).toBe(ClassBookingStatus.CONFIRMED);
      expect(booking.paymentMethod).toBe('MONTHLY_PLAN_QUOTA');
      expect(booking.pricePaidTomans).toBe(0); // Quota consumption, no direct charge

      // Verify enrollment remaining quota decremented to 7
      const updatedEnrollment = (await classesService.getUserEnrollments(testMemberUserId))[0];
      expect(updatedEnrollment.remainingSessions).toBe(7);
      expect(updatedEnrollment.usedSessions).toBe(1);

      // Verify session booked count incremented
      const updatedSession1 = await classesService.getSessionById(session1.id);
      expect(updatedSession1.bookedCount).toBe(1);

      // Verify quota ledger recorded session booking
      expect(ledgerTable.length).toBe(2);
      expect(ledgerTable[1].action_type).toBe(CoachPlanUsageAction.SESSION_BOOKING);
      expect(ledgerTable[1].delta_sessions).toBe(-1);
      expect(ledgerTable[1].remaining_after).toBe(7);

      // 3. User cancels quota booking -> Quota restored back to 8!
      await classesService.cancelBooking(testMemberUserId, booking.id, 'جابجایی برنامه');

      const restoredEnrollment = (await classesService.getUserEnrollments(testMemberUserId))[0];
      expect(restoredEnrollment.remainingSessions).toBe(8);
      expect(restoredEnrollment.usedSessions).toBe(0);

      const restoredSession = await classesService.getSessionById(session1.id);
      expect(restoredSession.bookedCount).toBe(0);

      expect(ledgerTable.length).toBe(3);
      expect(ledgerTable[2].action_type).toBe(CoachPlanUsageAction.CANCELLATION_RESTORE);
      expect(ledgerTable[2].delta_sessions).toBe(1);
    });

    it('rejects quota booking when plan is exhausted', async () => {
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, { displayName: 'مربی آرش' });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED);
      const venue = await classesService.createVenue(coach.id, { nameFa: 'سالن تمرین' });
      const cls = await classesService.createClass(testCoachUserId, {
        title: 'کلاس تک جلسه‌ای امتحانی',
        categorySlug: 'fitness',
        description: 'تمرین آزمایشی',
        durationMinutes: 60,
        defaultCapacity: 5,
        venueId: venue.id,
        singleSessionPriceTomans: 100000,
        hasMonthlyPlan: true,
      });

      const plan = await classesService.createMonthlyPlan(testCoachUserId, {
        classId: cls.id,
        title: 'بسته ۱ جلسه‌ای',
        includedSessions: 1, // Only 1 session!
        priceTomans: 90000,
      });

      const enrollment = await classesService.completeCoachPlanEnrollment(testMemberUserId, plan.id, 'tx-plan', 90000);

      const s1 = await classesService.createSession(testCoachUserId, {
        classId: cls.id,
        sessionDate: '2026-10-18',
        startTime: '10:00:00',
        endTime: '11:00:00',
        capacity: 5,
      });

      const s2 = await classesService.createSession(testCoachUserId, {
        classId: cls.id,
        sessionDate: '2026-10-19',
        startTime: '10:00:00',
        endTime: '11:00:00',
        capacity: 5,
      });

      // Use the only session quota
      await classesService.bookSessionUsingMonthlyPlan(testMemberUserId, s1.id, enrollment.id);

      // Second booking attempt must fail
      await expect(
        classesService.bookSessionUsingMonthlyPlan(testMemberUserId, s2.id, enrollment.id),
      ).rejects.toThrow('سهمیه جلسات باقی‌مانده این اشتراک به پایان رسیده است');
    });
  });

  describe('5. Reception / Venue QR Check-in', () => {
    it('verifies class entry QR code and marks attendance with replay protection', async () => {
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, { displayName: 'آرش' });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED);
      const venue = await classesService.createVenue(coach.id, { nameFa: 'باشگاه مرکزی' });
      const cls = await classesService.createClass(testCoachUserId, {
        title: 'کلاس کراس‌فیت',
        categorySlug: 'crossfit',
        description: 'شرح',
        durationMinutes: 60,
        defaultCapacity: 5,
        venueId: venue.id,
        singleSessionPriceTomans: 250000,
      });
      const session = await classesService.createSession(testCoachUserId, {
        classId: cls.id,
        sessionDate: '2026-10-21',
        startTime: '18:00:00',
        endTime: '19:00:00',
        capacity: 5,
      });

      const booking = await classesService.completeSingleSessionBooking(testMemberUserId, session.id, 'tx-qr', 250000);
      expect(booking.checkinToken).toBeDefined();

      // Check-in via QR
      const checkinResult = await classesService.verifyClassQrToken(booking.checkinToken!);
      expect(checkinResult.isValid).toBe(true);
      expect(checkinResult.userName).toBe('سارا راد');
      expect(checkinResult.attendanceStatus).toBe(ClassAttendanceStatus.ATTENDED);

      // Re-scan is idempotent
      const checkinResult2 = await classesService.verifyClassQrToken(booking.checkinToken!);
      expect(checkinResult2.isValid).toBe(true);
    });
  });

  describe('6. Coach Financial Overview, Ledger & Paya Settlement', () => {
    it('tracks coach earnings, generates settlement batch, and disburses via Paya', async () => {
      const coach = await coachesService.createOrUpdateProfile(testCoachUserId, {
        displayName: 'آرش توانگر',
        shebaNumber: 'IR980120000000012345678901',
      });
      await coachesService.verifyCoach(testAdminUserId, coach.id, CoachVerificationStatus.VERIFIED, 0.10); // 10% commission

      const venue = await classesService.createVenue(coach.id, { nameFa: 'سالن ۱' });
      const cls = await classesService.createClass(testCoachUserId, {
        title: 'کلاس بوکس',
        categorySlug: 'boxing',
        description: 'تمرین تکنیک',
        durationMinutes: 60,
        defaultCapacity: 10,
        venueId: venue.id,
        singleSessionPriceTomans: 500000,
      });
      const session = await classesService.createSession(testCoachUserId, {
        classId: cls.id,
        sessionDate: '2026-10-22',
        startTime: '16:00:00',
        endTime: '17:00:00',
        capacity: 10,
      });

      // 2 members book the session: 2 x 500,000 = 1,000,000 Tomans
      await classesService.completeSingleSessionBooking(testMemberUserId, session.id, 'tx-box-1', 500000);
      await classesService.completeSingleSessionBooking(testMemberUserId2, session.id, 'tx-box-2', 500000);

      // Total gross: 1,000,000 | Commission (10%): 100,000 | Net Earned: 900,000 Tomans
      const fin = await coachesService.getFinancialOverview(coach.id);
      expect(fin.totalGrossSalesTomans).toBe(1000000);
      expect(fin.totalCommissionTomans).toBe(1000000 * 0.10);
      expect(fin.totalNetEarnedTomans).toBe(900000);
      expect(fin.payableBalanceTomans).toBe(900000);

      // Admin generates settlement batch
      const today = new Date().toISOString().split('T')[0];
      const batch = await coachesService.generateSettlementBatch(coach.id, today, today);
      expect(batch.totalGrossTomans).toBe(1000000);
      expect(batch.totalNetPayoutTomans).toBe(900000);
      expect(batch.status).toBe('PENDING_APPROVAL');

      // Admin disburses settlement via Paya
      const disbursed = await coachesService.approveAndDisburseSettlement(
        batch.id,
        testAdminUserId,
        'RRN_PAYA_998877',
        'TRK_PAYA_112233',
      );

      expect(disbursed.status).toBe('PAID');
      expect(disbursed.bankReferenceRrn).toBe('RRN_PAYA_998877');

      // Coach payable balance must now be 0
      const updatedCoach = await coachesService.getById(coach.id);
      expect(updatedCoach.payableBalanceTomans).toBe(0);
    });
  });
});
