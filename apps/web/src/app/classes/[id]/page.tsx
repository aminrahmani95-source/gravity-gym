'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../context/auth-context';
import {
  CoachClass,
  ClassSession,
  CoachMonthlyPlan,
  CoachPlanEnrollment,
  ClassVenueType,
  ClassDifficulty,
  PaymentPurpose,
} from '@gym-app/shared-types';
import {
  Dumbbell,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Video,
  QrCode,
  Users,
  CreditCard,
  Check,
} from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { toPersianDigits, formatTomans } from '../../../lib/formatters';

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const { user, openLoginModal } = useAuth();

  const [coachClass, setCoachClass] = useState<CoachClass | null>(null);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [userEnrollments, setUserEnrollments] = useState<CoachPlanEnrollment[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{
    bookingCode: string;
    qrToken: string;
    method: 'DIRECT_PAYMENT' | 'MONTHLY_PLAN_QUOTA';
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const [cls, sList] = await Promise.all([
          apiFetch<CoachClass>(`/classes/${classId}`),
          apiFetch<ClassSession[]>(`/classes/${classId}/sessions`),
        ]);
        setCoachClass(cls);
        setSessions(sList || []);

        if (sList && sList.length > 0) {
          const firstAvailable = sList.find((s) => s.availableSeats > 0);
          if (firstAvailable) {
            setSelectedSessionId(firstAvailable.id);
          }
        }

        if (user) {
          try {
            const enrollments = await apiFetch<CoachPlanEnrollment[]>('/classes/member/my-plans');
            const activeForClass = (enrollments || []).filter(
              (e) => (e.classId === classId || e.coachId === cls.coachId) && e.status === 'ACTIVE' && e.remainingSessions > 0
            );
            setUserEnrollments(activeForClass);
          } catch {
            // Unauthenticated or error
          }
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'خطا در بارگذاری جزئیات کلاس');
      } finally {
        setIsLoading(false);
      }
    }

    if (classId) {
      loadData();
    }
  }, [classId, user]);

  const activePlanQuota = userEnrollments.length > 0 ? userEnrollments[0] : null;
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // 1. Single Session Booking via Direct Payment Gateway
  const handleSingleSessionPayment = async () => {
    if (!user) {
      openLoginModal('برای رزرو جلسه ابتدا وارد حساب کاربری خود شوید.');
      return;
    }
    if (!selectedSessionId) {
      setErrorMsg('لطفاً ابتدا جلسه مورد نظر را انتخاب فرمایید.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      // 1. Initiate checkout
      const checkoutRes = await apiFetch<{ gatewayAuthority: string; redirectUrl: string }>(
        '/payments/classes/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            purpose: PaymentPurpose.CLASS_SINGLE_SESSION,
            referenceId: selectedSessionId,
          }),
        },
      );

      // 2. Direct verification (emulated gateway checkout)
      const verifyRes = await apiFetch<{
        isSuccessful: boolean;
        paymentId: string;
        errorMessage?: string;
      }>('/payments/classes/verify', {
        method: 'POST',
        body: JSON.stringify({
          gatewayAuthority: checkoutRes.gatewayAuthority,
          status: 'OK',
        }),
      });

      if (!verifyRes.isSuccessful) {
        throw new Error(verifyRes.errorMessage || 'پرداخت با خطا مواجه شد.');
      }

      // Fetch user's latest booking to show the confirmation modal
      const myBookings = await apiFetch<any[]>('/classes/member/my-bookings');
      const latestBooking = myBookings.find((b) => b.sessionId === selectedSessionId);

      setBookingSuccess({
        bookingCode: latestBooking?.bookingCode || 'CLS-SUCCESS',
        qrToken: latestBooking?.checkinToken || latestBooking?.qr_token || 'QRC_DONE',
        method: 'DIRECT_PAYMENT',
      });

      // Refresh sessions count
      const updatedSessions = await apiFetch<ClassSession[]>(`/classes/${classId}/sessions`);
      setSessions(updatedSessions);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در انجام پرداخت');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Single Session Booking using Active Monthly Plan Quota
  const handleBookWithPlanQuota = async () => {
    if (!user) {
      openLoginModal();
      return;
    }
    if (!activePlanQuota) return;
    if (!selectedSessionId) {
      setErrorMsg('لطفاً جلسه مورد نظر را انتخاب نمایید.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<any>(`/classes/sessions/${selectedSessionId}/book-with-plan`, {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: activePlanQuota.id,
        }),
      });

      setBookingSuccess({
        bookingCode: res.bookingCode || 'CLS-QUOTA',
        qrToken: res.checkinToken || res.qrToken || 'QRC_DONE',
        method: 'MONTHLY_PLAN_QUOTA',
      });

      // Refresh enrollments & sessions
      const [enrollments, updatedSessions] = await Promise.all([
        apiFetch<CoachPlanEnrollment[]>('/classes/member/my-plans'),
        apiFetch<ClassSession[]>(`/classes/${classId}/sessions`),
      ]);
      setUserEnrollments(enrollments.filter((e) => (e.classId === classId || e.coachId === coachClass?.coachId) && e.status === 'ACTIVE' && e.remainingSessions > 0));
      setSessions(updatedSessions);
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در رزرو با سهمیه ماهانه');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Purchase Coach Monthly Plan
  const handleBuyMonthlyPlan = async (planId: string) => {
    if (!user) {
      openLoginModal('جهت خرید بسته ماهانه لطفاً وارد حساب خود شوید.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const checkoutRes = await apiFetch<{ gatewayAuthority: string }>(
        '/payments/classes/checkout',
        {
          method: 'POST',
          body: JSON.stringify({
            purpose: PaymentPurpose.COACH_MONTHLY_PLAN,
            referenceId: planId,
          }),
        },
      );

      const verifyRes = await apiFetch<{ isSuccessful: boolean; errorMessage?: string }>(
        '/payments/classes/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            gatewayAuthority: checkoutRes.gatewayAuthority,
            status: 'OK',
          }),
        },
      );

      if (!verifyRes.isSuccessful) {
        throw new Error(verifyRes.errorMessage || 'پرداخت بسته ماهانه ناموفق بود.');
      }

      // Reload enrollments
      const enrollments = await apiFetch<CoachPlanEnrollment[]>('/classes/member/my-plans');
      setUserEnrollments(enrollments.filter((e) => (e.classId === classId || e.coachId === coachClass?.coachId) && e.status === 'ACTIVE' && e.remainingSessions > 0));
      alert('بسته ماهانه مربی با موفقیت خریداری و به حساب شما افزوده شد! اکنون می‌توانید جلسات مورد نظر خود را بدون پرداخت مجدد رزرو نمایید.');
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در خرید بسته ماهانه');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-[#C8F500]/20 border-t-[#C8F500] animate-spin" />
      </div>
    );
  }

  if (errorMsg && !coachClass) {
    return (
      <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] flex items-center justify-center p-6">
        <div className="rounded-3xl border border-red-900/50 bg-[#15181B] p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-red-200">خطا در بارگذاری کلاس</h2>
          <p className="mt-2 text-xs text-[#9CA3A8]">{errorMsg}</p>
          <Link
            href="/classes"
            className="mt-6 inline-flex rounded-xl bg-[#C8F500] text-[#0D0F11] font-bold px-4 py-2 text-xs"
          >
            بازگشت به فهرست کلاس‌ها
          </Link>
        </div>
      </div>
    );
  }

  if (!coachClass) return null;

  return (
    <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] pb-28">
      {/* Navigation Breadcrumb */}
      <div className="border-b border-[#272B30] bg-[#111417]/80 backdrop-blur-md py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 text-xs text-[#9CA3A8]">
          <Link href="/classes" className="hover:text-[#C8F500] transition-colors">
            کلاس‌های ورزشی
          </Link>
          <ChevronRight className="w-3.5 h-3.5 rtl-flip text-[#71767B]" />
          <span className="text-[#F4F5F2] font-semibold truncate">{coachClass.title}</span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-950/20 p-4 flex items-center gap-3 text-xs text-red-300">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Confirmation Modal */}
        {bookingSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="rounded-3xl border border-[#C8F500]/50 bg-[#15181B] p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-[#C8F500]/10 border border-[#C8F500] text-[#C8F500] flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div>
                <span className="text-xs font-bold text-[#C8F500] bg-[#C8F500]/10 px-3 py-1 rounded-full">
                  {bookingSuccess.method === 'MONTHLY_PLAN_QUOTA'
                    ? 'رزرو موفق با سهمیه ماهانه'
                    : 'پرداخت و رزرو موفق تک‌جلسه'}
                </span>
                <h3 className="mt-3 text-xl font-black text-[#F4F5F2]">
                  رزرو شما با موفقیت ثبت گردید!
                </h3>
                <p className="mt-1.5 text-xs text-[#9CA3A8]">
                  کد ورود و بارکد اختصاصی شما جهت ارائه در محل باشگاه صادر شد.
                </p>
              </div>

              {/* Receipt Box */}
              <div className="rounded-2xl border border-[#272B30] bg-[#111417] p-4 text-xs space-y-2 text-right">
                <div className="flex justify-between items-center text-[#9CA3A8]">
                  <span>کلاس:</span>
                  <span className="text-[#F4F5F2] font-bold">{coachClass.title}</span>
                </div>
                <div className="flex justify-between items-center text-[#9CA3A8]">
                  <span>مربی:</span>
                  <span className="text-[#F4F5F2] font-semibold">{coachClass.coach?.displayName}</span>
                </div>
                {selectedSession && (
                  <div className="flex justify-between items-center text-[#9CA3A8]">
                    <span>زمان جلسه:</span>
                    <span className="text-[#C8F500] font-bold font-persian-digits">
                      {selectedSession.sessionDate} ساعت {selectedSession.startTime.slice(0, 5)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[#9CA3A8] pt-2 border-t border-[#272B30]">
                  <span>کد رزرو:</span>
                  <span className="text-base font-black text-[#C8F500] tracking-wider">
                    {bookingSuccess.bookingCode}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href="/account"
                  className="rounded-xl bg-[#C8F500] hover:bg-[#D6FB33] text-[#0D0F11] font-black py-3 text-xs sm:text-sm transition-all"
                >
                  مشاهده بلیط و بارکد ورود در حساب من
                </Link>
                <button
                  onClick={() => setBookingSuccess(null)}
                  className="rounded-xl border border-[#272B30] bg-[#15181B] text-[#9CA3A8] hover:text-[#F4F5F2] py-2.5 text-xs"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left / Main Column: Class details & Sessions */}
          <div className="lg:col-span-2 space-y-8">
            {/* Class Hero Header */}
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default" size="sm">
                  {coachClass.categoryNameFa || 'ورزش تخصصی'}
                </Badge>
                <Badge variant="tier-plus" size="sm">
                  {coachClass.difficulty === ClassDifficulty.BEGINNER
                    ? 'سطح مبتدی'
                    : coachClass.difficulty === ClassDifficulty.ADVANCED
                    ? 'سطح پیشرفته'
                    : 'همه سطوح'}
                </Badge>
                {coachClass.venue?.venueType === ClassVenueType.ONLINE && (
                  <Badge variant="warning" size="sm" className="flex items-center gap-1">
                    <Video className="w-3 h-3" /> آنلاین
                  </Badge>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-[#F4F5F2] leading-tight">
                {coachClass.title}
              </h1>

              <p className="text-sm text-[#9CA3A8] leading-relaxed whitespace-pre-line">
                {coachClass.description}
              </p>

              {/* Class Specs Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-[#272B30] text-xs">
                <div className="rounded-xl bg-[#111417] p-3 border border-[#272B30]">
                  <span className="block text-[#9CA3A8] text-[11px]">مدت زمان هر جلسه</span>
                  <span className="mt-1 font-bold text-[#F4F5F2] flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#C8F500]" />
                    {toPersianDigits(coachClass.durationMinutes)} دقیقه
                  </span>
                </div>

                <div className="rounded-xl bg-[#111417] p-3 border border-[#272B30]">
                  <span className="block text-[#9CA3A8] text-[11px]">ظرفیت استاندارد کلاس</span>
                  <span className="mt-1 font-bold text-[#F4F5F2] flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-[#C8F500]" />
                    {toPersianDigits(coachClass.defaultCapacity)} نفر
                  </span>
                </div>

                <div className="rounded-xl bg-[#111417] p-3 border border-[#272B30] col-span-2 sm:col-span-1">
                  <span className="block text-[#9CA3A8] text-[11px]">مهلت لغو رزرو</span>
                  <span className="mt-1 font-bold text-[#F4F5F2]">
                    تا {toPersianDigits(coachClass.cancellationDeadlineHours)} ساعت قبل از شروع
                  </span>
                </div>
              </div>
            </div>

            {/* Sessions Selector: PRIMARY MVP FUNNEL */}
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black text-[#F4F5F2] flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#C8F500]" />
                    انتخاب جلسه تمرین (رزرو تک‌جلسه)
                  </h2>
                  <p className="mt-1 text-xs text-[#9CA3A8]">
                    جلسه مد نظر خود را انتخاب فرمایید و بدون نیاز به خرید اشتراک طولانی‌مدت در کلاس شرکت کنید.
                  </p>
                </div>

                {activePlanQuota && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C8F500] bg-[#C8F500]/10 border border-[#C8F500]/30 px-3 py-1 rounded-full shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                    {toPersianDigits(activePlanQuota.remainingSessions)} سهمیه فعال دارید
                  </span>
                )}
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-2xl bg-[#111417] p-8 text-center border border-[#272B30]">
                  <p className="text-xs text-[#9CA3A8]">
                    در حال حاضر جلسه‌ای برای این کلاس ثبت نشده است. مربی به زودی برنامه‌های جدید را بارگذاری خواهد کرد.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((s) => {
                    const isSelected = selectedSessionId === s.id;
                    const isFull = s.availableSeats <= 0;

                    return (
                      <div
                        key={s.id}
                        onClick={() => !isFull && setSelectedSessionId(s.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isFull
                            ? 'opacity-50 bg-[#111417] border-[#272B30] cursor-not-allowed'
                            : isSelected
                            ? 'bg-[#C8F500]/5 border-[#C8F500] shadow-sm shadow-[#C8F500]/10'
                            : 'bg-[#111417] border-[#272B30] hover:border-[#353B41]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'border-[#C8F500] bg-[#C8F500] text-[#0D0F11]'
                                : 'border-[#71767B]'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[#F4F5F2] font-persian-digits">
                                تاریخ: {s.sessionDate}
                              </span>
                              <span className="text-xs text-[#C8F500] font-semibold font-persian-digits">
                                ساعت {s.startTime.slice(0, 5)} الی {s.endTime.slice(0, 5)}
                              </span>
                            </div>

                            <span className="text-[11px] text-[#9CA3A8] mt-0.5 block">
                              {s.venueName || coachClass.venue?.nameFa}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                          <div>
                            {isFull ? (
                              <span className="text-xs font-bold text-red-400 bg-red-950/40 px-2 py-0.5 rounded-md">
                                تکمیل ظرفیت
                              </span>
                            ) : (
                              <span className="text-xs text-[#9CA3A8] font-persian-digits">
                                <span className="text-[#C8F500] font-bold">{toPersianDigits(s.availableSeats)}</span> جای خالی
                              </span>
                            )}
                          </div>

                          <div className="text-left">
                            <span className="text-sm font-black text-[#F4F5F2]">
                              {formatTomans(s.priceTomans)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Booking Actions */}
              {selectedSession && selectedSession.availableSeats > 0 && (
                <div className="pt-4 border-t border-[#272B30] flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="block text-[11px] text-[#9CA3A8]">مبلغ قابل پرداخت برای تک‌جلسه:</span>
                    <span className="text-lg font-black text-[#C8F500]">
                      {formatTomans(selectedSession.priceTomans)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* If user has active monthly plan quota */}
                    {activePlanQuota ? (
                      <Button
                        onClick={handleBookWithPlanQuota}
                        disabled={isProcessing}
                        variant="primary"
                        className="w-full sm:w-auto text-xs font-black px-6"
                      >
                        {isProcessing ? 'در حال رزرو...' : 'رزرو با سهمیه ماهانه (بدون هزینه)'}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSingleSessionPayment}
                        disabled={isProcessing}
                        variant="primary"
                        className="w-full sm:w-auto text-xs font-black px-6"
                      >
                        {isProcessing ? 'در حال اتصال به درگاه...' : 'پرداخت و رزرو تک‌جلسه'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SECONDARY FUNNEL: Coach Monthly Plan (Never forced) */}
            {coachClass.monthlyPlan && (
              <div className="rounded-3xl border border-[#C8F500]/30 bg-gradient-to-br from-[#15181B] to-[#1a1f16] p-6 sm:p-8 space-y-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 bg-[#C8F500] text-[#0D0F11] font-black text-[10px] px-4 py-1 rounded-br-2xl uppercase tracking-wider">
                  بسته پیشنهادی مربی
                </div>

                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#C8F500] mb-1">
                    <Sparkles className="w-4 h-4" />
                    تخفیف ویژه جلسات ماهانه
                  </div>
                  <h3 className="text-xl font-black text-[#F4F5F2]">
                    {coachClass.monthlyPlan.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#9CA3A8] max-w-xl">
                    اگر می‌خواهید به طور مستمر و منظم با این مربی تمرین کنید، می‌توانید بسته ماهانه را با قیمت اقتصادی‌تر تهیه کنید.
                    <span className="text-[#C8F500] block mt-1">
                      (خرید این بسته اختیاری است و هرگز اجباری نمی‌باشد).
                    </span>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-2xl bg-[#111417]/80 p-3.5 border border-[#272B30]">
                    <span className="text-[11px] text-[#9CA3A8]">تعداد جلسات مجاز</span>
                    <span className="mt-1 block font-black text-[#F4F5F2] text-sm">
                      {toPersianDigits(coachClass.monthlyPlan.includedSessions)} جلسه
                    </span>
                  </div>
                  <div className="rounded-2xl bg-[#111417]/80 p-3.5 border border-[#272B30]">
                    <span className="text-[11px] text-[#9CA3A8]">مدت اعتبار</span>
                    <span className="mt-1 block font-black text-[#F4F5F2] text-sm">
                      {toPersianDigits(coachClass.monthlyPlan.validityDays)} روز
                    </span>
                  </div>
                  <div className="rounded-2xl bg-[#111417]/80 p-3.5 border border-[#272B30]">
                    <span className="text-[11px] text-[#9CA3A8]">قیمت بسته</span>
                    <span className="mt-1 block font-black text-[#C8F500] text-sm">
                      {formatTomans(coachClass.monthlyPlan.priceTomans)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between gap-4">
                  <span className="text-xs text-[#9CA3A8]">
                    صرفه‌جویی اقتصادی نسبت به خرید جداگانه تک جلسات
                  </span>

                  <button
                    onClick={() => handleBuyMonthlyPlan(coachClass.monthlyPlan!.id)}
                    disabled={isProcessing}
                    className="rounded-xl bg-[#15181B] border border-[#C8F500] text-[#C8F500] hover:bg-[#C8F500] hover:text-[#0D0F11] font-bold text-xs px-5 py-2.5 transition-all cursor-pointer shrink-0 shadow-sm"
                  >
                    خرید بسته ماهانه مربی
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Coach & Venue Cards */}
          <div className="space-y-6">
            {/* Coach Profile Card */}
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[#272B30] border border-[#353B41] flex items-center justify-center font-black text-xl text-[#C8F500] shrink-0">
                  {coachClass.coach?.displayName?.slice(0, 1) || 'م'}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-base text-[#F4F5F2]">
                      {coachClass.coach?.displayName}
                    </h3>
                    <span title="مربی تأییدشده گراویتی">
                      <ShieldCheck className="w-4 h-4 text-[#C8F500]" />
                    </span>
                  </div>
                  <span className="text-xs text-[#9CA3A8] block">
                    {toPersianDigits(coachClass.coach?.experienceYears || 5)} سال سابقه مربیگری تخصصی
                  </span>
                </div>
              </div>

              {coachClass.coach?.bio && (
                <p className="text-xs text-[#9CA3A8] leading-relaxed border-t border-[#272B30] pt-3">
                  {coachClass.coach.bio}
                </p>
              )}

              {coachClass.coach?.specialties && coachClass.coach.specialties.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-bold text-[#9CA3A8] block">تخصص‌ها:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {coachClass.coach.specialties.map((s, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-[#272B30] px-2 py-0.5 text-[10px] text-[#F4F5F2]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Venue Card */}
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#C8F500]">
                <MapPin className="w-4 h-4" />
                اطلاعات محل برگزاری
              </div>

              <div>
                <h4 className="font-bold text-sm text-[#F4F5F2]">
                  {coachClass.venue?.nameFa || 'مکان اختصاصی کلاس'}
                </h4>
                <p className="mt-1 text-xs text-[#9CA3A8] leading-relaxed">
                  {coachClass.venue?.addressFa || 'تهران، مجموعه ورزشی'}
                </p>
              </div>

              {coachClass.venue?.venueType === ClassVenueType.ONLINE && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Video className="w-4 h-4" />
                    جلسه آنلاین و تعاملی
                  </div>
                  <p className="text-[11px] text-amber-200/80">
                    لینک ورود اختصاصی به جلسه پس از نهایی شدن رزرو در بخش «حساب من» فعال خواهد شد.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
