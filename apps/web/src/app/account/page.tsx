'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { apiFetch } from '../../lib/api';
import {
  MemberSubscriptionDetails,
  MemberCheckinHistoryItem,
  MemberPaymentHistoryItem,
  WalletSummary,
  Gym,
} from '@gym-app/shared-types';
import {
  toPersianDigits,
  formatMoney,
  formatCredits,
  formatPhone,
  formatDateFa,
  formatDateTimeFa,
} from '../../lib/formatters';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert } from '../../components/ui/alert';
import { EmptyState } from '../../components/ui/empty-state';
import { Footer } from '../../components/footer';
import { Skeleton } from '../../components/ui/skeleton';
import { Modal } from '../../components/ui/modal';
import { Input } from '../../components/ui/input';
import { DynamicQrModal } from '../../components/dynamic-qr-modal';
import {
  UserCircle,
  CreditCard,
  QrCode,
  Clock,
  History,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  ShieldCheck,
  ChevronLeft,
  Building2,
  Edit3,
  Dumbbell,
  Calendar,
  MapPin,
  XCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ClassBooking, CoachPlanEnrollment } from '@gym-app/shared-types';

export default function AccountPage() {
  const { user, isLoading: isAuthLoading, openLoginModal, refreshProfile } = useAuth();

  // Data states
  const [subDetails, setSubDetails] = useState<MemberSubscriptionDetails | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [checkinHistory, setCheckinHistory] = useState<MemberCheckinHistoryItem[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<MemberPaymentHistoryItem[]>([]);
  const [gymsList, setGymsList] = useState<Gym[]>([]);
  const [memberBookings, setMemberBookings] = useState<ClassBooking[]>([]);
  const [memberEnrollments, setMemberEnrollments] = useState<CoachPlanEnrollment[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'classes' | 'ledger' | 'checkins' | 'payments'>('classes');

  // Modals state
  const [isQrSelectorOpen, setIsQrSelectorOpen] = useState<boolean>(false);
  const [activeQrGym, setActiveQrGym] = useState<{ id: string; name: string; cost: number } | null>(null);
  const [selectedClassPass, setSelectedClassPass] = useState<ClassBooking | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{ success?: string; error?: string } | null>(null);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [editFirstName, setEditFirstName] = useState<string>('');
  const [editLastName, setEditLastName] = useState<string>('');
  const [editNationalCode, setEditNationalCode] = useState<string>('');
  const [editGender, setEditGender] = useState<string>('MALE');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);

  const loadMemberData = async () => {
    if (!user) return;
    setIsLoadingData(true);
    try {
      const [subsRes, walletRes, chkRes, payRes, gymsRes, bookingsRes, enrollmentsRes] = await Promise.allSettled([
        apiFetch<MemberSubscriptionDetails>('/subscriptions/me'),
        apiFetch<WalletSummary>('/wallet/summary'),
        apiFetch<MemberCheckinHistoryItem[]>('/checkin/history'),
        apiFetch<MemberPaymentHistoryItem[]>('/payments/history'),
        apiFetch<Gym[]>('/gyms'),
        apiFetch<ClassBooking[]>('/classes/member/bookings'),
        apiFetch<CoachPlanEnrollment[]>('/classes/member/enrollments'),
      ]);

      if (subsRes.status === 'fulfilled') setSubDetails(subsRes.value);
      if (walletRes.status === 'fulfilled') setWalletSummary(walletRes.value);
      if (chkRes.status === 'fulfilled') setCheckinHistory(chkRes.value);
      if (payRes.status === 'fulfilled') setPaymentHistory(payRes.value);
      if (gymsRes.status === 'fulfilled') setGymsList(gymsRes.value);
      if (bookingsRes.status === 'fulfilled') setMemberBookings(bookingsRes.value || []);
      if (enrollmentsRes.status === 'fulfilled') setMemberEnrollments(enrollmentsRes.value || []);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    setCancellingBookingId(bookingId);
    setCancelFeedback(null);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>(`/classes/member/bookings/${bookingId}/cancel`, {
        method: 'POST',
      });
      setCancelFeedback({ success: res.message || 'رزرو با موفقیت لغو شد.' });
      await loadMemberData();
    } catch (err: any) {
      setCancelFeedback({ error: err.message || 'خطا در لغو رزرو جلسه' });
    } finally {
      setCancellingBookingId(null);
    }
  };

  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || '');
      setEditLastName(user.lastName || '');
      setEditNationalCode(user.nationalCode || '');
      setEditGender(user.gender || 'MALE');
      loadMemberData();
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileError(null);
    try {
      await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          gender: editGender,
          nationalCode: editNationalCode.trim() || undefined,
        }),
      });
      await refreshProfile();
      setIsEditProfileOpen(false);
    } catch (err: any) {
      setProfileError(err.message || 'خطا در ذخیره مشخصات کاربری');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const getTierBadgeVariant = (tier: string) => {
    switch (tier?.toUpperCase()) {
      case 'ELITE': return 'tier-elite';
      case 'PREMIUM': return 'tier-premium';
      case 'PLUS': return 'tier-plus';
      default: return 'tier-basic';
    }
  };

  const getTierLabelFa = (tier: string) => {
    switch (tier?.toUpperCase()) {
      case 'ELITE': return 'الیت';
      case 'PREMIUM': return 'پریمیوم';
      case 'PLUS': return 'پلاس';
      default: return 'استاندارد';
    }
  };

  // Auth Loading Skeleton State (prevents flash during initial load/hydration)
  if (isAuthLoading) {
    return (
      <main className="min-h-screen bg-[#0D0F10] text-[#F4F5F2] pb-20 pt-6 sm:pt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="h-4 w-36 animate-pulse rounded bg-[#1D2125] mb-6" />
          <div className="mb-8 h-32 w-full animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30]" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 h-80 animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30]" />
            <div className="lg:col-span-7 h-96 animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30]" />
          </div>
        </div>
      </main>
    );
  }

  // Unauthenticated Guard
  if (!user) {
    return (
      <main className="min-h-screen bg-[#0D0F10] text-[#F4F5F2] py-16 px-4">
        <div className="mx-auto max-w-lg">
          <EmptyState
            icon={<UserCircle className="h-8 w-8 text-[#C8F500]" />}
            title="ورود به حساب کاربری"
            description="جهت دسترسی به کارت عضویت، کیف پول اعتباری، بارکد ورود به باشگاه و سوابق تردد، لطفاً ابتدا وارد حساب کاربری خود شوید."
            action={
              <Button
                variant="primary"
                onClick={() => openLoginModal('جهت مشاهده حساب کاربری وارد شوید.')}
                leftIcon={<UserCircle className="h-4 w-4 text-[#0D0F11]" />}
              >
                ورود به گراویتی
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen bg-[#0D0F10] text-[#F4F5F2] pb-20 pt-6 sm:pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold text-[#9CA3A8]">
          <Link href="/" className="hover:text-[#C8F500] transition-colors">
            خانه
          </Link>
          <ChevronLeft className="h-3.5 w-3.5 rtl-flip text-[#62686D]" />
          <span className="text-[#F4F5F2] font-bold">حساب کاربری و کیف پول</span>
        </div>

        {/* Member Profile Header Card */}
        <div className="mb-8 rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-[#1D2125] border border-[#C8F500]/30 text-[#C8F500] shadow-md shadow-[#C8F500]/5">
                <UserCircle className="h-10 w-10 sm:h-12 sm:w-12" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#F4F5F2]">
                    {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : 'ورزشکار گراویتی'}
                  </h1>
                  <Badge variant="success" size="sm">
                    حساب فعال
                  </Badge>
                  <Badge variant={user?.gender === 'FEMALE' ? 'tier-premium' : 'default'} size="sm">
                    {user?.gender === 'FEMALE' ? 'بانو' : 'آقا'}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[#9CA3A8]">
                  <span className="font-persian-digits font-semibold text-[#C4C8CC]">
                    {formatPhone(user?.phoneNumber, true)}
                  </span>
                  <span>•</span>
                  <span>کد ملی: <span className="font-persian-digits font-mono text-[#C4C8CC]">{toPersianDigits(user?.nationalCode || 'ثبت نشده')}</span></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditProfileOpen(true)}
                leftIcon={<Edit3 className="h-4 w-4" />}
              >
                ویرایش مشخصات
              </Button>
            </div>
          </div>
        </div>

        {/* Main 2-Column Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Column 1: Active Membership & Credit Wallet (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-6">
            {/* 1. Active Membership Card */}
            <Card className="relative overflow-hidden border-[#272B30] bg-[#15181B] shadow-md">
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-[#C8F500] via-emerald-400 to-[#C8F500]" />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#C8F500]" />
                    <CardTitle>عضویت ورزشی گراویتی</CardTitle>
                  </div>
                  {subDetails?.state === 'ACTIVE' ? (
                    <Badge variant="success">اشتراک فعال</Badge>
                  ) : subDetails?.state === 'EXPIRING_SOON' ? (
                    <Badge variant="warning">نزدیک به انقضا</Badge>
                  ) : subDetails?.state === 'EXPIRED' ? (
                    <Badge variant="danger">منقضی‌شده</Badge>
                  ) : (
                    <Badge variant="secondary">بدون اشتراک</Badge>
                  )}
                </div>
                <CardDescription>
                  وضعیت چرخه عضویت و دسترسی به شبکه باشگاه‌های گراویتی
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {isLoadingData ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                  </div>
                ) : subDetails?.state === 'ACTIVE' || subDetails?.state === 'EXPIRING_SOON' ? (
                  <>
                    {/* Warning if expiring soon */}
                    {subDetails.state === 'EXPIRING_SOON' && (
                      <Alert variant="warning" title="اشتراک شما به زودی منقضی می‌شود" className="py-2.5">
                        تنها <span className="font-bold font-persian-digits">{toPersianDigits(subDetails.subscription?.remainingDays)}</span> روز تا پایان دوره باقی است. با تمدید به موقع، تا ۱۰٪ اعتبار مصرف‌نشده حفظ می‌شود.
                      </Alert>
                    )}

                    <div className="rounded-2xl bg-[#1D2125] border border-[#272B30] p-5 text-[#F4F5F2] shadow-inner">
                      <div className="flex items-center justify-between text-xs text-[#9CA3A8]">
                        <span>نوع اشتراک</span>
                        <span className="font-mono text-[11px] text-[#C8F500] font-persian-digits">
                          {toPersianDigits(subDetails.subscription?.remainingDays)} روز مانده
                        </span>
                      </div>
                      <div className="mt-1 text-lg font-black text-[#F4F5F2]">
                        {subDetails.subscription?.planTitle}
                      </div>

                      {/* Progress Bar of Cycle */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between text-[11px] text-[#9CA3A8]">
                          <span>پیشرفت دوره ۳۰ روزه</span>
                          <span className="font-persian-digits text-[#C4C8CC]">
                            {toPersianDigits(
                              Math.max(
                                0,
                                (subDetails.subscription?.totalDays || 30) - (subDetails.subscription?.remainingDays || 0)
                              )
                            )}{' '}
                            از {toPersianDigits(subDetails.subscription?.totalDays || 30)} روز
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-[#121517]">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              subDetails.state === 'EXPIRING_SOON' ? 'bg-amber-400' : 'bg-[#C8F500]'
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  5,
                                  (((subDetails.subscription?.totalDays || 30) -
                                    (subDetails.subscription?.remainingDays || 0)) /
                                    (subDetails.subscription?.totalDays || 30)) *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[#272B30] pt-3 text-xs text-[#9CA3A8]">
                        <div>
                          <span className="text-[10px] text-[#62686D] block">شروع دوره:</span>
                          <span className="font-semibold text-[#C4C8CC]">
                            {formatDateFa(subDetails.subscription?.startsAt)}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-[#62686D] block">تاریخ انقضا:</span>
                          <span className="font-semibold text-[#C4C8CC]">
                            {formatDateFa(subDetails.subscription?.expiresAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                      <Button
                        variant="primary"
                        size="md"
                        className="flex-1 shadow-md"
                        leftIcon={<QrCode className="h-4 w-4 text-[#0D0F11]" />}
                        onClick={() => setIsQrSelectorOpen(true)}
                      >
                        دریافت بارکد ورود به باشگاه
                      </Button>
                      <Link href="/plans" className="flex-1">
                        <Button variant="outline" size="md" className="w-full">
                          تمدید یا ارتقای پلن
                        </Button>
                      </Link>
                    </div>
                  </>
                ) : subDetails?.state === 'EXPIRED' ? (
                  <div className="space-y-4">
                    <Alert variant="error" title="اشتراک ورزشی شما منقضی شده است">
                      مهلت استفاده از پلن به پایان رسیده است. جهت فعال‌سازی مجدد ورود به باشگاه‌ها، اشتراک خود را تمدید فرمایید.
                    </Alert>
                    <Link href="/plans">
                      <Button variant="primary" size="md" className="w-full">
                        خرید اشتراک جدید و تمدید
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <EmptyState
                    icon={<CreditCard className="h-6 w-6 text-[#C8F500]" />}
                    title="هنوز اشتراک فعالی ندارید"
                    description="با خرید اشتراک گراویتی، به بیش از ۱۰۰ مجموعه ورزشی معتبر تهران دسترسی پیدا کرده و با بارکد هوشمند تردد نمایید."
                    action={
                      <Link href="/plans">
                        <Button variant="primary" size="md" leftIcon={<Sparkles className="h-4 w-4 text-[#0D0F11]" />}>
                          مشاهده و خرید پلن عضویت
                        </Button>
                      </Link>
                    }
                  />
                )}
              </CardContent>
            </Card>

            {/* 2. Credit Wallet Card */}
            <Card className="border-[#272B30] bg-[#15181B]">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-[#C8F500]" />
                    <CardTitle>کیف پول اعتباری</CardTitle>
                  </div>
                  <span className="text-[11px] font-medium text-[#9CA3A8]">دفترکل مستقل</span>
                </div>
                <CardDescription>
                  اعتبار تخصیص‌یافته معتبر برای استفاده در تمام سانس‌ها و باشگاه‌های همکار
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {isLoadingData ? (
                  <Skeleton className="h-20 w-full rounded-2xl" />
                ) : (
                  <>
                    <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-5 text-center">
                      <span className="text-xs font-semibold text-[#9CA3A8]">موجودی قابل استفاده</span>
                      <div className="mt-1 text-3xl sm:text-4xl font-black text-[#C8F500] font-persian-digits tracking-tight">
                        {toPersianDigits(walletSummary?.currentCredits ?? user?.currentCredits ?? 0)}{' '}
                        <span className="text-sm font-bold text-[#F4F5F2]">اعتبار ورزشی</span>
                      </div>
                    </div>

                    {/* Breakdown metrics */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-[#272B30] bg-[#121517] p-3 text-right">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#9CA3A8]">
                          <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
                          <span>کل اعتبار دریافتی</span>
                        </div>
                        <div className="mt-1 text-base font-black text-[#F4F5F2] font-persian-digits">
                          {formatCredits(walletSummary?.totalEarnedCredits ?? user?.currentCredits ?? 0)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-[#272B30] bg-[#121517] p-3 text-right">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#9CA3A8]">
                          <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
                          <span>کل اعتبار مصرف‌شده</span>
                        </div>
                        <div className="mt-1 text-base font-black text-[#F4F5F2] font-persian-digits">
                          {formatCredits(walletSummary?.totalSpentCredits ?? 0)}
                        </div>
                      </div>
                    </div>

                    {/* Rollover Policy Box */}
                    <div className="rounded-xl border border-[#272B30] bg-[#1D2125] p-3 text-xs leading-relaxed text-[#C4C8CC]">
                      <div className="flex items-center gap-1.5 font-bold mb-1 text-[#C8F500]">
                        <ShieldCheck className="h-4 w-4" />
                        <span>قانون رول‌اور (انتقال اعتبار)</span>
                      </div>
                      <p className="text-[11px] text-[#9CA3A8] leading-normal">
                        در صورت تمدید اشتراک قبل از انقضا، ۱۰٪ از اعتبار مصرف‌نشده (حداکثر تا ۵ اعتبار) به‌صورت خودکار به دوره بعدی منتقل خواهد شد.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Column 2: Activity Tabs (7 cols on lg) */}
          <div className="lg:col-span-7">
            <Card className="border-[#272B30] bg-[#15181B]">
              <CardHeader className="pb-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#202428] pb-4">
                  <div>
                    <CardTitle>ریزتراکنش‌ها و سوابق فعالیت</CardTitle>
                    <CardDescription>
                      دفترکل شفاف اعتبارات، ورودهای باشگاهی و فاکتورهای پرداخت
                    </CardDescription>
                  </div>

                  {/* Tab Selector Buttons */}
                  <div className="flex items-center gap-1 rounded-2xl bg-[#1D2125] border border-[#272B30] p-1 text-xs overflow-x-auto">
                    <button
                      onClick={() => setActiveTab('classes')}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition-all cursor-pointer whitespace-nowrap ${
                        activeTab === 'classes'
                          ? 'bg-[#15181B] text-[#C8F500] border border-[#272B30] shadow-xs'
                          : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                      }`}
                    >
                      <Dumbbell className="h-3.5 w-3.5" />
                      <span>کلاس‌ها و دوره‌ها</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('ledger')}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition-all cursor-pointer whitespace-nowrap ${
                        activeTab === 'ledger'
                          ? 'bg-[#15181B] text-[#C8F500] border border-[#272B30] shadow-xs'
                          : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                      }`}
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>گردش اعتبار</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('checkins')}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition-all cursor-pointer whitespace-nowrap ${
                        activeTab === 'checkins'
                          ? 'bg-[#15181B] text-[#C8F500] border border-[#272B30] shadow-xs'
                          : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      <span>سوابق تردد</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('payments')}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold transition-all cursor-pointer whitespace-nowrap ${
                        activeTab === 'payments'
                          ? 'bg-[#15181B] text-[#C8F500] border border-[#272B30] shadow-xs'
                          : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>فاکتورها</span>
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {isLoadingData ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full rounded-2xl" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                  </div>
                ) : activeTab === 'classes' ? (
                  /* 0. Coach Classes & Monthly Passes Tab */
                  <div className="space-y-6">
                    {cancelFeedback?.success && (
                      <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 p-3 text-xs font-semibold text-emerald-300 animate-fade-in">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>{cancelFeedback.success}</span>
                      </div>
                    )}
                    {cancelFeedback?.error && (
                      <div className="flex items-center gap-2 rounded-2xl bg-red-950/60 border border-red-800/60 p-3 text-xs font-semibold text-red-300 animate-fade-in">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                        <span>{cancelFeedback.error}</span>
                      </div>
                    )}

                    {/* Section 1: Active Monthly Plans */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#C8F500]" />
                          <h3 className="text-sm font-bold text-[#F4F5F2]">بسته‌های ماهانه مربیان</h3>
                        </div>
                        <Link href="/classes" className="text-xs text-[#C8F500] hover:underline flex items-center gap-1">
                          <span>کشف دوره‌های بیشتر</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>

                      {memberEnrollments && memberEnrollments.length > 0 ? (
                        <div className="space-y-3">
                          {memberEnrollments.map((enr: any) => {
                            const remaining = Math.max(0, (enr.total_quota || 0) - (enr.used_quota || 0));
                            return (
                              <div
                                key={enr.id}
                                className="rounded-2xl border border-[#272B30] bg-[#1D2125]/80 p-4 transition-all hover:border-[#353B41]"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-[#F4F5F2] text-sm">{enr.plan_title || 'بسته ماهانه مربی'}</span>
                                      <Badge variant={enr.status === 'ACTIVE' ? 'success' : 'secondary'} size="sm">
                                        {enr.status === 'ACTIVE' ? 'فعال' : 'منقضی'}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-[#9CA3A8] mt-1 flex items-center gap-2">
                                      <span>کلاس: {enr.class_title}</span>
                                      <span>•</span>
                                      <span>مربی: {enr.coach_first_name} {enr.coach_last_name}</span>
                                    </div>
                                  </div>

                                  <div className="text-left">
                                    <span className="text-xs font-bold text-[#C8F500] font-persian-digits">
                                      {toPersianDigits(remaining)} از {toPersianDigits(enr.total_quota)} جلسه باقی‌مانده
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-3 space-y-1">
                                  <div className="h-2 w-full rounded-full bg-[#15181B] overflow-hidden">
                                    <div
                                      className="h-full bg-[#C8F500] rounded-full transition-all"
                                      style={{ width: `${Math.min(100, Math.max(5, (remaining / (enr.total_quota || 1)) * 100))}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-[#62686D]">
                                    <span>مصرف‌شده: {toPersianDigits(enr.used_quota)} جلسه</span>
                                    <span>اعتبار تا: {formatDateFa(enr.valid_until)}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[#272B30] bg-[#121517]/40 p-4 text-center">
                          <p className="text-xs text-[#9CA3A8]">شما هنوز در هیچ بسته ماهانه مربی ثبت‌نام نکرده‌اید.</p>
                          <p className="text-[11px] text-[#62686D] mt-1">پس از تجربه تک‌جلسه، در صورت تمایل می‌توانید بسته دوره‌ای مربی را تهیه کنید.</p>
                        </div>
                      )}
                    </div>

                    {/* Section 2: Booked Class Sessions */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-[#C8F500]" />
                          <h3 className="text-sm font-bold text-[#F4F5F2]">جلسات رزرو شده شما</h3>
                        </div>
                        <span className="text-xs text-[#9CA3A8] font-persian-digits">
                          {toPersianDigits(memberBookings.length)} نوبت
                        </span>
                      </div>

                      {memberBookings && memberBookings.length > 0 ? (
                        <div className="space-y-3">
                          {memberBookings.map((b: any) => {
                            const isConfirmed = b.status === 'CONFIRMED';
                            return (
                              <div
                                key={b.id}
                                className="rounded-2xl border border-[#272B30] bg-[#1D2125]/80 p-4 hover:border-[#353B41] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#15181B] border border-[#272B30] text-[#C8F500] shrink-0">
                                    <Dumbbell className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-bold text-[#F4F5F2]">{b.class_title}</span>
                                      <Badge
                                        variant={
                                          b.status === 'CONFIRMED'
                                            ? 'success'
                                            : b.status === 'CANCELLED'
                                            ? 'danger'
                                            : 'secondary'
                                        }
                                        size="sm"
                                      >
                                        {b.status === 'CONFIRMED'
                                          ? 'تأییدشده'
                                          : b.status === 'CANCELLED'
                                          ? 'لغوشده'
                                          : 'تکمیل‌شده'}
                                      </Badge>
                                      <Badge variant="outline" size="sm">
                                        {b.booking_type === 'MONTHLY_PLAN' ? 'بسته ماهانه' : 'تک‌جلسه'}
                                      </Badge>
                                    </div>

                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#9CA3A8]">
                                      <span>مربی: {b.coach_first_name} {b.coach_last_name}</span>
                                      <span>•</span>
                                      <span className="flex items-center gap-1 font-persian-digits">
                                        <Clock className="h-3 w-3 text-[#62686D]" />
                                        {b.session_date} | {b.start_time?.slice(0, 5)} تا {b.end_time?.slice(0, 5)}
                                      </span>
                                    </div>

                                    <div className="mt-1 text-xs text-[#62686D] flex items-center gap-1.5">
                                      <MapPin className="h-3 w-3" />
                                      <span>{b.venue_name || 'محل برگزاری'} {b.venue_address ? `(${b.venue_address})` : ''}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                  {isConfirmed && (
                                    <>
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => setSelectedClassPass(b)}
                                        leftIcon={<QrCode className="h-3.5 w-3.5 text-[#0D0F11]" />}
                                      >
                                        بارکد ورود
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={cancellingBookingId === b.id}
                                        onClick={() => handleCancelBooking(b.id)}
                                        className="text-red-400 hover:text-red-300 hover:border-red-800"
                                        leftIcon={<XCircle className="h-3.5 w-3.5" />}
                                      >
                                        {cancellingBookingId === b.id ? 'در حال لغو...' : 'لغو'}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyState
                          icon={<Dumbbell className="h-6 w-6 text-[#9CA3A8]" />}
                          title="هنوز جلسه‌ای رزرو نکرده‌اید"
                          description="از بخش کلاس‌های ورزشی، با مربیان حرفه‌ای آشنا شده و تک‌جلسه یا دوره مورد علاقه خود را انتخاب کنید."
                          action={
                            <Link href="/classes">
                              <Button variant="primary" size="sm" leftIcon={<Sparkles className="h-4 w-4 text-[#0D0F11]" />}>
                                مشاهده لیست کلاس‌های ورزشی
                              </Button>
                            </Link>
                          }
                        />
                      )}
                    </div>
                  </div>
                ) : activeTab === 'ledger' ? (
                  /* 1. Credit Ledger Tab */
                  <div className="space-y-3">
                    {walletSummary?.recentTransactions && walletSummary.recentTransactions.length > 0 ? (
                      walletSummary.recentTransactions.map((tx) => {
                        const isPositive = tx.deltaCredits > 0;
                        return (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between rounded-2xl border border-[#272B30] bg-[#1D2125]/70 p-4 hover:bg-[#1D2125] hover:border-[#353B41] transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                  isPositive
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                                    : 'bg-red-950/60 text-red-400 border border-red-800/60'
                                }`}
                              >
                                {isPositive ? (
                                  <ArrowDownLeft className="h-5 w-5" />
                                ) : (
                                  <ArrowUpRight className="h-5 w-5" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-[#F4F5F2]">
                                  {tx.relatedTitle || tx.description || 'رویداد دفترکل اعتباری'}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9CA3A8]">
                                  <span>{formatDateTimeFa(tx.createdAt)}</span>
                                  <span>•</span>
                                  <span>
                                    مانده پس از تراکنش:{' '}
                                    <strong className="font-persian-digits text-[#C4C8CC]">
                                      {formatCredits(tx.balanceAfter)}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div
                              className={`text-sm sm:text-base font-black font-persian-digits ${
                                isPositive ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {isPositive ? '+' : ''}
                              {toPersianDigits(tx.deltaCredits)} اعتبار
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <EmptyState
                        icon={<History className="h-6 w-6 text-[#9CA3A8]" />}
                        title="هیچ تراکنش اعتباری ثبت نشده است"
                        description="با خرید اولین پلن، تراکنش‌های مربوط به افزایش و کسر اعتبار در این بخش نمایش داده خواهند شد."
                      />
                    )}
                  </div>
                ) : activeTab === 'checkins' ? (
                  /* 2. Checkin History Tab */
                  <div className="space-y-3">
                    {checkinHistory.length > 0 ? (
                      checkinHistory.map((chk) => (
                        <div
                          key={chk.id}
                          className="flex items-center justify-between rounded-2xl border border-[#272B30] bg-[#1D2125]/70 p-4 hover:bg-[#1D2125] hover:border-[#353B41] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15181B] border border-[#272B30] text-[#C8F500]">
                              <Building2 className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-[#F4F5F2]">{chk.gymName}</span>
                                <Badge variant={getTierBadgeVariant(chk.gymTier)} size="sm">
                                  سطح {getTierLabelFa(chk.gymTier)}
                                </Badge>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9CA3A8]">
                                <Clock className="h-3 w-3 text-[#62686D]" />
                                <span>{formatDateTimeFa(chk.createdAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-left">
                            <div className="text-sm font-black text-red-400 font-persian-digits">
                              -{toPersianDigits(chk.creditsDebited)} اعتبار
                            </div>
                            <span className="inline-block mt-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/60">
                              ورود موفق
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        icon={<QrCode className="h-6 w-6 text-[#9CA3A8]" />}
                        title="هنوز ترددی در باشگاه‌ها ثبت نشده است"
                        description="پس از ورود به هر یک از مجموعه‌های ورزشی طرف قرارداد، سوابق کامل ورود شما در این بخش ثبت می‌شود."
                      />
                    )}
                  </div>
                ) : (
                  /* 3. Payments Tab */
                  <div className="space-y-3">
                    {paymentHistory.length > 0 ? (
                      paymentHistory.map((pay) => (
                        <div
                          key={pay.id}
                          className="flex items-center justify-between rounded-2xl border border-[#272B30] bg-[#1D2125]/70 p-4 hover:bg-[#1D2125] hover:border-[#353B41] transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400">
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-[#F4F5F2]">{pay.planTitle}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#9CA3A8]">
                                <span>{formatDateTimeFa(pay.createdAt)}</span>
                                {pay.referenceIdRrn && (
                                  <>
                                    <span>•</span>
                                    <span>
                                      کد پیگیری: <span className="font-mono text-[#C4C8CC]">{pay.referenceIdRrn}</span>
                                    </span>
                                  </>
                                )}
                                {pay.cardPanMasked && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-[#C4C8CC]">{pay.cardPanMasked}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-left">
                            <div className="text-sm font-black text-[#F4F5F2] font-persian-digits">
                              {formatMoney(pay.amountTomans)}
                            </div>
                            <span
                              className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                pay.status === 'PAID'
                                  ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                                  : 'text-amber-400 bg-amber-950/60 border-amber-800/60'
                              }`}
                            >
                              {pay.status === 'PAID' ? 'پرداخت موفق' : 'در انتظار'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        icon={<CreditCard className="h-6 w-6 text-[#9CA3A8]" />}
                        title="هیچ فاکتور پرداختی یافت نشد"
                        description="سوابق خریدهای اشتراک و رسیدهای پرداخت الکترونیکی شاپرک در این جدول آرشیو خواهند شد."
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Quick QR Gym Selector Modal */}
      {isQrSelectorOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsQrSelectorOpen(false)}
          title="انتخاب مجموعه ورزشی جهت ورود"
          description="لطفاً باشگاه مورد نظر خود را جهت تولید بارکد اختصاصی تردد انتخاب نمایید."
          icon={<QrCode className="h-6 w-6 text-[#C8F500]" />}
          maxWidth="md"
        >
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {gymsList.length > 0 ? (
              gymsList.map((gym) => {
                const cost =
                  gym.tier === 'ELITE'
                    ? 14
                    : gym.tier === 'PREMIUM'
                    ? 7
                    : gym.tier === 'PLUS'
                    ? 4
                    : 2;

                return (
                  <button
                    key={gym.id}
                    onClick={() => {
                      setIsQrSelectorOpen(false);
                      setActiveQrGym({ id: gym.id, name: gym.nameFa, cost });
                    }}
                    className="w-full flex items-center justify-between rounded-2xl border border-[#272B30] bg-[#1D2125] p-4 text-right hover:border-[#C8F500]/50 hover:bg-[#22272C] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15181B] border border-[#272B30] group-hover:border-[#C8F500]/40 group-hover:text-[#C8F500] transition-colors text-[#9CA3A8]">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#F4F5F2] group-hover:text-[#C8F500] transition-colors">
                          {gym.nameFa}
                        </div>
                        <div className="text-xs text-[#9CA3A8] mt-0.5">
                          {gym.city}، منطقه {gym.district}
                        </div>
                      </div>
                    </div>

                    <div className="text-left">
                      <Badge variant={getTierBadgeVariant(gym.tier)} size="sm">
                        سطح {getTierLabelFa(gym.tier)}
                      </Badge>
                      <div className="text-xs font-bold text-[#C8F500] font-persian-digits mt-1">
                        {toPersianDigits(cost)} اعتبار
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="py-6 text-center text-xs text-[#9CA3A8]">
                در حال بارگذاری فهرست باشگاه‌ها...
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Active Dynamic QR Modal */}
      {activeQrGym && (
        <DynamicQrModal
          gymId={activeQrGym.id}
          gymName={activeQrGym.name}
          creditCost={activeQrGym.cost}
          onClose={() => {
            setActiveQrGym(null);
            loadMemberData(); // Refresh wallet and checkins after QR close
          }}
        />
      )}

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsEditProfileOpen(false)}
          title="ویرایش مشخصات کاربری"
          description="نام و کدملی جهت اعتبارسنجی در کانتر پذیرش باشگاه‌ها استفاده می‌شود."
          maxWidth="sm"
        >
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <Input
              label="نام"
              placeholder="مثال: علی"
              value={editFirstName}
              onChange={(e) => {
                setEditFirstName(e.target.value);
                setProfileError(null);
              }}
              required
            />
            <Input
              label="نام خانوادگی"
              placeholder="مثال: احمدی"
              value={editLastName}
              onChange={(e) => {
                setEditLastName(e.target.value);
                setProfileError(null);
              }}
              required
            />

            {/* Gender Selection */}
            <div>
              <label className="block text-xs font-bold text-[#C4C8CC] mb-1.5">جنسیت</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditGender('FEMALE');
                    setProfileError(null);
                  }}
                  className={`rounded-xl py-2 text-xs font-bold transition cursor-pointer border ${
                    editGender === 'FEMALE'
                      ? 'bg-rose-950/60 border-rose-600 text-rose-300 shadow-xs'
                      : 'bg-[#1D2125] border-[#272B30] text-[#9CA3A8] hover:bg-[#22272C]'
                  }`}
                >
                  بانوان
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditGender('MALE');
                    setProfileError(null);
                  }}
                  className={`rounded-xl py-2 text-xs font-bold transition cursor-pointer border ${
                    editGender === 'MALE'
                      ? 'bg-cyan-950/60 border-cyan-600 text-cyan-300 shadow-xs'
                      : 'bg-[#1D2125] border-[#272B30] text-[#9CA3A8] hover:bg-[#22272C]'
                  }`}
                >
                  آقایان
                </button>
              </div>
            </div>

            <Input
              label="کد ملی (اختیاری)"
              placeholder="۱۰ رقم کد ملی"
              value={editNationalCode}
              onChange={(e) => {
                setEditNationalCode(e.target.value);
                setProfileError(null);
              }}
              maxLength={10}
            />

            {profileError && (
              <div className="rounded-xl border border-red-800/80 bg-red-950/60 p-3 text-xs font-medium text-red-300 animate-fade-in">
                {profileError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isSavingProfile}
              >
                {isSavingProfile ? 'در حال ذخیره...' : 'ذخیره مشخصات'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setProfileError(null);
                  setIsEditProfileOpen(false);
                }}
              >
                انصراف
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Class Session QR Pass Modal */}
      {selectedClassPass && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedClassPass(null)}
          title="کارت ورود به کلاس ورزشی"
          description="این بارکد را در بدو ورود به مربی یا متصدی سالن ارائه دهید."
          icon={<QrCode className="h-6 w-6 text-[#C8F500]" />}
          maxWidth="sm"
        >
          <div className="flex flex-col items-center justify-center p-2 text-center space-y-4">
            <div className="rounded-3xl bg-white p-5 shadow-xl border-4 border-[#C8F500]">
              <QRCodeSVG
                value={selectedClassPass.qr_token || selectedClassPass.id}
                size={200}
                level="H"
                includeMargin={false}
              />
            </div>

            <div className="w-full rounded-2xl bg-[#1D2125] border border-[#272B30] p-4 text-right space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-sm font-bold text-[#F4F5F2]">
                <span>{(selectedClassPass as any).class_title}</span>
                <Badge variant="success" size="sm">بلیت معتبر</Badge>
              </div>
              <div className="text-[#9CA3A8]">مربی: {(selectedClassPass as any).coach_first_name} {(selectedClassPass as any).coach_last_name}</div>
              <div className="text-[#C8F500] font-persian-digits font-bold">
                تاریخ: {(selectedClassPass as any).session_date} | {(selectedClassPass as any).start_time?.slice(0, 5)} تا {(selectedClassPass as any).end_time?.slice(0, 5)}
              </div>
              <div className="text-[#62686D]">مکان: {(selectedClassPass as any).venue_name}</div>
              {selectedClassPass.seat_number && (
                <div className="pt-1 text-[#F4F5F2] font-mono">
                  شماره جایگاه: <span className="font-bold text-[#C8F500]">{selectedClassPass.seat_number}</span>
                </div>
              )}
            </div>

            <div className="text-[11px] text-[#62686D] leading-relaxed">
              این بلیت اختصاصی است و پس از اسکن و ثبت حضور توسط مربی، وضعیت جلسه تکمیل خواهد شد.
            </div>

            <Button
              variant="outline"
              size="md"
              className="w-full"
              onClick={() => setSelectedClassPass(null)}
            >
              بستن بلیت
            </Button>
          </div>
        </Modal>
      )}
    </main>
    <Footer />
    </>
  );
}
