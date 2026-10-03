import { Injectable, BadRequestException, ConflictException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { AppConfigService } from '../../common/config/app-config.service';
import { LedgerService } from '../ledger/ledger.service';
import { EconomicsService } from '../economics/economics.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  GenerateQrResponseDto,
  ReceptionVerificationResult,
  CreditLedgerEntryType,
  CheckinStatus,
  Gender,
  DynamicQrPayload,
  MemberCheckinHistoryItem,
} from '@gym-app/shared-types';

import { getTehranTimeInfo, isSansActiveAt } from '../../common/utils/tehran-time.util';
import * as crypto from 'crypto';

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);
  private readonly qrSecret = AppConfigService.getQrSecret();

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly ledgerService: LedgerService,
    private readonly economicsService: EconomicsService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  /**
   * Generates a dynamic, short-lived (45s) rotating QR code for the member.
   * Embeds cryptographic HMAC signature and random single-use nonce.
   */
  async generateDynamicQr(userId: string, gymId: string, clientLat?: number, clientLng?: number): Promise<GenerateQrResponseDto> {
    // Check if user has an active account
    const userRes = await this.db.query('SELECT status FROM users WHERE id = $1', [userId]);
    if (!userRes.rows[0] || userRes.rows[0].status !== 'ACTIVE') {
      throw new ForbiddenException('حساب کاربری شما فعال نیست یا مسدود شده است.');
    }

    // Check if gym exists and is active
    let gym: any;
    if (this.db.isInMemory) {
      gym = this.db.getTable('gyms').find(g => g.id === gymId);
    } else {
      const gymRes = await this.db.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
      gym = gymRes.rows[0];
    }

    if (!gym) {
      throw new BadRequestException('مجموعه ورزشی مورد نظر یافت نشد.');
    }
    if (!gym.is_active) {
      throw new BadRequestException('مجموعه ورزشی مورد نظر در حال حاضر غیرفعال می‌باشد.');
    }

    // Check if user has sufficient credits available for this gym
    const balance = await this.ledgerService.getBalance(userId);
    if (balance <= 0) {
      throw new BadRequestException('موجودی اعتبار شما به اتمام رسیده است. لطفاً اشتراک خود را تمدید فرمایید.');
    }

    const pricing = await this.economicsService.calculateDynamicCreditCost(gymId);
    if (balance < pricing.creditCost) {
      const gymName = gym.name_fa || gym.name || 'این مجموعه';
      throw new BadRequestException(
        `موجودی اعتبار شما (${balance} اعتبار) برای ورود به «${gymName}» (${pricing.creditCost} اعتبار) کافی نمی‌باشد. لطفاً بسته اعتباری خود را شارژ فرمایید.`
      );
    }

    // Check subscription expiration if subscriptions exist for member
    if (this.db.isInMemory) {
      const subs = this.db.getTable('subscriptions').filter(s => s.user_id === userId);
      if (subs.length > 0) {
        const latestSub = subs[subs.length - 1];
        if (latestSub.status === 'EXPIRED' || new Date(latestSub.expires_at) <= new Date()) {
          throw new ForbiddenException('اشتراک ورزشی شما منقضی شده است. جهت ورود به مجموعه، ابتدا اشتراک خود را تمدید فرمایید.');
        }
      }
    } else {
      const subRes = await this.db.query(
        'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY expires_at DESC LIMIT 1',
        [userId],
      );
      if (subRes.rows[0]) {
        const sub = subRes.rows[0];
        if (sub.status === 'EXPIRED' || new Date(sub.expires_at) <= new Date()) {
          throw new ForbiddenException('اشتراک ورزشی شما منقضی شده است. جهت ورود به مجموعه، ابتدا اشتراک خود را تمدید فرمایید.');
        }
      }
    }

    const rules = await this.economicsService.getSystemRules();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = rules.qrValiditySeconds ?? 45;
    const expiresAtSeconds = nowSeconds + ttlSeconds;
    const nonce = crypto.randomBytes(8).toString('hex');

    // Sign payload with HMAC-SHA256
    const payloadToSign = `${userId}:${gymId}:${nowSeconds}:${expiresAtSeconds}:${nonce}`;
    const signature = crypto.createHmac('sha256', this.qrSecret).update(payloadToSign).digest('hex');

    const qrPayload: DynamicQrPayload = {
      sub: userId,
      gymId,
      iat: nowSeconds,
      exp: expiresAtSeconds,
      nonce,
      sig: signature,
    };

    const qrToken = Buffer.from(JSON.stringify(qrPayload)).toString('base64url');

    return {
      qrToken,
      expiresInSeconds: ttlSeconds,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    };
  }

  /**
   * The 8-Stage Server-Side Check-in Validation Pipeline (+ Privacy-Compliant Reception Confirmation)
   * Scanned by the gym receptionist front-desk terminal.
   */
  async verifyAndConsumeCheckin(
    qrToken: string,
    staffUserId: string,
    terminalGymId?: string,
  ): Promise<ReceptionVerificationResult> {
    const rules = await this.economicsService.getSystemRules();
    let payload: DynamicQrPayload;

    // Decode QR payload
    try {
      const decoded = Buffer.from(qrToken, 'base64url').toString('utf8');
      payload = JSON.parse(decoded);
    } catch {
      throw new BadRequestException('فرمت بارکد ورود نامعتبر است.');
    }

    const { sub: userId, gymId: tokenGymId, iat, exp, nonce, sig } = payload;

    if (terminalGymId && terminalGymId !== tokenGymId) {
      throw new BadRequestException('این بارکد برای مجموعه ورزشی دیگری صادر شده است و در این مجموعه معتبر نمی‌باشد.');
    }

    const targetGymId = terminalGymId || tokenGymId;

    // =========================================================================
    // STAGE 1: Distributed Mutex & Rate Limiting (Redis Redlock)
    // =========================================================================
    const lock = await this.redis.acquireLock(`checkin:${userId}`, 10000);
    if (!lock) {
      throw new ConflictException('عملیات همزمان شناسایی شد. ورود تکراری امکان‌پذیر نیست.');
    }

    try {
      // =========================================================================
      // STAGE 2: Nonce Freshness & Anti-Replay Protection (Configurable retention)
      // =========================================================================
      const nonceKey = `nonce:qr:${nonce}`;
      const nonceTtl = rules.qrNonceRetentionSeconds ?? 90;
      const isFreshNonce = await this.redis.setnx(nonceKey, '1', nonceTtl);
      if (!isFreshNonce) {
        throw new BadRequestException('این بارکد قبلاً استفاده شده است (حمله تکرار/Replay Attack).');
      }

      // =========================================================================
      // STAGE 3: Cryptographic Signature & Expiration Window (Strict 45s validity)
      // Note: Nonce retention (90s) NEVER extends QR token cryptographic age (45s)
      // =========================================================================
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds > exp) {
        throw new BadRequestException(`بارکد ورود منقضی شده است (مدت اعتبار ${rules.qrValiditySeconds ?? 45} ثانیه به پایان رسیده است).`);
      }

      const expectedPayload = `${userId}:${tokenGymId}:${iat}:${exp}:${nonce}`;
      const expectedSig = crypto.createHmac('sha256', this.qrSecret).update(expectedPayload).digest('hex');
      if (expectedSig !== sig) {
        throw new BadRequestException('امضای رمزنگاری بارکد نامعتبر یا دستکاری شده است.');
      }

      // =========================================================================
      // STAGE 4: Identity & Account Status Verification
      // =========================================================================
      const userRes = await this.db.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = userRes.rows[0];
      if (!user || user.status !== 'ACTIVE') {
        throw new ForbiddenException('حساب کاربری عضو مسدود است یا در سیستم یافت نشد.');
      }

      // Check subscription validity if subscriptions exist for member
      if (this.db.isInMemory) {
        const subs = this.db.getTable('subscriptions').filter(s => s.user_id === userId);
        if (subs.length > 0) {
          const latestSub = subs[subs.length - 1];
          if (latestSub.status === 'EXPIRED' || new Date(latestSub.expires_at) <= new Date()) {
            throw new ForbiddenException('عضو دارای اشتراک ورزشی معتبر نمی‌باشد یا مدت اعتبار اشتراک به پایان رسیده است.');
          }
        }
      } else {
        const subRes = await this.db.query(
          'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY expires_at DESC LIMIT 1',
          [userId],
        );
        if (subRes.rows[0]) {
          const sub = subRes.rows[0];
          if (sub.status === 'EXPIRED' || new Date(sub.expires_at) <= new Date()) {
            throw new ForbiddenException('عضو دارای اشتراک ورزشی معتبر نمی‌باشد یا مدت اعتبار اشتراک به پایان رسیده است.');
          }
        }
      }

      // =========================================================================
      // STAGE 5: Gender Schedule & Sans Validation (سانس‌های بانوان و آقایان)
      // =========================================================================
      const activeSans = await this.validateActiveGenderSans(targetGymId, user.gender);

      // =========================================================================
      // STAGE 6: Club Eligibility & Venue Monthly Quota
      // =========================================================================
      const monthlyVisitsAtThisClub = await this.countMonthlyVisits(userId, targetGymId);
      if (monthlyVisitsAtThisClub >= rules.defaultClubMonthlyVisitCap) {
        throw new BadRequestException(
          `سقف مجاز ورود ماهانه به این مجموعه تکمیل شده است (${monthlyVisitsAtThisClub} از ${rules.defaultClubMonthlyVisitCap} جلسه استفاده شده).`
        );
      }

      // =========================================================================
      // STAGE 7: Cooldown & Velocity Fraud Detection
      // =========================================================================
      const cooldownKey = `cooldown:${userId}:${targetGymId}`;
      const inCooldown = await this.redis.get(cooldownKey);
      if (inCooldown) {
        throw new BadRequestException('فاصله زمانی مجاز تا ورود بعدی در این مجموعه رعایت نشده است (حداقل ۲ ساعت).');
      }

      await this.validateTravelVelocity(userId, targetGymId, rules.impossibleVelocityKmhThreshold);

      // =========================================================================
      // STAGE 8: Atomic Dual-Subledger Mutation (Credit Ledger & Gym Payable Ledger)
      // =========================================================================
      const pricing = await this.economicsService.calculateDynamicCreditCost(
        targetGymId,
        activeSans.isPeak,
        false
      );

      const checkinId = crypto.randomUUID();
      const nowIso = new Date().toISOString();

      try {
        await this.db.withTransaction(async (client) => {
          // 1. Record completed check-in record first so child ledger FK constraints are satisfied
          if (this.db.isInMemory) {
            this.db.getTable('checkins').push({
              id: checkinId,
              user_id: userId,
              gym_id: targetGymId,
              staff_user_id: staffUserId,
              credits_debited: pricing.creditCost,
              monetary_payout_tomans: pricing.monetaryPayout,
              status: CheckinStatus.COMPLETED,
              qr_nonce: nonce,
              created_at: nowIso,
            });
          } else {
            await client.query(
              `INSERT INTO checkins (id, user_id, gym_id, staff_user_id, credits_debited, monetary_payout_tomans, status, qr_nonce, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [checkinId, userId, targetGymId, staffUserId, pricing.creditCost, pricing.monetaryPayout, CheckinStatus.COMPLETED, nonce, nowIso]
            );
          }

          // 2. Debit credits from user ledger
          await this.ledgerService.debitCredits(
            userId,
            pricing.creditCost,
            CreditLedgerEntryType.CHECKIN_DEBIT,
            checkinId,
            `ورود به مجموعه ورزشی (${pricing.creditCost} اعتبار)`
          );

          // 3. Accrue monetary payable in Tomans to partner gym
          await this.ledgerService.creditGymPayable(
            targetGymId,
            pricing.monetaryPayout,
            checkinId,
            undefined,
            `پذیرش عضو پلتفرم (${user.first_name} ${user.last_name})`
          );
        });
      } catch (err: any) {
        if (
          err.code === '23505' ||
          err.constraint === 'uq_checkins_qr_nonce' ||
          err.constraint === 'uq_credit_ledger_checkin_debit' ||
          err.constraint === 'uq_gym_payable_checkin_earning' ||
          err.message?.includes('uq_checkins_qr_nonce') ||
          err.message?.includes('duplicate key value')
        ) {
          throw new BadRequestException('این بارکد قبلاً استفاده شده است (حمله تکرار/Replay Attack).');
        }
        throw err;
      }

      // Set cooldown in Redis (default 120 minutes = 7200 seconds)
      await this.redis.set(cooldownKey, '1', rules.defaultCooldownMinutes * 60);

      // Get Gym profile for UI display
      const gymRes = await this.db.query('SELECT name_fa FROM gyms WHERE id = $1', [targetGymId]);
      const gymName = gymRes.rows[0]?.name_fa || 'مجموعه ورزشی';

      // Dispatch notification for approved check-in
      if (this.notificationsService && user.phone_number) {
        try {
          const balance = await this.ledgerService.getBalance(userId);
          await this.notificationsService.notifyCheckinApproved(
            user.phone_number,
            gymName,
            pricing.creditCost,
            balance,
          );
        } catch (notifErr: any) {
          this.logger.warn(`Failed to dispatch checkin approval notification: ${notifErr.message}`);
        }
      }

      // =========================================================================
      // PHYSICAL CONFIRMATION STEP: Return Privacy-Compliant Verification Screen
      // PRIVACY MANDATE: Suppresses National ID & Phone Number!
      // =========================================================================
      return {
        status: 'APPROVED',
        checkinId,
        member: {
          userId: user.id,
          fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'عضو پلتفرم',
          gender: user.gender as Gender,
          avatarUrl: user.avatar_url,
          subscriptionTitle: 'عضویت فعال ورزشی',
          monthlyVisitsAtThisClub: monthlyVisitsAtThisClub + 1,
          maxMonthlyCap: rules.defaultClubMonthlyVisitCap,
        },
        visitDetails: {
          gymName,
          creditsDebited: pricing.creditCost,
          checkinTime: nowIso,
        },
      };
    } catch (err: any) {
      if (this.notificationsService) {
        try {
          const uRes = await this.db.query('SELECT phone_number FROM users WHERE id = $1', [userId]);
          const phone = uRes.rows[0]?.phone_number;
          if (phone) {
            await this.notificationsService.notifyCheckinRejected(phone, targetGymId, err.message || 'خطا در احراز ورود');
          }
        } catch {
          // Never re-throw notification failure
        }
      }
      throw err;
    } finally {
      // Release distributed lock
      await this.redis.releaseLock(`checkin:${userId}`, lock.lockId);
    }
  }

  private async validateActiveGenderSans(gymId: string, userGender: Gender): Promise<{ isPeak: boolean }> {
    // 1. Fetch Gym access mode
    let gym: any;
    if (this.db.isInMemory) {
      gym = this.db.getTable('gyms').find(g => g.id === gymId);
    } else {
      const res = await this.db.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
      gym = res.rows[0];
    }

    if (!gym) {
      throw new BadRequestException('مجموعه ورزشی مورد نظر یافت نشد.');
    }
    if (!gym.is_active) {
      throw new BadRequestException('مجموعه ورزشی مورد نظر در حال حاضر غیرفعال می‌باشد.');
    }

    const accessMode = gym.access_mode || 'MIXED';

    // 2. Strict Gym Access Mode Check
    if (accessMode === 'FEMALE_ONLY' && userGender !== Gender.FEMALE) {
      throw new ForbiddenException('این مجموعه ورزشی کاملاً ویژه بانوان است و امکان پذیرش آقایان را ندارد.');
    }
    if (accessMode === 'MALE_ONLY' && userGender !== Gender.MALE) {
      throw new ForbiddenException('این مجموعه ورزشی کاملاً ویژه آقایان است و امکان پذیرش بانوان را ندارد.');
    }

    // 3. Timezone & Schedule Calculation in Asia/Tehran
    const { iranianDayOfWeek, currentTimeStr, dayNameFa } = getTehranTimeInfo();
    const prevDayOfWeek = (iranianDayOfWeek + 6) % 7;

    let sansList: any[] = [];
    if (this.db.isInMemory) {
      sansList = this.db.getTable('gym_sans').filter(
        s => s.gym_id === gymId && (s.day_of_week === iranianDayOfWeek || s.day_of_week === prevDayOfWeek)
      );
    } else {
      const res = await this.db.query(
        'SELECT * FROM gym_sans WHERE gym_id = $1 AND day_of_week IN ($2, $3)',
        [gymId, iranianDayOfWeek, prevDayOfWeek]
      );
      sansList = res.rows;
    }

    if (sansList.length === 0) {
      throw new BadRequestException(`مجموعه ورزشی در روز ${dayNameFa} فاقد سانس کاری فعال می‌باشد.`);
    }

    // 4. Find active sans matching user's gender (handles overnight sessions)
    const matchingSlot = sansList.find(
      s => s.gender === userGender && isSansActiveAt(s, iranianDayOfWeek, currentTimeStr)
    );
    if (matchingSlot) {
      return { isPeak: matchingSlot.is_peak };
    }

    // 5. If no matching slot for user's gender, check if currently open for the opposite gender
    const oppositeGenderSlot = sansList.find(
      s => isSansActiveAt(s, iranianDayOfWeek, currentTimeStr)
    );
    if (oppositeGenderSlot) {
      const activeGenderFa = oppositeGenderSlot.gender === Gender.FEMALE ? 'بانوان' : 'آقایان';
      const userGenderFa = userGender === Gender.FEMALE ? 'بانوان' : 'آقایان';
      throw new ForbiddenException(
        `تداخل سانس جنسیتی: در حال حاضر سانس اختصاصی ${activeGenderFa} برقرار است و امکان پذیرش ${userGenderFa} وجود ندارد.`
      );
    }

    // 6. Gym currently closed between sans shifts or outside operating hours
    throw new BadRequestException('مجموعه ورزشی در این ساعت دارای سانس فعال نمی‌باشد.');
  }

  private async countMonthlyVisits(userId: string, gymId: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    if (this.db.isInMemory) {
      const checkins = this.db.getTable('checkins');
      return checkins.filter(
        c => c.user_id === userId && c.gym_id === gymId && c.status === 'COMPLETED' && c.created_at >= thirtyDaysAgo
      ).length;
    }

    const res = await this.db.query(
      `SELECT COUNT(*) as count FROM checkins 
       WHERE user_id = $1 AND gym_id = $2 AND status = 'COMPLETED' AND created_at >= $3`,
      [userId, gymId, thirtyDaysAgo]
    );
    return parseInt(res.rows[0].count, 10);
  }

  private async validateTravelVelocity(userId: string, targetGymId: string, maxKmh: number): Promise<void> {
    let lastCheckin: any;
    let lastGym: any;
    if (this.db.isInMemory) {
      const checkins = this.db
        .getTable('checkins')
        .filter(c => c.user_id === userId && c.status === 'COMPLETED')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      lastCheckin = checkins[0];
      if (lastCheckin) {
        lastGym = this.db.getTable('gyms').find(g => g.id === lastCheckin.gym_id);
      }
    } else {
      const res = await this.db.query(
        `SELECT c.*, g.latitude, g.longitude FROM checkins c
         JOIN gyms g ON c.gym_id = g.id
         WHERE c.user_id = $1 AND c.status = 'COMPLETED'
         ORDER BY c.created_at DESC LIMIT 1`,
        [userId]
      );
      lastCheckin = res.rows[0];
    }

    if (!lastCheckin || lastCheckin.gym_id === targetGymId) {
      return; // Same gym handled by cooldown
    }

    const elapsedHours = (Date.now() - new Date(lastCheckin.created_at).getTime()) / (1000 * 3600);
    if (elapsedHours > 3) {
      return; // Normal transit window
    }

    // Target gym coordinates
    let targetGym: any;
    if (this.db.isInMemory) {
      targetGym = this.db.getTable('gyms').find(g => g.id === targetGymId);
    } else {
      const res = await this.db.query('SELECT latitude, longitude FROM gyms WHERE id = $1', [targetGymId]);
      targetGym = res.rows[0];
    }

    const originLat = lastCheckin.latitude ?? lastGym?.latitude;
    const originLon = lastCheckin.longitude ?? lastGym?.longitude;

    if (targetGym && originLat && targetGym.latitude) {
      const distKm = this.haversine(
        Number(originLat),
        Number(originLon),
        Number(targetGym.latitude),
        Number(targetGym.longitude)
      );
      const speedKmh = distKm / Math.max(elapsedHours, 0.05);

      if (speedKmh > maxKmh) {
        this.logger.warn(`[Velocity Fraud Alert] User: ${userId} | Speed: ${Math.round(speedKmh)} km/h | Dist: ${Math.round(distKm)} km`);
        throw new BadRequestException('جابجایی ناممکن جغرافیایی ثبت شد. لطفاً با پشتیبانی تماس بگیرید.');
      }
    }
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /**
   * Retrieves the member's personal check-in visit history.
   * STRICT SECURITY & PRIVACY BOUNDARY:
   * 1. Never leaks cryptographic nonce (`qr_nonce`).
   * 2. Never leaks internal B2B financial settlement payout (`monetary_payout_tomans`).
   * 3. Scoped strictly to the requesting member's userId.
   */
  async getUserCheckinHistory(userId: string): Promise<MemberCheckinHistoryItem[]> {
    if (this.db.isInMemory) {
      const checkins = this.db.getTable('checkins').filter(c => c.user_id === userId);
      const gyms = this.db.getTable('gyms');
      const sorted = [...checkins].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return sorted.map(c => {
        const gym = gyms.find(g => g.id === c.gym_id);
        return {
          id: c.id,
          gymId: c.gym_id,
          gymName: gym?.name_fa || 'باشگاه عضو پلتفرم',
          gymTier: gym?.tier || 'BASIC',
          creditsDebited: c.credits_debited,
          status: c.status,
          createdAt: c.created_at,
        };
      });
    }

    const res = await this.db.query(
      `SELECT c.id, c.gym_id, g.name_fa as gym_name, g.tier as gym_tier, 
              c.credits_debited, c.status, c.created_at
       FROM checkins c
       JOIN gyms g ON c.gym_id = g.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return res.rows.map(r => ({
      id: r.id,
      gymId: r.gym_id,
      gymName: r.gym_name,
      gymTier: r.gym_tier,
      creditsDebited: r.credits_debited,
      status: r.status,
      createdAt: r.created_at,
    }));
  }
}

