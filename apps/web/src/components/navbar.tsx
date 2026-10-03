'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/auth-context';
import { UserRole } from '@gym-app/shared-types';
import {
  Dumbbell,
  Compass,
  CreditCard,
  QrCode,
  ShieldAlert,
  UserCircle,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { toPersianDigits } from '../lib/formatters';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { user, isLoading, isDemoLoginEnabled, switchDemoRole, logout, openLoginModal } = useAuth();

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
      case UserRole.ADMIN:
        return <Badge variant="warning" size="sm">ادمین</Badge>;
      case UserRole.GYM_STAFF:
        return <Badge variant="tier-premium" size="sm">پذیرش</Badge>;
      case UserRole.COACH:
        return <Badge variant="tier-elite" size="sm">مربی</Badge>;
      default:
        return <Badge variant="default" size="sm">ورزشکار</Badge>;
    }
  };

  interface NavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick?: () => void;
  }

  // Base links always available to everyone
  const baseNavLinks: NavItem[] = [
    { href: '/', label: 'کشف باشگاه‌ها', icon: Compass },
    { href: '/classes', label: 'کلاس‌های ورزشی', icon: Dumbbell },
    { href: '/plans', label: 'پلن‌های عضویت', icon: CreditCard },
  ];

  const memberLink: NavItem = { href: '/account', label: 'حساب من', icon: UserCircle };
  const coachLink: NavItem = { href: '/coach', label: 'پنل مربیگری', icon: Dumbbell };

  // Role-sensitive staff & admin links
  const staffLinks: NavItem[] = [
    { href: '/reception', label: 'کانتر پذیرش', icon: QrCode },
  ];
  const adminLinks: NavItem[] = [
    { href: '/admin', label: 'پنل مدیریت', icon: ShieldAlert },
  ];

  // Strictly role-isolated desktop links:
  // When loading or unauthenticated, only base links are visible (zero privileged link leak or hydration flash)
  let desktopNavLinks: NavItem[] = [...baseNavLinks];

  if (!isLoading && user) {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      desktopNavLinks = [...baseNavLinks, ...staffLinks, ...adminLinks, coachLink, memberLink];
    } else if (user.role === UserRole.GYM_STAFF) {
      desktopNavLinks = [...baseNavLinks, ...staffLinks, memberLink];
    } else if (user.role === UserRole.COACH) {
      desktopNavLinks = [...baseNavLinks, coachLink, memberLink];
    } else {
      // Regular athlete / member (UserRole.USER)
      desktopNavLinks = [...baseNavLinks, memberLink];
    }
  }

  // Strictly role-isolated mobile bottom navigation items
  let mobileNavLinks: NavItem[] = [];
  if (isLoading || !user) {
    mobileNavLinks = [
      { href: '/', label: 'کشف', icon: Compass },
      { href: '/classes', label: 'کلاس‌ها', icon: Dumbbell },
      { href: '/plans', label: 'پلن‌ها', icon: CreditCard },
      { href: '#login', label: 'ورود', icon: UserCircle, onClick: () => openLoginModal() },
    ];
  } else if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    mobileNavLinks = [
      { href: '/', label: 'کشف', icon: Compass },
      { href: '/classes', label: 'کلاس‌ها', icon: Dumbbell },
      { href: '/reception', label: 'پذیرش', icon: QrCode },
      { href: '/admin', label: 'مدیریت', icon: ShieldAlert },
      { href: '/account', label: 'حساب من', icon: UserCircle },
    ];
  } else if (user.role === UserRole.GYM_STAFF) {
    mobileNavLinks = [
      { href: '/', label: 'کشف', icon: Compass },
      { href: '/classes', label: 'کلاس‌ها', icon: Dumbbell },
      { href: '/reception', label: 'پذیرش', icon: QrCode },
      { href: '/account', label: 'حساب من', icon: UserCircle },
    ];
  } else if (user.role === UserRole.COACH) {
    mobileNavLinks = [
      { href: '/', label: 'کشف', icon: Compass },
      { href: '/classes', label: 'کلاس‌ها', icon: Dumbbell },
      { href: '/coach', label: 'پنل مربی', icon: Dumbbell },
      { href: '/account', label: 'حساب من', icon: UserCircle },
    ];
  } else {
    // Regular member (UserRole.USER)
    mobileNavLinks = [
      { href: '/', label: 'کشف', icon: Compass },
      { href: '/classes', label: 'کلاس‌ها', icon: Dumbbell },
      { href: '/plans', label: 'پلن‌ها', icon: CreditCard },
      { href: '/account', label: 'حساب من', icon: UserCircle },
    ];
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#272B30] bg-[#0D0F10]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 lg:gap-8 shrink-0">
            <Link href="/" className="flex items-center gap-2 lg:gap-3 group shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15181B] border border-[#C8F500]/30 text-[#C8F500] shadow-md shadow-[#C8F500]/5 group-hover:border-[#C8F500] group-hover:scale-105 transition-all duration-200">
                <Dumbbell className="h-5 w-5 rtl-flip" />
              </div>
              <div>
                <span className="text-base sm:text-lg font-black tracking-tight text-[#F4F5F2] group-hover:text-[#C8F500] transition-colors">
                  گراویتی اسپرت
                </span>
                <span className="block text-[10px] font-medium text-[#9CA3A8]">
                  شبکه اعتباری تناسب اندام
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-0.5 lg:gap-1 text-xs lg:text-sm font-semibold">
              {desktopNavLinks.map(link => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1 lg:gap-1.5 rounded-xl px-2 lg:px-3.5 py-1.5 lg:py-2 transition-all duration-150 ${
                      isActive
                        ? 'bg-[#C8F500]/10 text-[#C8F500] font-bold border border-[#C8F500]/20 shadow-xs'
                        : 'text-[#C4C8CC] hover:bg-[#15181B] hover:text-[#F4F5F2]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-[#C8F500]' : 'text-[#9CA3A8]'}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Controls & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoading ? (
              <div className="h-9 w-24 animate-pulse rounded-xl bg-[#1D2125]" />
            ) : user ? (
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Credits Balance Chip - Links to Account */}
                <Link
                  href="/account"
                  title="مشاهده جزئیات کیف پول و اشتراک"
                  className="flex items-center gap-1.5 sm:gap-2 rounded-xl bg-[#15181B] border border-[#272B30] px-2 lg:px-3 py-1.5 text-xs font-semibold text-[#F4F5F2] shadow-2xs hover:border-[#353B41] hover:bg-[#1D2125] transition-all cursor-pointer"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C8F500] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C8F500]" />
                  </span>
                  <span className="text-[#9CA3A8] text-[11px]">موجودی:</span>
                  <span className="font-black text-[#C8F500] font-persian-digits">
                    {toPersianDigits(user.currentCredits)} <span className="text-[11px] font-normal text-[#C8F500]/80">اعتبار</span>
                  </span>
                </Link>

                {/* User Identity & Role - Links to Account */}
                <Link
                  href="/account"
                  title="مشاهده حساب کاربری"
                  className="hidden lg:flex items-center gap-2 pr-1 hover:text-[#C8F500] transition-colors cursor-pointer"
                >
                  <span className="text-xs font-bold text-[#F4F5F2]">
                    {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.phoneNumber}
                  </span>
                  {getRoleBadge(user.role)}
                </Link>

                {/* Logout Button (Test Selector: button[title*="خروج"]) */}
                <button
                  onClick={logout}
                  title="خروج از حساب کاربری"
                  className="flex items-center justify-center rounded-xl border border-[#272B30] bg-[#15181B] p-2 text-[#9CA3A8] hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/50 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* Unauthenticated: Real Login Trigger (Hidden on mobile where bottom nav provides entry) */
              <div className="hidden sm:block">
                <Button
                  onClick={() => openLoginModal()}
                  variant="primary"
                  size="sm"
                  leftIcon={<UserCircle className="h-4 w-4 text-[#0D0F11]" />}
                >
                  ورود به سیستم
                </Button>
              </div>
            )}

            {/* Development/Testing Demo Switcher (ONLY when explicitly enabled) */}
            {isDemoLoginEnabled && (
              <div className="hidden xl:flex items-center gap-1 rounded-xl border border-dashed border-amber-500/40 bg-amber-950/30 p-1 text-xs">
                <span className="px-1.5 text-[10px] font-bold text-amber-300 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  دمو:
                </span>
                <button
                  onClick={() => switchDemoRole(UserRole.USER)}
                  className={`rounded-lg px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
                    user?.role === UserRole.USER
                      ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                      : 'text-[#C4C8CC] hover:bg-[#1D2125]'
                  }`}
                >
                  کاربر
                </button>
                <button
                  onClick={() => switchDemoRole(UserRole.GYM_STAFF)}
                  className={`rounded-lg px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
                    user?.role === UserRole.GYM_STAFF
                      ? 'bg-violet-600 text-white font-bold shadow-xs'
                      : 'text-[#C4C8CC] hover:bg-[#1D2125]'
                  }`}
                >
                  پذیرش
                </button>
                <button
                  onClick={() => switchDemoRole(UserRole.COACH)}
                  className={`rounded-lg px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
                    user?.role === UserRole.COACH
                      ? 'bg-emerald-500 text-[#0D0F11] font-bold shadow-xs'
                      : 'text-[#C4C8CC] hover:bg-[#1D2125]'
                  }`}
                >
                  مربی
                </button>
                <button
                  onClick={() => switchDemoRole(UserRole.SUPER_ADMIN)}
                  className={`rounded-lg px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
                    user?.role === UserRole.SUPER_ADMIN
                      ? 'bg-amber-500 text-[#0D0F11] font-bold shadow-xs'
                      : 'text-[#C4C8CC] hover:bg-[#1D2125]'
                  }`}
                >
                  ادمین
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#272B30] bg-[#0D0F10]/95 backdrop-blur-md px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-xl">
        <div className="flex items-center justify-around">
          {mobileNavLinks.map(link => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            if (link.onClick) {
              return (
                <button
                  key={link.href}
                  type="button"
                  onClick={link.onClick}
                  className="flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150 text-[#C8F500] font-semibold hover:text-[#D6FB33] cursor-pointer"
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] mt-1">{link.label}</span>
                </button>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-150 ${
                  isActive ? 'text-[#C8F500] font-bold' : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-[#C8F500] scale-110' : ''}`} />
                <span className="text-[10px] mt-1">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};
