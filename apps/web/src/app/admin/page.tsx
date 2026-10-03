'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/auth-context';
import { UserRole, Gender, GymTier, GymAccessMode, GymDetailAdminResponse, CoachVerificationStatus } from '@gym-app/shared-types';
import {
  ShieldAlert,
  TrendingUp,
  DollarSign,
  Activity,
  CheckCircle,
  AlertTriangle,
  CreditCard,
  Calculator,
  Trash2,
  PlusCircle,
  Settings,
  Calendar,
  Users,
  UserCheck,
  Sparkles,
  Search,
  FileText,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  Phone,
  Power,
  Edit,
  Eye,
  Info,
  Clock,
  ExternalLink,
  ShieldCheck,
  Layers,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';
import { Badge } from '../../components/ui/badge';
import { Modal } from '../../components/ui/modal';
import { Input } from '../../components/ui/input';
import { toPersianDigits, formatMoney, formatDateFa, formatDateTimeFa } from '../../lib/formatters';

const DAY_NAMES = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];

const TIER_LABELS: Record<string, { label: string; badgeClass: string }> = {
  BASIC: { label: 'پایه (BASIC)', badgeClass: 'bg-zinc-800/80 text-zinc-300 border-zinc-700' },
  PLUS: { label: 'پلاس (PLUS)', badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-800/60' },
  PREMIUM: { label: 'پریمیوم (PREMIUM)', badgeClass: 'bg-purple-950/60 text-purple-300 border-purple-800/60' },
  ELITE: { label: 'الیت (ELITE)', badgeClass: 'bg-amber-950/60 text-amber-300 border-amber-800/60' },
};

const ACCESS_MODE_LABELS: Record<string, { label: string; badgeClass: string }> = {
  MIXED: { label: 'مختلط (شیفت‌های مجزا)', badgeClass: 'bg-[#1D2125] text-[#C4C8CC] border-[#272B30]' },
  MALE_ONLY: { label: 'ویژه آقایان', badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60' },
  FEMALE_ONLY: { label: 'ویژه بانوان', badgeClass: 'bg-rose-950/60 text-rose-300 border-rose-800/60' },
};

export default function AdminDashboardPage() {
  const { user, isLoading, openLoginModal } = useAuth();
  const [adminTab, setAdminTab] = useState<'economics' | 'gyms' | 'coaches' | 'staff' | 'classes'>('economics');
  const [metrics, setMetrics] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [recentCheckins, setRecentCheckins] = useState<any[]>([]);
  const [gyms, setGyms] = useState<any[]>([]);
  const [selectedGymId, setSelectedGymId] = useState<string>('gym-plus-2');
  const [creditCostInput, setCreditCostInput] = useState<number>(4);
  const [payoutInput, setPayoutInput] = useState<number>(65000);
  const [overrideStatus, setOverrideStatus] = useState<{ success?: string; error?: string } | null>(null);

  // Gym Management State
  const [adminGyms, setAdminGyms] = useState<any[]>([]);
  const [selectedMgmtGymId, setSelectedMgmtGymId] = useState<string>('gym-plus-2');
  const [accessModeInput, setAccessModeInput] = useState<string>('MIXED');
  const [sansDayInput, setSansDayInput] = useState<number>(0);
  const [sansGenderInput, setSansGenderInput] = useState<string>('FEMALE');
  const [sansStartInput, setSansStartInput] = useState<string>('08:00');
  const [sansEndInput, setSansEndInput] = useState<string>('14:00');
  const [sansCapacityInput, setSansCapacityInput] = useState<number>(30);
  const [sansIsPeakInput, setSansIsPeakInput] = useState<boolean>(false);
  const [sansStatus, setSansStatus] = useState<{ success?: string; error?: string } | null>(null);

  // Coaches & Settlement State
  const [adminCoaches, setAdminCoaches] = useState<any[]>([]);
  const [adminSettlements, setAdminSettlements] = useState<any[]>([]);
  const [coachStatusFilter, setCoachStatusFilter] = useState<string>('ALL');
  const [coachSearchTerm, setCoachSearchTerm] = useState<string>('');
  const [verifyingCoach, setVerifyingCoach] = useState<any | null>(null);
  const [verifyCommissionRate, setVerifyCommissionRate] = useState<number>(15);
  const [verifyActionStatus, setVerifyActionStatus] = useState<string>('VERIFIED');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [generatingCoach, setGeneratingCoach] = useState<any | null>(null);
  const [genCycleStart, setGenCycleStart] = useState<string>('2026-09-01');
  const [genCycleEnd, setGenCycleEnd] = useState<string>('2026-10-01');
  const [isGeneratingSettlement, setIsGeneratingSettlement] = useState<boolean>(false);
  const [disbursingBatch, setDisbursingBatch] = useState<any | null>(null);
  const [disbursePayaId, setDisbursePayaId] = useState<string>('');
  const [isDisbursing, setIsDisbursing] = useState<boolean>(false);
  const [coachActionFeedback, setCoachActionFeedback] = useState<{ success?: string; error?: string } | null>(null);

  // Admin Direct Coach Provisioning State
  const [isAddCoachModalOpen, setIsAddCoachModalOpen] = useState<boolean>(false);
  const [isCreatingCoach, setIsCreatingCoach] = useState<boolean>(false);
  const [newCoachForm, setNewCoachForm] = useState({
    phone: '',
    fullName: '',
    displayName: '',
    sports: 'بدنسازی، فیتنس',
    experienceYears: 5,
    commissionRate: 15,
    shebaNumber: '',
    bankAccountHolder: '',
    bio: '',
  });

  // Staff Management State
  const [adminStaff, setAdminStaff] = useState<any[]>([]);
  const [staffSearchTerm, setStaffSearchTerm] = useState<string>('');
  const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState<boolean>(false);
  const [isSavingStaff, setIsSavingStaff] = useState<boolean>(false);
  const [staffForm, setStaffForm] = useState<{ phone: string; firstName: string; lastName: string; assignedGymId: string }>({
    phone: '',
    firstName: '',
    lastName: '',
    assignedGymId: '',
  });
  const [staffFeedback, setStaffFeedback] = useState<{ success?: string; error?: string } | null>(null);

  // Platform Classes Overview State
  const [adminClasses, setAdminClasses] = useState<any[]>([]);
  const [classesSearchTerm, setClassesSearchTerm] = useState<string>('');

  // Full Gym Management Super Admin State
  const [gymSearchTerm, setGymSearchTerm] = useState<string>('');
  const [gymStatusFilter, setGymStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [gymTierFilter, setGymTierFilter] = useState<string>('ALL');
  const [gymAccessModeFilter, setGymAccessModeFilter] = useState<string>('ALL');
  const [gymActionFeedback, setGymActionFeedback] = useState<{ success?: string; error?: string } | null>(null);

  // Add Gym Form Modal
  const [isAddGymModalOpen, setIsAddGymModalOpen] = useState<boolean>(false);
  const [isCreatingGym, setIsCreatingGym] = useState<boolean>(false);
  const defaultNewGym = {
    nameFa: '',
    tier: GymTier.BASIC,
    accessMode: GymAccessMode.MIXED,
    city: 'تهران',
    district: '',
    addressFa: '',
    latitude: 35.72,
    longitude: 51.41,
    geofenceRadiusMeters: 150,
    shebaNumber: '',
    bankAccountHolder: '',
    phone: '',
    descriptionFa: '',
  };
  const [newGymForm, setNewGymForm] = useState(defaultNewGym);

  // Edit Gym Form Modal
  const [editingGym, setEditingGym] = useState<any | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editGymForm, setEditGymForm] = useState<any>({});

  // Operational Dossier Modal
  const [inspectingGymId, setInspectingGymId] = useState<string | null>(null);
  const [inspectingGymDetail, setInspectingGymDetail] = useState<GymDetailAdminResponse | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);

  // Safe Removal Modal
  const [removingGym, setRemovingGym] = useState<any | null>(null);
  const [isRemovingGym, setIsRemovingGym] = useState<boolean>(false);

  const handleToggleGymStatus = async (gym: any) => {
    const nextStatus = !gym.isActive;
    setGymActionFeedback(null);
    try {
      await apiFetch(`/admin/gyms/${gym.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextStatus }),
      });
      setGymActionFeedback({
        success: `وضعیت مجموعه «${gym.nameFa}» با موفقیت به ${nextStatus ? 'فعال' : 'غیرفعال / بایگانی'} تغییر یافت.`,
      });
      await fetchDashboard();
    } catch (err: any) {
      setGymActionFeedback({ error: err.message || 'خطا در تغییر وضعیت مجموعه' });
    }
  };

  const handleCreateGym = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingGym(true);
    setGymActionFeedback(null);
    try {
      const res = await apiFetch<any>('/admin/gyms', {
        method: 'POST',
        body: JSON.stringify(newGymForm),
      });
      setGymActionFeedback({
        success: `مجموعه ورزشی «${res.nameFa}» با موفقیت افزوده شد و بلافاصله در فهرست مجموعه‌ها قرار گرفت.`,
      });
      setIsAddGymModalOpen(false);
      setNewGymForm(defaultNewGym);
      await fetchDashboard();
    } catch (err: any) {
      setGymActionFeedback({ error: err.message || 'خطا در ایجاد مجموعه ورزشی' });
    } finally {
      setIsCreatingGym(false);
    }
  };

  const openEditModal = (gym: any) => {
    setEditingGym(gym);
    setEditGymForm({
      nameFa: gym.nameFa || '',
      tier: gym.tier || GymTier.BASIC,
      accessMode: gym.accessMode || GymAccessMode.MIXED,
      city: gym.city || 'تهران',
      district: gym.district || '',
      addressFa: gym.addressFa || '',
      latitude: gym.latitude || 35.72,
      longitude: gym.longitude || 51.41,
      geofenceRadiusMeters: gym.geofenceRadiusMeters || 150,
      shebaNumber: gym.shebaNumber || '',
      bankAccountHolder: gym.bankAccountHolder || '',
      phone: gym.phone || '',
      descriptionFa: gym.descriptionFa || '',
      isActive: gym.isActive ?? true,
    });
  };

  const handleSaveEditGym = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGym) return;
    setIsSavingEdit(true);
    setGymActionFeedback(null);
    try {
      const res = await apiFetch<any>(`/admin/gyms/${editingGym.id}`, {
        method: 'PUT',
        body: JSON.stringify(editGymForm),
      });
      setGymActionFeedback({
        success: `تغییرات مجموعه «${res.nameFa || editGymForm.nameFa}» با موفقیت ذخیره شد و پس از بازخوانی پایدار است.`,
      });
      setEditingGym(null);
      await fetchDashboard();
    } catch (err: any) {
      setGymActionFeedback({ error: err.message || 'خطا در ذخیره تغییرات مجموعه' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openDetailModal = async (gym: any) => {
    setInspectingGymId(gym.id);
    setIsLoadingDetail(true);
    setInspectingGymDetail(null);
    try {
      const detail = await apiFetch<GymDetailAdminResponse>(`/admin/gyms/${gym.id}`);
      setInspectingGymDetail(detail);
    } catch (err: any) {
      setGymActionFeedback({ error: err.message || 'خطا در بارگذاری پرونده عملیاتی مجموعه' });
      setInspectingGymId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removingGym) return;
    setIsRemovingGym(true);
    setGymActionFeedback(null);
    try {
      const res = await apiFetch<any>(`/admin/gyms/${removingGym.id}`, {
        method: 'DELETE',
      });
      setGymActionFeedback({
        success: res.message || 'عملیات با موفقیت انجام شد.',
      });
      setRemovingGym(null);
      await fetchDashboard();
    } catch (err: any) {
      setGymActionFeedback({ error: err.message || 'خطا در خروج مجموعه از شبکه' });
    } finally {
      setIsRemovingGym(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab && ['economics', 'gyms', 'coaches', 'staff', 'classes'].includes(urlTab)) {
        setAdminTab(urlTab as any);
      }
    }
  }, []);

  useEffect(() => {
    if (user && (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN)) {
      fetchDashboard();
    }
  }, [user]);

  const fetchDashboard = async () => {
    try {
      const [
        metricsRes,
        chksRes,
        rulesRes,
        gymsListRes,
        mgmtGymsRes,
        coachesRes,
        settlementsRes,
        staffRes,
        classesRes,
      ] = await Promise.allSettled([
        apiFetch<any>('/admin/dashboard-metrics'),
        apiFetch<any[]>('/admin/recent-checkins'),
        apiFetch<any>('/economics/rules'),
        apiFetch<any[]>('/gyms'),
        apiFetch<any[]>('/admin/gyms'),
        apiFetch<any[]>('/coaches/admin/all'),
        apiFetch<any[]>('/coaches/admin/settlements'),
        apiFetch<any[]>('/admin/staff'),
        apiFetch<any[]>('/admin/classes'),
      ]);

      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value);
      if (chksRes.status === 'fulfilled') setRecentCheckins(chksRes.value || []);
      if (rulesRes.status === 'fulfilled') setRules(rulesRes.value);

      if (gymsListRes.status === 'fulfilled' && gymsListRes.value?.length > 0) {
        setGyms(gymsListRes.value);
        setSelectedGymId(gymsListRes.value[1]?.id || gymsListRes.value[0]?.id);
      }

      if (mgmtGymsRes.status === 'fulfilled' && mgmtGymsRes.value?.length > 0) {
        const mgmtGyms = mgmtGymsRes.value;
        setAdminGyms(mgmtGyms);
        const cur = mgmtGyms.find(g => g.id === selectedMgmtGymId) || mgmtGyms[0];
        setSelectedMgmtGymId(cur.id);
        setAccessModeInput(cur.accessMode || 'MIXED');
        if (mgmtGyms.length > 0 && !staffForm.assignedGymId) {
          setStaffForm(prev => ({ ...prev, assignedGymId: mgmtGyms[0].id }));
        }
      }

      if (coachesRes.status === 'fulfilled') setAdminCoaches(coachesRes.value || []);
      if (settlementsRes.status === 'fulfilled') setAdminSettlements(settlementsRes.value || []);
      if (staffRes.status === 'fulfilled') setAdminStaff(staffRes.value || []);
      if (classesRes.status === 'fulfilled') setAdminClasses(classesRes.value || []);
    } catch (err) {
      console.error('Error fetching admin dashboard:', err);
    }
  };

  const handleVerifyCoach = async () => {
    if (!verifyingCoach) return;
    setIsVerifying(true);
    setCoachActionFeedback(null);
    try {
      await apiFetch(`/coaches/admin/${verifyingCoach.id}/verify`, {
        method: 'PUT',
        body: JSON.stringify({
          status: verifyActionStatus,
          commissionRate: Number(verifyCommissionRate) / 100,
        }),
      });
      setCoachActionFeedback({
        success: `وضعیت مربی ${verifyingCoach.displayName} با موفقیت به ${
          verifyActionStatus === 'VERIFIED' ? 'تأییدشده' : 'ردشده'
        } تغییر یافت.`,
      });
      setVerifyingCoach(null);
      fetchDashboard();
    } catch (err: any) {
      setCoachActionFeedback({ error: err.message || 'خطا در ثبت وضعیت مربی' });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGenerateSettlement = async () => {
    if (!generatingCoach) return;
    setIsGeneratingSettlement(true);
    setCoachActionFeedback(null);
    try {
      const res = await apiFetch<any>(`/coaches/admin/${generatingCoach.id}/settlements/generate`, {
        method: 'POST',
        body: JSON.stringify({
          cycleStart: genCycleStart,
          cycleEnd: genCycleEnd,
        }),
      });
      setCoachActionFeedback({
        success: `دسته تسویه برای ${generatingCoach.displayName} با شماره ${res.id} تولید شد.`,
      });
      setGeneratingCoach(null);
      fetchDashboard();
    } catch (err: any) {
      setCoachActionFeedback({ error: err.message || 'خطا در ایجاد دسته تسویه' });
    } finally {
      setIsGeneratingSettlement(false);
    }
  };

  const handleDisburseSettlement = async () => {
    if (!disbursingBatch) return;
    setIsDisbursing(true);
    setCoachActionFeedback(null);
    try {
      await apiFetch(`/coaches/admin/settlements/${disbursingBatch.id || disbursingBatch.batchId}/disburse`, {
        method: 'POST',
        body: JSON.stringify({
          payaId: disbursePayaId || `PAYA-IR-${Date.now().toString().slice(-8)}`,
        }),
      });
      setCoachActionFeedback({
        success: 'دسته تسویه با موفقیت به‌عنوان تسویه‌شده در سیستم پایا ثبت شد.',
      });
      setDisbursingBatch(null);
      setDisbursePayaId('');
      fetchDashboard();
    } catch (err: any) {
      setCoachActionFeedback({ error: err.message || 'خطا در تسویه پایا' });
    } finally {
      setIsDisbursing(false);
    }
  };

  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStaff(true);
    setStaffFeedback(null);
    try {
      await apiFetch('/admin/staff', {
        method: 'POST',
        body: JSON.stringify(staffForm),
      });
      setStaffFeedback({ success: 'پرسنل جدید با موفقیت به مجموعه منتسب گردید.' });
      setIsAddStaffModalOpen(false);
      setStaffForm({ phone: '', firstName: '', lastName: '', assignedGymId: adminGyms[0]?.id || '' });
      await fetchDashboard();
    } catch (err: any) {
      setStaffFeedback({ error: err.message || 'خطا در انتساب پرسنل' });
    } finally {
      setIsSavingStaff(false);
    }
  };

  const handleAdminCreateCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingCoach(true);
    setCoachActionFeedback(null);
    try {
      await apiFetch('/coaches/admin/create', {
        method: 'POST',
        body: JSON.stringify({
          phone: newCoachForm.phone,
          fullName: newCoachForm.fullName,
          displayName: newCoachForm.displayName,
          sports: newCoachForm.sports.split('،').map(s => s.trim()).filter(Boolean),
          experienceYears: Number(newCoachForm.experienceYears),
          commissionRate: Number(newCoachForm.commissionRate) / 100,
          shebaNumber: newCoachForm.shebaNumber,
          bankAccountHolder: newCoachForm.bankAccountHolder,
          bio: newCoachForm.bio,
        }),
      });
      setCoachActionFeedback({ success: `مربی جدید «${newCoachForm.displayName}» با موفقیت در سیستم ثبت و تأیید شد.` });
      setIsAddCoachModalOpen(false);
      setNewCoachForm({
        phone: '',
        fullName: '',
        displayName: '',
        sports: 'بدنسازی، فیتنس',
        experienceYears: 5,
        commissionRate: 15,
        shebaNumber: '',
        bankAccountHolder: '',
        bio: '',
      });
      await fetchDashboard();
    } catch (err: any) {
      setCoachActionFeedback({ error: err.message || 'خطا در ثبت مربی توسط مدیریت' });
    } finally {
      setIsCreatingCoach(false);
    }
  };

  const handleUpdatePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideStatus(null);
    try {
      await apiFetch(`/economics/gym-pricing/${selectedGymId}`, {
        method: 'PUT',
        body: JSON.stringify({
          creditCost: Number(creditCostInput),
          monetaryPayoutTomans: Number(payoutInput),
          notes: 'بروزرسانی از طریق پنل مدیریت ادمین',
        }),
      });
      setOverrideStatus({ success: 'تعرفه با موفقیت بروزرسانی شد و اصل نامساوی طلایی تأیید گردید.' });
      fetchDashboard();
    } catch (err: any) {
      setOverrideStatus({ error: err.message || 'خطا در اعمال تعرفه' });
    }
  };

  const handleUpdateAccessMode = async () => {
    setSansStatus(null);
    try {
      await apiFetch(`/admin/gyms/${selectedMgmtGymId}/access-mode`, {
        method: 'PUT',
        body: JSON.stringify({ accessMode: accessModeInput }),
      });
      setSansStatus({ success: 'نوع دسترسی جنسیتی باشگاه با موفقیت بروزرسانی شد.' });
      fetchDashboard();
    } catch (err: any) {
      setSansStatus({ error: err.message || 'خطا در بروزرسانی نوع دسترسی' });
    }
  };

  const handleAddSans = async (e: React.FormEvent) => {
    e.preventDefault();
    setSansStatus(null);
    try {
      await apiFetch(`/admin/gyms/${selectedMgmtGymId}/sans`, {
        method: 'POST',
        body: JSON.stringify({
          dayOfWeek: Number(sansDayInput),
          gender: sansGenderInput,
          startTime: sansStartInput,
          endTime: sansEndInput,
          capacity: Number(sansCapacityInput),
          isPeak: Boolean(sansIsPeakInput),
        }),
      });
      setSansStatus({ success: 'سانس جدید با موفقیت ثبت و اعتبارسنجی شد.' });
      fetchDashboard();
    } catch (err: any) {
      setSansStatus({ error: err.message || 'خطا در ثبت سانس' });
    }
  };

  const handleDeleteSans = async (sansId: string) => {
    setSansStatus(null);
    try {
      await apiFetch(`/admin/gyms/${selectedMgmtGymId}/sans/${sansId}`, {
        method: 'DELETE',
      });
      setSansStatus({ success: 'سانس با موفقیت حذف گردید.' });
      fetchDashboard();
    } catch (err: any) {
      setSansStatus({ error: err.message || 'خطا در حذف سانس' });
    }
  };

  // Real-time Golden Bounding Inequality Ratio Calculation: lambda = (M_club + VC_checkin) / C_club
  const vcCheckin = rules?.variableCostPerCheckinTomans ?? 500;
  const maxAllowedRatio = rules?.globalMaxPayoutPerCreditRatio ?? 32000;
  const calculatedLambda = creditCostInput > 0 ? (payoutInput + vcCheckin) / creditCostInput : 0;
  const isViolated = calculatedLambda > maxAllowedRatio;

  // 1. Loading State Guard (eliminates privileged shell flash)
  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-[#F4F5F2]">
        <div className="h-20 w-1/3 animate-pulse rounded-2xl bg-[#15181B] border border-[#272B30] mb-8" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 animate-pulse rounded-3xl bg-[#15181B] border border-[#272B30]" />
          ))}
        </div>
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
      <div className="mx-auto max-w-lg px-4 py-16 text-[#F4F5F2]">
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8 text-[#C8F500]" />}
          title="ورود به پنل مدیریت گراویتی"
          description="دسترسی به این بخش صرفاً برای مدیران ارشد سیستم امکان‌پذیر است. لطفاً جهت احراز هویت وارد حساب کاربری خود شوید."
          action={
            <Button
              variant="primary"
              onClick={() => openLoginModal('ورود به‌عنوان مدیر ارشد سیستم')}
              leftIcon={<ShieldAlert className="h-4 w-4 text-[#0D0F11]" />}
            >
              ورود مدیر ارشد
            </Button>
          }
        />
      </div>
    );
  }

  // 3. Unauthorized Role Guard (e.g. Member or Staff)
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-[#F4F5F2]">
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8 text-rose-500" />}
          title="دسترسی غیرمجاز به پنل مدیریت"
          description="حساب کاربری شما سطح دسترسی لازم برای مشاهده و مدیریت پنل اقتصادی را ندارد."
          action={
            <div className="flex items-center gap-3">
              <Link href={user.role === UserRole.GYM_STAFF ? '/reception' : '/account'}>
                <Button variant="primary" size="md">
                  {user.role === UserRole.GYM_STAFF ? 'کانتر پذیرش' : 'حساب کاربری'}
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 text-[#F4F5F2]">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#202428] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-950/60 border border-amber-800/60 px-3 py-1 text-xs font-bold text-amber-300 mb-2">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            <span>سطح دسترسی: مدیر ارشد (Super Admin)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#F4F5F2] tracking-tight">
            پنل نظارت و مدیریت اقتصاد پلتفرم
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#9CA3A8]">
            پایش شاخص‌های حاشیه سود مشترک، تسویه حساب‌ها، مربیان و اعتبارسنجی محدودیت طلایی
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-[#1D2125] border border-[#272B30] p-1.5 self-start sm:self-auto max-w-full overflow-x-auto">
          <button
            type="button"
            onClick={() => setAdminTab('economics')}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              adminTab === 'economics'
                ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            <span>اقتصاد و مجموعه‌ها</span>
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('gyms')}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              adminTab === 'gyms'
                ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>مدیریت مجموعه‌ها</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#15181B] text-[10px] font-black text-[#C8F500] font-persian-digits">
              {toPersianDigits(adminGyms.length)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('coaches')}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              adminTab === 'coaches'
                ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>مربیان و تسویه‌ها</span>
            {adminCoaches.filter(c => c.verificationStatus === 'PENDING').length > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white font-persian-digits">
                {toPersianDigits(adminCoaches.filter(c => c.verificationStatus === 'PENDING').length)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('staff')}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              adminTab === 'staff'
                ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>پرسنل پذیرش</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#15181B] text-[10px] font-black text-[#C8F500] font-persian-digits">
              {toPersianDigits(adminStaff.length)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('classes')}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              adminTab === 'classes'
                ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>کلاس‌های ورزشی</span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#15181B] text-[10px] font-black text-[#C8F500] font-persian-digits">
              {toPersianDigits(adminClasses.length)}
            </span>
          </button>
        </div>
      </div>

      {adminTab === 'economics' ? (
        <>
        {/* Financial Metrics Row */}
      {metrics && (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Metric 1: Gross Revenue */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9CA3A8]">درآمد ناخالص پلتفرم (Gross Revenue)</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-cyan-400 border border-[#272B30]">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
              {metrics.economics?.totalRevenueTomans?.toLocaleString('fa-IR')}{' '}
              <span className="text-xs font-normal text-[#9CA3A8] font-sans">تومان</span>
            </div>
            <span className="mt-2 block text-[11px] text-emerald-400 font-semibold">مبتنی بر مشترکین فعال</span>
          </div>

          {/* Metric 2: Payables */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9CA3A8]">تعهد تسویه باشگاه‌ها (Payable Liabilities)</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-violet-400 border border-[#272B30]">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
              {metrics.economics?.totalPayablesTomans?.toLocaleString('fa-IR')}{' '}
              <span className="text-xs font-normal text-[#9CA3A8] font-sans">تومان</span>
            </div>
            <span className="mt-2 block text-[11px] text-violet-400 font-semibold">بستانکاری تجمیعی مجموعه‌ها</span>
          </div>

          {/* Metric 3: Contribution Margin (Contains required test text: 'حاشیه مشارکت (Contribution Margin)') */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9CA3A8]">حاشیه مشارکت (Contribution Margin)</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-[#C8F500] border border-[#272B30]">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-black text-[#C8F500] font-persian-digits">
              {metrics.economics?.contributionMargin?.toLocaleString('fa-IR')}{' '}
              <span className="text-xs font-normal text-[#9CA3A8] font-sans">تومان</span>
            </div>
            <span className="mt-2 block text-[11px] text-[#C8F500] font-semibold font-persian-digits">
              نسبت: {toPersianDigits(metrics.economics?.contributionMarginRatio)}٪ (هدف: بالای ۴۵٪)
            </span>
          </div>

          {/* Metric 4: Check-ins */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#9CA3A8]">مجموع ورودهای تأییدشده</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-amber-400 border border-[#272B30]">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
              {metrics.overview?.totalCheckins?.toLocaleString('fa-IR')}{' '}
              <span className="text-xs font-normal text-[#9CA3A8] font-sans">جلسه</span>
            </div>
            <span className="mt-2 block text-[11px] text-[#62686D] font-medium">تراکنش‌های موفق اسکن کانتر</span>
          </div>
        </div>
      )}

      {/* Pricing Override Engine with Golden Bounding Validator */}
      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-7 shadow-xs">
          <div className="flex items-center gap-2 border-b border-[#202428] pb-3">
            <Calculator className="h-5 w-5 text-[#C8F500]" />
            <h2 className="text-base font-bold text-[#F4F5F2]">موتور تنظیم تعرفه و آزمون محدودیت طلایی</h2>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-[#9CA3A8]">
            ادمین می‌تواند هزینه اعتباری و تسویه ریالی هر مجموعه را مستقلاً تغییر دهد. سیستم پیش از ذخیره‌سازی، نامساوی طلایی (M/C ≤ ۳۲,۰۰۰) را بررسی می‌کند.
          </p>

          <form onSubmit={handleUpdatePricing} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#C4C8CC] mb-1">انتخاب مجموعه ورزشی</label>
              <select
                value={selectedGymId}
                onChange={e => setSelectedGymId(e.target.value)}
                className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 text-xs font-medium text-[#F4F5F2] shadow-xs focus:border-[#C8F500] focus:bg-[#15181B] focus:outline-none"
              >
                {gyms && gyms.length > 0 ? (
                  gyms.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.nameFa} (سطح {g.tier})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="gym-basic-1">باشگاه بدنسازی کارو (سطح پایه)</option>
                    <option value="gym-plus-2">مجموعه ورزشی ستاره ونک (سطح پلاس)</option>
                    <option value="gym-premium-3">باشگاه اکسیژن رویال (سطح پریمیوم)</option>
                    <option value="gym-elite-4">کلاب ورزشی هتل اسپیناس پالاس (سطح الیت)</option>
                  </>
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#C4C8CC] mb-1">هزینه اعتباری کاربر (C_club)</label>
                <input
                  type="number"
                  min="1"
                  value={creditCostInput}
                  onChange={e => setCreditCostInput(Number(e.target.value))}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 font-mono text-sm font-bold text-[#F4F5F2] shadow-xs focus:border-[#C8F500] focus:bg-[#15181B] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#C4C8CC] mb-1">تسویه نقدی باشگاه (M_club تومان)</label>
                <input
                  type="number"
                  step="5000"
                  min="0"
                  value={payoutInput}
                  onChange={e => setPayoutInput(Number(e.target.value))}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 font-mono text-sm font-bold text-[#F4F5F2] shadow-xs focus:border-[#C8F500] focus:bg-[#15181B] focus:outline-none"
                />
              </div>
            </div>

            {/* Real-Time Golden Bounding Feedback Indicator (Crucial for test: 'هشدار اقتصادی' / 'زیان پلتفرم') */}
            <div
              className={`rounded-2xl p-4 text-xs font-medium transition-all ${
                isViolated
                  ? 'border border-red-800/80 bg-red-950/60 text-red-200 animate-fade-in'
                  : 'border border-emerald-800/80 bg-emerald-950/60 text-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>نسبت تسویه به اعتبار محاسبه شده:</span>
                <span className="font-bold text-sm">
                  <span className="font-persian-digits">{Math.round(calculatedLambda).toLocaleString('fa-IR')}</span>{' '}
                  <span>تومان / اعتبار</span>
                </span>
              </div>
              <div className="mt-1 text-[11px] opacity-80">
                سقف مجاز پلتفرم (λ_max): {maxAllowedRatio.toLocaleString('fa-IR')} تومان / اعتبار (با احتساب {vcCheckin.toLocaleString('fa-IR')} ت هزینه ورود)
              </div>
              {isViolated && (
                <div className="mt-2.5 flex items-center gap-1.5 font-bold text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>هشدار اقتصادی: این تعرفه باعث زیان پلتفرم در مصرف صددرصدی می‌شود و ثبت نخواهد شد!</span>
                </div>
              )}
            </div>

            {overrideStatus?.success && (
              <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 p-3 text-xs font-semibold text-emerald-300 animate-fade-in">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>{overrideStatus.success}</span>
              </div>
            )}

            {overrideStatus?.error && (
              <div className="rounded-2xl bg-red-950/60 border border-red-800/60 p-3 text-xs font-semibold text-red-300 animate-fade-in">
                {overrideStatus.error}
              </div>
            )}

            <Button
              type="submit"
              disabled={isViolated}
              variant="primary"
              size="lg"
              className="w-full"
            >
              ذخیره و انتشار فوری در قوانین دیتابیس
            </Button>
          </form>
        </div>

        {/* Live Check-in Feed */}
        <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-7 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#202428] pb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#C8F500]" />
                <h2 className="text-base font-bold text-[#F4F5F2]">آخرین ورودهای زنده شبکه</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-[#C8F500] animate-ping" />
                <span className="text-[11px] font-bold text-[#C8F500]">زنده</span>
              </div>
            </div>

            <div className="mt-4 divide-y divide-[#202428] max-h-96 overflow-y-auto">
              {recentCheckins.length === 0 ? (
                <p className="py-12 text-center text-xs text-[#62686D] font-medium">
                  هنوز ورودی جدیدی در پایگاه داده ثبت نشده است.
                </p>
              ) : (
                recentCheckins.map((chk: any) => (
                  <div key={chk.id} className="flex items-center justify-between py-3.5 hover:bg-[#1D2125] px-2 rounded-xl transition">
                    <div>
                      <span className="block text-xs font-bold text-[#F4F5F2]">{chk.gym_name || 'مجموعه ورزشی'}</span>
                      <span className="block text-[11px] text-[#9CA3A8] mt-0.5">
                        کاربر: {chk.first_name || 'عضو'} (<bdi dir="ltr">***{chk.phone_number?.slice(-4)}</bdi>)
                      </span>
                    </div>
                    <div className="text-left">
                      <span className="inline-block rounded-xl bg-[#1D2125] border border-[#272B30] px-2.5 py-0.5 text-xs font-bold text-[#C8F500] font-persian-digits">
                        {chk.credits_debited} اعتبار
                      </span>
                      <span className="block text-[10px] text-[#62686D] mt-1 font-persian-digits">
                        تسویه: {Number(chk.monetary_payout_tomans).toLocaleString('fa-IR')} ت
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-[#202428] text-[11px] text-[#62686D] text-center">
            پایش لحظه‌ای اتوماتیک تراکنش‌های پذیرش در تمامی شعب
          </div>
        </div>
      </div>

      {/* Gym Access & Sessions Management Section */}
      <div className="mt-10 rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#202428] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1D2125] border border-[#272B30] text-[#C8F500]">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#F4F5F2]">مدیریت دسترسی جنسیتی و سانس‌های باشگاه‌ها</h2>
              <p className="text-xs text-[#9CA3A8] mt-0.5">پیکربندی نوع دسترسی (بانوان / آقایان / مختلط شیفتی) و جدول سانس‌های هفتگی</p>
            </div>
          </div>

          {/* Select Target Gym */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#C4C8CC]">انتخاب باشگاه:</span>
            <select
              value={selectedMgmtGymId}
              onChange={e => {
                const gid = e.target.value;
                setSelectedMgmtGymId(gid);
                const g = adminGyms.find(x => x.id === gid);
                if (g) setAccessModeInput(g.accessMode || 'MIXED');
              }}
              className="rounded-2xl border border-[#272B30] bg-[#1D2125] py-2 pr-3 pl-8 text-xs font-bold text-[#F4F5F2] focus:border-[#C8F500] focus:bg-[#15181B] focus:outline-none"
            >
              {adminGyms.map(g => (
                <option key={g.id} value={g.id}>
                  {g.nameFa} ({g.tier})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Top Controls: Access Mode Configuration */}
        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#1D2125] border border-[#272B30]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-bold text-[#C4C8CC]">نوع دسترسی مجموعه (Access Mode):</span>
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'FEMALE_ONLY', label: 'کاملاً ویژه بانوان (Female Only)' },
                { id: 'MALE_ONLY', label: 'کاملاً ویژه آقایان (Male Only)' },
                { id: 'MIXED', label: 'سانس‌های تفکیک‌شده (Mixed Shifts)' },
              ].map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setAccessModeInput(mode.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    accessModeInput === mode.id
                      ? 'bg-[#C8F500] text-[#0D0F11] font-black shadow-xs'
                      : 'bg-[#15181B] text-[#C4C8CC] border border-[#272B30] hover:bg-[#22272C]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={handleUpdateAccessMode}
            variant="primary"
            size="sm"
          >
            ذخیره نوع دسترسی
          </Button>
        </div>

        {/* Status Alert */}
        {sansStatus?.success && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 p-3 text-xs font-semibold text-emerald-300 animate-fade-in">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{sansStatus.success}</span>
          </div>
        )}
        {sansStatus?.error && (
          <div className="mt-4 rounded-2xl bg-red-950/60 border border-red-800/60 p-3 text-xs font-semibold text-red-300 animate-fade-in">
            {sansStatus.error}
          </div>
        )}

        {/* Grid: Existing Sans on Right / Add New Sans on Left */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Sessions List (2 cols) */}
          <div className="lg:col-span-2">
            <h3 className="text-sm font-bold text-[#F4F5F2] mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#C8F500]" />
              <span>سانس‌های هفتگی ثبت‌شده در این مجموعه</span>
            </h3>

            {(() => {
              const currentGym = adminGyms.find(g => g.id === selectedMgmtGymId);
              const sansList = currentGym?.sans || [];
              if (sansList.length === 0) {
                return (
                  <p className="py-8 text-center text-xs text-[#62686D] font-medium border border-dashed border-[#272B30] rounded-2xl">
                    هنوز هیچ سانسی برای این مجموعه تعریف نشده است.
                  </p>
                );
              }

              return (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {sansList.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-2xl border border-[#272B30] bg-[#1D2125] hover:bg-[#22272C] transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="rounded-xl bg-[#15181B] border border-[#272B30] px-2.5 py-1 text-xs font-bold text-[#F4F5F2]">
                          {DAY_NAMES[s.dayOfWeek] || `روز ${s.dayOfWeek}`}
                        </span>

                        <span
                          className={`rounded-xl px-2 py-0.5 text-xs font-bold ${
                            s.gender === Gender.FEMALE
                              ? 'bg-rose-950/60 border border-rose-800/60 text-rose-300'
                              : 'bg-cyan-950/60 border border-cyan-800/60 text-cyan-300'
                          }`}
                        >
                          {s.gender === Gender.FEMALE ? 'بانوان' : 'آقایان'}
                        </span>

                        <span className="text-xs font-bold text-[#C4C8CC] font-persian-digits">
                          {s.startTime?.slice(0, 5)} تا {s.endTime?.slice(0, 5)}
                        </span>

                        {s.isPeak && (
                          <span className="rounded-xl bg-amber-950/70 border border-amber-800/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            سانس اوج
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteSans(s.id)}
                        className="rounded-xl p-1.5 text-[#9CA3A8] hover:bg-red-950/60 hover:text-red-400 transition cursor-pointer"
                        title="حذف سانس"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Add New Sans Form (1 col) */}
          <div className="rounded-2xl border border-[#272B30] bg-[#1D2125]/70 p-5">
            <h3 className="text-sm font-bold text-[#F4F5F2] mb-3 flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-[#C8F500]" />
              <span>افزودن سانس جدید</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-[#C4C8CC] mb-1">روز هفته</label>
                <select
                  value={sansDayInput}
                  onChange={e => setSansDayInput(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#272B30] bg-[#15181B] py-1.5 px-3 text-xs font-semibold text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#C4C8CC] mb-1">جنسیت سانس</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSansGenderInput('FEMALE')}
                    className={`rounded-xl py-1.5 text-xs font-bold transition cursor-pointer ${
                      sansGenderInput === 'FEMALE'
                        ? 'bg-rose-900/60 border border-rose-600 text-rose-200'
                        : 'bg-[#15181B] border border-[#272B30] text-[#9CA3A8]'
                    }`}
                  >
                    بانوان
                  </button>
                  <button
                    type="button"
                    onClick={() => setSansGenderInput('MALE')}
                    className={`rounded-xl py-1.5 text-xs font-bold transition cursor-pointer ${
                      sansGenderInput === 'MALE'
                        ? 'bg-cyan-900/60 border border-cyan-600 text-cyan-200'
                        : 'bg-[#15181B] border border-[#272B30] text-[#9CA3A8]'
                    }`}
                  >
                    آقایان
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#C4C8CC] mb-1">ساعت شروع</label>
                  <input
                    type="text"
                    placeholder="08:00"
                    value={sansStartInput}
                    dir="ltr"
                    onChange={e => setSansStartInput(e.target.value)}
                    className="w-full rounded-xl border border-[#272B30] bg-[#15181B] py-1.5 px-2.5 text-center text-xs font-mono text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#C4C8CC] mb-1">ساعت پایان</label>
                  <input
                    type="text"
                    placeholder="14:00"
                    value={sansEndInput}
                    dir="ltr"
                    onChange={e => setSansEndInput(e.target.value)}
                    className="w-full rounded-xl border border-[#272B30] bg-[#15181B] py-1.5 px-2.5 text-center text-xs font-mono text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-peak"
                  checked={sansIsPeakInput}
                  onChange={e => setSansIsPeakInput(e.target.checked)}
                  className="rounded border-[#272B30] bg-[#15181B] text-[#C8F500] focus:ring-[#C8F500]"
                />
                <label htmlFor="chk-peak" className="text-xs font-semibold text-[#C4C8CC] cursor-pointer">
                  تعرفه سانس اوج (Peak Sans)
                </label>
              </div>

              <Button
                type="button"
                onClick={handleAddSans}
                variant="primary"
                size="sm"
                className="w-full mt-2"
              >
                ثبت و اعتبارسنجی سانس
              </Button>
            </div>
          </div>
        </div>
      </div>
      </>
      ) : adminTab === 'gyms' ? (
        /* FULL GYM MANAGEMENT TAB */
        <div className="mt-8 space-y-8">
          {gymActionFeedback?.success && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 p-4 text-xs font-semibold text-emerald-300 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{gymActionFeedback.success}</span>
            </div>
          )}
          {gymActionFeedback?.error && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-950/60 border border-red-800/60 p-4 text-xs font-semibold text-red-300 animate-fade-in">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{gymActionFeedback.error}</span>
            </div>
          )}

          {/* Quick Metrics for Gyms */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">کل مجموعه‌های شبکه</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-cyan-400 border border-[#272B30]">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminGyms.length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">مجموعه</span>
              </div>
              <span className="mt-2 block text-[11px] text-emerald-400 font-semibold">
                {toPersianDigits(adminGyms.filter(g => g.isActive).length)} مجموعه فعال
              </span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">مجموعه‌های فعال پذیرش</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-emerald-400 border border-[#272B30]">
                  <CheckCircle className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-emerald-400 font-persian-digits">
                {toPersianDigits(adminGyms.filter(g => g.isActive).length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">باشگاه</span>
              </div>
              <span className="mt-2 block text-[11px] text-emerald-400 font-semibold">آماده صدور و اسکن بارکد QR</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">غیرفعال یا بایگانی‌شده</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-amber-400 border border-[#272B30]">
                  <Power className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-amber-400 font-persian-digits">
                {toPersianDigits(adminGyms.filter(g => !g.isActive).length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">مجموعه</span>
              </div>
              <span className="mt-2 block text-[11px] text-[#9CA3A8] font-semibold">مسدود از پذیرش، سوابق محفوظ</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">کل سانس‌های تعریف‌شده</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-[#C8F500] border border-[#272B30]">
                  <Calendar className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#C8F500] font-persian-digits">
                {toPersianDigits(adminGyms.reduce((acc, g) => acc + (g.sans?.length || 0), 0))}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">سانس هفتگی</span>
              </div>
              <span className="mt-2 block text-[11px] text-cyan-400 font-semibold">تفکیک جنسیتی و سانس‌های اوج</span>
            </div>
          </div>

          {/* Action Header & Search/Filters */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#202428] pb-4">
              <div>
                <h2 className="text-lg font-black text-[#F4F5F2] flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-[#C8F500]" />
                  <span>مدیریت مجموعه‌ها و باشگاه‌های طرف قرارداد</span>
                </h2>
                <p className="text-xs text-[#9CA3A8] mt-1">
                  مشاهده پرونده عملیاتی، افزودن باشگاه جدید، ویرایش اطلاعات، فعال/غیرفعال‌سازی و خروج امن از شبکه
                </p>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setNewGymForm(defaultNewGym);
                  setIsAddGymModalOpen(true);
                }}
                className="flex items-center gap-2 self-start md:self-auto cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                <span>افزودن باشگاه جدید</span>
              </Button>
            </div>

            {/* Search and Filters Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
              {/* Search input */}
              <div className="md:col-span-2 relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-[#62686D]" />
                <input
                  type="text"
                  placeholder="جستجو بر اساس نام باشگاه، شهر، منطقه، تلفن یا شبا..."
                  value={gymSearchTerm}
                  onChange={e => setGymSearchTerm(e.target.value)}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] py-2.5 pr-9 pl-3 text-xs text-[#F4F5F2] placeholder-[#62686D] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={gymStatusFilter}
                  onChange={e => setGymStatusFilter(e.target.value as any)}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] py-2.5 px-3 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">وضعیت: همه ({toPersianDigits(adminGyms.length)})</option>
                  <option value="ACTIVE">فقط فعال ({toPersianDigits(adminGyms.filter(g => g.isActive).length)})</option>
                  <option value="INACTIVE">فقط غیرفعال / بایگانی ({toPersianDigits(adminGyms.filter(g => !g.isActive).length)})</option>
                </select>
              </div>

              {/* Tier Filter */}
              <div>
                <select
                  value={gymTierFilter}
                  onChange={e => setGymTierFilter(e.target.value)}
                  className="w-full rounded-2xl border border-[#272B30] bg-[#1D2125] py-2.5 px-3 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">سطح: همه سطوح</option>
                  <option value="BASIC">پایه (BASIC)</option>
                  <option value="PLUS">پلاس (PLUS)</option>
                  <option value="PREMIUM">پریمیوم (PREMIUM)</option>
                  <option value="ELITE">الیت (ELITE)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Gyms List / Cards Grid */}
          <div className="space-y-4">
            {(() => {
              const filtered = adminGyms.filter(g => {
                if (gymSearchTerm.trim()) {
                  const q = gymSearchTerm.trim().toLowerCase();
                  const matchName = (g.nameFa || '').toLowerCase().includes(q);
                  const matchCity = (g.city || '').toLowerCase().includes(q);
                  const matchDistrict = (g.district || '').toLowerCase().includes(q);
                  const matchPhone = (g.phone || '').includes(q);
                  const matchSheba = (g.shebaNumber || '').toLowerCase().includes(q);
                  const matchHolder = (g.bankAccountHolder || '').toLowerCase().includes(q);
                  if (!matchName && !matchCity && !matchDistrict && !matchPhone && !matchSheba && !matchHolder) {
                    return false;
                  }
                }
                if (gymStatusFilter === 'ACTIVE' && !g.isActive) return false;
                if (gymStatusFilter === 'INACTIVE' && g.isActive) return false;
                if (gymTierFilter !== 'ALL' && g.tier !== gymTierFilter) return false;
                if (gymAccessModeFilter !== 'ALL' && g.accessMode !== gymAccessModeFilter) return false;
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="rounded-3xl border border-dashed border-[#272B30] bg-[#15181B] p-12 text-center">
                    <Building2 className="mx-auto h-12 w-12 text-[#62686D] opacity-60" />
                    <h3 className="mt-4 text-base font-bold text-[#F4F5F2]">هیچ مجموعه ورزشی مطابق با فیلترها یافت نشد</h3>
                    <p className="mt-1 text-xs text-[#9CA3A8]">عبارت جستجو یا فیلتر وضعیت و سطح دسترسی را تغییر دهید.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 gap-4">
                  {filtered.map(gym => {
                    const tierInfo = TIER_LABELS[gym.tier] || { label: gym.tier, badgeClass: 'bg-[#1D2125] text-white border-[#272B30]' };
                    const accessInfo = ACCESS_MODE_LABELS[gym.accessMode] || { label: gym.accessMode || 'مختلط', badgeClass: 'bg-[#1D2125] text-white border-[#272B30]' };

                    return (
                      <div
                        key={gym.id}
                        className={`rounded-3xl border p-5 transition-all ${
                          gym.isActive
                            ? 'border-[#272B30] bg-[#15181B] hover:border-[#383D43]'
                            : 'border-red-950/60 bg-[#121417]/80 opacity-80'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                          {/* Info section */}
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-black text-[#F4F5F2]">{gym.nameFa}</h3>
                              <span className={`rounded-xl border px-2.5 py-0.5 text-[11px] font-bold ${tierInfo.badgeClass}`}>
                                {tierInfo.label}
                              </span>
                              <span className={`rounded-xl border px-2.5 py-0.5 text-[11px] font-bold ${accessInfo.badgeClass}`}>
                                {accessInfo.label}
                              </span>
                              <span
                                className={`rounded-xl border px-2.5 py-0.5 text-[11px] font-bold flex items-center gap-1.5 ${
                                  gym.isActive
                                    ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                                    : 'bg-red-950/60 border-red-800/60 text-red-300'
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${gym.isActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                <span>{gym.isActive ? 'فعال در شبکه' : 'غیرفعال / بایگانی'}</span>
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1.5 gap-x-4 text-xs text-[#9CA3A8]">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-[#62686D] shrink-0" />
                                <span>{gym.city}، {gym.district} - {gym.addressFa}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CreditCard className="h-3.5 w-3.5 text-[#62686D] shrink-0" />
                                <span>شبا: <bdi dir="ltr" className="font-mono text-[#F4F5F2]">{gym.shebaNumber || '-'}</bdi> ({gym.bankAccountHolder || '-'})</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-[#62686D] shrink-0" />
                                <span>{toPersianDigits(gym.sans?.length || 0)} سانس هفتگی فعال</span>
                              </div>
                              {gym.phone && (
                                <div className="flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5 text-[#62686D] shrink-0" />
                                  <span>تماس: <bdi dir="ltr" className="font-mono">{gym.phone}</bdi></span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDetailModal(gym)}
                              className="flex items-center gap-1.5 text-xs text-[#F4F5F2] hover:border-[#C8F500] cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5 text-cyan-400" />
                              <span>پرونده عملیاتی</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditModal(gym)}
                              className="flex items-center gap-1.5 text-xs text-[#F4F5F2] hover:border-[#C8F500] cursor-pointer"
                            >
                              <Edit className="h-3.5 w-3.5 text-amber-400" />
                              <span>ویرایش</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleToggleGymStatus(gym)}
                              className={`flex items-center gap-1.5 text-xs cursor-pointer ${
                                gym.isActive
                                  ? 'text-amber-300 hover:border-amber-500 hover:bg-amber-950/30'
                                  : 'text-emerald-300 hover:border-emerald-500 hover:bg-emerald-950/30'
                              }`}
                            >
                              <Power className="h-3.5 w-3.5" />
                              <span>{gym.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRemovingGym(gym)}
                              className="flex items-center gap-1.5 text-xs text-rose-400 hover:border-rose-600 hover:bg-rose-950/30 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>خروج از شبکه</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      ) : adminTab === 'coaches' ? (
        /* COACHES & SETTLEMENTS TAB */
        <div className="mt-8 space-y-8">
          {coachActionFeedback?.success && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 p-4 text-xs font-semibold text-emerald-300 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{coachActionFeedback.success}</span>
            </div>
          )}
          {coachActionFeedback?.error && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-950/60 border border-red-800/60 p-4 text-xs font-semibold text-red-300 animate-fade-in">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{coachActionFeedback.error}</span>
            </div>
          )}

          {/* Top Metrics Row for Coaches */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">کل مربیان ثبت‌نامی</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-cyan-400 border border-[#272B30]">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminCoaches.length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">مربی</span>
              </div>
              <span className="mt-2 block text-[11px] text-emerald-400 font-semibold">
                {toPersianDigits(adminCoaches.filter(c => c.verificationStatus === 'VERIFIED').length)} مربی تأییدشده
              </span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">در انتظار احراز مدارک</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-amber-400 border border-[#272B30]">
                  <UserCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminCoaches.filter(c => c.verificationStatus === 'PENDING').length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">درخواست</span>
              </div>
              <span className="mt-2 block text-[11px] text-amber-400 font-semibold">نیازمند بررسی تیم مدیریت</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">تعهد بستانکاری جاری مربیان</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-[#C8F500] border border-[#272B30]">
                  <CreditCard className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#C8F500] font-persian-digits">
                {formatMoney(adminCoaches.reduce((acc, c) => acc + (c.payableBalanceTomans || 0), 0))}
              </div>
              <span className="mt-2 block text-[11px] text-[#62686D] font-medium">پس از کسر سهم کارمزد گراویتی</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">دوره‌های تسویه پایا</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-violet-400 border border-[#272B30]">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminSettlements.length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">دسته</span>
              </div>
              <span className="mt-2 block text-[11px] text-violet-400 font-semibold">
                {toPersianDigits(adminSettlements.filter(s => s.status === 'PENDING_APPROVAL').length)} آماده پرداخت
              </span>
            </div>
          </div>

          {/* Section 1: Coaches Roster & Verification Management */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#202428] pb-5">
              <div>
                <h2 className="text-lg font-black text-[#F4F5F2]">مدیریت مربیان و نرخ کارمزد</h2>
                <p className="text-xs text-[#9CA3A8] mt-0.5">تأیید هویت، تنظیم درصد کارمزد پلتفرم و بررسی وضعیت تسویه</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-[#62686D]" />
                  <input
                    type="text"
                    placeholder="جستجوی مربی..."
                    value={coachSearchTerm}
                    onChange={e => setCoachSearchTerm(e.target.value)}
                    className="rounded-xl border border-[#272B30] bg-[#1D2125] py-1.5 pr-8 pl-3 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 rounded-xl bg-[#1D2125] border border-[#272B30] p-1 text-xs">
                  {[
                    { id: 'ALL', label: 'همه' },
                    { id: 'PENDING', label: 'در انتظار' },
                    { id: 'VERIFIED', label: 'تأییدشده' },
                    { id: 'REJECTED', label: 'ردشده' },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCoachStatusFilter(f.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                        coachStatusFilter === f.id
                          ? 'bg-[#15181B] text-[#C8F500] border border-[#272B30]'
                          : 'text-[#9CA3A8] hover:text-[#F4F5F2]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAddCoachModalOpen(true)}
                  className="flex items-center gap-1.5 cursor-pointer font-bold"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>افزودن مربی جدید</span>
                </Button>
              </div>
            </div>

            {/* Coaches Table */}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#202428] text-[#9CA3A8] font-bold">
                    <th className="py-3 px-3">نام و مشخصات مربی</th>
                    <th className="py-3 px-3">تخصص‌ها</th>
                    <th className="py-3 px-3">شماره شبا و حساب</th>
                    <th className="py-3 px-3">کارمزد گراویتی</th>
                    <th className="py-3 px-3">وضعیت مدارک</th>
                    <th className="py-3 px-3">مانده بستانکاری</th>
                    <th className="py-3 px-3 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202428]">
                  {(() => {
                    const filtered = adminCoaches.filter(c => {
                      if (coachStatusFilter !== 'ALL' && c.verificationStatus !== coachStatusFilter) return false;
                      if (coachSearchTerm && !c.displayName?.toLowerCase().includes(coachSearchTerm.toLowerCase())) return false;
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-[#62686D]">
                            هیچ مربی منطبق با فیلتر یافت نشد.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map(c => (
                      <tr key={c.id} className="hover:bg-[#1D2125]/50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#F4F5F2]">{c.displayName}</div>
                          <div className="text-[11px] text-[#62686D] font-persian-digits font-mono mt-0.5">
                            {c.contactPhone || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {Array.isArray(c.specialties) && c.specialties.slice(0, 2).map((s: string, idx: number) => (
                              <span key={idx} className="rounded-md bg-[#1D2125] border border-[#272B30] px-1.5 py-0.5 text-[10px] text-[#C4C8CC]">
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono text-[11px] text-[#C4C8CC] dir-ltr">{c.shebaNumber || 'ثبت نشده'}</div>
                          <div className="text-[10px] text-[#62686D]">{c.bankAccountHolder || '-'}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-[#C8F500] font-persian-digits">
                            {toPersianDigits(Math.round((c.commissionRate || 0.15) * 100))}٪
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <Badge
                            variant={
                              c.verificationStatus === 'VERIFIED'
                                ? 'success'
                                : c.verificationStatus === 'PENDING'
                                ? 'warning'
                                : 'danger'
                            }
                            size="sm"
                          >
                            {c.verificationStatus === 'VERIFIED'
                              ? 'تأییدشده'
                              : c.verificationStatus === 'PENDING'
                              ? 'در انتظار بررسی'
                              : 'ردشده'}
                          </Badge>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-[#F4F5F2] font-persian-digits">
                            {formatMoney(c.payableBalanceTomans || 0)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-left">
                          <div className="flex items-center gap-1.5 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setVerifyingCoach(c);
                                setVerifyCommissionRate(Math.round((c.commissionRate || 0.15) * 100));
                                setVerifyActionStatus(c.verificationStatus || 'VERIFIED');
                              }}
                            >
                              بررسی و کارمزد
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setGeneratingCoach(c);
                              }}
                            >
                              تولید تسویه
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Settlement Batches Roster & Paya Disbursement */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#202428] pb-5">
              <div>
                <h2 className="text-lg font-black text-[#F4F5F2]">دسته‌های تسویه حساب مربیان و حواله پایا</h2>
                <p className="text-xs text-[#9CA3A8] mt-0.5">پایش دوره‌های تسویه، محاسبه سهم پلتفرم و ثبت نهایی حواله بانکی</p>
              </div>
              <span className="text-xs text-[#9CA3A8] font-persian-digits">
                {toPersianDigits(adminSettlements.length)} صورتحساب
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#202428] text-[#9CA3A8] font-bold">
                    <th className="py-3 px-3">شناسه دسته</th>
                    <th className="py-3 px-3">مربی و حساب</th>
                    <th className="py-3 px-3">دوره تسویه</th>
                    <th className="py-3 px-3">تعداد جلسات</th>
                    <th className="py-3 px-3">کل ناخالص</th>
                    <th className="py-3 px-3">سهم گراویتی</th>
                    <th className="py-3 px-3">خالص پرداختی</th>
                    <th className="py-3 px-3">وضعیت</th>
                    <th className="py-3 px-3 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202428]">
                  {adminSettlements.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-xs text-[#62686D]">
                        هنوز هیچ دسته تسویه‌ای برای مربیان تولید نشده است.
                      </td>
                    </tr>
                  ) : (
                    adminSettlements.map((batch: any) => {
                      const isPaid = batch.status === 'PAID';
                      return (
                        <tr key={batch.id} className="hover:bg-[#1D2125]/50 transition-colors">
                          <td className="py-3 px-3 font-mono text-[11px] text-[#C4C8CC]">
                            {batch.id?.slice(0, 8)}...
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-[#F4F5F2]">{batch.coach_name || 'مربی'}</div>
                            <div className="text-[10px] text-[#62686D] font-mono dir-ltr">{batch.sheba_number || '-'}</div>
                          </td>
                          <td className="py-3 px-3 text-[11px] text-[#9CA3A8] font-persian-digits">
                            {batch.cycle_start || batch.cycleStart} تا {batch.cycle_end || batch.cycleEnd}
                          </td>
                          <td className="py-3 px-3 font-bold font-persian-digits">
                            {toPersianDigits(batch.total_bookings ?? batch.totalBookings ?? 0)}
                          </td>
                          <td className="py-3 px-3 font-bold font-persian-digits">
                            {formatMoney(batch.total_gross_tomans ?? batch.totalGrossTomans ?? 0)}
                          </td>
                          <td className="py-3 px-3 font-bold text-red-400 font-persian-digits">
                            {formatMoney(batch.total_commission_tomans ?? batch.totalCommissionTomans ?? 0)}
                          </td>
                          <td className="py-3 px-3 font-black text-[#C8F500] font-persian-digits">
                            {formatMoney(batch.total_net_payout_tomans ?? batch.totalNetPayoutTomans ?? 0)}
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant={isPaid ? 'success' : 'warning'} size="sm">
                              {isPaid ? 'تسویه شده' : 'در انتظار پایا'}
                            </Badge>
                            {batch.paya_tracking_id && (
                              <div className="mt-1 font-mono text-[9px] text-[#62686D]">
                                {batch.paya_tracking_id}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-left">
                            {!isPaid ? (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setDisbursingBatch(batch)}
                              >
                                تسویه پایا
                              </Button>
                            ) : (
                              <span className="text-[11px] text-emerald-400 font-bold">تسویه کامل</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : adminTab === 'staff' ? (
        /* STAFF MANAGEMENT TAB */
        <div className="mt-8 space-y-8">
          {staffFeedback?.success && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 p-4 text-xs font-semibold text-emerald-300 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{staffFeedback.success}</span>
            </div>
          )}
          {staffFeedback?.error && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-950/60 border border-red-800/60 p-4 text-xs font-semibold text-red-300 animate-fade-in">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{staffFeedback.error}</span>
            </div>
          )}

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">کل پرسنل پذیرش پلتفرم</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-cyan-400 border border-[#272B30]">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminStaff.length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">اپراتور</span>
              </div>
              <span className="mt-2 block text-[11px] text-emerald-400 font-semibold">دارای دسترسی کانتر ورود</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">پرسنل دارای انتساب معتبر</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-[#C8F500] border border-[#272B30]">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#C8F500] font-persian-digits">
                {toPersianDigits(adminStaff.filter(s => s.assignedGymId).length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">نفر</span>
              </div>
              <span className="mt-2 block text-[11px] text-[#9CA3A8] font-semibold">متصل به مجموعه مشخص</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">مجموعه‌های پوشش داده شده</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-amber-400 border border-[#272B30]">
                  <Building2 className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(new Set(adminStaff.map(s => s.assignedGymId).filter(Boolean)).size)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">مجموعه</span>
              </div>
              <span className="mt-2 block text-[11px] text-amber-400 font-semibold">دارای متصدی پذیرش فعال</span>
            </div>
          </div>

          {/* Staff Roster Card */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#202428] pb-5">
              <div>
                <h2 className="text-lg font-black text-[#F4F5F2]">پرسنل و متصدیان پذیرش باشگاه‌ها</h2>
                <p className="text-xs text-[#9CA3A8] mt-0.5">کنترل دسترسی اپراتورهای پذیرش، اسکنرهای QR و انتساب شعب</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-[#62686D]" />
                  <input
                    type="text"
                    placeholder="جستجو بر اساس نام یا شماره..."
                    value={staffSearchTerm}
                    onChange={e => setStaffSearchTerm(e.target.value)}
                    className="rounded-xl border border-[#272B30] bg-[#1D2125] py-1.5 pr-8 pl-3 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsAddStaffModalOpen(true)}
                  className="flex items-center gap-1.5 cursor-pointer font-bold"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>انتساب پرسنل جدید</span>
                </Button>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#202428] text-[#9CA3A8] font-bold">
                    <th className="py-3 px-3">نام و نام خانوادگی</th>
                    <th className="py-3 px-3">شماره تماس</th>
                    <th className="py-3 px-3">مجموعه ورزشی منتسب</th>
                    <th className="py-3 px-3">سطح دسترسی</th>
                    <th className="py-3 px-3">وضعیت حساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202428]">
                  {(() => {
                    const filtered = adminStaff.filter(s =>
                      !staffSearchTerm ||
                      s.fullName?.toLowerCase().includes(staffSearchTerm.toLowerCase()) ||
                      s.phone?.includes(staffSearchTerm) ||
                      s.assignedGymName?.toLowerCase().includes(staffSearchTerm.toLowerCase())
                    );
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-[#62686D]">
                            هیچ پرسنل پذیرشی یافت نشد.
                          </td>
                        </tr>
                      );
                    }
                    return filtered.map((s: any) => (
                      <tr key={s.id} className="hover:bg-[#1D2125]/50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#F4F5F2]">{s.fullName}</div>
                          <div className="text-[10px] text-[#62686D] font-mono">{s.id}</div>
                        </td>
                        <td className="py-3 px-3 font-mono dir-ltr text-[#9CA3A8]">
                          {s.phone}
                        </td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1D2125] border border-[#272B30] text-[#F4F5F2] font-semibold">
                            <Building2 className="w-3 h-3 text-[#C8F500]" />
                            {s.assignedGymName}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="tier-premium" size="sm">کانتر پذیرش</Badge>
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="success" size="sm">فعال</Badge>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* PLATFORM CLASSES OVERVIEW TAB */
        <div className="mt-8 space-y-8">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">کل کلاس‌های ورزشی فعال</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-cyan-400 border border-[#272B30]">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminClasses.length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">کلاس</span>
              </div>
              <span className="mt-2 block text-[11px] text-emerald-400 font-semibold">در سراسر سالن‌ها و باشگاه‌ها</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">کلاس‌های دارای بسته ماهانه</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-[#C8F500] border border-[#272B30]">
                  <CreditCard className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#C8F500] font-persian-digits">
                {toPersianDigits(adminClasses.filter(c => c.hasMonthlyPlan).length)}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">کلاس</span>
              </div>
              <span className="mt-2 block text-[11px] text-[#9CA3A8] font-semibold">پشتیبانی از مدل اشتراکی</span>
            </div>

            <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#9CA3A8]">مجموع سانس‌های تعریف‌شده</span>
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1D2125] text-violet-400 border border-[#272B30]">
                  <Calendar className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-black text-[#F4F5F2] font-persian-digits">
                {toPersianDigits(adminClasses.reduce((acc, c) => acc + (c.sessionCount || 0), 0))}{' '}
                <span className="text-xs font-normal text-[#9CA3A8] font-sans">سانس</span>
              </div>
              <span className="mt-2 block text-[11px] text-violet-400 font-semibold">سانس‌های هفتگی فعال</span>
            </div>
          </div>

          {/* Classes Table Card */}
          <div className="rounded-3xl border border-[#272B30] bg-[#15181B] p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#202428] pb-5">
              <div>
                <h2 className="text-lg font-black text-[#F4F5F2]">نظارت بر کلاس‌های ورزشی مربیان</h2>
                <p className="text-xs text-[#9CA3A8] mt-0.5">پایش نرخ تعرفه، محل برگزاری، مربیان مجری و وضعیت سانس‌ها</p>
              </div>

              <div className="relative">
                <Search className="absolute right-3 top-2.5 h-3.5 w-3.5 text-[#62686D]" />
                <input
                  type="text"
                  placeholder="جستجوی عنوان کلاس یا مربی..."
                  value={classesSearchTerm}
                  onChange={e => setClassesSearchTerm(e.target.value)}
                  className="rounded-xl border border-[#272B30] bg-[#1D2125] py-1.5 pr-8 pl-3 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#202428] text-[#9CA3A8] font-bold">
                    <th className="py-3 px-3">عنوان کلاس</th>
                    <th className="py-3 px-3">مربی برگزارکننده</th>
                    <th className="py-3 px-3">محل برگزاری</th>
                    <th className="py-3 px-3">تعرفه تک‌جلسه</th>
                    <th className="py-3 px-3">بسته ماهانه</th>
                    <th className="py-3 px-3">سانس‌ها</th>
                    <th className="py-3 px-3">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202428]">
                  {(() => {
                    const filtered = adminClasses.filter(c =>
                      !classesSearchTerm ||
                      c.title?.toLowerCase().includes(classesSearchTerm.toLowerCase()) ||
                      c.coachNameFa?.toLowerCase().includes(classesSearchTerm.toLowerCase()) ||
                      c.venueNameFa?.toLowerCase().includes(classesSearchTerm.toLowerCase())
                    );
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-[#62686D]">
                            هیچ کلاس ورزشی یافت نشد.
                          </td>
                        </tr>
                      );
                    }
                    return filtered.map((c: any) => (
                      <tr key={c.id} className="hover:bg-[#1D2125]/50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#F4F5F2]">{c.title}</div>
                          <div className="text-[10px] text-[#62686D]">{c.categorySlug}</div>
                        </td>
                        <td className="py-3 px-3 font-semibold text-[#F4F5F2]">
                          {c.coachNameFa}
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-[#F4F5F2]">{c.venueNameFa}</div>
                          <span className="text-[10px] text-[#9CA3A8]">
                            {c.venueType === 'GRAVITY_GYM' ? 'باشگاه گراویتی' : c.venueType === 'PARTNER_GYM' ? 'باشگاه همکار' : 'سالن مستقل'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-[#C8F500] font-persian-digits">
                          {formatMoney(c.singleSessionPriceTomans)}
                        </td>
                        <td className="py-3 px-3">
                          {c.hasMonthlyPlan ? (
                            <Badge variant="success" size="sm">دارد</Badge>
                          ) : (
                            <span className="text-[#62686D] text-[11px]">فقط تک‌جلسه</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold font-persian-digits">
                          {toPersianDigits(c.sessionCount || 0)} سانس
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant={c.isActive ? 'success' : 'default'} size="sm">
                            {c.isActive ? 'فعال' : 'غیرفعال'}
                          </Badge>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Verify Coach & Commission Rate */}
      {verifyingCoach && (
        <Modal
          isOpen={true}
          onClose={() => setVerifyingCoach(null)}
          title="بررسی مدارک و تعیین کارمزد مربی"
          description={`تنظیم وضعیت احراز هویت و درصد کارمزد پلتفرم برای ${verifyingCoach.displayName}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#1D2125] border border-[#272B30] p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">نام مربی:</span>
                <span className="font-bold text-[#F4F5F2]">{verifyingCoach.displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">شماره تماس:</span>
                <span className="font-mono text-[#F4F5F2]">{verifyingCoach.contactPhone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">شماره شبا:</span>
                <span className="font-mono text-[#C8F500] dir-ltr">{verifyingCoach.shebaNumber || 'ثبت نشده'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">نام صاحب حساب:</span>
                <span className="text-[#F4F5F2]">{verifyingCoach.bankAccountHolder || '-'}</span>
              </div>
              <div>
                <span className="text-[#9CA3A8] block mb-1">درباره و سوابق:</span>
                <p className="text-[#C4C8CC] leading-relaxed bg-[#15181B] p-2 rounded-xl">
                  {verifyingCoach.bio || 'توضیحاتی ثبت نشده است.'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#C4C8CC] mb-1.5">وضعیت تأیید مدارک</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'VERIFIED', label: 'تأییدشده' },
                  { id: 'PENDING', label: 'در انتظار' },
                  { id: 'REJECTED', label: 'رد درخواست' },
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setVerifyActionStatus(s.id)}
                    className={`rounded-xl py-2 text-xs font-bold transition cursor-pointer border ${
                      verifyActionStatus === s.id
                        ? 'bg-[#C8F500] text-[#0D0F11] border-[#C8F500]'
                        : 'bg-[#1D2125] text-[#9CA3A8] border-[#272B30]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#C4C8CC] mb-1">
                درصد کارمزد پلتفرم گراویتی (٪)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={verifyCommissionRate}
                onChange={e => setVerifyCommissionRate(Number(e.target.value))}
                className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-3 text-xs font-bold text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-persian-digits"
              />
              <p className="text-[11px] text-[#62686D] mt-1">
                به‌صورت پیش‌فرض ۱۵٪ است. درآمد حاصل از فروش تک‌جلسات و بسته‌های ماهانه بر این مبنا تسهیم می‌شود.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isVerifying}
                onClick={handleVerifyCoach}
              >
                {isVerifying ? 'در حال ذخیره...' : 'ثبت و اعمال تغییرات'}
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setVerifyingCoach(null)}
              >
                انصراف
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Generate Settlement Batch */}
      {generatingCoach && (
        <Modal
          isOpen={true}
          onClose={() => setGeneratingCoach(null)}
          title="تولید صورتحساب تسویه حساب دوره"
          description={`محاسبه و تجمیع کارکرد مربی ${generatingCoach.displayName}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#C4C8CC] mb-1">تاریخ شروع دوره</label>
                <input
                  type="date"
                  value={genCycleStart}
                  onChange={e => setGenCycleStart(e.target.value)}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#C4C8CC] mb-1">تاریخ پایان دوره</label>
                <input
                  type="date"
                  value={genCycleEnd}
                  onChange={e => setGenCycleEnd(e.target.value)}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-2xl bg-[#1D2125] border border-[#272B30] p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">مانده بستانکاری ثبت‌شده مربی:</span>
                <span className="font-bold text-[#C8F500] font-persian-digits">
                  {formatMoney(generatingCoach.payableBalanceTomans || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">نرخ کارمزد فعال:</span>
                <span className="font-bold text-[#F4F5F2] font-persian-digits">
                  {toPersianDigits(Math.round((generatingCoach.commissionRate || 0.15) * 100))}٪
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isGeneratingSettlement}
                onClick={handleGenerateSettlement}
              >
                {isGeneratingSettlement ? 'در حال تولید...' : 'تولید دسته تسویه دوره'}
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setGeneratingCoach(null)}
              >
                انصراف
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: Disburse Paya Batch */}
      {disbursingBatch && (
        <Modal
          isOpen={true}
          onClose={() => setDisbursingBatch(null)}
          title="تأیید و ثبت حواله پایا"
          description={`تسویه دسته به مبلغ ${formatMoney(disbursingBatch.total_net_payout_tomans ?? disbursingBatch.totalNetPayoutTomans ?? 0)}`}
          maxWidth="sm"
        >
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#1D2125] border border-[#272B30] p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">مبلغ خالص پرداختی:</span>
                <span className="font-bold text-[#C8F500] font-persian-digits">
                  {formatMoney(disbursingBatch.total_net_payout_tomans ?? disbursingBatch.totalNetPayoutTomans ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#9CA3A8]">شماره شبا مقصد:</span>
                <span className="font-mono text-[#F4F5F2] dir-ltr">{disbursingBatch.sheba_number || '-'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#C4C8CC] mb-1">
                شناسه پیگیری حواله پایا / مرجع بانکی
              </label>
              <input
                type="text"
                placeholder="مثال: PAYA-98234123"
                value={disbursePayaId}
                onChange={e => setDisbursePayaId(e.target.value)}
                className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-3 text-xs font-mono text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isDisbursing}
                onClick={handleDisburseSettlement}
              >
                {isDisbursing ? 'در حال ثبت...' : 'تأیید نهایی تسویه پایا'}
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setDisbursingBatch(null)}
              >
                انصراف
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* GYM MANAGEMENT MODAL 1: ADD NEW GYM                      */}
      {/* ======================================================== */}
      {isAddGymModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddGymModalOpen(false)}
          title="افزودن مجموعه ورزشی جدید به شبکه"
          description="ثبت مشخصات جغرافیایی، دسترسی، شماره شبا و حساب بانکی مجموعه ورزشی"
          maxWidth="lg"
        >
          <form onSubmit={handleCreateGym} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام مجموعه ورزشی *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: باشگاه بدنسازی رویال"
                  value={newGymForm.nameFa}
                  onChange={e => setNewGymForm({ ...newGymForm, nameFa: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">سطح مجموعه (Tier) *</label>
                <select
                  value={newGymForm.tier}
                  onChange={e => setNewGymForm({ ...newGymForm, tier: e.target.value as GymTier })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none cursor-pointer"
                >
                  <option value={GymTier.BASIC}>پایه (BASIC)</option>
                  <option value={GymTier.PLUS}>پلاس (PLUS)</option>
                  <option value={GymTier.PREMIUM}>پریمیوم (PREMIUM)</option>
                  <option value={GymTier.ELITE}>الیت (ELITE)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">حالت دسترسی جنسیتی *</label>
                <select
                  value={newGymForm.accessMode}
                  onChange={e => setNewGymForm({ ...newGymForm, accessMode: e.target.value as GymAccessMode })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none cursor-pointer"
                >
                  <option value={GymAccessMode.MIXED}>مختلط (شیفت‌های مجزا)</option>
                  <option value={GymAccessMode.MALE_ONLY}>ویژه آقایان</option>
                  <option value={GymAccessMode.FEMALE_ONLY}>ویژه بانوان</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شماره تماس مجموعه</label>
                <input
                  type="text"
                  placeholder="02188888888"
                  value={newGymForm.phone}
                  dir="ltr"
                  onChange={e => setNewGymForm({ ...newGymForm, phone: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شهر *</label>
                <input
                  type="text"
                  required
                  placeholder="تهران"
                  value={newGymForm.city}
                  onChange={e => setNewGymForm({ ...newGymForm, city: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">منطقه / محله *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: سعادت‌آباد"
                  value={newGymForm.district}
                  onChange={e => setNewGymForm({ ...newGymForm, district: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#C4C8CC] mb-1">آدرس دقیق *</label>
                <input
                  type="text"
                  required
                  placeholder="خیابان، کوچه، پلاک، طبقه"
                  value={newGymForm.addressFa}
                  onChange={e => setNewGymForm({ ...newGymForm, addressFa: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">عرض جغرافیایی (Latitude)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newGymForm.latitude}
                  dir="ltr"
                  onChange={e => setNewGymForm({ ...newGymForm, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">طول جغرافیایی (Longitude)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={newGymForm.longitude}
                  dir="ltr"
                  onChange={e => setNewGymForm({ ...newGymForm, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شعاع ژئوفنس ورود (متر)</label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  value={newGymForm.geofenceRadiusMeters}
                  onChange={e => setNewGymForm({ ...newGymForm, geofenceRadiusMeters: parseInt(e.target.value, 10) || 150 })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام صاحب حساب بانکی *</label>
                <input
                  type="text"
                  required
                  placeholder="نام و نام خانوادگی صاحب حساب"
                  value={newGymForm.bankAccountHolder}
                  onChange={e => setNewGymForm({ ...newGymForm, bankAccountHolder: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#C4C8CC] mb-1">شماره شبا (IR + ۲۴ رقم) *</label>
                <input
                  type="text"
                  required
                  placeholder="IR123456789012345678901234"
                  value={newGymForm.shebaNumber}
                  dir="ltr"
                  onChange={e => setNewGymForm({ ...newGymForm, shebaNumber: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#C8F500] font-mono focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#C4C8CC] mb-1">توضیحات و امکانات مجموعه</label>
                <textarea
                  rows={2}
                  placeholder="امکانات، پارکینگ، سونا و جکوزی، خدمات بوفه..."
                  value={newGymForm.descriptionFa}
                  onChange={e => setNewGymForm({ ...newGymForm, descriptionFa: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[#202428]">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isCreatingGym}
                className="flex-1 cursor-pointer"
              >
                {isCreatingGym ? 'در حال ثبت مجموعه...' : 'افزودن و اتصال فوری به شبکه'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setIsAddGymModalOpen(false)}
                className="cursor-pointer"
              >
                انصراف
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* GYM MANAGEMENT MODAL 2: EDIT EXISTING GYM                */}
      {/* ======================================================== */}
      {editingGym && (
        <Modal
          isOpen={true}
          onClose={() => setEditingGym(null)}
          title={`ویرایش مجموعه ورزشی «${editingGym.nameFa}»`}
          description="بروزرسانی مشخصات مکانی، اداری، بانکی و وضعیت فعال‌سازی"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveEditGym} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام مجموعه ورزشی *</label>
                <input
                  type="text"
                  required
                  value={editGymForm.nameFa || ''}
                  onChange={e => setEditGymForm({ ...editGymForm, nameFa: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">سطح مجموعه (Tier) *</label>
                <select
                  value={editGymForm.tier}
                  onChange={e => setEditGymForm({ ...editGymForm, tier: e.target.value as GymTier })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none cursor-pointer"
                >
                  <option value={GymTier.BASIC}>پایه (BASIC)</option>
                  <option value={GymTier.PLUS}>پلاس (PLUS)</option>
                  <option value={GymTier.PREMIUM}>پریمیوم (PREMIUM)</option>
                  <option value={GymTier.ELITE}>الیت (ELITE)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">حالت دسترسی جنسیتی *</label>
                <select
                  value={editGymForm.accessMode}
                  onChange={e => setEditGymForm({ ...editGymForm, accessMode: e.target.value as GymAccessMode })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none cursor-pointer"
                >
                  <option value={GymAccessMode.MIXED}>مختلط (شیفت‌های مجزا)</option>
                  <option value={GymAccessMode.MALE_ONLY}>ویژه آقایان</option>
                  <option value={GymAccessMode.FEMALE_ONLY}>ویژه بانوان</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شماره تماس مجموعه</label>
                <input
                  type="text"
                  value={editGymForm.phone || ''}
                  dir="ltr"
                  onChange={e => setEditGymForm({ ...editGymForm, phone: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شهر *</label>
                <input
                  type="text"
                  required
                  value={editGymForm.city || ''}
                  onChange={e => setEditGymForm({ ...editGymForm, city: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">منطقه / محله *</label>
                <input
                  type="text"
                  required
                  value={editGymForm.district || ''}
                  onChange={e => setEditGymForm({ ...editGymForm, district: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#C4C8CC] mb-1">آدرس دقیق *</label>
                <input
                  type="text"
                  required
                  value={editGymForm.addressFa || ''}
                  onChange={e => setEditGymForm({ ...editGymForm, addressFa: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">عرض جغرافیایی (Latitude)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editGymForm.latitude}
                  dir="ltr"
                  onChange={e => setEditGymForm({ ...editGymForm, latitude: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">طول جغرافیایی (Longitude)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={editGymForm.longitude}
                  dir="ltr"
                  onChange={e => setEditGymForm({ ...editGymForm, longitude: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شعاع ژئوفنس (متر)</label>
                <input
                  type="number"
                  min="50"
                  max="2000"
                  value={editGymForm.geofenceRadiusMeters}
                  onChange={e => setEditGymForm({ ...editGymForm, geofenceRadiusMeters: parseInt(e.target.value, 10) || 150 })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام صاحب حساب بانکی *</label>
                <input
                  type="text"
                  required
                  value={editGymForm.bankAccountHolder || ''}
                  onChange={e => setEditGymForm({ ...editGymForm, bankAccountHolder: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#C4C8CC] mb-1">شماره شبا (IR + ۲۴ رقم) *</label>
                <input
                  type="text"
                  required
                  value={editGymForm.shebaNumber || ''}
                  dir="ltr"
                  onChange={e => setEditGymForm({ ...editGymForm, shebaNumber: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#C8F500] font-mono focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-bold text-[#C4C8CC] mb-1">توضیحات و امکانات مجموعه</label>
                <textarea
                  rows={2}
                  value={editGymForm.descriptionFa || ''}
                  onChange={e => setEditGymForm({ ...editGymForm, descriptionFa: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-edit-active"
                  checked={editGymForm.isActive ?? true}
                  onChange={e => setEditGymForm({ ...editGymForm, isActive: e.target.checked })}
                  className="rounded border-[#272B30] bg-[#15181B] text-[#C8F500] focus:ring-[#C8F500]"
                />
                <label htmlFor="chk-edit-active" className="text-xs font-bold text-[#F4F5F2] cursor-pointer">
                  مجموعه در وضعیت «فعال» جهت پذیرش اعضا و صدور بارکد QR قرار دارد
                </label>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-3 border-t border-[#202428]">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSavingEdit}
                className="flex-1 cursor-pointer"
              >
                {isSavingEdit ? 'در حال ذخیره...' : 'ذخیره تغییرات و پایداری در دیتابیس'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setEditingGym(null)}
                className="cursor-pointer"
              >
                انصراف
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* GYM MANAGEMENT MODAL 3: OPERATIONAL DOSSIER DETAIL       */}
      {/* ======================================================== */}
      {(inspectingGymDetail || (inspectingGymId && isLoadingDetail)) && (
        <Modal
          isOpen={true}
          onClose={() => {
            setInspectingGymId(null);
            setInspectingGymDetail(null);
          }}
          title="پرونده جامع عملیاتی و اطلاعات مجموعه ورزشی"
          description={
            inspectingGymDetail
              ? `${inspectingGymDetail.gym.nameFa} | شناسه: ${inspectingGymDetail.gym.id}`
              : 'در حال بارگذاری پرونده...'
          }
          maxWidth="xl"
        >
          {isLoadingDetail ? (
            <div className="py-12 text-center text-xs text-[#9CA3A8] space-y-2">
              <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#C8F500]" />
              <p>در حال فراخوانی داده‌های آماری، سوابق تردد و تنظیمات تعرفه...</p>
            </div>
          ) : inspectingGymDetail ? (
            <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
              {/* Top 4 KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 space-y-1">
                  <span className="text-[#9CA3A8] block text-[11px]">سطح و دسترسی</span>
                  <div className="font-bold text-[#F4F5F2]">{inspectingGymDetail.gym.nameFa}</div>
                  <div className="flex gap-1 pt-1">
                    <span className="rounded-lg bg-[#15181B] px-2 py-0.5 text-[10px] text-cyan-300 font-bold">
                      {TIER_LABELS[inspectingGymDetail.gym.tier]?.label || inspectingGymDetail.gym.tier}
                    </span>
                    <span className="rounded-lg bg-[#15181B] px-2 py-0.5 text-[10px] text-amber-300 font-bold">
                      {ACCESS_MODE_LABELS[inspectingGymDetail.gym.accessMode]?.label || inspectingGymDetail.gym.accessMode}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 space-y-1">
                  <span className="text-[#9CA3A8] block text-[11px]">تردد و پذیرش کل</span>
                  <div className="text-lg font-black text-[#C8F500] font-persian-digits">
                    {toPersianDigits(inspectingGymDetail.totalCheckins)} <span className="text-xs font-normal text-[#9CA3A8]">جلسه</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 block">
                    امروز: {toPersianDigits(inspectingGymDetail.activeCheckinsToday)} ورود موفق
                  </span>
                </div>

                <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 space-y-1">
                  <span className="text-[#9CA3A8] block text-[11px]">موقعیت مکانی</span>
                  <div className="font-bold text-[#F4F5F2] truncate">
                    {inspectingGymDetail.gym.city}، {inspectingGymDetail.gym.district}
                  </div>
                  <span className="text-[10px] text-[#9CA3A8] block font-persian-digits">
                    ژئوفنس: {toPersianDigits(inspectingGymDetail.gym.geofenceRadiusMeters)} متر
                  </span>
                </div>

                <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-3 space-y-1">
                  <span className="text-[#9CA3A8] block text-[11px]">وضعیت شبا و تسویه</span>
                  <div className="font-mono text-[#F4F5F2] text-[11px] truncate dir-ltr">
                    {inspectingGymDetail.gym.shebaNumber || '-'}
                  </div>
                  <span className="text-[10px] text-[#9CA3A8] block truncate">
                    صاحب حساب: {inspectingGymDetail.gym.bankAccountHolder}
                  </span>
                </div>
              </div>

              {/* Financial Invariant Notice */}
              <div
                className={`rounded-2xl p-4 text-xs font-medium border ${
                  inspectingGymDetail.hasFinancialHistory
                    ? 'border-cyan-800/80 bg-cyan-950/40 text-cyan-200'
                    : 'border-emerald-800/80 bg-emerald-950/40 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    {inspectingGymDetail.hasFinancialHistory
                      ? 'وضعیت اسناد و یکپارچگی مالی: دارای سوابق ثبت‌شده در دفاتر پلتفرم'
                      : 'وضعیت اسناد و یکپارچگی مالی: بدون سابقه تردد و مالی'}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {inspectingGymDetail.hasFinancialHistory
                    ? 'جهت رعایت اصول حسابداری و جلوگیری از خطا در تراز مالی، این مجموعه دارای سوابق تردد یا اسناد بستانکاری است و قابلیت حذف فیزیکی ندارد. در صورت قطع همکاری، از گزینه خروج از شبکه برای بایگانی امن استفاده فرمایید.'
                    : 'این مجموعه تازه تاسیس بوده و فاقد هرگونه تراکنش است؛ لذا در صورت لزوم امکان حذف کامل آن از پایگاه داده وجود دارد.'}
                </p>
              </div>

              {/* Assigned Staff */}
              <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-4 space-y-3">
                <h4 className="text-xs font-bold text-[#F4F5F2] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-[#C8F500]" />
                    <span>پرسنل و مسئولین پذیرش متصل به این مجموعه</span>
                  </span>
                  <span className="text-[11px] text-[#9CA3A8] font-persian-digits">
                    {toPersianDigits(inspectingGymDetail.assignedStaff.length)} نفر
                  </span>
                </h4>

                {inspectingGymDetail.assignedStaff.length === 0 ? (
                  <p className="text-xs text-[#62686D] py-3 text-center border border-dashed border-[#272B30] rounded-xl">
                    هیچ پرسنل پذیرشی در سیستم به این مجموعه تخصیص نیافته است.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {inspectingGymDetail.assignedStaff.map(staff => (
                      <div
                        key={staff.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[#272B30] bg-[#15181B] text-xs"
                      >
                        <div>
                          <div className="font-bold text-[#F4F5F2]">
                            {staff.firstName} {staff.lastName}
                          </div>
                          <div className="font-mono text-[11px] text-[#9CA3A8] dir-ltr">{staff.phoneNumber}</div>
                        </div>
                        <span className="rounded-lg bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 text-[10px] text-emerald-300 font-bold">
                          {staff.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Weekly Sans Shifts */}
              <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-4 space-y-3">
                <h4 className="text-xs font-bold text-[#F4F5F2] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-[#C8F500]" />
                    <span>برنامه سانس‌های کاری هفتگی</span>
                  </span>
                  <span className="text-[11px] text-[#9CA3A8] font-persian-digits">
                    {toPersianDigits(inspectingGymDetail.sans.length)} سانس
                  </span>
                </h4>

                {inspectingGymDetail.sans.length === 0 ? (
                  <p className="text-xs text-[#62686D] py-3 text-center border border-dashed border-[#272B30] rounded-xl">
                    هنوز سانسی برای این مجموعه ثبت نشده است.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {inspectingGymDetail.sans.map(s => (
                      <div
                        key={s.id}
                        className="p-2.5 rounded-xl border border-[#272B30] bg-[#15181B] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#F4F5F2]">{DAY_NAMES[s.dayOfWeek]}</span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                              s.gender === Gender.FEMALE
                                ? 'bg-rose-950/60 text-rose-300'
                                : 'bg-cyan-950/60 text-cyan-300'
                            }`}
                          >
                            {s.gender === Gender.FEMALE ? 'بانوان' : 'آقایان'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#9CA3A8]">
                          <span className="font-persian-digits">
                            {s.startTime?.slice(0, 5)} تا {s.endTime?.slice(0, 5)}
                          </span>
                          {s.isPeak && <span className="text-amber-400 font-bold">اوج</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hosted Classes */}
              <div className="rounded-2xl border border-[#272B30] bg-[#1D2125] p-4 space-y-3">
                <h4 className="text-xs font-bold text-[#F4F5F2] flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-[#C8F500]" />
                    <span>کلاس‌های مربیان میزبانی‌شده در این مجموعه</span>
                  </span>
                  <span className="text-[11px] text-[#9CA3A8] font-persian-digits">
                    {toPersianDigits(inspectingGymDetail.hostedClasses.length)} کلاس
                  </span>
                </h4>

                {inspectingGymDetail.hostedClasses.length === 0 ? (
                  <p className="text-xs text-[#62686D] py-3 text-center border border-dashed border-[#272B30] rounded-xl">
                    هیچ کلاس مربی مستقلی در این مجموعه تعریف نشده است.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {inspectingGymDetail.hostedClasses.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[#272B30] bg-[#15181B] text-xs"
                      >
                        <div>
                          <div className="font-bold text-[#F4F5F2]">{c.titleFa}</div>
                          <div className="text-[11px] text-[#9CA3A8]">
                            مربی: {c.coachName} | زمان‌بندی: {c.scheduleFa}
                          </div>
                        </div>
                        <div className="text-left font-persian-digits">
                          <span className="text-xs font-bold text-[#C8F500]">
                            {formatMoney(c.pricePerSessionToman)}
                          </span>
                          <span className="block text-[10px] text-[#9CA3A8]">تک‌جلسه</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Modal>
      )}

      {/* ======================================================== */}
      {/* GYM MANAGEMENT MODAL 4: SAFE REMOVAL CONFIRMATION        */}
      {/* ======================================================== */}
      {removingGym && (
        <Modal
          isOpen={true}
          onClose={() => setRemovingGym(null)}
          title="خروج مجموعه از شبکه و تعیین وضعیت"
          description={`بررسی شرایط خروج مجموعه «${removingGym.nameFa}» از شبکه پلتفرم گراویتی`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-2xl border border-amber-800/60 bg-amber-950/40 p-4 space-y-2 text-amber-200">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>قانون حفاظت از یکپارچگی دفاتر مالی و تردد</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                سیستم به‌صورت خودکار سوابق تردد، تراکنش‌ها و اسناد تسویه این مجموعه را بررسی می‌کند:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 pr-1">
                <li>در صورت وجود هرگونه سابقه تاریخی، برای محافظت از اسناد حسابداری، مجموعه به وضعیت <b>غیرفعال / بایگانی‌شده</b> منتقل گردیده و پذیرش آن مسدود می‌شود اما اطلاعات تاریخی حفظ می‌گردد.</li>
                <li>در صورت عدم وجود هرگونه سابقه مالی یا تردد، مجموعه به‌طور کامل به همراه سانس‌ها از دیتابیس حذف خواهد شد.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-[#272B30] bg-[#1D2125] p-3 text-xs space-y-1">
              <div className="text-[#9CA3A8]">نام مجموعه انتخابی:</div>
              <div className="font-bold text-[#F4F5F2]">{removingGym.nameFa}</div>
              <div className="text-[11px] text-[#9CA3A8]">
                موقعیت: شهر {removingGym.city}، {removingGym.district}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="primary"
                size="md"
                disabled={isRemovingGym}
                onClick={handleConfirmRemove}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              >
                {isRemovingGym ? 'در حال اعمال...' : 'تأیید خروج از شبکه'}
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setRemovingGym(null)}
                className="cursor-pointer"
              >
                انصراف
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {/* ======================================================== */}
      {/* GYM MANAGEMENT MODAL 5: ASSIGN / CREATE STAFF             */}
      {/* ======================================================== */}
      {isAddStaffModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddStaffModalOpen(false)}
          title="انتساب پرسنل جدید به مجموعه ورزشی"
          description="ایجاد یا تخصیص دسترسی متصدی پذیرش برای اسکن کد QR اعضا"
          maxWidth="md"
        >
          <form onSubmit={handleAssignStaff} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[#C4C8CC] mb-1">شماره تماس پرسنل (الزامی) *</label>
              <input
                type="text"
                required
                placeholder="0912..."
                value={staffForm.phone}
                dir="ltr"
                onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })}
                className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام *</label>
                <input
                  type="text"
                  required
                  value={staffForm.firstName}
                  onChange={e => setStaffForm({ ...staffForm, firstName: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام خانوادگی *</label>
                <input
                  type="text"
                  required
                  value={staffForm.lastName}
                  onChange={e => setStaffForm({ ...staffForm, lastName: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block font-bold text-[#C4C8CC] mb-1">مجموعه ورزشی محل خدمت *</label>
              <select
                value={staffForm.assignedGymId}
                onChange={e => setStaffForm({ ...staffForm, assignedGymId: e.target.value })}
                className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
              >
                {adminGyms.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.nameFa} ({g.city} - {g.district})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSavingStaff}
                className="flex-1 cursor-pointer font-bold"
              >
                {isSavingStaff ? 'در حال ثبت...' : 'ثبت و انتساب پرسنل'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setIsAddStaffModalOpen(false)}
                className="cursor-pointer"
              >
                انصراف
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* DIRECT COACH PROVISIONING MODAL                           */}
      {/* ======================================================== */}
      {isAddCoachModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddCoachModalOpen(false)}
          title="ثبت مستقیم و تأیید مربی جدید"
          description="ایجاد حساب مربیگری و فعال‌سازی فوری بدون نیاز به ثبت‌نام توسط مربی"
          maxWidth="lg"
        >
          <form onSubmit={handleAdminCreateCoach} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شماره تماس مربی *</label>
                <input
                  type="text"
                  required
                  placeholder="0912..."
                  dir="ltr"
                  value={newCoachForm.phone}
                  onChange={e => setNewCoachForm({ ...newCoachForm, phone: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام کامل هویتی *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: آرش توانگر"
                  value={newCoachForm.fullName}
                  onChange={e => setNewCoachForm({ ...newCoachForm, fullName: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام نمایشی در پلتفرم *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: استاد توانگر"
                  value={newCoachForm.displayName}
                  onChange={e => setNewCoachForm({ ...newCoachForm, displayName: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نرخ کارمزد گراویتی (درصد) *</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  required
                  value={newCoachForm.commissionRate}
                  onChange={e => setNewCoachForm({ ...newCoachForm, commissionRate: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">رشته‌های تخصصی (با ویرگول جدا شود)</label>
                <input
                  type="text"
                  value={newCoachForm.sports}
                  onChange={e => setNewCoachForm({ ...newCoachForm, sports: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">سال‌های سابقه مربیگری</label>
                <input
                  type="number"
                  min="1"
                  value={newCoachForm.experienceYears}
                  onChange={e => setNewCoachForm({ ...newCoachForm, experienceYears: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">شماره شبا (IR...)</label>
                <input
                  type="text"
                  placeholder="IR..."
                  dir="ltr"
                  value={newCoachForm.shebaNumber}
                  onChange={e => setNewCoachForm({ ...newCoachForm, shebaNumber: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-[#C4C8CC] mb-1">نام صاحب حساب بانکی</label>
                <input
                  type="text"
                  value={newCoachForm.bankAccountHolder}
                  onChange={e => setNewCoachForm({ ...newCoachForm, bankAccountHolder: e.target.value })}
                  className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#C4C8CC] mb-1">بیوگرافی و مدارک</label>
              <textarea
                rows={2}
                value={newCoachForm.bio}
                onChange={e => setNewCoachForm({ ...newCoachForm, bio: e.target.value })}
                className="w-full rounded-xl border border-[#272B30] bg-[#1D2125] p-2.5 text-xs text-[#F4F5F2] focus:border-[#C8F500] focus:outline-none resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isCreatingCoach}
                className="flex-1 cursor-pointer font-bold"
              >
                {isCreatingCoach ? 'در حال ثبت...' : 'ثبت و فعال‌سازی مربی'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setIsAddCoachModalOpen(false)}
                className="cursor-pointer"
              >
                انصراف
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
