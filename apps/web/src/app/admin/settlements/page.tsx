'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSettlementsRoute() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin?tab=coaches');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0D0F11] flex items-center justify-center p-6">
      <div className="w-12 h-12 rounded-full border-4 border-[#C8F500]/20 border-t-[#C8F500] animate-spin" />
    </div>
  );
}
