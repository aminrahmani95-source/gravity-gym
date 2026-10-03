'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { X, Phone, KeyRound, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialMessage?: string;
}

export const LoginModal: React.FC<Props> = ({ isOpen, onClose, initialMessage }) => {
  const { sendOtp, login } = useAuth();
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStep('PHONE');
      setPhoneNumber('');
      setOtpCode('');
      setErrorMsg(null);
      setCountdown(0);
      setDevOtpHint(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
    if (!/^09\d{9}$/.test(cleanPhone)) {
      setErrorMsg('شماره موبایل نامعتبر است. نمونه صحیح: ۰۹۱۲۳۴۵۶۷۸۹');
      return;
    }

    setIsLoading(true);
    try {
      const res = await sendOtp(cleanPhone);
      setStep('OTP');
      setCountdown(res.expiresInSeconds || 60);
      if (res.debugCode) {
        setDevOtpHint(res.debugCode);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارسال کد تأیید پیامکی');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCode = otpCode.trim();
    if (!/^\d{4,6}$/.test(cleanCode)) {
      setErrorMsg('کد تأیید نامعتبر است. لطفاً کد دریافتی را وارد کنید.');
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
      await login(cleanPhone, cleanCode);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'کد تأیید اشتباه یا منقضی شده است.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || isLoading) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
      const res = await sendOtp(cleanPhone);
      setCountdown(res.expiresInSeconds || 60);
      if (res.debugCode) {
        setDevOtpHint(res.debugCode);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'خطا در ارسال مجدد کد');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in overscroll-contain"
    >
      <div className="relative w-full max-w-sm rounded-3xl bg-[#15181B] border border-[#272B30] p-6 shadow-2xl transition-all text-[#F4F5F2]">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="بستن پنجره ورود"
          className="absolute left-4 top-4 rounded-full p-2 text-[#9CA3A8] hover:bg-[#1D2125] hover:text-[#F4F5F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/40 transition cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F500]/10 border border-[#C8F500]/20 text-[#C8F500]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 id="login-modal-title" className="text-lg font-bold text-[#F4F5F2]">
            {step === 'PHONE' ? 'ورود به پلتفرم تناسب اندام' : 'تأیید شماره موبایل'}
          </h3>
          <p className="mt-1 text-xs text-[#9CA3A8]">
            {initialMessage
              ? initialMessage
              : step === 'PHONE'
              ? 'شماره موبایل خود را جهت دریافت کد تأیید پیامکی وارد نمایید.'
              : `کد تأیید به شماره ${phoneNumber} ارسال شد.`}
          </p>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-800/80 bg-red-950/60 p-3 text-xs font-medium text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 1: Phone Form */}
        {step === 'PHONE' && (
          <form onSubmit={handleSendOtp} className="mt-6">
            <div>
              <label className="block text-xs font-semibold text-[#C4C8CC]">شماره موبایل</label>
              <div className="relative mt-2">
                <Phone className="absolute right-3.5 top-3.5 h-4 w-4 text-[#9CA3A8]" />
                <input
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  inputMode="numeric"
                  spellCheck={false}
                  dir="ltr"
                  autoFocus
                  placeholder="09123456789"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] py-3 pr-10 pl-4 font-mono text-sm tracking-wider text-[#F4F5F2] placeholder:text-[#62686D] shadow-sm transition focus-visible:border-[#C8F500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !phoneNumber.trim()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C8F500] py-3.5 text-xs font-black text-[#0D0F11] shadow-md shadow-[#C8F500]/10 transition hover:bg-[#D6FB33] disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-[#0D0F11]" />
                  <span>در حال ارسال پیامک...</span>
                </>
              ) : (
                <span>دریافت کد تأیید یکبارمصرف</span>
              )}
            </button>
          </form>
        )}

        {/* Step 2: OTP Form */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className="mt-6">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#C4C8CC]">کد تأیید پیامکی</label>
                <button
                  type="button"
                  onClick={() => {
                    setStep('PHONE');
                    setOtpCode('');
                    setErrorMsg(null);
                    setDevOtpHint(null);
                  }}
                  className="text-[11px] font-medium text-[#C8F500] hover:underline cursor-pointer"
                >
                  ویرایش شماره
                </button>
              </div>

              {devOtpHint && (
                <button
                  type="button"
                  onClick={() => setOtpCode(devOtpHint)}
                  className="mt-3 w-full rounded-2xl bg-[#1D2125] border border-[#C8F500]/30 p-2.5 text-center text-xs text-[#C8F500] hover:bg-[#22272C] transition cursor-pointer"
                >
                  <span>کد تأیید پیامکی (محیط آزمایشی): </span>
                  <span className="font-mono font-bold text-sm text-[#F4F5F2]">{devOtpHint}</span>
                  <span className="block text-[10px] text-[#9CA3A8] mt-0.5">(جهت درج خودکار کلیک نمایید)</span>
                </button>
              )}

              <div className="relative mt-2">
                <KeyRound className="absolute right-3.5 top-3.5 h-4 w-4 text-[#9CA3A8]" />
                <input
                  type="text"
                  name="otp"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  spellCheck={false}
                  dir="ltr"
                  autoFocus
                  maxLength={6}
                  placeholder="12345"
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value)}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] py-3 pr-10 pl-4 font-mono text-center text-lg font-bold tracking-widest text-[#F4F5F2] placeholder:text-[#62686D] shadow-sm transition focus-visible:border-[#C8F500] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F500]/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !otpCode.trim()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C8F500] py-3.5 text-xs font-black text-[#0D0F11] shadow-md shadow-[#C8F500]/10 transition hover:bg-[#D6FB33] disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-[#0D0F11]" />
                  <span>در حال بررسی کد...</span>
                </>
              ) : (
                <span>تأیید و ورود به سیستم</span>
              )}
            </button>

            <div className="mt-4 text-center">
              {countdown > 0 ? (
                <span className="text-[11px] text-[#9CA3A8]">
                  ارسال مجدد کد پس از <span className="font-persian-digits font-bold text-[#F4F5F2]">{countdown}</span> ثانیه
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isLoading}
                  className="text-xs font-medium text-[#C8F500] hover:underline cursor-pointer"
                >
                  ارسال مجدد کد تأیید
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
