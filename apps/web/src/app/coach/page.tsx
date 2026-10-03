'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/auth-context';
import {
  CoachProfile,
  CoachClass,
  ClassSession,
  ClassCategory,
  ClassVenue,
  ClassVenueType,
  ClassDifficulty,
  CreateClassDto,
  CreateClassSessionDto,
  CreateCoachMonthlyPlanDto,
  CreateCoachProfileDto,
  ClassAttendanceStatus,
} from '@gym-app/shared-types';
import {
  Dumbbell,
  Calendar,
  DollarSign,
  TrendingUp,
  Award,
  Plus,
  Users,
  Clock,
  MapPin,
  CheckCircle,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ChevronLeft,
  X,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { toPersianDigits, formatTomans } from '../../lib/formatters';

export default function CoachDashboardPage() {
  const { user, openLoginModal } = useAuth();

  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [financials, setFinancials] = useState<any>(null);
  const [classes, setClasses] = useState<CoachClass[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [categories, setCategories] = useState<ClassCategory[]>([]);
  const [venues, setVenues] = useState<ClassVenue[]>([]);
  const [activeTab, setActiveTab] = useState<'classes' | 'sessions' | 'plans' | 'financials'>('classes');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRosterSession, setSelectedRosterSession] = useState<{ id: string; title: string } | null>(null);
  const [rosterAttendees, setRosterAttendees] = useState<any[]>([]);

  // Modals state
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);

  // Forms state
  const [newClassForm, setNewClassForm] = useState<Partial<CreateClassDto>>({
    title: '',
    categorySlug: 'fitness',
    description: '',
    difficulty: ClassDifficulty.ALL_LEVELS,
    durationMinutes: 60,
    defaultCapacity: 12,
    singleSessionPriceTomans: 300000,
    hasMonthlyPlan: true,
    cancellationDeadlineHours: 2,
  });

  const [newSessionForm, setNewSessionForm] = useState<{
    classId: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    capacity: number;
    priceTomans?: number;
  }>({
    classId: '',
    sessionDate: new Date().toISOString().split('T')[0],
    startTime: '18:00',
    endTime: '19:15',
    capacity: 12,
  });

  const [newPlanForm, setNewPlanForm] = useState<Partial<CreateCoachMonthlyPlanDto>>({
    classId: '',
    title: 'بسته ماهانه ۸ جلسه',
    includedSessions: 8,
    priceTomans: 2000000,
    validityDays: 30,
  });

  const [registrationForm, setRegistrationForm] = useState<CreateCoachProfileDto>({
    displayName: '',
    bio: '',
    specialties: ['فیتنس', 'تی‌آر‌ایکس'],
    sports: ['بدنسازی'],
    experienceYears: 5,
    shebaNumber: '',
    bankAccountHolder: '',
    contactPhone: '',
  });

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    loadCoachData();
  }, [user]);

  async function loadCoachData() {
    setIsLoading(true);
    try {
      const [profileRes, catRes, vRes] = await Promise.all([
        apiFetch<CoachProfile>('/coaches/me').catch(() => null),
        apiFetch<ClassCategory[]>('/classes/categories').catch(() => []),
        apiFetch<ClassVenue[]>('/classes/venues').catch(() => []),
      ]);

      setCoachProfile(profileRes);
      setCategories(catRes || []);
      setVenues(vRes || []);

      if (profileRes) {
        const [finRes, clsRes, sRes] = await Promise.all([
          apiFetch<any>('/coaches/me/financials').catch(() => null),
          apiFetch<CoachClass[]>('/classes/coach/my-classes').catch(() => []),
          apiFetch<ClassSession[]>('/classes/coach/my-sessions').catch(() => []),
        ]);
        setFinancials(finRes);
        setClasses(clsRes || []);
        setSessions(sRes || []);
        if (clsRes && clsRes.length > 0) {
          setNewSessionForm((prev) => ({ ...prev, classId: clsRes[0].id }));
          setNewPlanForm((prev) => ({ ...prev, classId: clsRes[0].id }));
        }
      }
    } catch (err) {
      console.error('Failed to load coach dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  }

  // Handle Coach Application
  const handleRegisterCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/coaches/apply', {
        method: 'POST',
        body: JSON.stringify(registrationForm),
      });
      alert('درخواست عضویت شما در جمع مربیان گراویتی با موفقیت ثبت شد و در صف بررسی مدیریت قرار گرفت.');
      await loadCoachData();
    } catch (err: any) {
      alert(err.message || 'خطا در ثبت درخواست مربیگری');
    }
  };

  // Handle Create Class
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassForm.venueId && venues.length > 0) {
      newClassForm.venueId = venues[0].id;
    }
    try {
      await apiFetch('/classes', {
        method: 'POST',
        body: JSON.stringify(newClassForm),
      });
      setShowCreateClassModal(false);
      await loadCoachData();
      alert('کلاس جدید با موفقیت ایجاد شد!');
    } catch (err: any) {
      alert(err.message || 'خطا در ایجاد کلاس');
    }
  };

  // Handle Create Session
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/classes/${newSessionForm.classId}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          sessionDate: newSessionForm.sessionDate,
          startTime: newSessionForm.startTime.includes(':') && newSessionForm.startTime.split(':').length === 2 ? `${newSessionForm.startTime}:00` : newSessionForm.startTime,
          endTime: newSessionForm.endTime.includes(':') && newSessionForm.endTime.split(':').length === 2 ? `${newSessionForm.endTime}:00` : newSessionForm.endTime,
          capacity: Number(newSessionForm.capacity),
          priceTomans: newSessionForm.priceTomans,
        }),
      });
      setShowCreateSessionModal(false);
      await loadCoachData();
      alert('جلسه تمرین جدید با موفقیت برنامه‌ریزی شد!');
    } catch (err: any) {
      alert(err.message || 'خطا در تعریف جلسه');
    }
  };

  // Handle Create Monthly Plan
  const handleCreateMonthlyPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch(`/classes/${newPlanForm.classId}/plans`, {
        method: 'POST',
        body: JSON.stringify({
          title: newPlanForm.title,
          includedSessions: Number(newPlanForm.includedSessions),
          priceTomans: Number(newPlanForm.priceTomans),
          validityDays: Number(newPlanForm.validityDays || 30),
        }),
      });
      setShowCreatePlanModal(false);
      await loadCoachData();
      alert('بسته ماهانه مربی برای کلاس با موفقیت تعریف شد!');
    } catch (err: any) {
      alert(err.message || 'خطا در تعریف بسته ماهانه');
    }
  };

  // View Roster Attendees
  const handleViewRoster = async (sessionId: string, classTitle: string) => {
    setSelectedRosterSession({ id: sessionId, title: classTitle });
    try {
      const attendees = await apiFetch<any[]>(`/classes/sessions/${sessionId}/attendees`);
      setRosterAttendees(attendees || []);
    } catch (err: any) {
      alert(err.message || 'خطا در دریافت لیست حاضرین');
    }
  };

  // Mark Attendance
  const handleMarkAttendance = async (bookingId: string, status: ClassAttendanceStatus) => {
    try {
      await apiFetch(`/classes/bookings/${bookingId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (selectedRosterSession) {
        const attendees = await apiFetch<any[]>(`/classes/sessions/${selectedRosterSession.id}/attendees`);
        setRosterAttendees(attendees || []);
      }
    } catch (err: any) {
      alert(err.message || 'خطا در ثبت حضور و غیاب');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center p-6 text-center">
        <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-8 max-w-md space-y-4">
          <Dumbbell className="w-12 h-12 text-[#C8F500] mx-auto" />
          <h2 className="text-xl font-black text-[#F4F5F2]">ورود به پنل مربیان گراویتی</h2>
          <p className="text-xs text-[#9CA3A8]">
            برای مشاهده داشبورد، مدیریت جلسات و بررسی درآمد خود، ابتدا وارد سیستم شوید.
          </p>
          <Button onClick={() => openLoginModal()} variant="primary" className="w-full">
            ورود به سیستم
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-[#C8F500]/20 border-t-[#C8F500] animate-spin" />
      </div>
    );
  }

  // Not yet registered as coach -> Registration Screen
  if (!coachProfile) {
    return (
      <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-10 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-[#C8F500]/10 border border-[#C8F500]/30 text-[#C8F500] mb-2">
              <Award className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-[#F4F5F2]">ثبت‌نام مربی مستقل در گراویتی</h1>
            <p className="text-xs text-[#9CA3A8] max-w-md mx-auto">
              کلاس‌های ورزشی خود را در باشگاه‌های گراویتی، باشگاه‌های همکار یا استودیوهای شخصی خود تعریف کنید و بدون واسطه درآمد کسب کنید.
            </p>
          </div>

          <form onSubmit={handleRegisterCoach} className="space-y-4 text-xs">
            <div>
              <label className="block text-[#9CA3A8] mb-1 font-semibold">نام و نام خانوادگی مربی:</label>
              <input
                type="text"
                required
                value={registrationForm.displayName}
                onChange={(e) => setRegistrationForm({ ...registrationForm, displayName: e.target.value })}
                placeholder="مثال: آرش توانگر"
                className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-4 py-2.5 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#9CA3A8] mb-1 font-semibold">سابقه مربیگری (سال):</label>
              <input
                type="number"
                min="1"
                value={registrationForm.experienceYears}
                onChange={(e) => setRegistrationForm({ ...registrationForm, experienceYears: Number(e.target.value) })}
                className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-4 py-2.5 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#9CA3A8] mb-1 font-semibold">شماره شبا (جهت واریز پایا تسویه‌حساب‌ها):</label>
              <input
                type="text"
                required
                placeholder="IR..."
                value={registrationForm.shebaNumber}
                onChange={(e) => setRegistrationForm({ ...registrationForm, shebaNumber: e.target.value })}
                className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-4 py-2.5 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[#9CA3A8] mb-1 font-semibold">نام صاحب حساب بانکی:</label>
              <input
                type="text"
                required
                value={registrationForm.bankAccountHolder}
                onChange={(e) => setRegistrationForm({ ...registrationForm, bankAccountHolder: e.target.value })}
                className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-4 py-2.5 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[#9CA3A8] mb-1 font-semibold">بیوگرافی و مدارک مربیگری:</label>
              <textarea
                rows={3}
                value={registrationForm.bio}
                onChange={(e) => setRegistrationForm({ ...registrationForm, bio: e.target.value })}
                placeholder="مدارک، تجارب و سبک تمرینی خود را شرح دهید..."
                className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-4 py-2.5 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none resize-none"
              />
            </div>

            <Button type="submit" variant="primary" className="w-full py-3 font-black text-xs">
              ارسال درخواست عضویت مربیگری
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Pending Verification Screen
  if (coachProfile.verificationStatus === 'PENDING') {
    return (
      <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto rounded-3xl border border-[#272B30] bg-[#15181B] p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              در انتظار بررسی و تأیید تیم مدیریت
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#F4F5F2]">
              درخواست مربیگری شما ثبت شد
            </h2>
            <p className="text-xs text-[#9CA3A8] max-w-lg mx-auto leading-relaxed">
              اطلاعات ارسالی شما شامل مدارک مربیگری و حساب بانکی در صف ارزیابی کارشناسان گراویتی قرار دارد. پس از تأیید نهایی، دسترسی شما به پنل مربیان و ابزارهای تعریف کلاس و سانس‌های ورزشی فعال خواهد شد.
            </p>
          </div>

          <div className="rounded-2xl border border-[#272B30] bg-[#111417] p-5 text-right space-y-3 text-xs">
            <h3 className="font-bold text-[#F4F5F2] border-b border-[#272B30] pb-2">
              خلاصه اطلاعات پرونده مربیگری
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[#9CA3A8]">
              <div>
                <span className="block text-[#6C757D] text-[11px]">نام مربی:</span>
                <span className="font-semibold text-[#F4F5F2]">{coachProfile.displayName}</span>
              </div>
              <div>
                <span className="block text-[#6C757D] text-[11px]">سابقه مربیگری:</span>
                <span className="font-semibold text-[#F4F5F2]">{toPersianDigits(coachProfile.experienceYears || 0)} سال</span>
              </div>
              <div>
                <span className="block text-[#6C757D] text-[11px]">رشته‌های ورزشی:</span>
                <span className="font-semibold text-[#F4F5F2]">{coachProfile.sports?.join('، ') || 'بدنسازی'}</span>
              </div>
              <div>
                <span className="block text-[#6C757D] text-[11px]">شماره شبا ثبت‌شده:</span>
                <span className="font-mono text-left dir-ltr block text-[#F4F5F2]">{coachProfile.shebaNumber || 'ثبت نشده'}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-[#272B30] hover:bg-[#353B41] text-[#F4F5F2] text-xs font-semibold px-5 py-2.5 transition-all"
            >
              بازگشت به صفحه اصلی
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Suspended or Rejected Screen
  if (coachProfile.verificationStatus === 'REJECTED' || coachProfile.verificationStatus === 'SUSPENDED' || !coachProfile.isActive) {
    const isSuspended = coachProfile.verificationStatus === 'SUSPENDED' || !coachProfile.isActive;
    return (
      <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto rounded-3xl border border-red-500/20 bg-[#15181B] p-8 space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
              {isSuspended ? 'حساب مربیگری موقتاً غیرفعال است' : 'درخواست مربیگری رد شده است'}
            </span>
            <h2 className="text-xl font-black text-[#F4F5F2]">
              {isSuspended ? 'تعلیق فعالیت مربیگری' : 'عدم تأیید مدارک مربیگری'}
            </h2>
            <p className="text-xs text-[#9CA3A8] leading-relaxed">
              {isSuspended
                ? 'پروفایل مربیگری شما توسط مدیریت به حالت تعلیق درآمده است. دسترسی به ابزارهای تعریف سانس و کلاس مسدود می‌باشد. جهت رفع تعلیق با پشتیبانی گراویتی تماس حاصل فرمایید.'
                : 'متأسفانه مدارک یا مشخصات ارسالی شما برای مربیگری مستقل مورد تأیید قرار نگرفت. برای اطلاعات تکمیلی با واحد پشتیبانی تماس بگیرید.'}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#272B30] hover:bg-[#353B41] text-[#F4F5F2] text-xs font-semibold px-5 py-2.5 transition-all"
          >
            بازگشت به صفحه اصلی
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] pb-24">
      {/* Top Banner */}
      <section className="border-b border-[#272B30] bg-[#111417]/80 backdrop-blur-md pt-8 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#272B30] border border-[#353B41] flex items-center justify-center font-black text-xl text-[#C8F500]">
                {coachProfile.displayName.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-[#F4F5F2]">
                    داشبورد مربی: {coachProfile.displayName}
                  </h1>
                  {coachProfile.verificationStatus === 'VERIFIED' ? (
                    <Badge variant="tier-elite" size="sm" className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> تأییدشده
                    </Badge>
                  ) : (
                    <Badge variant="warning" size="sm">در انتظار بررسی</Badge>
                  )}
                </div>
                <span className="text-xs text-[#9CA3A8] mt-1 block">
                  نرخ کارمزد گراویتی: {toPersianDigits(Math.round(coachProfile.commissionRate * 100))}٪ | سهم خالص مربی: {toPersianDigits(Math.round((1 - coachProfile.commissionRate) * 100))}٪
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowCreateClassModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-[#C8F500] hover:bg-[#D6FB33] text-[#0D0F11] font-bold text-xs px-3.5 py-2 transition-all cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                تعریف کلاس جدید
              </button>
              <button
                onClick={() => setShowCreateSessionModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-[#15181B] border border-[#272B30] hover:border-[#C8F500] text-[#F4F5F2] font-semibold text-xs px-3.5 py-2 transition-all cursor-pointer"
              >
                <Calendar className="w-4 h-4 text-[#C8F500]" />
                برنامه‌ریزی جلسه
              </button>
            </div>
          </div>

          {/* Financial Ribbon */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
            <div className="rounded-2xl border border-[#272B30] bg-[#15181B] p-4">
              <span className="text-[11px] text-[#9CA3A8] block">موجودی بستانکاری (آماده تسویه)</span>
              <span className="text-lg font-black text-[#C8F500] mt-1 block">
                {formatTomans(financials?.payableBalanceTomans || coachProfile.payableBalanceTomans)}
              </span>
            </div>

            <div className="rounded-2xl border border-[#272B30] bg-[#15181B] p-4">
              <span className="text-[11px] text-[#9CA3A8] block">کل درآمد ناخالص</span>
              <span className="text-lg font-black text-[#F4F5F2] mt-1 block">
                {formatTomans(financials?.totalGrossSalesTomans || 0)}
              </span>
            </div>

            <div className="rounded-2xl border border-[#272B30] bg-[#15181B] p-4">
              <span className="text-[11px] text-[#9CA3A8] block">درآمد خالص واریزی</span>
              <span className="text-lg font-black text-[#F4F5F2] mt-1 block">
                {formatTomans(financials?.totalNetEarnedTomans || 0)}
              </span>
            </div>

            <div className="rounded-2xl border border-[#272B30] bg-[#15181B] p-4">
              <span className="text-[11px] text-[#9CA3A8] block">تعداد رزروهای تأییدشده</span>
              <span className="text-lg font-black text-[#C8F500] mt-1 block font-persian-digits">
                {toPersianDigits(financials?.totalConfirmedBookings || 0)} رزرو
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs Bar */}
      <section className="border-b border-[#272B30] bg-[#0D0F11] sticky top-16 z-20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 py-3 overflow-x-auto">
          {[
            { id: 'classes', label: 'کلاس‌های من' },
            { id: 'sessions', label: 'جلسات و لیست حاضرین' },
            { id: 'plans', label: 'بسته‌های ماهانه' },
            { id: 'financials', label: 'گردش حساب و تسویه‌ها' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#C8F500] text-[#0D0F11] shadow-xs'
                  : 'text-[#9CA3A8] hover:text-[#F4F5F2] hover:bg-[#15181B]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Tab Contents */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* TAB 1: CLASSES */}
        {activeTab === 'classes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#F4F5F2]">کلاس‌های تعریف شده توسط شما</h2>
              <span className="text-xs text-[#9CA3A8] font-persian-digits">
                {toPersianDigits(classes.length)} کلاس فعال
              </span>
            </div>

            {classes.length === 0 ? (
              <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-12 text-center">
                <Dumbbell className="w-10 h-10 text-[#9CA3A8] mx-auto mb-3" />
                <h3 className="text-sm font-bold text-[#F4F5F2]">هنوز کلاسی تعریف نکرده‌اید</h3>
                <p className="mt-1 text-xs text-[#9CA3A8]">
                  با کلیک بر روی دکمه «تعریف کلاس جدید» اولین دوره یا کلاس خود را ثبت کنید.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {classes.map((cls) => (
                  <div
                    key={cls.id}
                    className="rounded-2xl border border-[#272B30] bg-[#15181B] p-5 space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <Badge variant="tier-plus" size="sm">{cls.categorySlug}</Badge>
                        <span className="text-[11px] text-[#C8F500] font-bold">
                          {formatTomans(cls.singleSessionPriceTomans)}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-[#F4F5F2] line-clamp-1">{cls.title}</h3>
                      <p className="mt-1 text-xs text-[#9CA3A8] line-clamp-2">{cls.description}</p>
                    </div>

                    <div className="pt-3 border-t border-[#272B30] flex items-center justify-between text-xs">
                      <span className="text-[#9CA3A8] text-[11px]">
                        ظرفیت: {toPersianDigits(cls.defaultCapacity)} نفر
                      </span>
                      <Link
                        href={`/classes/${cls.id}`}
                        className="text-[#C8F500] font-bold text-xs hover:underline flex items-center gap-0.5"
                      >
                        صفحه عمومی کلاس
                        <ChevronLeft className="w-3.5 h-3.5 rtl-flip" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SESSIONS & ROSTER */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#F4F5F2]">جلسات برنامه‌ریزی شده</h2>
              <span className="text-xs text-[#9CA3A8] font-persian-digits">
                {toPersianDigits(sessions.length)} جلسه
              </span>
            </div>

            {sessions.length === 0 ? (
              <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-12 text-center">
                <Calendar className="w-10 h-10 text-[#9CA3A8] mx-auto mb-3" />
                <p className="text-xs text-[#9CA3A8]">هنوز جلسه‌ای برای کلاس‌ها زمان‌بندی نشده است.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-4 rounded-2xl border border-[#272B30] bg-[#15181B] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#F4F5F2] text-sm font-persian-digits">
                          تاریخ: {s.sessionDate}
                        </span>
                        <span className="text-[#C8F500] font-semibold font-persian-digits">
                          ساعت {s.startTime.slice(0, 5)} الی {s.endTime.slice(0, 5)}
                        </span>
                        <Badge variant="default" size="sm">{s.status}</Badge>
                      </div>
                      <span className="text-[#9CA3A8] text-[11px] mt-1 block">
                        ظرفیت رزرو شده: {toPersianDigits(s.bookedCount)} از {toPersianDigits(s.capacity)} نفر
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleViewRoster(s.id, s.classTitle || 'کلاس ورزشی')}
                        className="rounded-xl bg-[#272B30] hover:bg-[#353B41] text-[#F4F5F2] font-semibold px-3 py-1.5 transition-all cursor-pointer"
                      >
                        لیست ثبت‌نامی‌ها ({toPersianDigits(s.bookedCount)})
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Roster Modal / Bottom Sheet */}
            {selectedRosterSession && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 max-w-lg w-full space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-[#272B30] pb-3">
                    <h3 className="font-bold text-sm text-[#F4F5F2]">
                      لیست حاضرین: {selectedRosterSession.title}
                    </h3>
                    <button
                      onClick={() => setSelectedRosterSession(null)}
                      className="text-[#9CA3A8] hover:text-[#F4F5F2]"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {rosterAttendees.length === 0 ? (
                    <p className="text-center py-6 text-xs text-[#9CA3A8]">
                      هنوز کاربری در این جلسه ثبت‌نام نکرده است.
                    </p>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {rosterAttendees.map((a) => (
                        <div
                          key={a.id}
                          className="p-3 rounded-xl border border-[#272B30] bg-[#111417] flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-[#F4F5F2] block">{a.userName}</span>
                            <span className="text-[11px] text-[#9CA3A8] font-persian-digits">
                              کد رزرو: {a.bookingCode} | {a.userPhone}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {a.attendanceStatus === 'ATTENDED' ? (
                              <span className="text-[#C8F500] font-bold text-[11px] flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" /> حاضر
                              </span>
                            ) : (
                              <button
                                onClick={() => handleMarkAttendance(a.id, ClassAttendanceStatus.ATTENDED)}
                                className="rounded-lg bg-[#C8F500] text-[#0D0F11] font-bold px-2.5 py-1 text-[11px] hover:bg-[#D6FB33]"
                              >
                                ثبت حضور
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MONTHLY PLANS */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#F4F5F2]">بسته‌های ماهانه مربیگری</h2>
                <p className="text-xs text-[#9CA3A8]">
                  کاربران پس از تجربه تک‌جلسه می‌توانند بسته‌های ماهانه شما را با قیمت اقتصادی‌تر تهیه کنند.
                </p>
              </div>

              <button
                onClick={() => setShowCreatePlanModal(true)}
                className="rounded-xl bg-[#C8F500] text-[#0D0F11] font-bold text-xs px-3.5 py-2 cursor-pointer shadow-xs"
              >
                تعریف بسته جدید
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
              {classes
                .filter((c) => c.monthlyPlan)
                .map((c) => (
                  <div
                    key={c.monthlyPlan!.id}
                    className="p-5 rounded-2xl border border-[#272B30] bg-[#15181B] space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <Badge variant="tier-elite" size="sm">بسته ماهانه فعال</Badge>
                      <span className="font-bold text-[#C8F500]">
                        {formatTomans(c.monthlyPlan!.priceTomans)}
                      </span>
                    </div>
                    <h3 className="font-bold text-sm text-[#F4F5F2]">{c.monthlyPlan!.title}</h3>
                    <p className="text-xs text-[#9CA3A8]">
                      شامل {toPersianDigits(c.monthlyPlan!.includedSessions)} جلسه با اعتبار {toPersianDigits(c.monthlyPlan!.validityDays)} روز
                    </p>
                    <span className="text-[11px] text-[#71767B] block pt-2 border-t border-[#272B30]">
                      مربوط به کلاس: {c.title}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 4: FINANCIALS */}
        {activeTab === 'financials' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 space-y-4">
              <h2 className="text-base font-bold text-[#F4F5F2] flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#C8F500]" />
                گردش حساب بستانکاری و تسویه‌ها
              </h2>
              <p className="text-xs text-[#9CA3A8]">
                مبالغ حاصل از رزرو جلسات پس از کسر کارمزد گراویتی مستقیماً به موجودی بستانکاری شما اضافه می‌گردد و در پایان سیکل به شماره شبا واریز خواهد شد.
              </p>

              {/* Transactions list */}
              <div className="pt-2 space-y-2 text-xs">
                {financials?.recentTransactions && financials.recentTransactions.length > 0 ? (
                  financials.recentTransactions.map((tx: any) => (
                    <div
                      key={tx.id}
                      className="p-3.5 rounded-xl border border-[#272B30] bg-[#111417] flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-[#F4F5F2] block">{tx.description}</span>
                        <span className="text-[11px] text-[#9CA3A8] font-persian-digits">
                          {tx.createdAt.split('T')[0]}
                        </span>
                      </div>
                      <div className="text-left font-persian-digits">
                        <span
                          className={`font-black text-sm block ${
                            tx.deltaAmountTomans > 0 ? 'text-[#C8F500]' : 'text-red-400'
                          }`}
                        >
                          {tx.deltaAmountTomans > 0 ? '+' : ''}
                          {formatTomans(tx.deltaAmountTomans)}
                        </span>
                        <span className="text-[10px] text-[#9CA3A8]">
                          مانده: {formatTomans(tx.balanceAfter)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#9CA3A8] text-center py-6">
                    هنوز تراکنشی در حساب شما ثبت نشده است.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* CREATE CLASS MODAL */}
      {showCreateClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between border-b border-[#272B30] pb-3">
              <h3 className="font-bold text-sm text-[#F4F5F2]">تعریف کلاس ورزشی جدید</h3>
              <button onClick={() => setShowCreateClassModal(false)} className="text-[#9CA3A8]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9CA3A8] mb-1">عنوان کلاس:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: فیتنس و چربی‌سوزی پیشرفته"
                  value={newClassForm.title}
                  onChange={(e) => setNewClassForm({ ...newClassForm, title: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9CA3A8] mb-1">رشته ورزشی:</label>
                  <select
                    value={newClassForm.categorySlug}
                    onChange={(e) => setNewClassForm({ ...newClassForm, categorySlug: e.target.value })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>{c.nameFa}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#9CA3A8] mb-1">محل برگزاری:</label>
                  <select
                    value={newClassForm.venueId}
                    onChange={(e) => setNewClassForm({ ...newClassForm, venueId: e.target.value })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>{v.nameFa}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9CA3A8] mb-1">قیمت هر تک‌جلسه (تومان):</label>
                  <input
                    type="number"
                    required
                    value={newClassForm.singleSessionPriceTomans}
                    onChange={(e) => setNewClassForm({ ...newClassForm, singleSessionPriceTomans: Number(e.target.value) })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3A8] mb-1">ظرفیت هر جلسه:</label>
                  <input
                    type="number"
                    required
                    value={newClassForm.defaultCapacity}
                    onChange={(e) => setNewClassForm({ ...newClassForm, defaultCapacity: Number(e.target.value) })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#9CA3A8] mb-1">توضیحات و نیازمندی‌های کلاس:</label>
                <textarea
                  rows={3}
                  value={newClassForm.description}
                  onChange={(e) => setNewClassForm({ ...newClassForm, description: e.target.value })}
                  placeholder="لوازم مورد نیاز، شرایط بدنی و توضیحات کلاس..."
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none resize-none"
                />
              </div>

              <Button type="submit" variant="primary" className="w-full py-2.5 font-bold text-xs mt-2">
                ثبت و انتشار کلاس
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SESSION MODAL */}
      {showCreateSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-[#272B30] pb-3">
              <h3 className="font-bold text-sm text-[#F4F5F2]">برنامه‌ریزی جلسه تمرین</h3>
              <button onClick={() => setShowCreateSessionModal(false)} className="text-[#9CA3A8]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9CA3A8] mb-1">کلاس مربوطه:</label>
                <select
                  value={newSessionForm.classId}
                  onChange={(e) => setNewSessionForm({ ...newSessionForm, classId: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#9CA3A8] mb-1">تاریخ برگزاری (YYYY-MM-DD):</label>
                <input
                  type="date"
                  required
                  value={newSessionForm.sessionDate}
                  onChange={(e) => setNewSessionForm({ ...newSessionForm, sessionDate: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9CA3A8] mb-1">ساعت شروع:</label>
                  <input
                    type="time"
                    required
                    value={newSessionForm.startTime}
                    onChange={(e) => setNewSessionForm({ ...newSessionForm, startTime: e.target.value })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3A8] mb-1">ساعت پایان:</label>
                  <input
                    type="time"
                    required
                    value={newSessionForm.endTime}
                    onChange={(e) => setNewSessionForm({ ...newSessionForm, endTime: e.target.value })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#9CA3A8] mb-1">ظرفیت جلسه:</label>
                <input
                  type="number"
                  required
                  value={newSessionForm.capacity}
                  onChange={(e) => setNewSessionForm({ ...newSessionForm, capacity: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <Button type="submit" variant="primary" className="w-full py-2.5 font-bold text-xs mt-2">
                ثبت جلسه در تقویم
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* CREATE MONTHLY PLAN MODAL */}
      {showCreatePlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between border-b border-[#272B30] pb-3">
              <h3 className="font-bold text-sm text-[#F4F5F2]">تعریف بسته ماهانه مربی</h3>
              <button onClick={() => setShowCreatePlanModal(false)} className="text-[#9CA3A8]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMonthlyPlan} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9CA3A8] mb-1">کلاس مربوطه:</label>
                <select
                  value={newPlanForm.classId}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, classId: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#9CA3A8] mb-1">عنوان بسته:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: بسته طلایی ماهانه ۸ جلسه"
                  value={newPlanForm.title}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, title: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#9CA3A8] mb-1">تعداد جلسات مجاز:</label>
                  <input
                    type="number"
                    required
                    value={newPlanForm.includedSessions}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, includedSessions: Number(e.target.value) })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#9CA3A8] mb-1">قیمت کل بسته (تومان):</label>
                  <input
                    type="number"
                    required
                    value={newPlanForm.priceTomans}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, priceTomans: Number(e.target.value) })}
                    className="w-full rounded-xl border border-[#272B30] bg-[#111417] px-3.5 py-2 text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>
              </div>

              <Button type="submit" variant="primary" className="w-full py-2.5 font-bold text-xs mt-2">
                ثبت بسته ماهانه
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
