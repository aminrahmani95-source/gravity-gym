'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Footer } from '@/components/footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicQrModal } from '@/components/dynamic-qr-modal';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api';
import { toPersianDigits } from '@/lib/formatters';
import { Gym, GymTier, GymAccessMode, Gender, GymSans } from '@gym-app/shared-types';
import {
  MapPin,
  Clock,
  ArrowRight,
  ShieldCheck,
  QrCode,
  Calendar,
  Phone,
  CheckCircle2,
  AlertCircle,
  Dumbbell
} from 'lucide-react';

const IRANIAN_DAY_NAMES: Record<number, string> = {
  0: '╪┤┘╪ذ┘ç',
  1: '█î┌رظî╪┤┘╪ذ┘ç',
  2: '╪»┘ê╪┤┘╪ذ┘ç',
  3: '╪│┘çظî╪┤┘╪ذ┘ç',
  4: '┌┘ç╪د╪▒╪┤┘╪ذ┘ç',
  5: '┘╛┘╪شظî╪┤┘╪ذ┘ç',
  6: '╪ش┘à╪╣┘ç',
};

export default function GymDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, openLoginModal } = useAuth();
  const gymId = params?.id as string;

  const [gym, setGym] = useState<Gym | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dynamic QR Modal State
  const [isQrOpen, setIsQrOpen] = useState(false);

  useEffect(() => {
    if (!gymId) return;

    let isMounted = true;
    async function fetchGymDetails() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiFetch<Gym>(`/gyms/${gymId}`);
        if (isMounted) {
          setGym(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || '╪«╪╖╪د ╪»╪▒ ╪ذ╪د╪▒┌»╪░╪د╪▒█î ╪د╪╖┘╪د╪╣╪د╪ز ┘à╪ش┘à┘ê╪╣┘ç ┘ê╪▒╪▓╪┤█î');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchGymDetails();
    return () => {
      isMounted = false;
    };
  }, [gymId]);

  const getTierImage = (tier?: GymTier) => {
    switch (tier) {
      case GymTier.BASIC:
        return '/images/gym-caro.jpg';
      case GymTier.PLUS:
        return '/images/gym-vanak.jpg';
      case GymTier.PREMIUM:
        return '/images/gym-oxygen.jpg';
      case GymTier.ELITE:
        return '/images/gym-espinas.jpg';
      default:
        return '/images/hero-athletic.jpg';
    }
  };

  const getTierBadgeVariant = (tier?: GymTier): 'tier-basic' | 'tier-plus' | 'tier-premium' | 'tier-elite' | 'default' => {
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

  const getTierTitleFa = (tier?: GymTier) => {
    switch (tier) {
      case GymTier.BASIC:
        return '╪ذ█î╪│█î┌ر (Basic)';
      case GymTier.PLUS:
        return '┘╛┘╪د╪│ (Plus)';
      case GymTier.PREMIUM:
        return '┘╛╪▒█î┘à█î┘ê┘à (Premium)';
      case GymTier.ELITE:
        return '╪د┘█î╪ز (Elite)';
      default:
        return '┘╪د┘à╪┤╪«╪╡';
    }
  };

  const getAccessModeBadge = (mode?: GymAccessMode) => {
    switch (mode) {
      case GymAccessMode.FEMALE_ONLY:
        return (
          <span className="rounded-xl bg-rose-950/60 border border-rose-800/60 px-2.5 py-1 text-xs font-bold text-rose-400">
            ┘ê█î┌ء┘ç ╪ذ╪د┘┘ê╪د┘
          </span>
        );
      case GymAccessMode.MALE_ONLY:
        return (
          <span className="rounded-xl bg-cyan-950/60 border border-cyan-800/60 px-2.5 py-1 text-xs font-bold text-cyan-400">
            ┘ê█î┌ء┘ç ╪ت┘é╪د█î╪د┘
          </span>
        );
      case GymAccessMode.MIXED:
      default:
        return (
          <span className="rounded-xl bg-[#1D2125] border border-[#272B30] px-2.5 py-1 text-xs font-medium text-[#C4C8CC]">
            ╪│╪د┘╪│ظî┘ç╪د█î ╪ز┘┌ر█î┌رظî╪┤╪»┘ç
          </span>
        );
    }
  };

  const handleOpenQr = () => {
    const hasToken = typeof window !== 'undefined' ? localStorage.getItem('gym_app_token') : null;
    if (!user && !hasToken) {
      openLoginModal('╪ش┘ç╪ز ╪»╪▒█î╪د┘╪ز ╪ذ╪د╪▒┌ر╪» ┘ê╪▒┘ê╪» ┘ê ┘à╪╡╪▒┘ ╪د╪╣╪ز╪ذ╪د╪▒╪î ╪د╪ذ╪ز╪»╪د ┘ê╪د╪▒╪» ╪ص╪│╪د╪ذ ┌ر╪د╪▒╪ذ╪▒█î ╪«┘ê╪» ╪┤┘ê█î╪».');
      return;
    }
    setIsQrOpen(true);
  };

  // Group weekly sans by day
  const groupedSans: Record<number, GymSans[]> = {};
  for (let d = 0; d < 7; d++) {
    groupedSans[d] = [];
  }
  if (gym?.sans) {
    gym.sans.forEach(s => {
      const day = s.dayOfWeek ?? 0;
      if (!groupedSans[day]) groupedSans[day] = [];
      groupedSans[day].push(s);
    });
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0D0F10] text-[#F4F5F2]" dir="rtl">
      <div>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
          {/* Back Navigation Button */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-bold text-[#9CA3A8] hover:text-[#C8F500] transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
              <span>╪ذ╪د╪▓┌»╪┤╪ز ╪ذ┘ç ┌ر╪د┘ê╪┤ ╪ذ╪د╪┤┌»╪د┘çظî┘ç╪د</span>
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-64 rounded-3xl bg-[#15181B] border border-[#272B30]" />
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="h-96 rounded-3xl bg-[#15181B] border border-[#272B30] lg:col-span-2" />
                <div className="h-96 rounded-3xl bg-[#15181B] border border-[#272B30]" />
              </div>
            </div>
          ) : error || !gym ? (
            <div className="rounded-3xl border border-red-800/80 bg-red-950/60 p-8 text-center space-y-4">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto" />
              <h2 className="text-lg font-bold text-red-200">{error || '┘à╪ش┘à┘ê╪╣┘ç ┘ê╪▒╪▓╪┤█î █î╪د┘╪ز ┘╪┤╪».'}</h2>
              <Button onClick={() => router.push('/')} variant="outline" size="sm">
                ┘à╪┤╪د┘ç╪»┘ç ┘ç┘à┘ç ┘à╪ش┘à┘ê╪╣┘çظî┘ç╪د
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Gym Header Banner with Atmosphere Cover */}
              <div className="relative overflow-hidden rounded-3xl border border-[#272B30] bg-[#121517] text-[#F4F5F2] shadow-xl">
                <div className="relative h-64 sm:h-80 w-full overflow-hidden">
                  <img
                    src={getTierImage(gym.tier)}
                    alt={gym.nameFa}
                    className="h-full w-full object-cover opacity-60 filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121517] via-[#121517]/40 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={getTierBadgeVariant(gym.tier)} size="md" className="shadow-md">
                        <bdi>{getTierTitleFa(gym.tier)}</bdi>
                      </Badge>
                      {getAccessModeBadge(gym.accessMode)}
                    </div>
                    <span className="text-[11px] text-[#9CA3A8] bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-white/10">
                      ╪ز╪╡┘ê█î╪▒ ┘┘à╪د╪»█î┘ ┘à╪ص█î╪╖█î
                    </span>
                  </div>

                  {/* Bottom Content */}
                  <div className="absolute bottom-6 right-6 left-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="space-y-2">
                      <h1 className="text-2xl sm:text-4xl font-black text-[#F4F5F2] tracking-tight">
                        {gym.nameFa}
                      </h1>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-[#C4C8CC]">
                        <MapPin className="h-4 w-4 text-[#C8F500] shrink-0" />
                        <span>{gym.city}╪î {gym.district} ظ¤ {gym.addressFa}</span>
                      </div>
                    </div>

                    {/* Cost & Check-in Button */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="rounded-2xl bg-[#0D0F10]/80 backdrop-blur-md border border-[#272B30] px-4 py-2 text-center">
                        <span className="block text-xl font-black font-persian-digits text-[#C8F500]">
                          {toPersianDigits(gym.currentCreditCost)}
                        </span>
                        <span className="text-[11px] text-[#9CA3A8] font-normal">╪د╪╣╪ز╪ذ╪د╪▒ ┘ç╪▒ ╪ش┘╪│┘ç</span>
                      </div>
                      <Button
                        onClick={handleOpenQr}
                        variant="primary"
                        size="md"
                        leftIcon={<QrCode className="h-5 w-5 text-[#0D0F11]" />}
                      >
                        ╪»╪▒█î╪د┘╪ز ╪ذ╪د╪▒┌ر╪» ┘ê╪▒┘ê╪»
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Alert & Active Session */}
              {gym.activeSession ? (
                <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#C8F500]/30 text-[#C8F500] shrink-0">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#C8F500] animate-pulse" />
                        <span className="text-xs font-bold text-[#C8F500]">┘à╪ش┘à┘ê╪╣┘ç ┘ç┘àظî╪د┌ر┘┘ê┘ ╪ذ╪د╪▓ ╪د╪│╪ز</span>
                      </div>
                      <h3 className="text-sm font-bold text-[#F4F5F2] mt-0.5">
                        {toPersianDigits(gym.activeSession.labelFa)}
                      </h3>
                    </div>
                  </div>

                  <div className="text-xs text-[#C8F500] bg-[#1D2125] border border-[#272B30] rounded-xl px-3 py-1.5 font-medium">
                    ╪│╪د╪╣╪ز ┌ر╪د╪▒█î ┘╪╣┘█î: {toPersianDigits(gym.activeSession.startTime)} ╪د┘█î {toPersianDigits(gym.activeSession.endTime)}
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-4 sm:p-5 flex items-center gap-3 text-[#9CA3A8]">
                  <Clock className="h-5 w-5 text-[#62686D] shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-[#F4F5F2]">╪»╪▒ ╪د█î┘ ┘╪ص╪╕┘ç ╪│╪د┘╪│█î ┘╪╣╪د┘ ┘┘à█îظî╪ذ╪د╪┤╪».</span>
                    <p className="text-xs text-[#9CA3A8] mt-0.5">
                      ╪ذ╪▒╪د█î ┘à╪▒╪د╪ش╪╣┘ç╪î ╪ذ╪▒┘╪د┘à┘ç ╪▓┘à╪د┘ظî╪ذ┘╪»█î ┘ç┘╪ز┌»█î ╪│╪د┘╪│ظî┘ç╪د█î ╪▓█î╪▒ ╪▒╪د ╪ذ╪▒╪▒╪│█î ┘╪▒┘à╪د█î█î╪».
                    </p>
                  </div>
                </div>
              )}

              {/* Main Content Grid: 2 cols schedule & facilities, 1 col info card */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left 2 Cols: Weekly Schedule */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Weekly Sans Table */}
                  <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-[#202428] pb-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-[#C8F500]" />
                        <h2 className="text-base font-bold text-[#F4F5F2]">
                          ╪ذ╪▒┘╪د┘à┘ç ╪▓┘à╪د┘ظî╪ذ┘╪»█î ┘ê ╪│╪د┘╪│ظî┘ç╪د█î ┘ç┘╪ز┌»█î
                        </h2>
                      </div>
                      <span className="text-xs text-[#9CA3A8]">
                        ╪│╪د╪╣╪ز ╪▒╪│┘à█î ╪ز┘ç╪▒╪د┘
                      </span>
                    </div>

                    <div className="space-y-3">
                      {[0, 1, 2, 3, 4, 5, 6].map(day => {
                        const sansList = groupedSans[day] || [];
                        return (
                          <div
                            key={day}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border border-[#272B30] bg-[#1D2125]/70 p-3.5 hover:bg-[#1D2125] transition-colors"
                          >
                            <span className="text-xs font-bold text-[#F4F5F2] w-24 shrink-0">
                              {IRANIAN_DAY_NAMES[day]}
                            </span>

                            {sansList.length === 0 ? (
                              <span className="text-xs text-[#62686D]">╪ز╪╣╪╖█î┘ / ╪ذ╪»┘ê┘ ╪│╪د┘╪│</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2 flex-1 sm:justify-end">
                                {sansList.map(s => {
                                  const isFemale = s.gender === Gender.FEMALE;
                                  return (
                                    <div
                                      key={s.id}
                                      className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-1 text-xs border font-medium ${
                                        isFemale
                                          ? 'bg-rose-950/60 border-rose-800/60 text-rose-300'
                                          : 'bg-cyan-950/60 border-cyan-800/60 text-cyan-300'
                                      }`}
                                    >
                                      <span className="font-bold">
                                        {isFemale ? '╪ذ╪د┘┘ê╪د┘' : '╪ت┘é╪د█î╪د┘'}:
                                      </span>
                                      <span className="font-persian-digits">
                                        {toPersianDigits(s.startTime.slice(0, 5))} ╪ز╪د {toPersianDigits(s.endTime.slice(0, 5))}
                                      </span>
                                      {s.isPeak && (
                                        <span className="rounded bg-amber-950/70 border border-amber-800/70 px-1 text-[10px] text-amber-300 font-normal">
                                          ┘╛█î┌ر
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Verified Facilities Card */}
                  {gym.facilities && gym.facilities.length > 0 && (
                    <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-[#202428] pb-4">
                        <Dumbbell className="h-5 w-5 text-[#C8F500]" />
                        <h2 className="text-base font-bold text-[#F4F5F2]">
                          ╪د┘à┌ر╪د┘╪د╪ز ┘ê ╪ز╪ش┘ç█î╪▓╪د╪ز ╪س╪ذ╪زظî╪┤╪»┘ç ┘à╪ش┘à┘ê╪╣┘ç
                        </h2>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {gym.facilities.map(f => (
                          <div
                            key={f.id}
                            className="flex items-center gap-2 rounded-xl border border-[#272B30] bg-[#1D2125] p-3 text-xs text-[#C4C8CC] font-medium"
                          >
                            <CheckCircle2 className="h-4 w-4 text-[#C8F500] shrink-0" />
                            <span>{f.nameFa}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right 1 Col: Location, Rules & Reception Verification Info */}
                <div className="space-y-6">
                  {/* Location & Contact Info */}
                  <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-[#F4F5F2] border-b border-[#202428] pb-3 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#C8F500]" />
                      <span>┘à┘ê┘é╪╣█î╪ز ┘ê ╪ت╪»╪▒╪│ ┘à╪ش┘à┘ê╪╣┘ç</span>
                    </h3>

                    <div className="space-y-3 text-xs leading-relaxed text-[#9CA3A8]">
                      <div>
                        <span className="font-bold text-[#F4F5F2]">┘╪┤╪د┘█î ╪»┘é█î┘é:</span>
                        <p className="mt-1">{gym.addressFa}</p>
                      </div>

                      {gym.phone && (
                        <div className="flex items-center gap-2 pt-2 border-t border-[#202428]">
                          <Phone className="h-3.5 w-3.5 text-[#9CA3A8]" />
                          <span className="font-bold text-[#F4F5F2]">╪ز┘┘┘:</span>
                          <span className="font-persian-digits text-[#C4C8CC]">{toPersianDigits(gym.phone)}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-[#202428]">
                        <span className="font-bold text-[#F4F5F2]">╪┤╪╣╪د╪╣ ┘à┘ê┘é╪╣█î╪ز ┘à┌ر╪د┘█î ┌┌رظî╪د█î┘:</span>
                        <span className="mr-1.5 font-persian-digits text-[#C4C8CC]">
                          {toPersianDigits(gym.geofenceRadiusMeters || 150)} ┘à╪ز╪▒
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Gravity Check-in Guidelines */}
                  <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs space-y-4">
                    <h3 className="text-sm font-bold text-[#F4F5F2] border-b border-[#202428] pb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span>┘é┘ê╪د┘█î┘ ┘╛╪░█î╪▒╪┤ ┘ê ┌┌رظî╪د█î┘</span>
                    </h3>

                    <ul className="space-y-2.5 text-xs text-[#9CA3A8] leading-relaxed list-disc list-inside">
                      <li>┘ê╪▒┘ê╪» ╪ذ┘ç ╪ذ╪د╪┤┌»╪د┘ç ╪╡╪▒┘╪د┘ï ╪»╪▒ ╪│╪د┘╪│ظî┘ç╪د█î ┘à╪ش╪د╪▓ ┘ê ┘à╪╖╪د╪ذ┘é ╪ذ╪د ╪ش┘╪│█î╪ز ╪ص╪│╪د╪ذ ┌ر╪د╪▒╪ذ╪▒█î ╪د┘à┌ر╪د┘ظî┘╛╪░█î╪▒ ╪د╪│╪ز.</li>
                      <li>╪ذ╪د╪▒┌ر╪» ┘╛┘ê█î╪د (Dynamic QR) ┘ç╪▒ █┤█╡ ╪س╪د┘█î┘ç █î┌رظî╪ذ╪د╪▒ ┘┘ê╪│╪د╪▓█î ╪┤╪»┘ç ┘ê ┘┘é╪╖ █î┌رظî╪ذ╪د╪▒ ┘à╪╡╪▒┘ ╪د╪│╪ز.</li>
                      <li>┘╛╪│ ╪د╪▓ ╪ز╪ث█î█î╪» ╪ذ╪د╪▒┌ر╪» ╪»╪▒ ┌»█î╪ز ┘╛╪░█î╪▒╪┤╪î {toPersianDigits(gym.currentCreditCost)} ╪د╪╣╪ز╪ذ╪د╪▒ ╪د╪▓ ┌ر█î┘ ┘╛┘ê┘ ╪┤┘à╪د ┌ر╪│╪▒ ┘à█îظî┌»╪▒╪»╪».</li>
                      <li>┘╪د╪╡┘┘ç ╪▓┘à╪د┘█î ╪د┘╪▓╪د┘à█î ╪ذ█î┘ ╪»┘ê ┌┌رظî╪د█î┘ ┘à╪ز┘ê╪د┘█î █╢█░ ╪»┘é█î┘é┘ç ╪د╪│╪ز.</li>
                    </ul>
                  </div>

                  {/* Bottom Action Card */}
                  <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 text-center space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1D2125] border border-[#C8F500]/30 text-[#C8F500] mx-auto shadow-md">
                      <QrCode className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-[#F4F5F2]">╪ت┘à╪د╪»┘ç ┘ê╪▒┘ê╪» ┘ç╪│╪ز█î╪»╪ا</h4>
                      <p className="text-xs text-[#9CA3A8]">╪ذ╪د╪▒┌ر╪» ╪«┘ê╪» ╪▒╪د ╪▒┘ê█î ╪»╪│╪ز┌»╪د┘ç ╪د╪│┌ر┘╪▒ ┘╛╪░█î╪▒╪┤ ┘é╪▒╪د╪▒ ╪»┘ç█î╪».</p>
                    </div>
                    <Button
                      onClick={handleOpenQr}
                      variant="primary"
                      size="md"
                      className="w-full"
                      leftIcon={<QrCode className="h-4 w-4 text-[#0D0F11]" />}
                    >
                      ╪»╪▒█î╪د┘╪ز ╪ذ╪د╪▒┌ر╪» ┘ê╪▒┘ê╪»█î
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Platform Footer */}
      <Footer />

      {/* Dynamic QR Checkin Modal */}
      {isQrOpen && gym && (
        <DynamicQrModal
          gymId={gym.id}
          gymName={gym.nameFa}
          creditCost={gym.currentCreditCost || 4}
          onClose={() => setIsQrOpen(false)}
        />
      )}
    </div>
  );
}
