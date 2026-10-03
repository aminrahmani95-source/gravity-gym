'use client';
import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/auth-context';
import { ReceptionVerificationResult, UserRole } from '@gym-app/shared-types';
import {
  QrCode,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  User,
  Building2,
  ScanLine,
  RotateCcw,
  History,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/ui/empty-state';
import { toPersianDigits } from '../../lib/formatters';

interface ShiftCheckinLog {
  id: string;
  name: string;
  time: string;
  credits: number;
  monthlyVisits: number;
  maxVisits: number;
}

export default function ReceptionPortalPage() {
  const { user, isLoading, openLoginModal } = useAuth();
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [result, setResult] = useState<ReceptionVerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shiftLogs, setShiftLogs] = useState<ShiftCheckinLog[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (user && !isLoading) {
      textareaRef.current?.focus();
    }
  }, [user, isLoading]);

  const getErrorCategory = (msg: string) => {
    if (msg.includes('تداخل سانس جنسیتی') || msg.includes('بانوان') || msg.includes('آقایان')) {
      return {
        badge: 'تداخل سانس جنسیتی',
        advice: 'در حال حاضر سانس اختصاصی جنسیت دیگر برقرار است. لطفاً سانس‌های مجاز امروز را به ورزشکار اعلام فرمایید.',
        accent: 'border-amber-300 bg-amber-50 text-amber-900',
      };
    }
    if (msg.includes('منقضی') || msg.includes('اشتراک')) {
      return {
        badge: 'اشتراک منقضی یا نامعتبر',
        advice: 'اشتراک ورزشی عضو به پایان رسیده است. جهت پذیرش، ورزشکار باید از طریق اپلیکیشن اقدام به تمدید عضویت نماید.',
        accent: 'border-red-300 bg-red-50 text-red-900',
      };
    }
    if (msg.includes('اعتبار') || msg.includes('اتمام')) {
      return {
        badge: 'کسری اعتبار',
        advice: 'موجودی اعتبار حساب کاربر کافی نیست. نیاز به خرید پلن جدید وجود دارد.',
        accent: 'border-red-300 bg-red-50 text-red-900',
      };
    }
    if (msg.includes('تکرار') || msg.includes('Replay') || msg.includes('قبلاً')) {
      return {
        badge: 'بارکد مصرف‌شده یا نامعتبر',
        advice: 'این بارکد قبلاً استفاده شده است. از ورزشکار بخواهید صفحه بارکد را در اپلیکیشن نوسازی فرماید.',
        accent: 'border-rose-300 bg-rose-50 text-rose-900',
      };
    }
    if (msg.includes('فاصله زمانی') || msg.includes('۲ ساعت')) {
      return {
        badge: 'محدودیت تردد متوالی (Cooldown)',
        advice: 'فاصله زمانی حداقل ۲ ساعت بین دو ورود متوالی به این مجموعه الزامی است.',
        accent: 'border-amber-300 bg-amber-50 text-amber-900',
      };
    }
    if (msg.includes('سقف')) {
      return {
        badge: 'سقف مجاز ماهانه',
        advice: 'سقف ۴ جلسه ورود ماهانه عضو به این باشگاه تکمیل شده است.',
        accent: 'border-amber-300 bg-amber-50 text-amber-900',
      };
    }
    if (msg.includes('مجموعه ورزشی دیگری') || msg.includes('صادر شده است')) {
      return {
        badge: 'عدم تطابق مجموعه (Cross-Venue)',
        advice: 'این بارکد برای مجموعه ورزشی دیگری تولید شده است. ورزشکار باید در اپلیکیشن همین باشگاه را انتخاب کند.',
        accent: 'border-amber-300 bg-amber-50 text-amber-900',
      };
    }
    return {
      badge: 'خطا در احراز هویت',
      advice: 'لطفاً وضعیت بارکد و اتصال شبکه را بررسی نموده و مجدداً تلاش فرمایید.',
      accent: 'border-red-300 bg-red-50 text-red-900',
    };
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || isVerifying) return;

    const hasToken = typeof window !== 'undefined' ? localStorage.getItem('gym_app_token') : null;
    if (!user && !hasToken) {
      openLoginModal('برای ثبت ورود و تأیید هویت، لطفاً با حساب پرسنل پذیرش وارد شوید.');
      return;
    }

    setIsVerifying(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await apiFetch<ReceptionVerificationResult>('/checkin/reception-verify', {
        method: 'POST',
        body: JSON.stringify({ qrToken: tokenInput.trim() }),
      });
      setResult(res);
      setTokenInput('');

      // Record in current shift log
      if (res && res.status === 'APPROVED') {
        const timeNow = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
        setShiftLogs(prev => [
          {
            id: res.checkinId || `shift-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: res.member?.fullName || 'عضو پلتفرم',
            time: timeNow,
            credits: res.visitDetails?.creditsDebited || 0,
            monthlyVisits: res.member?.monthlyVisitsAtThisClub || 1,
            maxVisits: res.member?.maxMonthlyCap || 4,
          },
          ...prev.slice(0, 9), // keep last 10 entries
        ]);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در تأیید بارکد ورود');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleReset = () => {
    setTokenInput('');
    setResult(null);
    setErrorMsg(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  // 1. Loading State Guard (eliminates privileged shell flash)
  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-28 w-full animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30] mb-8" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="h-96 animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30]" />
          <div className="h-96 animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30]" />
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State Guard (Guest)
  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          icon={<QrCode className="h-8 w-8 text-[#C8F500]" />}
          title="ورود به کانتر پذیرش باشگاه"
          description="دسترسی به این بخش صرفاً برای پرسنل پذیرش مجموعه‌های ورزشی و مدیران سیستم امکان‌پذیر است. لطفاً جهت فعال‌سازی ترمینال پذیرش، با حساب پرسنل وارد شوید."
          action={
            <Button
              variant="primary"
              onClick={() => openLoginModal('ورود به‌عنوان پرسنل پذیرش باشگاه')}
              leftIcon={<QrCode className="h-4 w-4 text-[#0D0F11]" />}
            >
              ورود پرسنل پذیرش
            </Button>
          }
        />
      </div>
    );
  }

  // 3. Unauthorized Role Guard (e.g. Member USER)
  if (user.role !== UserRole.GYM_STAFF && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8 text-rose-500" />}
          title="دسترسی غیرمجاز به کانتر پذیرش"
          description="حساب کاربری شما از نوع ورزشکار بوده و دسترسی به کانتر پذیرش باشگاه‌ها را ندارد. پذیرش در محل مجموعه ورزشی توسط پرسنل باشگاه انجام می‌شود."
          action={
            <div className="flex items-center gap-3">
              <Link href="/account">
                <Button variant="primary" size="md">
                  مشاهده حساب کاربری
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" size="md">
                  بازگشت به خانه
                </Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 text-[#F4F5F2]">
      {/* Kiosk Operator Header */}
      <div className="rounded-3xl border border-[#272B30] bg-[#121517] p-6 text-[#F4F5F2] shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1D2125] border border-[#C8F500]/30 text-[#C8F500] shadow-md">
              <QrCode className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#F4F5F2]">کانتر هوشمند پذیرش باشگاه</h1>
              <p className="text-xs text-[#9CA3A8] mt-0.5">
                {user?.role === UserRole.GYM_STAFF
                  ? 'اسپیناس پالاس (کانتر اختصاصی پذیرش)'
                  : 'کانتر اسکنر متصل به سرور مرکزی'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="flex items-center gap-2 rounded-2xl bg-[#1D2125] border border-[#272B30] px-3.5 py-1.5 text-xs font-semibold text-[#C4C8CC]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C8F500] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C8F500]" />
              </span>
              <span>اتصال امن به شبکه مرکزی</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Terminal Grid */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left Column: QR Scan Form */}
        <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-[#202428]">
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-[#C8F500]" />
              <h2 className="text-base font-bold text-[#F4F5F2]">اسکن بارکد عضویت</h2>
            </div>
            {(result || errorMsg || tokenInput) && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#9CA3A8] hover:text-[#C8F500] transition cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>عضو بعدی / نوسازی</span>
              </button>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[#9CA3A8]">
            بارکد پویای ۴۵ ثانیه‌ای نمایش داده شده روی گوشی همراه عضو را اسکن کنید یا توکن آن را وارد نمایید.
          </p>

          <form onSubmit={handleVerify} className="mt-5">
            <label className="block text-xs font-bold text-[#C4C8CC] mb-1.5">
              توکن بارکد پویا (QR Payload)
            </label>
            <textarea
              ref={textareaRef}
              rows={4}
              value={tokenInput}
              dir="ltr"
              onChange={e => setTokenInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (tokenInput.trim() && !isVerifying) {
                    handleVerify(e);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleReset();
                }
              }}
              placeholder="eyJzdWIiOiJ1c2VyLTEiLCJneW1JZCI6..."
              className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] p-3.5 font-mono text-xs text-[#F4F5F2] placeholder:text-[#62686D] shadow-xs transition focus-visible:border-[#C8F500] focus-visible:bg-[#15181B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/20"
            />

            <Button
              type="submit"
              disabled={isVerifying || !tokenInput.trim()}
              isLoading={isVerifying}
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              leftIcon={<ShieldCheck className="h-5 w-5 text-[#0D0F11]" />}
            >
              {isVerifying ? 'در حال بررسی اعتبارسنجی سرور...' : 'ثبت ورود و تأیید هویت'}
            </Button>
          </form>

          {/* Categorized Error Display (Preserves exact .bg-red-50 and .border-red-200 for test suite) */}
          {errorMsg && (() => {
            const cat = getErrorCategory(errorMsg);
            return (
              <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800 animate-fade-in shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                    <span className="font-bold text-sm">خطا در پذیرش:</span>
                  </div>
                  <span className="rounded-md bg-red-200/80 px-2 py-0.5 text-[11px] font-bold text-red-900">
                    {cat.badge}
                  </span>
                </div>
                <div className="pr-7 text-xs leading-relaxed text-red-800">
                  {errorMsg}
                </div>
                <div className="mt-1 border-t border-red-200/80 pt-2 pr-7 text-[11px] text-red-700">
                  <span className="font-semibold text-red-900">راهنما برای پذیرش: </span>
                  {cat.advice}
                </div>
              </div>
            );
          })()}

          <div className="mt-6 pt-4 border-t border-[#202428] flex items-center justify-between text-[11px] text-[#62686D]">
            <span>پشتیبانی از اسکنرهای بارکد خوان USB و 2D Kiosk</span>
            <span>Enter: ثبت فوری | Esc: نوسازی</span>
          </div>
        </div>

        {/* Right Column: Privacy-Compliant Verification Screen */}
        <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-7 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#202428] pb-3">
              <h2 className="text-base font-bold text-[#F4F5F2]">نمایشگر مانیتور پذیرش</h2>
              <Badge variant="outline" size="sm">
                حریم خصوصی فعال
              </Badge>
            </div>

            {result && result.status === 'APPROVED' ? (
              <div className="mt-6 flex flex-col items-center text-center animate-fade-in">
                {/* Status Badge */}
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 px-4 py-1.5 text-xs font-bold text-emerald-400 shadow-2xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>ورود تأیید شد - مجاز</span>
                </div>

                {/* Member Avatar Container */}
                <div className="mt-6 relative flex h-28 w-28 items-center justify-center rounded-3xl border-4 border-emerald-900/40 bg-[#1D2125] shadow-md">
                  <User className="h-14 w-14 text-[#9CA3A8]" />
                  <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#C8F500] text-[#0D0F11] shadow-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                </div>

                {/* Member Details */}
                <h3 className="mt-4 text-xl font-black text-[#F4F5F2]">{result.member?.fullName}</h3>
                <p className="mt-1 text-xs text-[#9CA3A8] font-medium">{result.member?.subscriptionTitle}</p>

                {/* Visit Stats 2-Column Grid */}
                <div className="mt-6 grid w-full grid-cols-2 gap-3 rounded-2xl bg-[#1D2125] border border-[#272B30] p-4 text-center">
                  <div className="border-l border-[#272B30] pl-2">
                    <span className="block text-[11px] text-[#9CA3A8] font-medium">اعتبار کسرشده</span>
                    <span className="mt-1 text-base font-extrabold text-[#C8F500] font-persian-digits">
                      {toPersianDigits(result.visitDetails?.creditsDebited)} اعتبار
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#9CA3A8] font-medium">مراجعات این ماه در مجموعه</span>
                    <span className="mt-1 text-base font-extrabold text-cyan-400 font-persian-digits">
                      {toPersianDigits(result.member?.monthlyVisitsAtThisClub)} از {toPersianDigits(result.member?.maxMonthlyCap)} جلسه
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-72 flex-col items-center justify-center text-center text-[#62686D]">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#1D2125] border border-[#272B30] text-[#9CA3A8]">
                  <Building2 className="h-8 w-8" />
                </div>
                <p className="mt-4 text-xs font-semibold text-[#9CA3A8]">در انتظار اسکن بارکد عضویت...</p>
                <p className="mt-1 text-[11px] text-[#62686D]">اطلاعات ورزشکار بلافاصله پس از اسکن تأیید و نمایش داده می‌شود.</p>
              </div>
            )}
          </div>

          {/* Privacy Preservation Audit Notice (Crucial: Suppresses national code & phone) */}
          <div className="mt-6 flex items-center gap-2 rounded-2xl bg-[#1D2125] border border-[#272B30] px-3.5 py-2.5 text-[11px] text-[#9CA3A8]">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>مطابق ضوابط حریم خصوصی، کد ملی و شماره تماس کاربر در این مانیتور پنهان است.</span>
          </div>
        </div>
      </div>

      {/* Shift Live Log (Recent Check-ins at this Terminal) */}
      {shiftLogs.length > 0 && (
        <div className="mt-8 rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs animate-fade-in">
          <div className="flex items-center gap-2 pb-3 border-b border-[#202428] mb-4">
            <History className="h-5 w-5 text-[#C8F500]" />
            <h2 className="text-base font-bold text-[#F4F5F2]">گزارش ترددهای تأییدشده در این شیفت کاری</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-[#202428] text-[#9CA3A8] font-medium">
                  <th className="py-2.5 px-3">نام ورزشکار</th>
                  <th className="py-2.5 px-3">زمان پذیرش</th>
                  <th className="py-2.5 px-3">اعتبار کسرشده</th>
                  <th className="py-2.5 px-3">دفعات مراجعه ماهانه</th>
                  <th className="py-2.5 px-3">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202428]">
                {shiftLogs.map(log => (
                  <tr key={log.id} className="hover:bg-[#1D2125] transition">
                    <td className="py-3 px-3 font-bold text-[#F4F5F2]">{log.name}</td>
                    <td className="py-3 px-3 text-[#9CA3A8] font-persian-digits">{log.time}</td>
                    <td className="py-3 px-3 text-[#C8F500] font-bold font-persian-digits">
                      {toPersianDigits(log.credits)} اعتبار
                    </td>
                    <td className="py-3 px-3 text-cyan-400 font-persian-digits">
                      {toPersianDigits(log.monthlyVisits)} از {toPersianDigits(log.maxVisits)} جلسه
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        تأییدشده
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
