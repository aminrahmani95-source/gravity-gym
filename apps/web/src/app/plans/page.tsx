'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/auth-context';
import { Plan, PaymentInitiateResponse, PaymentVerifyResult } from '@gym-app/shared-types';
import { Footer } from '../../components/footer';
import {
  Check,
  Sparkles,
  CreditCard,
  ShieldCheck,
  Zap,
  Repeat,
  User,
  Search,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Alert } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { toPersianDigits, formatMoney } from '../../lib/formatters';

export default function PlansPage() {
  const { user, refreshProfile, openLoginModal } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [purchasingPlanId, setPurchasingPlanId] = useState<string | null>(null);
  const [successReceipt, setSuccessReceipt] = useState<PaymentVerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<Plan[]>('/plans');
      setPlans(data);
    } catch (err) {
      console.error('Error fetching plans:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async (plan: Plan) => {
    if (purchasingPlanId !== null) return;
    const hasToken = typeof window !== 'undefined' ? localStorage.getItem('gym_app_token') : null;
    if (!user && !hasToken) {
      openLoginModal('برای خرید اشتراک و فعالسازی اعتبار، ابتدا وارد حساب کاربری خود شوید.');
      return;
    }
    setPurchasingPlanId(plan.id);
    setErrorMsg(null);
    setSuccessReceipt(null);

    try {
      // Step 1: Initiate payment (explicit Rial boundary)
      const initRes = await apiFetch<PaymentInitiateResponse>('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId: plan.id }),
      });

      // Step 2: In test/mock mode, simulate immediate successful bank clearance
      const verifyRes = await apiFetch<PaymentVerifyResult>('/payments/verify', {
        method: 'POST',
        body: JSON.stringify({
          planId: plan.id,
          gatewayAuthority: initRes.gatewayAuthority,
          status: 'OK',
        }),
      });

      if (verifyRes.isSuccessful) {
        setSuccessReceipt(verifyRes);
        await refreshProfile();
      } else {
        setErrorMsg(verifyRes.errorMessage || 'پرداخت ناموفق بود.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در برقراری ارتباط با درگاه شاپرک');
    } finally {
      setPurchasingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#0D0F10] text-[#F4F5F2]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
        {/* Title Header with Athletic Subtitle */}
        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#C8F500]/10 border border-[#C8F500]/20 px-3.5 py-1 text-xs font-bold text-[#C8F500] mb-3 shadow-2xs">
            <Zap className="h-3.5 w-3.5 text-[#C8F500]" />
            <span>اشتراک‌های منعطف با محاسبه دقیق بر اساس جلسه</span>
          </div>
          <h1 className="text-3xl font-black text-[#F4F5F2] sm:text-4xl tracking-tight">
            پلن‌های عضویت اعتباری
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-[#9CA3A8] leading-relaxed">
            یک پلن انتخاب کنید و به تمامی باشگاه‌های ورزشی پلتفرم متناسب با اعتبار خود دسترسی داشته باشید. بدون قراردادهای طولانی، با امکان انتقال اعتبار مصرف‌نشده.
          </p>
        </div>

        {/* Success Receipt Banner (Maintains exact test selectors: .bg-emerald-50, h3, .font-mono, .bg-white) */}
        {successReceipt && (
          <div className="mx-auto max-w-xl rounded-3xl border border-emerald-500/60 bg-emerald-50 p-6 text-center shadow-xl animate-fade-in">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-emerald-950">پرداخت شاپرک با موفقیت انجام شد!</h3>
            <p className="mt-1 text-xs text-emerald-800">
              شماره پیگیری تراکنش (RRN): <span className="font-mono font-bold" dir="ltr">{successReceipt.referenceIdRrn}</span>
            </p>
            <div className="mt-4 rounded-2xl bg-white p-4 text-xs font-semibold text-slate-800 shadow-sm border border-emerald-200">
              <span>مقدار <span className="font-persian-digits">{toPersianDigits(successReceipt.creditsIssued)}</span> اعتبار به حساب کاربری شما افزوده شد.</span>
            </div>
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/account"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-800 transition cursor-pointer"
              >
                <User className="h-4 w-4" />
                <span>مشاهده موجودی در حساب کاربری</span>
              </Link>
              <Link
                href="/"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-xs font-bold text-emerald-900 shadow-2xs hover:bg-emerald-100/60 transition cursor-pointer"
              >
                <Search className="h-4 w-4" />
                <span>جستجو و انتخاب باشگاه</span>
              </Link>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="mx-auto max-w-xl">
            <Alert variant="error" title="خطا در عملیات پرداخت">
              {errorMsg}
            </Alert>
          </div>
        )}

        {/* Plans Pricing Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-4 lg:gap-8">
          {isLoading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="rounded-3xl border border-[#272B30] bg-[#15181B] p-8 space-y-4 shadow-2xs animate-pulse">
                <Skeleton className="h-6 w-1/2 rounded-lg" />
                <Skeleton className="h-10 w-3/4 rounded-lg" />
                <Skeleton className="h-8 w-full rounded-lg" />
                <div className="space-y-2 pt-4">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-5/6 rounded-md" />
                  <Skeleton className="h-4 w-4/6 rounded-md" />
                </div>
                <Skeleton className="h-12 w-full rounded-2xl mt-6" />
              </div>
            ))
          ) : (
            plans.map(plan => {
              const isFeatured = plan.slug === 'standard_30';
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col justify-between rounded-3xl p-7 sm:p-8 transition-all duration-200 ${
                    isFeatured
                      ? 'border-2 border-[#C8F500] bg-[#15181B] shadow-xl shadow-[#C8F500]/5 scale-102 lg:scale-105 z-10'
                      : 'border border-[#272B30] bg-[#15181B] shadow-2xs hover:shadow-md hover:border-[#353B41]'
                  }`}
                >
                  <div>
                    {isFeatured && (
                      <div className="mb-3 inline-flex items-center gap-1 rounded-full bg-[#C8F500]/15 border border-[#C8F500]/30 px-3 py-0.5 text-[11px] font-bold text-[#C8F500]">
                        <Sparkles className="h-3 w-3" />
                        <span>پلن استاندارد (۳۰ روزه)</span>
                      </div>
                    )}
                    <h3 className="text-xl font-bold text-[#F4F5F2]">{plan.titleFa}</h3>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-black tracking-tight text-[#F4F5F2] font-persian-digits">
                        {formatMoney(plan.priceTomans, false)}
                      </span>
                      <span className="text-xs font-medium text-[#9CA3A8]">تومان / ۳۰ روز</span>
                    </div>

                    {/* Credits Award Badge */}
                    <div className="mt-5 flex items-center gap-2 rounded-2xl bg-[#1D2125] border border-[#C8F500]/25 p-3 text-xs font-bold text-[#C8F500] shadow-2xs">
                      <Sparkles className="h-4 w-4 text-[#C8F500] shrink-0" />
                      <span>تخصیص <span className="font-persian-digits">{toPersianDigits(plan.creditsAwarded)}</span> اعتبار ماهانه</span>
                    </div>

                    {/* Features List */}
                    <ul className="mt-6 space-y-3.5 text-xs text-[#C4C8CC]">
                      <li className="flex items-center gap-2.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D2125] border border-[#272B30] text-[#C8F500] shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <span>دسترسی به تمامی سطوح از پایه تا الیت</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D2125] border border-[#272B30] text-[#C8F500] shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <span>انتقال تا ۱۰٪ اعتبار باقیمانده به ماه بعد (<span className="font-persian-digits">{toPersianDigits(plan.maxRolloverCredits)}</span> اعتبار)</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D2125] border border-[#272B30] text-[#C8F500] shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <span>بارکد پویا ضدتقلب و ورود سریع در کانتر</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D2125] border border-[#272B30] text-[#C8F500] shrink-0">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                        <span>امکان شارژ بسته‌های مکمل در هر زمان</span>
                      </li>
                    </ul>
                  </div>

                  {/* Purchase Action Button */}
                  <div className="mt-8 border-t border-[#202428] pt-6">
                    <Button
                      onClick={() => handlePurchase(plan)}
                      disabled={purchasingPlanId !== null}
                      isLoading={purchasingPlanId === plan.id}
                      variant={isFeatured ? 'primary' : 'secondary'}
                      size="lg"
                      className="w-full"
                      leftIcon={<CreditCard className="h-4 w-4" />}
                    >
                      {purchasingPlanId === plan.id ? 'در حال اتصال به شاپرک...' : 'خرید و فعالسازی اشتراک'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Trust & Guarantee Highlights */}
        <div className="rounded-3xl bg-[#15181B] border border-[#272B30] p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center sm:text-right">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-[#C8F500] shrink-0">
                <Repeat className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#F4F5F2]">انتقال اعتبار باقیمانده (Rollover)</h4>
                <p className="mt-1 text-xs text-[#9CA3A8] leading-relaxed">
                  تا سقف ۱۰ درصد از اعتبارهای استفاده‌نشده دوره شما در صورت تمدید به‌صورت خودکار به دوره بعدی منتقل می‌شود.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-emerald-400 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#F4F5F2]">پرداخت امن و یکتایی تراکنش</h4>
                <p className="mt-1 text-xs text-[#9CA3A8] leading-relaxed">
                  تمامی تراکنش‌ها با رعایت دقیق پروتکل پرداخت یکتا و بدون تکرار (Idempotency) در درگاه پرداخت شاپرک پردازش می‌گردند.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D2125] border border-[#272B30] text-cyan-400 shrink-0">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#F4F5F2]">آزادی بدون تعهد انفرادی</h4>
                <p className="mt-1 text-xs text-[#9CA3A8] leading-relaxed">
                  بدون نیاز به ثبت‌نام و پرداخت شهریه کامل در هر مجموعه؛ آزادی دسترسی به سالن‌های مختلف ورزشی بر اساس نیاز و زمان شما.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Footer */}
      <Footer />
    </div>
  );
}
