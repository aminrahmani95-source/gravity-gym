import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
  CoachProfile,
  CoachVerificationStatus,
  CoachPayableEntryType,
  CreateCoachProfileDto,
  UpdateCoachProfileDto,
  CreateAdminCoachDto,
  UserRole,
} from '@gym-app/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class CoachesService {
  private readonly logger = new Logger(CoachesService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves all coaches, optionally filtered by verification status and active state.
   */
  async getAll(status?: CoachVerificationStatus, onlyActive = true): Promise<CoachProfile[]> {
    if (this.db.isInMemory) {
      let list = [...this.db.getTable('coaches')];
      if (onlyActive) {
        list = list.filter(c => c.is_active);
      }
      if (status) {
        list = list.filter(c => c.verification_status === status);
      }
      return list.map(this.mapCoach);
    }

    let query = 'SELECT * FROM coaches WHERE 1=1';
    const params: any[] = [];
    if (onlyActive) {
      params.push(true);
      query += ` AND is_active = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND verification_status = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC';

    const res = await this.db.query(query, params);
    return res.rows.map(this.mapCoach);
  }

  /**
   * Retrieves a coach by their unique coach ID.
   */
  async getById(id: string): Promise<CoachProfile> {
    if (this.db.isInMemory) {
      const coach = this.db.getTable('coaches').find(c => c.id === id);
      if (!coach) throw new NotFoundException('مربی مورد نظر یافت نشد.');
      return this.mapCoach(coach);
    }

    const res = await this.db.query('SELECT * FROM coaches WHERE id = $1', [id]);
    if (!res.rows[0]) throw new NotFoundException('مربی مورد نظر یافت نشد.');
    return this.mapCoach(res.rows[0]);
  }

  /**
   * Retrieves a coach profile by the linked User ID.
   */
  async getByUserId(userId: string): Promise<CoachProfile | null> {
    if (this.db.isInMemory) {
      const coach = this.db.getTable('coaches').find(c => c.user_id === userId);
      return coach ? this.mapCoach(coach) : null;
    }

    const res = await this.db.query('SELECT * FROM coaches WHERE user_id = $1', [userId]);
    return res.rows[0] ? this.mapCoach(res.rows[0]) : null;
  }

  /**
   * Public/Member: Submits a coach application.
   * Creates a PENDING profile. Does NOT promote user role until approved by Admin.
   */
  async applyForCoach(userId: string, dto: CreateCoachProfileDto): Promise<CoachProfile> {
    return this.db.withTransaction(async (client) => {
      // 1. Verify user exists
      let user: any = null;
      if (this.db.isInMemory) {
        user = this.db.getTable('users').find(u => u.id === userId);
      } else {
        const userRes = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
        user = userRes.rows[0];
      }
      if (!user) throw new NotFoundException('کاربر مورد نظر یافت نشد.');

      // 2. Check for existing coach record
      let existing: any = null;
      if (this.db.isInMemory) {
        existing = this.db.getTable('coaches').find(c => c.user_id === userId);
      } else {
        const coachRes = await client.query('SELECT * FROM coaches WHERE user_id = $1', [userId]);
        existing = coachRes.rows[0];
      }

      if (existing) {
        if (existing.verification_status === CoachVerificationStatus.VERIFIED) {
          return this.mapCoach(existing);
        }
        if (existing.verification_status === CoachVerificationStatus.PENDING) {
          return this.mapCoach(existing);
        }
        if (existing.verification_status === CoachVerificationStatus.SUSPENDED) {
          throw new ForbiddenException('حساب مربیگری شما در وضعیت تعلیق قرار دارد. لطفاً با پشتیبانی تماس حاصل فرمایید.');
        }
        if (existing.verification_status === CoachVerificationStatus.REJECTED) {
          throw new BadRequestException('درخواست پیشین شما برای مربیگری رد شده است. جهت بررسی مجدد مدارک با پشتیبانی هماهنگ فرمایید.');
        }
      }

      // 3. Create new PENDING coach application (User role remains USER until Admin approves)
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newCoach = {
        id: newId,
        user_id: userId,
        display_name: dto.displayName,
        bio: dto.bio || null,
        avatar_url: null,
        specialties: dto.specialties || [],
        sports: dto.sports || [],
        experience_years: dto.experienceYears || 1,
        verification_status: CoachVerificationStatus.PENDING,
        is_active: false, // inactive until verified by admin
        sheba_number: dto.shebaNumber || null,
        bank_account_holder: dto.bankAccountHolder || null,
        contact_phone: dto.contactPhone || null,
        commission_rate: 0.15,
        payable_balance_tomans: 0,
        created_at: now,
        updated_at: now,
      };

      if (this.db.isInMemory) {
        this.db.getTable('coaches').push(newCoach);
        return this.mapCoach(newCoach);
      }

      const insertRes = await client.query(
        `INSERT INTO coaches 
         (id, user_id, display_name, bio, avatar_url, specialties, sports, experience_years, verification_status, is_active, sheba_number, bank_account_holder, contact_phone, commission_rate, payable_balance_tomans, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()) RETURNING *`,
        [
          newId,
          userId,
          newCoach.display_name,
          newCoach.bio,
          newCoach.avatar_url,
          JSON.stringify(newCoach.specialties),
          JSON.stringify(newCoach.sports),
          newCoach.experience_years,
          newCoach.verification_status,
          newCoach.is_active,
          newCoach.sheba_number,
          newCoach.bank_account_holder,
          newCoach.contact_phone,
          newCoach.commission_rate,
          newCoach.payable_balance_tomans,
        ],
      );
      return this.mapCoach(insertRes.rows[0]);
    });
  }

  /**
   * Verified Coach: Updates their own profile.
   */
  async updateProfile(userId: string, dto: UpdateCoachProfileDto): Promise<CoachProfile> {
    return this.db.withTransaction(async (client) => {
      let existing: any = null;
      if (this.db.isInMemory) {
        existing = this.db.getTable('coaches').find(c => c.user_id === userId);
      } else {
        const coachRes = await client.query('SELECT * FROM coaches WHERE user_id = $1', [userId]);
        existing = coachRes.rows[0];
      }

      if (!existing) {
        throw new NotFoundException('پروفایل مربیگری یافت نشد.');
      }
      if (existing.verification_status !== CoachVerificationStatus.VERIFIED) {
        throw new ForbiddenException('ویرایش اطلاعات مربیگری صرفاً پس از تأیید حساب توسط مدیریت امکان‌پذیر است.');
      }

      const now = new Date().toISOString();
      const updated = {
        ...existing,
        display_name: dto.displayName ?? existing.display_name,
        bio: dto.bio !== undefined ? dto.bio : existing.bio,
        avatar_url: dto.avatarUrl ?? existing.avatar_url,
        specialties: dto.specialties ? (typeof dto.specialties === 'string' ? JSON.parse(dto.specialties) : dto.specialties) : existing.specialties,
        sports: dto.sports ? (typeof dto.sports === 'string' ? JSON.parse(dto.sports) : dto.sports) : existing.sports,
        experience_years: dto.experienceYears !== undefined ? dto.experienceYears : existing.experience_years,
        sheba_number: dto.shebaNumber !== undefined ? dto.shebaNumber : existing.sheba_number,
        bank_account_holder: dto.bankAccountHolder !== undefined ? dto.bankAccountHolder : existing.bank_account_holder,
        contact_phone: dto.contactPhone !== undefined ? dto.contactPhone : existing.contact_phone,
        updated_at: now,
      };

      if (this.db.isInMemory) {
        const idx = this.db.getTable('coaches').findIndex(c => c.id === existing.id);
        this.db.getTable('coaches')[idx] = updated;
        return this.mapCoach(updated);
      }

      const updateRes = await client.query(
        `UPDATE coaches 
         SET display_name = $1, bio = $2, avatar_url = $3, specialties = $4, sports = $5,
             experience_years = $6, sheba_number = $7, bank_account_holder = $8, contact_phone = $9, updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [
          updated.display_name,
          updated.bio,
          updated.avatar_url,
          JSON.stringify(updated.specialties),
          JSON.stringify(updated.sports),
          updated.experience_years,
          updated.sheba_number,
          updated.bank_account_holder,
          updated.contact_phone,
          existing.id,
        ],
      );
      return this.mapCoach(updateRes.rows[0]);
    });
  }

  /**
   * Backward-compatible delegation: Creates application if none exists, or updates if verified.
   */
  async createOrUpdateProfile(userId: string, dto: CreateCoachProfileDto | UpdateCoachProfileDto): Promise<CoachProfile> {
    const existing = await this.getByUserId(userId);
    if (!existing) {
      return this.applyForCoach(userId, dto as CreateCoachProfileDto);
    }
    if (existing.verificationStatus === CoachVerificationStatus.VERIFIED) {
      return this.updateProfile(userId, dto as UpdateCoachProfileDto);
    }
    return existing;
  }

  /**
   * Admin / Super Admin directly provisions an approved Coach.
   */
  async createCoachByAdmin(adminId: string, dto: CreateAdminCoachDto): Promise<CoachProfile> {
    return this.db.withTransaction(async (client) => {
      // Find or create linked user
      let user: any = null;
      if (this.db.isInMemory) {
        user = this.db.getTable('users').find(u => u.phone_number === dto.phoneNumber);
        if (!user) {
          const newUserId = crypto.randomUUID();
          user = {
            id: newUserId,
            phone_number: dto.phoneNumber,
            first_name: dto.firstName || dto.displayName,
            last_name: dto.lastName || 'مربی',
            role: UserRole.COACH,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
          };
          this.db.getTable('users').push(user);
        } else {
          user.role = UserRole.COACH;
        }
      } else {
        const userRes = await client.query('SELECT * FROM users WHERE phone_number = $1', [dto.phoneNumber]);
        if (!userRes.rows[0]) {
          const newUserId = crypto.randomUUID();
          const insUser = await client.query(
            'INSERT INTO users (id, phone_number, first_name, last_name, role, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [newUserId, dto.phoneNumber, dto.firstName || dto.displayName, dto.lastName || 'مربی', UserRole.COACH, 'ACTIVE'],
          );
          user = insUser.rows[0];
        } else {
          user = userRes.rows[0];
          await client.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [UserRole.COACH, user.id]);
        }
      }

      // Check existing coach profile
      let coachRow: any = null;
      const now = new Date().toISOString();
      const newId = crypto.randomUUID();
      const commissionRate = dto.commissionRate !== undefined ? dto.commissionRate : 0.15;

      if (this.db.isInMemory) {
        coachRow = this.db.getTable('coaches').find(c => c.user_id === user.id);
        if (coachRow) {
          coachRow.display_name = dto.displayName;
          coachRow.verification_status = CoachVerificationStatus.VERIFIED;
          coachRow.is_active = true;
          coachRow.commission_rate = commissionRate;
          coachRow.updated_at = now;
        } else {
          coachRow = {
            id: newId,
            user_id: user.id,
            display_name: dto.displayName,
            bio: dto.bio || null,
            avatar_url: null,
            specialties: dto.specialties || [],
            sports: dto.sports || [],
            experience_years: dto.experienceYears || 5,
            verification_status: CoachVerificationStatus.VERIFIED,
            is_active: true,
            sheba_number: dto.shebaNumber || null,
            bank_account_holder: dto.bankAccountHolder || null,
            contact_phone: dto.contactPhone || dto.phoneNumber,
            commission_rate: commissionRate,
            payable_balance_tomans: 0,
            created_at: now,
            updated_at: now,
          };
          this.db.getTable('coaches').push(coachRow);
        }

        this.db.getTable('audit_logs').push({
          id: crypto.randomUUID(),
          user_id: adminId,
          action: 'ADMIN_CREATE_COACH',
          resource_type: 'coach',
          resource_id: coachRow.id,
          details: { displayName: dto.displayName, phone: dto.phoneNumber },
          created_at: now,
        });

        return this.mapCoach(coachRow);
      }

      const existingCoach = await client.query('SELECT * FROM coaches WHERE user_id = $1', [user.id]);
      if (existingCoach.rows[0]) {
        const updRes = await client.query(
          `UPDATE coaches 
           SET display_name = $1, verification_status = $2, is_active = true, commission_rate = $3, updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [dto.displayName, CoachVerificationStatus.VERIFIED, commissionRate, existingCoach.rows[0].id],
        );
        coachRow = updRes.rows[0];
      } else {
        const insRes = await client.query(
          `INSERT INTO coaches 
           (id, user_id, display_name, bio, avatar_url, specialties, sports, experience_years, verification_status, is_active, sheba_number, bank_account_holder, contact_phone, commission_rate, payable_balance_tomans, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, 0, NOW(), NOW()) RETURNING *`,
          [
            newId,
            user.id,
            dto.displayName,
            dto.bio || null,
            null,
            JSON.stringify(dto.specialties || []),
            JSON.stringify(dto.sports || []),
            dto.experienceYears || 5,
            CoachVerificationStatus.VERIFIED,
            dto.shebaNumber || null,
            dto.bankAccountHolder || null,
            dto.contactPhone || dto.phoneNumber,
            commissionRate,
          ],
        );
        coachRow = insRes.rows[0];
      }

      await client.query(
        'INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [
          crypto.randomUUID(),
          adminId,
          'ADMIN_CREATE_COACH',
          'coach',
          coachRow.id,
          JSON.stringify({ displayName: dto.displayName, phone: dto.phoneNumber }),
        ],
      );

      return this.mapCoach(coachRow);
    });
  }

  /**
   * Admin approves, verifies, rejects, or suspends a coach.
   * Synchronizes user.role between USER and COACH based on verification status.
   */
  async verifyCoach(
    adminId: string,
    coachId: string,
    status: CoachVerificationStatus,
    commissionRate?: number,
  ): Promise<CoachProfile> {
    return this.db.withTransaction(async (client) => {
      const coach = await this.getById(coachId);
      const newRate = commissionRate !== undefined ? commissionRate : coach.commissionRate;
      const isApproved = status === CoachVerificationStatus.VERIFIED;
      const now = new Date().toISOString();

      if (this.db.isInMemory) {
        const table = this.db.getTable('coaches');
        const c = table.find(x => x.id === coachId);
        c.verification_status = status;
        c.commission_rate = newRate;
        c.is_active = isApproved;
        c.updated_at = now;

        // Synchronize linked user's role:
        const user = this.db.getTable('users').find(u => u.id === c.user_id);
        if (user) {
          if (isApproved) {
            user.role = UserRole.COACH;
          } else if (user.role === UserRole.COACH) {
            user.role = UserRole.USER;
          }
        }
        
        // Log audit
        this.db.getTable('audit_logs').push({
          id: crypto.randomUUID(),
          user_id: adminId,
          action: `COACH_VERIFICATION_${status}`,
          resource_type: 'coach',
          resource_id: coachId,
          details: { status, commissionRate: newRate },
          created_at: now,
        });

        return this.mapCoach(c);
      }

      const res = await client.query(
        'UPDATE coaches SET verification_status = $1, commission_rate = $2, is_active = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
        [status, newRate, isApproved, coachId],
      );

      // Synchronize linked user's role:
      if (isApproved) {
        await client.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [UserRole.COACH, coach.userId]);
      } else {
        await client.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND role = $3', [UserRole.USER, coach.userId, UserRole.COACH]);
      }

      await client.query(
        'INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
        [
          crypto.randomUUID(),
          adminId,
          `COACH_VERIFICATION_${status}`,
          'coach',
          coachId,
          JSON.stringify({ status, commissionRate: newRate }),
        ],
      );

      return this.mapCoach(res.rows[0]);
    });
  }

  /**
   * Credits a coach's payable balance in Tomans (e.g. verified booking earning).
   * Row-level serialized with transaction.
   */
  async creditCoachPayable(
    coachId: string,
    amountTomans: number,
    referenceId?: string,
    entryType = CoachPayableEntryType.CLASS_BOOKING_EARNING,
    description?: string,
  ): Promise<void> {
    if (amountTomans <= 0) return;

    await this.db.withTransaction(async (client) => {
      await client.query('SELECT id FROM coaches WHERE id = $1 FOR UPDATE', [coachId]);
      
      let currentBalance = 0;
      if (this.db.isInMemory) {
        const c = this.db.getTable('coaches').find(x => x.id === coachId);
        if (!c) throw new NotFoundException('مربی یافت نشد.');
        currentBalance = Number(c.payable_balance_tomans || 0);
        const newBalance = currentBalance + amountTomans;
        c.payable_balance_tomans = newBalance;

        this.db.getTable('coach_payable_ledger').push({
          id: crypto.randomUUID(),
          coach_id: coachId,
          delta_amount_tomans: amountTomans,
          balance_after: newBalance,
          entry_type: entryType,
          reference_id: referenceId || null,
          description: description || 'درآمد حاصل از رزرو کلاس ورزشی',
          created_at: new Date().toISOString(),
        });
        return;
      }

      const coachRes = await client.query('SELECT payable_balance_tomans FROM coaches WHERE id = $1', [coachId]);
      currentBalance = Number(coachRes.rows[0]?.payable_balance_tomans || 0);
      const newBalance = currentBalance + amountTomans;

      await client.query('UPDATE coaches SET payable_balance_tomans = $1, updated_at = NOW() WHERE id = $2', [newBalance, coachId]);
      await client.query(
        `INSERT INTO coach_payable_ledger (id, coach_id, delta_amount_tomans, balance_after, entry_type, reference_id, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [crypto.randomUUID(), coachId, amountTomans, newBalance, entryType, referenceId, description || 'درآمد حاصل از رزرو کلاس ورزشی'],
      );
    });
  }

  /**
   * Debits a coach's payable balance (e.g. Paya disbursement or booking cancellation refund).
   * Strict invariant: Balance CANNOT drop below zero.
   */
  async debitCoachPayable(
    coachId: string,
    amountTomans: number,
    referenceId?: string,
    entryType = CoachPayableEntryType.DISBURSEMENT_PAYA,
    description?: string,
  ): Promise<void> {
    if (amountTomans <= 0) return;

    await this.db.withTransaction(async (client) => {
      await client.query('SELECT id FROM coaches WHERE id = $1 FOR UPDATE', [coachId]);

      let currentBalance = 0;
      if (this.db.isInMemory) {
        const c = this.db.getTable('coaches').find(x => x.id === coachId);
        if (!c) throw new NotFoundException('مربی یافت نشد.');
        currentBalance = Number(c.payable_balance_tomans || 0);
        if (currentBalance < amountTomans) {
          throw new BadRequestException(`موجودی بستانکاری مربی (${currentBalance.toLocaleString()} تومان) برای کسر (${amountTomans.toLocaleString()} تومان) کافی نمی‌باشد.`);
        }
        const newBalance = currentBalance - amountTomans;
        c.payable_balance_tomans = newBalance;

        this.db.getTable('coach_payable_ledger').push({
          id: crypto.randomUUID(),
          coach_id: coachId,
          delta_amount_tomans: -amountTomans,
          balance_after: newBalance,
          entry_type: entryType,
          reference_id: referenceId || null,
          description: description || 'کسر از حساب مربی',
          created_at: new Date().toISOString(),
        });
        return;
      }

      const coachRes = await client.query('SELECT payable_balance_tomans FROM coaches WHERE id = $1', [coachId]);
      currentBalance = Number(coachRes.rows[0]?.payable_balance_tomans || 0);
      if (currentBalance < amountTomans) {
        throw new BadRequestException(`موجودی بستانکاری مربی (${currentBalance.toLocaleString()} تومان) برای کسر (${amountTomans.toLocaleString()} تومان) کافی نمی‌باشد.`);
      }
      const newBalance = currentBalance - amountTomans;

      await client.query('UPDATE coaches SET payable_balance_tomans = $1, updated_at = NOW() WHERE id = $2', [newBalance, coachId]);
      await client.query(
        `INSERT INTO coach_payable_ledger (id, coach_id, delta_amount_tomans, balance_after, entry_type, reference_id, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [crypto.randomUUID(), coachId, -amountTomans, newBalance, entryType, referenceId, description || 'کسر از حساب مربی'],
      );
    });
  }

  /**
   * Retrieves comprehensive financial overview for a coach dashboard.
   */
  async getFinancialOverview(coachId: string) {
    const coach = await this.getById(coachId);

    let bookings: any[] = [];
    let ledgerEntries: any[] = [];
    let settlements: any[] = [];

    if (this.db.isInMemory) {
      bookings = this.db.getTable('class_bookings').filter(b => b.coach_id === coachId && b.status === 'CONFIRMED');
      ledgerEntries = this.db.getTable('coach_payable_ledger')
        .filter(l => l.coach_id === coachId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);
      settlements = this.db.getTable('coach_settlement_batches')
        .filter(s => s.coach_id === coachId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      const bRes = await this.db.query('SELECT * FROM class_bookings WHERE coach_id = $1 AND status = \'CONFIRMED\'', [coachId]);
      bookings = bRes.rows;
      const lRes = await this.db.query('SELECT * FROM coach_payable_ledger WHERE coach_id = $1 ORDER BY created_at DESC LIMIT 20', [coachId]);
      ledgerEntries = lRes.rows;
      const sRes = await this.db.query('SELECT * FROM coach_settlement_batches WHERE coach_id = $1 ORDER BY created_at DESC', [coachId]);
      settlements = sRes.rows;
    }

    const totalGrossSales = bookings.reduce((sum, b) => sum + Number(b.price_paid_tomans || 0), 0);
    const totalCommission = bookings.reduce((sum, b) => sum + Number(b.gravity_commission_tomans || 0), 0);
    const totalNetEarned = bookings.reduce((sum, b) => sum + Number(b.coach_earning_tomans || 0), 0);

    return {
      coachId,
      displayName: coach.displayName,
      commissionRate: coach.commissionRate,
      payableBalanceTomans: coach.payableBalanceTomans,
      totalConfirmedBookings: bookings.length,
      totalGrossSalesTomans: totalGrossSales,
      totalCommissionTomans: totalCommission,
      totalNetEarnedTomans: totalNetEarned,
      recentTransactions: ledgerEntries.map(l => ({
        id: l.id,
        deltaAmountTomans: Number(l.delta_amount_tomans),
        balanceAfter: Number(l.balance_after),
        entryType: l.entry_type,
        description: l.description,
        createdAt: l.created_at,
      })),
      settlements: settlements.map(s => ({
        id: s.id,
        cycleStart: s.cycle_start,
        cycleEnd: s.cycle_end,
        totalBookings: s.total_bookings,
        totalGrossTomans: Number(s.total_gross_tomans),
        totalCommissionTomans: Number(s.total_commission_tomans),
        totalNetPayoutTomans: Number(s.total_net_payout_tomans),
        status: s.status,
        bankReferenceRrn: s.bank_reference_rrn,
        payaTrackingId: s.paya_tracking_id,
        disbursedAt: s.disbursed_at,
        createdAt: s.created_at,
      })),
    };
  }

  /**
   * Generates a coach settlement batch for a date cycle.
   */
  async generateSettlementBatch(coachId: string, cycleStart: string, cycleEnd: string) {
    return this.db.withTransaction(async (client) => {
      const coach = await this.getById(coachId);
      
      let bookings: any[] = [];
      if (this.db.isInMemory) {
        bookings = this.db.getTable('class_bookings').filter(b => 
          b.coach_id === coachId &&
          b.status === 'CONFIRMED' &&
          b.created_at.split('T')[0] >= cycleStart &&
          b.created_at.split('T')[0] <= cycleEnd
        );
      } else {
        const res = await client.query(
          'SELECT * FROM class_bookings WHERE coach_id = $1 AND status = \'CONFIRMED\' AND created_at::date >= $2 AND created_at::date <= $3',
          [coachId, cycleStart, cycleEnd],
        );
        bookings = res.rows;
      }

      const totalGross = bookings.reduce((sum, b) => sum + Number(b.price_paid_tomans || 0), 0);
      const totalCommission = Math.round(totalGross * coach.commissionRate);
      const totalNetPayout = totalGross - totalCommission;

      const batchId = crypto.randomUUID();
      const now = new Date().toISOString();
      const batch = {
        id: batchId,
        coachId,
        coach_id: coachId,
        cycleStart,
        cycle_start: cycleStart,
        cycleEnd,
        cycle_end: cycleEnd,
        totalBookings: bookings.length,
        total_bookings: bookings.length,
        totalGrossTomans: totalGross,
        total_gross_tomans: totalGross,
        totalCommissionTomans: totalCommission,
        total_commission_tomans: totalCommission,
        totalNetPayoutTomans: totalNetPayout,
        total_net_payout_tomans: totalNetPayout,
        status: 'PENDING_APPROVAL' as const,
        bankReferenceRrn: null,
        bank_reference_rrn: null,
        payaTrackingId: null,
        paya_tracking_id: null,
        disbursedAt: null,
        disbursed_at: null,
        createdAt: now,
        created_at: now,
      };

      if (this.db.isInMemory) {
        this.db.getTable('coach_settlement_batches').push(batch);
        return batch;
      }

      const insertRes = await client.query(
        `INSERT INTO coach_settlement_batches 
         (id, coach_id, cycle_start, cycle_end, total_bookings, total_gross_tomans, total_commission_tomans, total_net_payout_tomans, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
        [batchId, coachId, cycleStart, cycleEnd, bookings.length, totalGross, totalCommission, totalNetPayout, 'PENDING_APPROVAL'],
      );
      const r = insertRes.rows[0];
      return {
        id: r.id,
        coachId: r.coach_id,
        cycleStart: r.cycle_start,
        cycleEnd: r.cycle_end,
        totalBookings: Number(r.total_bookings),
        totalGrossTomans: Number(r.total_gross_tomans),
        totalCommissionTomans: Number(r.total_commission_tomans),
        totalNetPayoutTomans: Number(r.total_net_payout_tomans),
        status: r.status,
        bankReferenceRrn: r.bank_reference_rrn,
        payaTrackingId: r.paya_tracking_id,
        disbursedAt: r.disbursed_at,
        createdAt: r.created_at,
      };
    });
  }

  /**
   * Admin approves and disburses a coach settlement batch.
   */
  async approveAndDisburseSettlement(batchId: string, adminId: string, rrn?: string, payaId?: string) {
    return this.db.withTransaction(async (client) => {
      let batch: any = null;
      if (this.db.isInMemory) {
        batch = this.db.getTable('coach_settlement_batches').find(b => b.id === batchId);
      } else {
        const res = await client.query('SELECT * FROM coach_settlement_batches WHERE id = $1 FOR UPDATE', [batchId]);
        batch = res.rows[0];
      }

      if (!batch) throw new NotFoundException('دسته تسویه مربی یافت نشد.');
      if (batch.status === 'PAID') {
        throw new BadRequestException('این تسویه قبلاً پرداخت شده است.');
      }

      const amountToDisburse = Number(batch.total_net_payout_tomans || batch.totalNetPayoutTomans);

      // Debit coach payable
      await this.debitCoachPayable(
        batch.coach_id || batch.coachId,
        amountToDisburse,
        batchId,
        CoachPayableEntryType.DISBURSEMENT_PAYA,
        `واریز تسویه حساب بانکی پایا (سیکل ${batch.cycle_start || batch.cycleStart} الی ${batch.cycle_end || batch.cycleEnd})`,
      );

      const now = new Date().toISOString();
      const updatedRrn = rrn || 'PAYA_' + Date.now().toString().slice(-8);
      const updatedPaya = payaId || 'TRK_' + Math.floor(10000000 + Math.random() * 90000000);

      if (this.db.isInMemory) {
        batch.status = 'PAID';
        batch.bankReferenceRrn = updatedRrn;
        batch.bank_reference_rrn = updatedRrn;
        batch.payaTrackingId = updatedPaya;
        batch.paya_tracking_id = updatedPaya;
        batch.disbursedAt = now;
        batch.disbursed_at = now;
        return batch;
      }

      const res = await client.query(
        `UPDATE coach_settlement_batches 
         SET status = 'PAID', bank_reference_rrn = $1, paya_tracking_id = $2, disbursed_at = NOW() 
         WHERE id = $3 RETURNING *`,
        [updatedRrn, updatedPaya, batchId],
      );
      const r = res.rows[0];
      return {
        id: r.id,
        coachId: r.coach_id,
        cycleStart: r.cycle_start,
        cycleEnd: r.cycle_end,
        totalBookings: Number(r.total_bookings),
        totalGrossTomans: Number(r.total_gross_tomans),
        totalCommissionTomans: Number(r.total_commission_tomans),
        totalNetPayoutTomans: Number(r.total_net_payout_tomans),
        status: r.status,
        bankReferenceRrn: r.bank_reference_rrn,
        payaTrackingId: r.paya_tracking_id,
        disbursedAt: r.disbursed_at,
        createdAt: r.created_at,
      };
    });
  }

  /**
   * List all settlement batches for admin or filtered by coach.
   */
  async getSettlementBatches(coachId?: string): Promise<any[]> {
    if (this.db.isInMemory) {
      const coaches = this.db.getTable('coaches');
      let batches = [...this.db.getTable('coach_settlement_batches')];
      if (coachId) {
        batches = batches.filter(b => (b.coach_id === coachId || b.coachId === coachId));
      }
      return batches
        .map(b => {
          const c = coaches.find(x => x.id === (b.coach_id || b.coachId));
          return {
            ...b,
            coach_name: c?.display_name || 'مربی گراویتی',
            sheba_number: c?.sheba_number || '',
            bank_account_holder: c?.bank_account_holder || '',
          };
        })
        .sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());
    }

    const where = coachId ? 'WHERE csb.coach_id = $1' : '';
    const params = coachId ? [coachId] : [];
    const res = await this.db.query(
      `SELECT csb.*, c.display_name AS coach_name, c.sheba_number, c.bank_account_holder
       FROM coach_settlement_batches csb
       JOIN coaches c ON csb.coach_id = c.id
       ${where}
       ORDER BY csb.created_at DESC`,
      params,
    );
    return res.rows;
  }

  private mapCoach(row: any): CoachProfile {
    return {
      id: row.id,
      userId: row.user_id,
      displayName: row.display_name,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      specialties: Array.isArray(row.specialties) ? row.specialties : (typeof row.specialties === 'string' ? JSON.parse(row.specialties) : []),
      sports: Array.isArray(row.sports) ? row.sports : (typeof row.sports === 'string' ? JSON.parse(row.sports) : []),
      experienceYears: Number(row.experience_years || 1),
      verificationStatus: row.verification_status,
      isActive: Boolean(row.is_active),
      shebaNumber: row.sheba_number,
      bankAccountHolder: row.bank_account_holder,
      contactPhone: row.contact_phone,
      commissionRate: Number(row.commission_rate || 0.15),
      payableBalanceTomans: Number(row.payable_balance_tomans || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
