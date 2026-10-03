'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import {
  CoachClass,
  ClassCategory,
  ClassVenueType,
  ClassDifficulty,
} from '@gym-app/shared-types';
import {
  Dumbbell,
  Search,
  Filter,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  ChevronLeft,
  Video,
  Award,
  Users,
} from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { toPersianDigits, formatTomans } from '../../lib/formatters';

export default function ClassesDiscoveryPage() {
  const [classes, setClasses] = useState<CoachClass[]>([]);
  const [categories, setCategories] = useState<ClassCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedVenueType, setSelectedVenueType] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [classesData, categoriesData] = await Promise.all([
          apiFetch<CoachClass[]>('/classes'),
          apiFetch<ClassCategory[]>('/classes/categories').catch(() => []),
        ]);
        setClasses(classesData || []);
        setCategories(categoriesData || []);
      } catch (err) {
        console.error('Failed to load classes data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      // Category filter
      if (selectedCategory !== 'ALL' && c.categorySlug !== selectedCategory) {
        return false;
      }
      // Venue type filter
      if (selectedVenueType !== 'ALL' && c.venue?.venueType !== selectedVenueType) {
        return false;
      }
      // Difficulty filter
      if (selectedDifficulty !== 'ALL' && c.difficulty !== selectedDifficulty) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = c.title.toLowerCase().includes(q);
        const descMatch = c.description?.toLowerCase().includes(q);
        const coachMatch = c.coach?.displayName.toLowerCase().includes(q);
        const venueMatch = c.venue?.nameFa.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !coachMatch && !venueMatch) {
          return false;
        }
      }
      return true;
    });
  }, [classes, selectedCategory, selectedVenueType, selectedDifficulty, searchQuery]);

  const getVenueBadge = (type?: ClassVenueType) => {
    switch (type) {
      case ClassVenueType.GRAVITY_GYM:
        return <Badge variant="tier-elite" size="sm">باشگاه گراویتی</Badge>;
      case ClassVenueType.PARTNER_GYM:
        return <Badge variant="tier-premium" size="sm">باشگاه همکار</Badge>;
      case ClassVenueType.EXTERNAL_GYM:
        return <Badge variant="tier-plus" size="sm">باشگاه مستقل</Badge>;
      case ClassVenueType.ONLINE:
        return (
          <Badge variant="warning" size="sm" className="flex items-center gap-1">
            <Video className="w-3 h-3" /> آنلاین
          </Badge>
        );
      default:
        return <Badge variant="default" size="sm">استودیو مستقل</Badge>;
    }
  };

  const getDifficultyLabel = (diff: ClassDifficulty) => {
    switch (diff) {
      case ClassDifficulty.BEGINNER:
        return 'مبتدی';
      case ClassDifficulty.INTERMEDIATE:
        return 'متوسط';
      case ClassDifficulty.ADVANCED:
        return 'پیشرفته';
      default:
        return 'همه سطوح';
    }
  };

  return (
    <div className="min-h-screen bg-[#0D0F11] text-[#F4F5F2] pb-24">
      {/* Header Banner */}
      <section className="border-b border-[#272B30] bg-[#111417]/80 backdrop-blur-md pt-8 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#C8F500]/30 bg-[#C8F500]/10 px-3 py-1 text-xs font-bold text-[#C8F500] mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                کلاس‌های تخصصی مربیان مستقل
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#F4F5F2] tracking-tight">
                تمرین مستقیم با بهترین مربیان
              </h1>
              <p className="mt-2 text-sm text-[#9CA3A8] max-w-2xl">
                یک جلسه رزرو کنید و با خیال راحت تجربه کنید. در صورت تمایل، می‌توانید بسته تمرینی ماهانه مربی را با تخفیف ویژه تهیه نمایید.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/coach"
                className="flex items-center gap-2 rounded-xl bg-[#15181B] border border-[#272B30] hover:border-[#C8F500]/40 px-4 py-2.5 text-xs sm:text-sm font-bold text-[#F4F5F2] hover:text-[#C8F500] transition-all"
              >
                <Award className="w-4 h-4 text-[#C8F500]" />
                پنل و ثبت‌نام مربیان
              </Link>
            </div>
          </div>

          {/* Search Box */}
          <div className="mt-6 relative max-w-2xl">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3A8]" />
            <input
              type="text"
              placeholder="جستجوی کلاس، نام مربی یا نام سالن تمرین..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-[#272B30] bg-[#15181B] pr-12 pl-4 py-3.5 text-sm text-[#F4F5F2] placeholder-[#71767B] focus:border-[#C8F500] focus:outline-none focus:ring-1 focus:ring-[#C8F500] transition-all shadow-inner"
            />
          </div>
        </div>
      </section>

      {/* Filter Chips Bar */}
      <section className="border-b border-[#272B30] bg-[#0D0F11] py-4 sticky top-16 z-20 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          {/* Categories Horizontal Scroll */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`rounded-xl px-3.5 py-1.5 shrink-0 transition-all cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                  : 'bg-[#15181B] border border-[#272B30] text-[#9CA3A8] hover:text-[#F4F5F2]'
              }`}
            >
              همه رشته‌ها
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.slug)}
                className={`rounded-xl px-3.5 py-1.5 shrink-0 transition-all cursor-pointer ${
                  selectedCategory === cat.slug
                    ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                    : 'bg-[#15181B] border border-[#272B30] text-[#9CA3A8] hover:text-[#F4F5F2]'
                }`}
              >
                {cat.nameFa}
              </button>
            ))}
          </div>

          {/* Sub Filters: Venue Type & Difficulty */}
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <div className="flex items-center gap-1.5 text-[#9CA3A8]">
              <Filter className="w-3.5 h-3.5 text-[#C8F500]" />
              <span>محل برگزاری:</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {[
                { id: 'ALL', label: 'همه مکان‌ها' },
                { id: ClassVenueType.GRAVITY_GYM, label: 'باشگاه‌های گراویتی' },
                { id: ClassVenueType.PARTNER_GYM, label: 'باشگاه‌های همکار' },
                { id: ClassVenueType.EXTERNAL_GYM, label: 'باشگاه‌های مستقل' },
                { id: ClassVenueType.ONLINE, label: 'کلاس آنلاین' },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVenueType(v.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] transition-all cursor-pointer ${
                    selectedVenueType === v.id
                      ? 'bg-[#272B30] text-[#C8F500] font-bold border border-[#C8F500]/30'
                      : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="h-3 w-px bg-[#272B30] hidden md:block" />

            <div className="flex items-center gap-1.5">
              <span className="text-[#9CA3A8]">سطح:</span>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="bg-[#15181B] border border-[#272B30] text-[#F4F5F2] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#C8F500]"
              >
                <option value="ALL">همه سطوح</option>
                <option value={ClassDifficulty.ALL_LEVELS}>عمومی</option>
                <option value={ClassDifficulty.BEGINNER}>مبتدی</option>
                <option value={ClassDifficulty.INTERMEDIATE}>متوسط</option>
                <option value={ClassDifficulty.ADVANCED}>پیشرفته</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Main Grid Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-80 rounded-2xl bg-[#15181B] border border-[#272B30] animate-pulse p-6"
              />
            ))}
          </div>
        ) : filteredClasses.length === 0 ? (
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-12 text-center max-w-lg mx-auto my-12">
            <div className="w-16 h-16 rounded-2xl bg-[#272B30] text-[#9CA3A8] flex items-center justify-center mx-auto mb-4">
              <Dumbbell className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[#F4F5F2]">کلاسی با این مشخصات یافت نشد</h3>
            <p className="mt-2 text-xs text-[#9CA3A8]">
              لطفاً فیلترهای اعمال‌شده یا عبارت جستجو را تغییر دهید تا نتایج بیشتری مشاهده فرمایید.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
                setSelectedVenueType('ALL');
                setSelectedDifficulty('ALL');
              }}
              className="mt-6 rounded-xl bg-[#C8F500] text-[#0D0F11] font-black px-4 py-2 text-xs hover:bg-[#D6FB33] transition-all cursor-pointer"
            >
              پاک‌کردن فیلترها
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses.map((cls) => (
              <article
                key={cls.id}
                className="group flex flex-col justify-between rounded-2xl border border-[#272B30] bg-[#15181B] hover:border-[#C8F500]/50 hover:shadow-lg hover:shadow-[#C8F500]/5 transition-all duration-200 overflow-hidden"
              >
                <div>
                  {/* Card Header & Badges */}
                  <div className="p-5 pb-3">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {getVenueBadge(cls.venue?.venueType)}
                      <span className="text-[11px] font-bold text-[#9CA3A8] bg-[#272B30] px-2 py-0.5 rounded-md">
                        {getDifficultyLabel(cls.difficulty)}
                      </span>
                    </div>

                    <h2 className="text-base sm:text-lg font-bold text-[#F4F5F2] group-hover:text-[#C8F500] transition-colors line-clamp-1">
                      {cls.title}
                    </h2>

                    <p className="mt-1.5 text-xs text-[#9CA3A8] line-clamp-2 leading-relaxed">
                      {cls.description}
                    </p>
                  </div>

                  {/* Coach Profile Strip */}
                  <div className="px-5 py-3 border-y border-[#272B30]/60 bg-[#111417]/50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#272B30] border border-[#353B41] flex items-center justify-center font-bold text-sm text-[#C8F500] shrink-0">
                        {cls.coach?.displayName?.slice(0, 1) || 'م'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-[#F4F5F2] truncate">
                            {cls.coach?.displayName}
                          </span>
                          <span className="text-[10px] text-[#C8F500] font-normal">
                            ({toPersianDigits(cls.coach?.experienceYears || 5)} سال تجربه)
                          </span>
                        </div>
                        <span className="text-[11px] text-[#9CA3A8] truncate block">
                          {cls.categoryNameFa || 'ورزش تخصصی'}
                        </span>
                      </div>
                    </div>

                    {cls.hasMonthlyPlan && (
                      <span className="shrink-0 text-[10px] font-bold text-[#C8F500] bg-[#C8F500]/10 border border-[#C8F500]/20 px-2 py-0.5 rounded-full">
                        بسته ماهانه
                      </span>
                    )}
                  </div>

                  {/* Venue & Location Strip */}
                  <div className="p-5 py-3 text-xs text-[#9CA3A8] space-y-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-[#C8F500] shrink-0" />
                      <span className="truncate text-[#F4F5F2]">
                        {cls.venue?.nameFa || 'مکان اختصاصی کلاس'}
                      </span>
                      {cls.venue?.district && (
                        <span className="text-[11px] text-[#9CA3A8] shrink-0">
                          ({cls.venue.district})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#9CA3A8]" />
                        {toPersianDigits(cls.durationMinutes)} دقیقه
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-[#9CA3A8]" />
                        ظرفیت: {toPersianDigits(cls.defaultCapacity)} نفر
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Pricing & Booking CTA */}
                <div className="p-5 pt-3 border-t border-[#272B30] bg-[#15181B] flex items-center justify-between gap-3">
                  <div>
                    <span className="block text-[10px] text-[#9CA3A8]">قیمت تک‌جلسه:</span>
                    <span className="text-base font-black text-[#C8F500]">
                      {formatTomans(cls.singleSessionPriceTomans)}
                    </span>
                  </div>

                  <Link
                    href={`/classes/${cls.id}`}
                    className="flex items-center gap-1.5 rounded-xl bg-[#C8F500] hover:bg-[#D6FB33] active:bg-[#B3DC00] text-[#0D0F11] font-bold px-3.5 py-2 text-xs transition-all shadow-xs"
                  >
                    <span>مشاهده و رزرو</span>
                    <ChevronLeft className="w-4 h-4 rtl-flip" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
