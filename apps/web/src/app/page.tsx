'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import { Gym, GymTier, GymAccessMode } from '@gym-app/shared-types';
import { useAuth } from '../context/auth-context';
import { DynamicQrModal } from '../components/dynamic-qr-modal';
import { Footer } from '../components/footer';
import {
  Search,
  MapPin,
  Sparkles,
  QrCode,
  Filter,
  Layers,
  Clock,
  RotateCcw,
  CheckCircle2,
  Compass,
  Repeat,
  ShieldCheck,
  CreditCard,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { GymCardSkeleton } from '../components/ui/skeleton';
import { EmptyState } from '../components/ui/empty-state';
import { toPersianDigits, formatDistance } from '../lib/formatters';

export default function GymDiscoveryPage() {
  const { user, openLoginModal } = useAuth();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [selectedGender, setSelectedGender] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeQrGym, setActiveQrGym] = useState<{ id: string; name: string; creditCost: number } | null>(null);

  // Auto-adapt to authenticated member's gender
  useEffect(() => {
    if (user?.gender && user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      setSelectedGender(user.gender);
    }
  }, [user?.gender]);

  useEffect(() => {
    fetchGyms();
  }, [selectedTier, selectedGender]);

  const fetchGyms = async () => {
    setIsLoading(true);
    try {
      let url = '/gyms?';
      if (selectedTier !== 'ALL') url += `tier=${selectedTier}&`;
      if (selectedGender !== 'ALL') url += `gender=${selectedGender}&`;
      const data = await apiFetch<Gym[]>(url);
      setGyms(data);
    } catch (err) {
      console.error('Error fetching gyms:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredGyms = gyms.filter(g =>
    searchQuery === '' ||
    g.nameFa.includes(searchQuery) ||
    g.district.includes(searchQuery)
  );

  const getTierBadgeVariant = (tier: GymTier) => {
    switch (tier) {
      case GymTier.BASIC:
        return 'tier-basic';
      case GymTier.PLUS:
        return 'tier-plus';
      case GymTier.PREMIUM:
        return 'tier-premium';
      case GymTier.ELITE:
        return 'tier-elite';
      default:
        return 'default';
    }
  };

  const getTierTitleFa = (tier: GymTier) => {
    switch (tier) {
      case GymTier.BASIC:
        return 'پایه (Basic)';
      case GymTier.PLUS:
        return 'پلاس (Plus)';
      case GymTier.PREMIUM:
        return 'پریمیوم (Premium)';
      case GymTier.ELITE:
        return 'الیت (Elite)';
    }
  };

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  const getGymTierImage = (tier: GymTier) => {
    switch (tier) {
      case GymTier.BASIC:
        return `${basePath}/images/gym-caro.jpg`;
      case GymTier.PLUS:
        return `${basePath}/images/gym-vanak.jpg`;
      case GymTier.PREMIUM:
        return `${basePath}/images/gym-oxygen.jpg`;
      case GymTier.ELITE:
        return `${basePath}/images/gym-espinas.jpg`;
      default:
        return `${basePath}/images/hero-athletic.jpg`;
    }
  };

  const getAccessModeBadge = (mode?: GymAccessMode) => {
    switch (mode) {
      case GymAccessMode.FEMALE_ONLY:
        return (
          <span className="rounded-lg bg-rose-950/60 border border-rose-800/60 px-2 py-0.5 text-[11px] font-bold text-rose-400">
            ویژه بانوان
          </span>
        );
      case GymAccessMode.MALE_ONLY:
        return (
          <span className="rounded-lg bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 text-[11px] font-bold text-cyan-400">
            ویژه آقایان
          </span>
        );
      case GymAccessMode.MIXED:
      default:
        return (
          <span className="rounded-lg bg-[#1D2125] border border-[#272B30] px-2 py-0.5 text-[11px] font-medium text-[#C4C8CC]">
            سانس مجزا
          </span>
        );
    }
  };

  const resetFilters = () => {
    setSelectedTier('ALL');
    setSelectedGender('ALL');
    setSearchQuery('');
  };

  const scrollToDiscovery = () => {
    const el = document.getElementById('gym-discovery-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between overflow-x-hidden w-full bg-[#0D0F10] text-[#F4F5F2]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-12 w-full">
        {/* ================================================================= */}
        {/* HERO SECTION: Split Layout with Cinematic Athletic Editorial Art */}
        {/* ================================================================= */}
        <section className="relative overflow-hidden rounded-3xl bg-[#121517] text-[#F4F5F2] border border-[#272B30] shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            {/* Left/Content Column (RTL: right side) */}
            <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-between z-10">
              <div>
                {/* Brand Category Tag */}
                <div className="inline-flex items-center gap-2 rounded-full bg-[#C8F500]/10 border border-[#C8F500]/25 px-3.5 py-1 text-xs font-semibold backdrop-blur-md text-[#C8F500]">
                  <Sparkles className="h-3.5 w-3.5 text-[#C8F500]" />
                  <span>پلتفرم متصل تناسب اندام و عضویت اعتباری</span>
                </div>

                {/* Primary Heading */}
                <h1 className="mt-5 text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight text-[#F4F5F2]">
                  باشگاه‌های منتخب تهران در جیب شما
                </h1>

                {/* Subtitle */}
                <p className="mt-4 text-xs sm:text-sm sm:leading-relaxed text-[#C4C8CC] max-w-xl">
                  با یک اشتراک شناور و اعتباری، به مجموعه‌های ورزشی و سالن‌های بدنسازی منتخب دسترسی داشته باشید. بدون قراردادهای بلندمدت انفرادی و با پذیرش فوری.
                </p>

                {/* Action CTAs */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href="/plans">
                    <Button
                      variant="primary"
                      size="lg"
                      className="px-6"
                      leftIcon={<CreditCard className="h-4 w-4 text-[#0D0F11]" />}
                    >
                      مشاهده و خرید پلن‌ها
                    </Button>
                  </Link>

                  <Button
                    onClick={scrollToDiscovery}
                    variant="outline"
                    size="lg"
                    rightIcon={<ChevronDown className="h-4 w-4" />}
                  >
                    کشف و جستجوی باشگاه‌ها
                  </Button>
                </div>
              </div>

              {/* 3 Core Trust Pillars */}
              <div className="mt-10 pt-6 border-t border-[#272B30] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[#C4C8CC]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#C8F500] shrink-0" />
                  <span>پذیرش با بارکد پویای ۴۵ ثانیه‌ای</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#C8F500] shrink-0" />
                  <span>انتقال ۱۰٪ اعتبار باقیمانده به ماه بعد</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#C8F500] shrink-0" />
                  <span>پوشش ۴ سطح ورزشی از پایه تا الیت</span>
                </div>
              </div>
            </div>

            {/* Right/Visual Column with High-Resolution Editorial Athletic Frame */}
            <div className="lg:col-span-5 relative min-h-[300px] lg:min-h-full overflow-hidden bg-[#0D0F10]">
              <img
                src={`${basePath}/images/hero-athletic.jpg`}
                alt="ورزشکار حرفه‌ای گراویتی اسپرت"
                className="absolute inset-0 h-full w-full object-cover object-center filter brightness-90 contrast-105"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#121517] via-[#121517]/30 to-transparent lg:bg-gradient-to-r lg:from-[#121517] lg:via-transparent lg:to-transparent" />
              
              {/* Floating Live Badge */}
              <div className="absolute bottom-5 right-5 sm:bottom-6 sm:right-6 rounded-2xl bg-[#15181B]/90 backdrop-blur-md border border-[#272B30] p-3.5 shadow-xl text-[#F4F5F2] max-w-[240px]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C8F500] text-[#0D0F11]">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[#F4F5F2]">ورود بدون معطلی</span>
                    <span className="block text-[10px] text-[#9CA3A8]">اعتبارسنجی با HMAC-SHA256</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* DISCOVERY & FILTERS SECTION */}
        {/* ================================================================= */}
        <section id="gym-discovery-section" className="space-y-6 pt-2">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C8F500] mb-1">
                <Compass className="h-4 w-4" />
                <span>شبکه مراکز ورزشی تهران</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#F4F5F2]">
                مجموعه‌ها و سالن‌های ورزشی منتخب
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-[#9CA3A8]">
              <span>در دسترس:</span>
              <span className="font-bold text-[#F4F5F2] font-persian-digits text-sm">
                {isLoading ? '...' : toPersianDigits(filteredGyms.length)}
              </span>
              <span>مجموعه ورزشی</span>
            </div>
          </div>

          {/* Discovery Filters Bar */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-[#15181B] p-4 rounded-3xl border border-[#272B30] shadow-xs max-w-full overflow-hidden">
            {/* Search Input */}
            <div className="relative flex-1 max-w-lg w-full">
              <Search className="absolute right-3.5 top-3.5 h-4 w-4 text-[#9CA3A8]" />
              <input
                type="text"
                placeholder="جستجو نام باشگاه یا منطقه (مثلاً سعادت‌آباد، ونک...)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] py-2.5 pr-10 pl-4 text-xs sm:text-sm text-[#F4F5F2] placeholder:text-[#62686D] shadow-2xs transition focus-visible:border-[#C8F500] focus-visible:bg-[#15181B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/20"
              />
            </div>

            {/* Filter Controls Group (Horizontal scrollable on mobile) */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 lg:pb-0 w-full lg:w-auto min-w-0">
              {/* Tier Filter Chips */}
              <div className="flex items-center rounded-2xl border border-[#272B30] bg-[#1D2125] p-1 text-xs shrink-0">
                {[
                  { id: 'ALL', label: 'همه سطوح' },
                  { id: 'BASIC', label: 'Basic' },
                  { id: 'PLUS', label: 'Plus' },
                  { id: 'PREMIUM', label: 'Premium' },
                  { id: 'ELITE', label: 'Elite' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTier(t.id)}
                    className={`rounded-xl px-2.5 sm:px-3 py-1.5 font-bold transition-all cursor-pointer text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/30 ${
                      selectedTier === t.id
                        ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                        : 'text-[#C4C8CC] hover:bg-[#22272C] hover:text-[#F4F5F2]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Gender Filter Chips */}
              <div className="flex items-center rounded-2xl border border-[#272B30] bg-[#1D2125] p-1 text-xs shrink-0">
                {[
                  { id: 'ALL', label: 'همه سانس‌ها' },
                  { id: 'MALE', label: 'آقایان' },
                  { id: 'FEMALE', label: 'بانوان' },
                ].map(g => (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGender(g.id)}
                    className={`rounded-xl px-2.5 sm:px-3 py-1.5 font-bold transition-all cursor-pointer text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/30 ${
                      selectedGender === g.id
                        ? 'bg-[#C8F500]/15 text-[#C8F500] border border-[#C8F500]/30 shadow-xs'
                        : 'border border-transparent text-[#C4C8CC] hover:bg-[#22272C] hover:text-[#F4F5F2]'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Reset Filters button if active */}
              {(selectedTier !== 'ALL' || selectedGender !== 'ALL' || searchQuery !== '') && (
                <button
                  onClick={resetFilters}
                  title="پاک کردن فیلترها"
                  className="flex items-center gap-1 rounded-2xl border border-[#272B30] bg-[#1D2125] px-2.5 py-1.5 text-xs font-semibold text-[#C4C8CC] hover:bg-[#22272C] hover:text-[#F4F5F2] transition cursor-pointer shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>بازنشانی</span>
                </button>
              )}
            </div>
          </div>

          {/* Gym Cards Balanced Grid (1 col mobile, 2 col tablet/laptop, 4 col desktop) */}
          <div>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <GymCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredGyms.length === 0 ? (
              <EmptyState
                icon={<Filter className="h-7 w-7 text-[#9CA3A8]" />}
                title="هیچ باشگاهی با فیلترهای انتخابی یافت نشد."
                description="می‌توانید فیلتر سطح یا کلمه جستجو را تغییر دهید تا باشگاه‌های بیشتری نمایش داده شوند."
                action={
                  <Button onClick={resetFilters} variant="outline" size="sm">
                    مشاهده همه باشگاه‌ها
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {filteredGyms.map(gym => (
                  <div
                    key={gym.id}
                    className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[#272B30] bg-[#15181B] shadow-xs transition-all duration-200 hover:shadow-xl hover:shadow-black/50 hover:border-[#353B41]"
                  >
                    <div>
                      {/* Gym Tier Atmosphere Cover */}
                      <div className="relative h-44 w-full overflow-hidden bg-[#0D0F10]">
                        <img
                          src={getGymTierImage(gym.tier)}
                          alt={`تصویر نمادین رده ${gym.tier}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 filter brightness-90"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#15181B] via-black/30 to-transparent" />

                        {/* Top Overlay Badges */}
                        <div className="absolute top-3 right-3 left-3 flex items-center justify-between gap-2">
                          <Badge variant={getTierBadgeVariant(gym.tier)} size="md" className="shadow-xs backdrop-blur-xs">
                            <bdi>{getTierTitleFa(gym.tier)}</bdi>
                          </Badge>
                          {getAccessModeBadge(gym.accessMode)}
                        </div>

                        {/* Bottom Overlay: Credit Cost Tag & Illustrative Badge */}
                        <div className="absolute bottom-3 right-3 left-3 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 rounded-xl bg-[#0D0F10]/90 backdrop-blur-md border border-[#272B30] px-2.5 py-1 text-xs font-bold text-[#F4F5F2] shadow-sm">
                            <span className="font-persian-digits text-sm text-[#C8F500] font-black">{toPersianDigits(gym.currentCreditCost)}</span>
                            <span className="font-normal text-[#9CA3A8]">اعتبار / جلسه</span>
                          </div>
                          <span className="text-[10px] text-[#9CA3A8] bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-lg border border-white/10">
                            تصویر نمادین
                          </span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-4 sm:p-5">
                        {/* Title & District */}
                        <Link href={`/gyms/${gym.id}`} className="block">
                          <h3 className="text-base font-bold text-[#F4F5F2] group-hover:text-[#C8F500] transition-colors">
                            {gym.nameFa}
                          </h3>
                        </Link>

                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#9CA3A8]">
                          <MapPin className="h-3.5 w-3.5 text-[#9CA3A8] shrink-0" />
                          <span>{gym.city}، {gym.district}</span>
                          {gym.distanceKm !== undefined && (
                            <span className="mr-1.5 text-[#62686D] font-persian-digits">({formatDistance(gym.distanceKm)})</span>
                          )}
                        </div>

                        {/* Active Session Info Banner */}
                        {gym.activeSession && (
                          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#1D2125] border border-[#272B30] px-2.5 py-1.5 text-xs text-[#C4C8CC] font-medium">
                            <Clock className="h-3.5 w-3.5 text-[#C8F500] shrink-0" />
                            <span>{toPersianDigits(gym.activeSession.labelFa)}</span>
                          </div>
                        )}

                        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[#9CA3A8]">
                          {gym.addressFa}
                        </p>

                        {/* Facilities Badges */}
                        {gym.facilities && gym.facilities.length > 0 && (
                          <div className="mt-3.5 flex flex-wrap gap-1.5">
                            {gym.facilities.slice(0, 3).map(f => (
                              <span
                                key={f.id}
                                className="rounded-lg bg-[#1D2125] border border-[#272B30] px-2 py-0.5 text-[11px] font-medium text-[#C4C8CC]"
                              >
                                {f.nameFa}
                              </span>
                            ))}
                            {gym.facilities.length > 3 && (
                              <span className="rounded-lg bg-[#1D2125] border border-[#272B30] px-1.5 py-0.5 text-[10px] text-[#62686D]">
                                +{gym.facilities.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action: Dynamic QR Check-in & View Details Link */}
                    <div className="p-4 sm:p-5 pt-0">
                      <div className="border-t border-[#202428] pt-3.5 space-y-2">
                        <Link
                          href={`/gyms/${gym.id}`}
                          className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#9CA3A8] hover:text-[#C8F500] transition-colors py-1"
                        >
                          <span>مشاهده برنامه سانس‌ها و جزئیات</span>
                          <span className="text-[#62686D]">&larr;</span>
                        </Link>
                        <Button
                          onClick={() => {
                            const hasToken = typeof window !== 'undefined' ? localStorage.getItem('gym_app_token') : null;
                            if (!user && !hasToken) {
                              openLoginModal('برای دریافت بارکد ورود به مجموعه ورزشی، ابتدا وارد حساب کاربری خود شوید.');
                              return;
                            }
                            setActiveQrGym({ id: gym.id, name: gym.nameFa, creditCost: gym.currentCreditCost || 4 });
                          }}
                          variant="secondary"
                          size="md"
                          className="w-full hover:border-[#C8F500]/50 hover:text-[#C8F500] transition-colors"
                          leftIcon={<QrCode className="h-4 w-4" />}
                        >
                          دریافت بارکد ورود به مجموعه
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ================================================================= */}
        {/* HOW IT WORKS (۳ گام ساده) */}
        {/* ================================================================= */}
        <section className="rounded-3xl bg-[#15181B] text-[#F4F5F2] p-8 sm:p-12 border border-[#272B30]">
          <div className="text-center max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#C8F500]/10 border border-[#C8F500]/20 px-3 py-1 text-xs font-semibold text-[#C8F500] mb-3">
              <Zap className="h-3.5 w-3.5" />
              <span>فرآیند ساده و سریع</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[#F4F5F2]">
              چگونه با گراویتی ورزش کنیم؟
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-[#9CA3A8]">
              بدون نیاز به ثبت‌نام جداگانه در هر باشگاه، در ۳ مرحله ورزش خود را آغاز کنید.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative rounded-2xl bg-[#1D2125] border border-[#272B30] p-6 flex flex-col justify-between">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#15181B] border border-[#C8F500]/30 text-[#C8F500] mb-4 font-mono font-black text-lg">
                  ۰۱
                </div>
                <h3 className="text-base font-bold text-[#F4F5F2]">انتخاب پلن اعتباری</h3>
                <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                  متناسب با میزان تمرین ماهانه خود یکی از بسته‌های اعتباری را از طریق درگاه پرداخت الکترونیک تهیه کنید.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-[#272B30] text-[11px] text-[#C8F500] flex items-center gap-1">
                <span>شارژ آنی موجودی</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative rounded-2xl bg-[#1D2125] border border-[#272B30] p-6 flex flex-col justify-between">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#15181B] border border-cyan-500/30 text-cyan-400 mb-4 font-mono font-black text-lg">
                  ۰۲
                </div>
                <h3 className="text-base font-bold text-[#F4F5F2]">انتخاب مجموعه و بررسی سانس</h3>
                <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                  از بین ۴ سطح باشگاهی، نزدیک‌ترین مجموعه را بر اساس سانس فعال آقایان یا بانوان انتخاب کرده و به باشگاه مراجعه کنید.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-[#272B30] text-[11px] text-cyan-400 flex items-center gap-1">
                <span>نمایش زنده وضعیت سانس</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative rounded-2xl bg-[#1D2125] border border-[#272B30] p-6 flex flex-col justify-between">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#15181B] border border-emerald-500/30 text-emerald-400 mb-4 font-mono font-black text-lg">
                  ۰۳
                </div>
                <h3 className="text-base font-bold text-[#F4F5F2]">اسکن بارکد پویا در پذیرش</h3>
                <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                  در کانتر پذیرش، بارکد یکتای ۴۵ ثانیه‌ای را باز کرده و اسکن کنید. ورود شما با حفظ محرمانگی کامل اطلاعات ثبت می‌شود.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-[#272B30] text-[11px] text-emerald-400 flex items-center gap-1">
                <span>ورود فوری بدون فرم کاغذی</span>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* WHY GRAVITY (۴ ستون تمایز پلتفرم) */}
        {/* ================================================================= */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black text-[#F4F5F2] tracking-tight">
              چرا ورزشکاران گراویتی را انتخاب می‌کنند؟
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-[#9CA3A8]">
              مزایای انحصاری که در هیچ اشتراک سنتی تک‌باشگاهی وجود ندارد.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-[#C8F500] mb-4">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F4F5F2]">آزادی عمل جغرافیایی</h3>
              <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                امروز در نزدیکی محل کار در ونک ورزش کنید و آخر هفته در مجموعه دیگری از شبکه تمرین کنید.
              </p>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-emerald-400 mb-4">
                <Repeat className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F4F5F2]">انتقال اعتبار سوخت‌نشده</h3>
              <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                تا سقف ۱۰ درصد از اعتبارهای استفاده‌نشده دوره با تمدید اشتراک به ماه آینده منتقل می‌شوند.
              </p>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-violet-400 mb-4">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F4F5F2]">حفظ محرمانگی هویت</h3>
              <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                کد ملی و شماره تماس شما هرگز روی مانیتور پذیرش نمایش داده نمی‌شود و حریم شخصی‌تان محفوظ است.
              </p>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-amber-400 mb-4">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F4F5F2]">بارکد ضد جعل ۴۵ ثانیه‌ای</h3>
              <p className="mt-2 text-xs text-[#9CA3A8] leading-relaxed">
                تولید پویای بارکد با امضای HMAC-SHA256 مانع از جعل یا استفاده مجدد از بارکد می‌شود.
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* FINAL CTA BANNER */}
        {/* ================================================================= */}
        <section className="rounded-3xl bg-gradient-to-r from-[#15181B] via-[#1D2125] to-[#15181B] border border-[#272B30] text-[#F4F5F2] p-8 sm:p-12 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-right max-w-xl">
            <h2 className="text-xl sm:text-3xl font-black tracking-tight text-[#F4F5F2]">
              آماده‌اید تجربه تناسب اندام خود را متحول کنید؟
            </h2>
            <p className="text-xs sm:text-sm text-[#C4C8CC] leading-relaxed">
              همین حالا پلن مناسب خود را انتخاب کرده و از مجهزترین باشگاه‌های شهر تهران لذت ببرید.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link href="/plans">
              <Button
                variant="primary"
                size="lg"
                className="px-8 shadow-xl"
              >
                مشاهده پلن‌های عضویت
              </Button>
            </Link>
          </div>
        </section>
      </div>

      {/* Dynamic QR Modal */}
      {activeQrGym && (
        <DynamicQrModal
          gymId={activeQrGym.id}
          gymName={activeQrGym.name}
          creditCost={activeQrGym.creditCost}
          onClose={() => setActiveQrGym(null)}
        />
      )}

      {/* Platform Footer */}
      <Footer />
    </div>
  );
}
