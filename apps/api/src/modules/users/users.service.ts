import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { UserProfileResponse, Gender } from '@gym-app/shared-types';
import {
  isValidIranianNationalCode,
  cleanIranianNationalCode,
} from '../../common/utils/iranian-national-code.util';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: string): Promise<UserProfileResponse> {
    const res = await this.db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = res.rows[0];
    if (!user) {
      throw new NotFoundException('کاربر مورد نظر یافت نشد.');
    }

    // Get current balance from credit_ledger
    const balanceRes = await this.db.query(
      'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    const currentCredits = balanceRes.rows[0]?.balance_after ?? 0;

    // Get active subscription
    const subRes = await this.db.query(
      `SELECT s.*, p.title_fa as plan_title 
       FROM subscriptions s 
       JOIN plans p ON s.plan_id = p.id 
       WHERE s.user_id = $1 AND s.status = 'ACTIVE' 
       ORDER BY s.expires_at DESC LIMIT 1`,
      [userId]
    );
    const activeSub = subRes.rows[0];

    return {
      id: user.id,
      phoneNumber: user.phone_number,
      firstName: user.first_name,
      lastName: user.last_name,
      nationalCode: user.national_code,
      gender: user.gender,
      avatarUrl: user.avatar_url,
      role: user.role,
      assignedGymId: user.assigned_gym_id,
      status: user.status,
      currentCredits,
      activeSubscription: activeSub ? {
        planTitle: activeSub.plan_title,
        expiresAt: activeSub.expires_at,
        status: activeSub.status,
      } : undefined,
    };
  }

  async updateProfile(
    userId: string,
    dto: { firstName?: string; lastName?: string; gender?: Gender; nationalCode?: string; avatarUrl?: string }
  ): Promise<UserProfileResponse> {
    const existing = await this.getProfile(userId);

    // 1. Validate and clean Iranian National Code if provided
    let cleanedNationalCode: string | undefined = undefined;
    if (dto.nationalCode !== undefined) {
      const raw = dto.nationalCode.trim();
      if (raw.length > 0) {
        if (!isValidIranianNationalCode(raw)) {
          throw new BadRequestException('کد ملی وارد شده نامعتبر است (فرمت یا رقم کنترلی کد ملی نادرست است).');
        }
        cleanedNationalCode = cleanIranianNationalCode(raw)!;

        // Check for duplicate national code among other users
        if (this.db.isInMemory) {
          const users = this.db.getTable('users');
          const conflict = users.find(u => u.id !== userId && u.national_code === cleanedNationalCode);
          if (conflict) {
            throw new ConflictException('این کد ملی قبلاً توسط کاربر دیگری در سیستم ثبت شده است.');
          }
        } else {
          const checkRes = await this.db.query(
            'SELECT id FROM users WHERE national_code = $1 AND id != $2',
            [cleanedNationalCode, userId]
          );
          if (checkRes.rows && checkRes.rows.length > 0) {
            throw new ConflictException('این کد ملی قبلاً توسط کاربر دیگری در سیستم ثبت شده است.');
          }
        }
      }
    }

    // 2. Validate Gender enum if provided
    if (dto.gender !== undefined) {
      if (dto.gender !== Gender.MALE && dto.gender !== Gender.FEMALE) {
        throw new BadRequestException('جنسیت انتخاب شده نامعتبر است.');
      }
    }

    const trimmedFirst = dto.firstName !== undefined ? dto.firstName.trim() : undefined;
    const trimmedLast = dto.lastName !== undefined ? dto.lastName.trim() : undefined;

    // 3. Update in PostgreSQL or memory engine
    try {
      if (this.db.isInMemory) {
        const users = this.db.getTable('users');
        const u = users.find(x => x.id === userId);
        if (u) {
          if (trimmedFirst !== undefined && trimmedFirst.length > 0) u.first_name = trimmedFirst;
          if (trimmedLast !== undefined && trimmedLast.length > 0) u.last_name = trimmedLast;
          if (dto.gender !== undefined) u.gender = dto.gender;
          if (cleanedNationalCode !== undefined) u.national_code = cleanedNationalCode;
          if (dto.avatarUrl !== undefined) u.avatar_url = dto.avatarUrl;
          u.updated_at = new Date().toISOString();
        }
      } else {
        await this.db.query(
          `UPDATE users 
           SET first_name = COALESCE(NULLIF($1, ''), first_name),
               last_name = COALESCE(NULLIF($2, ''), last_name),
               gender = COALESCE($3, gender),
               national_code = COALESCE($4, national_code),
               avatar_url = COALESCE($5, avatar_url),
               updated_at = NOW()
           WHERE id = $6`,
          [trimmedFirst, trimmedLast, dto.gender, cleanedNationalCode, dto.avatarUrl, userId]
        );
      }
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('duplicate key value') || err.message?.includes('national_code')) {
        throw new ConflictException('این کد ملی قبلاً توسط کاربر دیگری در سیستم ثبت شده است.');
      }
      throw err;
    }

    return this.getProfile(userId);
  }
}
