'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { apiFetch } from '../lib/api';
import { GenerateQrResponseDto } from '@gym-app/shared-types';
import { RefreshCw, Clock, ShieldCheck, Copy, Check, AlertTriangle } from 'lucide-react';
import { Modal } from './ui/modal';
import { Button } from './ui/button';
import { toPersianDigits, formatCredits } from '../lib/formatters';

interface Props {
  gymId: string;
  gymName: string;
  creditCost: number;
  onClose: () => void;
}

export const DynamicQrModal: React.FC<Props> = ({ gymId, gymName, creditCost, onClose }) => {
  const [qrData, setQrData] = useState<GenerateQrResponseDto | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(45);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const fetchToken = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<GenerateQrResponseDto>('/checkin/generate-qr', {
        method: 'POST',
        body: JSON.stringify({ gymId }),
      });
      setQrData(data);
      setSecondsRemaining(data.expiresInSeconds);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت بارکد ورود');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchToken();
  }, [gymId]);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const copyToken = () => {
    if (qrData?.qrToken) {
      navigator.clipboard.writeText(qrData.qrToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={gymName}
      description={`کسر از موجودی: ${formatCredits(creditCost)}`}
      icon={<ShieldCheck className="h-6 w-6 text-[#C8F500]" />}
      maxWidth="sm"
    >
      {/* QR Content Box */}
      <div className="flex flex-col items-center justify-center">
        {isLoading ? (
          <div className="flex h-56 w-56 items-center justify-center rounded-3xl border-2 border-dashed border-[#272B30] bg-[#1D2125]">
            <RefreshCw className="h-8 w-8 animate-spin text-[#C8F500]" />
          </div>
        ) : error ? (
          <div className="flex h-56 w-56 flex-col items-center justify-center rounded-3xl border border-red-800/80 bg-red-950/60 p-4 text-center">
            <p className="text-xs font-bold text-red-300 mb-3">{error}</p>
            <Button onClick={fetchToken} variant="danger" size="sm">
              تلاش مجدد
            </Button>
          </div>
        ) : qrData ? (
          <div className="relative flex flex-col items-center">
            {/* High-Contrast Pure White QR Container (Required for optical scanner hardware & camera contrast) */}
            <div className="relative rounded-3xl bg-white p-4 shadow-xl border border-white/20 overflow-hidden">
              <QRCodeSVG
                value={qrData.qrToken}
                size={200}
                level="M"
                includeMargin={false}
              />

              {secondsRemaining === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D0F11]/90 backdrop-blur-xs p-4 text-center animate-fade-in">
                  <AlertTriangle className="h-8 w-8 text-amber-400 mb-2" />
                  <p className="text-xs font-bold text-[#F4F5F2] mb-1">بارکد منقضی شده است</p>
                  <p className="text-[10px] text-[#9CA3A8] mb-3">جهت ثبت ورود، بارکد جدید دریافت نمایید</p>
                  <Button
                    onClick={fetchToken}
                    variant="primary"
                    size="sm"
                    leftIcon={<RefreshCw className="h-3.5 w-3.5 text-[#0D0F11]" />}
                  >
                    دریافت بارکد جدید
                  </Button>
                </div>
              )}
            </div>

            {/* Timer Progress */}
            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#F4F5F2] bg-[#1D2125] px-3.5 py-1.5 rounded-xl border border-[#272B30]">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-[#9CA3A8]">اعتبار بارکد:</span>
              <span
                className={`font-persian-digits text-sm font-bold ${
                  secondsRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-[#C8F500]'
                }`}
              >
                {toPersianDigits(secondsRemaining)} ثانیه
              </span>
            </div>

            {secondsRemaining > 0 && (
              <button
                onClick={copyToken}
                className="mt-3 flex items-center gap-1.5 rounded-xl border border-[#272B30] bg-[#1D2125] px-3 py-1.5 text-[11px] font-medium text-[#C4C8CC] hover:bg-[#22272C] hover:text-[#F4F5F2] transition cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'کپی شد!' : 'کپی توکن جهت اسکن دستی در کانتر'}</span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* Security Notice */}
      <div className="mt-5 flex items-start gap-2 rounded-2xl bg-amber-950/40 border border-amber-800/60 p-3 text-[11px] font-medium leading-relaxed text-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <span>این بارکد پویا بوده و اسکرین‌شات از آن نامعتبر است. بارکد را مقابل اسکنر کانتر پذیرش قرار دهید.</span>
      </div>
    </Modal>
  );
};
