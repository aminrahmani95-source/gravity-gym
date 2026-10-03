import { Injectable, BadRequestException, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppConfigService } from '../../common/config/app-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, Gender, UserStatus, AuthResponse } from '@gym-app/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Dispatches transactional OTP using Iranian pattern routing
   * Enforces 120s cooldown per phone number
   */
  async sendOtp(phoneNumber: string): Promise<{ success: boolean; expiresInSeconds: number; debugCode?: string }> {
    const cleanPhone = this.normalizePhoneNumber(phoneNumber);

    // Rate limiting: Hourly cap to prevent SMS bombing (max 10 requests per hour)
    const hourlyKey = `otp_rate_hour:${cleanPhone}`;
    const hourlyCount = parseInt((await this.redis.get(hourlyKey)) || '0', 10);
    if (hourlyCount >= 10) {
      throw new BadRequestException('تعداد درخواست‌های کد تأیید در یک ساعت گذشته بیش از حد مجاز است. لطفاً بعداً تلاش فرمایید.');
    }

    const cooldownKey = `otp_cooldown:${cleanPhone}`;
    const inCooldown = await this.redis.get(cooldownKey);
    
    if (inCooldown) {
      if (process.env.NODE_ENV !== 'production') {
        const existingOtp = await this.redis.get(`otp:${cleanPhone}`);
        if (existingOtp) {
          return { success: true, expiresInSeconds: 60, debugCode: existingOtp };
        }
      } else {
        throw new BadRequestException('کد تأیید اخیراً ارسال شده است. لطفاً پیش از تلاش مجدد صبر فرمایید.');
      }
    }

    // Generate 5-digit verification code
    const otpCode = process.env.NODE_ENV === 'test' ? '12345' : Math.floor(10000 + Math.random() * 90000).toString();
    const otpKey = `otp:${cleanPhone}`;

    // Store in Redis with 120 seconds TTL
    await this.redis.set(otpKey, otpCode, 120);
    const cooldownSeconds = await this.getSystemConfig('otp_resend_cooldown_seconds', 60);
    await this.redis.set(cooldownKey, '1', cooldownSeconds);
    await this.redis.set(hourlyKey, (hourlyCount + 1).toString(), 3600);

    // Dispatch OTP via notification service or fallback logger
    if (this.notificationsService) {
      await this.notificationsService.sendOtp(cleanPhone, otpCode);
    } else if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[SMS OTP Dispatch] To: ${cleanPhone} | Pattern Code: ${otpCode} (Expires in 120s)`);
    } else {
      this.logger.log(`[SMS OTP Dispatch] To: ${cleanPhone} | Dispatched via SMS Gateway (Expires in 120s)`);
    }

    return {
      success: true,
      expiresInSeconds: 120,
      debugCode: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
    };
  }

  /**
   * Verifies OTP code and returns signed JWT session
   * Includes brute-force protection (configurable failed attempts limit per OTP lifecycle)
   */
  async verifyOtp(phoneNumber: string, code: string): Promise<AuthResponse> {
    const cleanPhone = this.normalizePhoneNumber(phoneNumber);
    const otpKey = `otp:${cleanPhone}`;
    const attemptsKey = `otp_attempts:${cleanPhone}`;
    const maxAttempts = await this.getSystemConfig('otp_max_attempts', 5);

    const storedCode = await this.redis.get(otpKey);
    if (!storedCode) {
      throw new BadRequestException('کد تأیید منقضی شده یا درخواست نشده است.');
    }

    // Check failed attempts
    const currentAttempts = parseInt((await this.redis.get(attemptsKey)) || '0', 10);
    if (currentAttempts >= maxAttempts) {
      await this.redis.del(otpKey);
      await this.redis.del(attemptsKey);
      throw new BadRequestException('تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً کد جدید دریافت نمایید.');
    }

    if (storedCode !== code) {
      const nextAttempts = currentAttempts + 1;
      await this.redis.set(attemptsKey, nextAttempts.toString(), 120);
      if (nextAttempts >= maxAttempts) {
        await this.redis.del(otpKey);
        await this.redis.del(attemptsKey);
        throw new BadRequestException('تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً کد جدید دریافت نمایید.');
      }
      throw new BadRequestException(`کد تأیید وارد شده نامعتبر است. (${maxAttempts - nextAttempts} تلاش باقیمانده)`);
    }

    // Invalidate consumed OTP & reset attempts & clear cooldown
    await this.redis.del(otpKey);
    await this.redis.del(attemptsKey);
    const cooldownKey = `otp_cooldown:${cleanPhone}`;
    await this.redis.del(cooldownKey);

    // Find or create user
    const userRes = await this.db.query('SELECT * FROM users WHERE phone_number = $1', [cleanPhone]);
    let user = userRes.rows[0];

    if (!user) {
      const newUserId = crypto.randomUUID();
      await this.db.query(
        'INSERT INTO users (id, phone_number, gender, role, status) VALUES ($1, $2, $3, $4, $5)',
        [newUserId, cleanPhone, Gender.MALE, UserRole.USER, UserStatus.ACTIVE]
      );
      const created = await this.db.query('SELECT * FROM users WHERE id = $1', [newUserId]);
      user = created.rows[0];
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('حساب کاربری شما مسدود شده است. با پشتیبانی تماس بگیرید.');
    }

    // Calculate current credits from ledger
    const balanceRes = await this.db.query(
      'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id]
    );
    const currentCredits = balanceRes.rows[0]?.balance_after ?? 0;

    // Fetch active subscription
    const subRes = await this.db.query(
      `SELECT s.*, p.title_fa as plan_title 
       FROM subscriptions s 
       JOIN plans p ON s.plan_id = p.id 
       WHERE s.user_id = $1 AND s.status = 'ACTIVE' 
       ORDER BY s.expires_at DESC LIMIT 1`,
      [user.id]
    );
    const activeSub = subRes.rows[0];

    // Issue JWT token
    const tokenPayload = {
      sub: user.id,
      phone: user.phone_number,
      role: user.role,
      gender: user.gender,
      assignedGymId: user.assigned_gym_id,
    };

    const jwtSecret = AppConfigService.getJwtSecret();

    const accessToken = await this.jwtService.signAsync(tokenPayload, {
      secret: jwtSecret,
      expiresIn: '72h',
    });

    const refreshToken = await this.jwtService.signAsync(tokenPayload, {
      secret: jwtSecret,
      expiresIn: '30d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phoneNumber: user.phone_number,
        firstName: user.first_name,
        lastName: user.last_name,
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
      },
    };
  }

  normalizePhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      throw new BadRequestException('شماره موبایل الزامی است.');
    }
    // Convert Persian and Arabic digits to ASCII digits
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let clean = phone.trim().replace(/[\s\-_]+/g, '');
    for (let i = 0; i < 10; i++) {
      clean = clean.split(persianDigits[i]).join(i.toString());
      clean = clean.split(arabicDigits[i]).join(i.toString());
    }

    if (clean.startsWith('+98')) {
      clean = '0' + clean.slice(3);
    } else if (clean.startsWith('0098')) {
      clean = '0' + clean.slice(4);
    } else if (clean.startsWith('98') && clean.length === 12) {
      clean = '0' + clean.slice(2);
    }

    // Enforce Iranian mobile number format: 09 followed by 9 digits (total 11 digits)
    const iranianMobileRegex = /^09\d{9}$/;
    if (!iranianMobileRegex.test(clean)) {
      throw new BadRequestException('شماره موبایل وارد شده نامعتبر است. فرمت صحیح: ۰۹۱۲۳۴۵۶۷۸۹');
    }

    return clean;
  }

  private async getSystemConfig(key: string, defaultValue: number): Promise<number> {
    if (this.db.isInMemory) {
      const row = this.db.getTable('system_configs').find((c: any) => c.key === key);
      return Number(row?.value_json?.value ?? defaultValue);
    }
    const res = await this.db.query('SELECT value_json FROM system_configs WHERE key = $1', [key]);
    return Number(res.rows[0]?.value_json?.value ?? defaultValue);
  }
}
