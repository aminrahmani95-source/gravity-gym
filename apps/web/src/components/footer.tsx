'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dumbbell, ShieldCheck, QrCode, Lock, Zap } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { UserRole } from '@gym-app/shared-types';

export const Footer: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isStaff = mounted && !isLoading && (user?.role === UserRole.GYM_STAFF || user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN);
  const isAdmin = mounted && !isLoading && (user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN);

  return (
    <footer className="border-t border-[#202428] bg-[#0A0C0E] text-[#9CA3A8]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand Info (2 columns on large screens) */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3 group inline-flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15181B] border border-[#C8F500]/30 text-[#C8F500] shadow-md shadow-[#C8F500]/5 group-hover:border-[#C8F500] transition-colors">
                <Dumbbell className="h-5 w-5 rtl-flip text-[#C8F500]" />
              </div>
              <div>
                <span className="text-lg font-black tracking-tight text-[#F4F5F2] group-hover:text-[#C8F500] transition-colors">
                  گراویتی اسپرت
                </span>
                <span className="block text-[11px] font-medium text-[#9CA3A8]">
                  شبکه اعتباری و متصل باشگاه‌های ورزشی
                </span>
              </div>
            </Link>
            <p className="text-xs text-[#9CA3A8] leading-relaxed max-w-sm">
              پلتفرم مدرن عضویت چندباشگاهی با اعتبار شناور؛ ورزش در مراکز و سالن‌های ورزشی منتخب با یک اشتراک هوشمند و پذیرش آنی.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 rounded-xl bg-[#15181B] border border-[#272B30] px-2.5 py-1 text-[11px] text-[#C4C8CC]">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>تراکنش یکتا (Idempotent)</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-[#15181B] border border-[#272B30] px-2.5 py-1 text-[11px] text-[#C4C8CC]">
                <QrCode className="h-3.5 w-3.5 text-[#C8F500]" />
                <span>بارکد ۴۵ ثانیه‌ای</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl bg-[#15181B] border border-[#272B30] px-2.5 py-1 text-[11px] text-[#C4C8CC]">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>HMAC-SHA256</span>
              </div>
            </div>
          </div>

          {/* Links: Platform & Athletes */}
          <div>
            <h4 className="text-xs font-bold text-[#F4F5F2] uppercase tracking-wider mb-4 border-r-2 border-[#C8F500] pr-2">
              ورزشکاران و اشتراک
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link href="/" className="hover:text-[#C8F500] transition-colors">
                  کشف باشگاه‌ها
                </Link>
              </li>
              <li>
                <Link href="/plans" className="hover:text-[#C8F500] transition-colors">
                  پلن‌های عضویت اعتباری
                </Link>
              </li>
              <li>
                <span className="text-[#62686D] cursor-not-allowed">
                  سیاست انتقال اعتبار (Rollover)
                </span>
              </li>
              <li>
                <span className="text-[#62686D] cursor-not-allowed">
                  راهنمای سطوح ورزشی
                </span>
              </li>
            </ul>
          </div>

          {/* Links: Partners & Gyms (Strictly Role-Aware) */}
          <div>
            <h4 className="text-xs font-bold text-[#F4F5F2] uppercase tracking-wider mb-4 border-r-2 border-violet-500 pr-2">
              باشگاه‌ها و همکاران
            </h4>
            <ul className="space-y-2.5 text-xs">
              {isAdmin && (
                <li>
                  <Link href="/admin" className="text-amber-400 hover:text-amber-300 font-semibold transition-colors flex items-center gap-1.5">
                    <span>داشبورد مدیریت و مانیتورینگ</span>
                  </Link>
                </li>
              )}
              {isStaff && (
                <li>
                  <Link href="/reception" className="text-violet-400 hover:text-violet-300 font-semibold transition-colors flex items-center gap-1.5">
                    <span>ترمینال پذیرش (QR Scanner)</span>
                  </Link>
                </li>
              )}
              <li>
                <span className="text-[#62686D] cursor-not-allowed">
                  پیوستن باشگاه به شبکه
                </span>
              </li>
              <li>
                <span className="text-[#62686D] cursor-not-allowed">
                  راهنمای همکاری و استانداردهای کیفی
                </span>
              </li>
              <li>
                <span className="text-[#62686D] cursor-not-allowed">
                  محاسبه‌گر تسویه اعتباری
                </span>
              </li>
            </ul>
          </div>

          {/* Links: Trust & Standards */}
          <div>
            <h4 className="text-xs font-bold text-[#F4F5F2] uppercase tracking-wider mb-4 border-r-2 border-emerald-500 pr-2">
              استانداردهای پلتفرم
            </h4>
            <ul className="space-y-2.5 text-xs text-[#9CA3A8]">
              <li className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-amber-400 shrink-0" />
                <span>حفظ حریم خصوصی ورزشکاران</span>
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>عدم امکان جعل بارکد ورود</span>
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>پروتکل یکتایی تراکنش بانکی</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#353B41] shrink-0" />
                <span>پشتیبانی شبانه‌روزی</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 border-t border-[#1D2125] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#62686D]">
          <p>© ۱۴۰۵ تمامی حقوق مادی و معنوی متعلق به سامانه گراویتی اسپرت است.</p>
          <div className="flex items-center gap-4 text-[#9CA3A8]">
            <span>تهران، ایران</span>
            <span>•</span>
            <span>نسخه ۳.۰ تولیدی</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
