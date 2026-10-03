import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Plan,
  Subscription,
  SubscriptionStatus,
  MemberSubscriptionDetails,
  SubscriptionLifecycleState,
} from '@gym-app/shared-types';

@Injectable()
export class PlansService {
  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async getAll(): Promise<Plan[]> {
    if (this.db.isInMemory) {
      return [...this.db.getTable('plans')]
        .filter(p => p.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(this.mapPlan);
    }

    const res = await this.db.query('SELECT * FROM plans WHERE is_active = true ORDER BY sort_order ASC');
    return res.rows.map(this.mapPlan);
  }

  async getById(id: string): Promise<Plan> {
    if (this.db.isInMemory) {
      const p = this.db.getTable('plans').find(x => x.id === id);
      if (!p) throw new NotFoundException('پلن مورد نظر یافت نشد.');
      return this.mapPlan(p);
    }

    const res = await this.db.query('SELECT * FROM plans WHERE id = $1', [id]);
    if (!res.rows[0]) throw new NotFoundException('پلن مورد نظر یافت نشد.');
    return this.mapPlan(res.rows[0]);
  }

  async getUserSubscription(userId: string): Promise<Subscription | null> {
    if (this.db.isInMemory) {
      const subs = this.db.getTable('subscriptions').filter(s => s.user_id === userId && s.status === 'ACTIVE');
      if (subs.length === 0) return null;
      const latest = subs[subs.length - 1];
      const plan = await this.getById(latest.plan_id);
      return {
        id: latest.id,
        userId: latest.user_id,
        planId: latest.plan_id,
        plan,
        startsAt: latest.starts_at,
        expiresAt: latest.expires_at,
        status: latest.status as SubscriptionStatus,
        autoRenew: latest.auto_renew,
      };
    }

    const res = await this.db.query(
      `SELECT s.* FROM subscriptions s 
       WHERE s.user_id = $1 AND s.status = 'ACTIVE' 
       ORDER BY s.expires_at DESC LIMIT 1`,
      [userId]
    );

    if (!res.rows[0]) return null;
    const plan = await this.getById(res.rows[0].plan_id);
    return {
      id: res.rows[0].id,
      userId: res.rows[0].user_id,
      planId: res.rows[0].plan_id,
      plan,
      startsAt: res.rows[0].starts_at,
      expiresAt: res.rows[0].expires_at,
      status: res.rows[0].status as SubscriptionStatus,
      autoRenew: res.rows[0].auto_renew,
    };
  }

  /**
   * Retrieves comprehensive member subscription lifecycle state and details.
   * Handles: ACTIVE, EXPIRING_SOON, EXPIRED, NO_ACTIVE_SUBSCRIPTION.
   */
  async getMemberSubscriptionDetails(userId: string): Promise<MemberSubscriptionDetails> {
    let latestSub: any = null;
    let currentBalance = 0;

    if (this.db.isInMemory) {
      const subs = this.db.getTable('subscriptions').filter(s => s.user_id === userId);
      if (subs.length > 0) {
        latestSub = subs[subs.length - 1];
      }
      const ledgerEntries = this.db.getTable('credit_ledger').filter(e => e.user_id === userId);
      currentBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance_after : 0;
    } else {
      const subRes = await this.db.query(
        `SELECT s.* FROM subscriptions s 
         WHERE s.user_id = $1 
         ORDER BY s.created_at DESC LIMIT 1`,
        [userId]
      );
      latestSub = subRes.rows[0] || null;

      const balRes = await this.db.query(
        `SELECT balance_after FROM credit_ledger 
         WHERE user_id = $1 
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      currentBalance = balRes.rows[0]?.balance_after ?? 0;
    }

    if (!latestSub) {
      return {
        state: 'NO_ACTIVE_SUBSCRIPTION',
        stats: {
          totalCreditsAwarded: 0,
          availableCredits: currentBalance,
          consumedCredits: 0,
        },
      };
    }

    const plan = await this.getById(latestSub.plan_id);
    const now = new Date();
    const startsAt = new Date(latestSub.starts_at);
    const expiresAt = new Date(latestSub.expires_at);
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
    const totalDays = Math.max(1, Math.round((expiresAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24)));

    let state: SubscriptionLifecycleState;
    if (latestSub.status === SubscriptionStatus.EXPIRED || remainingMs <= 0) {
      state = 'EXPIRED';
    } else if (latestSub.status === SubscriptionStatus.ACTIVE) {
      state = remainingDays <= 3 ? 'EXPIRING_SOON' : 'ACTIVE';
    } else {
      state = 'EXPIRED';
    }

    const totalCreditsAwarded = plan.creditsAwarded;
    const consumedCredits = Math.max(0, totalCreditsAwarded - currentBalance);

    return {
      state,
      subscription: {
        id: latestSub.id,
        planId: latestSub.plan_id,
        planTitle: plan.titleFa,
        startsAt: latestSub.starts_at,
        expiresAt: latestSub.expires_at,
        status: latestSub.status as SubscriptionStatus,
        autoRenew: latestSub.auto_renew,
        remainingDays,
        totalDays,
      },
      plan,
      stats: {
        totalCreditsAwarded,
        availableCredits: currentBalance,
        consumedCredits,
      },
    };
  }

  async processSubscriptionExpiration(subscriptionId: string): Promise<{
    subscriptionId: string;
    previousStatus: string;
    newStatus: string;
    preservedRolloverCredits: number;
    expiredExcessCredits: number;
  }> {
    return this.db.withTransaction(async (client) => {
      let sub: any;
      if (this.db.isInMemory) {
        sub = this.db.getTable('subscriptions').find(s => s.id === subscriptionId);
      } else {
        const res = await client.query('SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE', [subscriptionId]);
        sub = res.rows[0];
      }

      if (!sub) {
        throw new NotFoundException('اشتراک مورد نظر یافت نشد.');
      }

      const previousStatus = sub.status;

      // Idempotency check: If subscription is already EXPIRED, do not process again
      if (previousStatus === SubscriptionStatus.EXPIRED) {
        return {
          subscriptionId,
          previousStatus: SubscriptionStatus.EXPIRED,
          newStatus: SubscriptionStatus.EXPIRED,
          preservedRolloverCredits: 0,
          expiredExcessCredits: 0,
        };
      }

      // Lock user row to serialize credit operations
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [sub.user_id]);

      // Check if an excess expiration debit was already executed for this subscription
      let alreadySwept = false;
      if (this.db.isInMemory) {
        const entries = this.db.getTable('credit_ledger').filter(
          e => e.user_id === sub.user_id &&
               e.entry_type === 'CREDIT_EXPIRATION_EXCESS' &&
               e.reference_id === subscriptionId
        );
        if (entries.length > 0) alreadySwept = true;
      } else {
        const sweepRes = await client.query(
          `SELECT id FROM credit_ledger 
           WHERE user_id = $1 AND entry_type = $2 AND reference_id = $3 LIMIT 1`,
          [sub.user_id, 'CREDIT_EXPIRATION_EXCESS', subscriptionId]
        );
        if (sweepRes.rows && sweepRes.rows.length > 0) alreadySwept = true;
      }

      if (alreadySwept) {
        if (this.db.isInMemory) {
          sub.status = SubscriptionStatus.EXPIRED;
        } else {
          await client.query('UPDATE subscriptions SET status = $1 WHERE id = $2', [
            SubscriptionStatus.EXPIRED,
            subscriptionId,
          ]);
        }
        return {
          subscriptionId,
          previousStatus,
          newStatus: SubscriptionStatus.EXPIRED,
          preservedRolloverCredits: 0,
          expiredExcessCredits: 0,
        };
      }

      const plan = await this.getById(sub.plan_id);

      // Calculate rollover cap: 10% of awarded credits, capped at 5 credits
      const cap = Math.min(5, plan.maxRolloverCredits || 5, Math.floor(plan.creditsAwarded * (plan.rolloverPercentage || 0.10)));

      let currentBalance = 0;
      if (this.db.isInMemory) {
        const entries = this.db.getTable('credit_ledger').filter(e => e.user_id === sub.user_id);
        currentBalance = entries.length > 0 ? entries[entries.length - 1].balance_after : 0;
      } else {
        const res = await client.query(
          'SELECT balance_after FROM credit_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [sub.user_id],
        );
        currentBalance = res.rows[0]?.balance_after ?? 0;
      }

      // Determine credits granted by other active, non-expired subscriptions.
      // Preserves newer subscription credits when expiring an old cycle.
      let otherActiveCredits = 0;
      const now = new Date();

      if (this.db.isInMemory) {
        const otherActiveSubs = this.db.getTable('subscriptions').filter((s: any) =>
          s.user_id === sub.user_id &&
          s.id !== subscriptionId &&
          s.status === SubscriptionStatus.ACTIVE &&
          new Date(s.expires_at) > now
        );
        for (const otherSub of otherActiveSubs) {
          const otherPlan = this.db.getTable('plans').find((p: any) => p.id === otherSub.plan_id);
          if (otherPlan) {
            otherActiveCredits += Number(otherPlan.credits_awarded || 0);
          }
        }
      } else {
        const otherRes = await client.query(
          `SELECT COALESCE(SUM(p.credits_awarded), 0) as total_credits
           FROM subscriptions s
           JOIN plans p ON s.plan_id = p.id
           WHERE s.user_id = $1 
             AND s.id != $2 
             AND s.status = 'ACTIVE' 
             AND s.expires_at > NOW()`,
          [sub.user_id, subscriptionId]
        );
        otherActiveCredits = Number(otherRes.rows[0]?.total_credits ?? 0);
      }

      // Attribution: Unspent credits that originated from this expiring cycle
      const unspentFromThisSub = Math.max(0, currentBalance - otherActiveCredits);

      let preservedRolloverCredits = 0;
      let expiredExcessCredits = 0;

      if (unspentFromThisSub > cap) {
        preservedRolloverCredits = cap;
        expiredExcessCredits = unspentFromThisSub - cap;
        // Invariant: never debit more than current balance to prevent negative balance
        expiredExcessCredits = Math.min(expiredExcessCredits, Math.max(0, currentBalance));

        if (expiredExcessCredits > 0) {
          const newId = crypto.randomUUID();
          const nowIso = new Date().toISOString();
          const balanceAfter = currentBalance - expiredExcessCredits;

          if (this.db.isInMemory) {
            this.db.getTable('credit_ledger').push({
              id: newId,
              user_id: sub.user_id,
              delta_credits: -expiredExcessCredits,
              balance_after: balanceAfter,
              entry_type: 'CREDIT_EXPIRATION_EXCESS',
              reference_id: subscriptionId,
              description: `انقضای مازاد اعتبارات دوره (سقف انتقال ۱۰٪ حداکثر ${cap} اعتبار)`,
              created_at: nowIso,
            });
          } else {
            await client.query(
              `INSERT INTO credit_ledger (id, user_id, delta_credits, balance_after, entry_type, reference_id, description, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                newId,
                sub.user_id,
                -expiredExcessCredits,
                balanceAfter,
                'CREDIT_EXPIRATION_EXCESS',
                subscriptionId,
                `انقضای مازاد اعتبارات دوره (سقف انتقال ۱۰٪ حداکثر ${cap} اعتبار)`,
                nowIso,
              ],
            );
          }
        }
      } else {
        preservedRolloverCredits = unspentFromThisSub;
        expiredExcessCredits = 0;
      }

      // Mark subscription status as EXPIRED
      if (this.db.isInMemory) {
        sub.status = SubscriptionStatus.EXPIRED;
      } else {
        await client.query('UPDATE subscriptions SET status = $1 WHERE id = $2', [
          SubscriptionStatus.EXPIRED,
          subscriptionId,
        ]);
      }

      return {
        subscriptionId,
        previousStatus,
        newStatus: SubscriptionStatus.EXPIRED,
        preservedRolloverCredits,
        expiredExcessCredits,
      };
    });
  }

  async notifyExpiringSubscriptions(warningDays: number = 3): Promise<number> {
    if (!this.notificationsService) return 0;
    const now = new Date();
    const thresholdDate = new Date(Date.now() + warningDays * 24 * 60 * 60 * 1000);
    let notifiedCount = 0;

    let expiringSubs: any[] = [];
    if (this.db.isInMemory) {
      expiringSubs = this.db.getTable('subscriptions').filter((s: any) => {
        if (s.status !== 'ACTIVE') return false;
        const exp = new Date(s.expires_at);
        return exp > now && exp <= thresholdDate;
      });
    } else {
      const res = await this.db.query(
        `SELECT s.*, p.title_fa as plan_title, u.phone_number 
         FROM subscriptions s
         JOIN plans p ON s.plan_id = p.id
         JOIN users u ON s.user_id = u.id
         WHERE s.status = 'ACTIVE' AND s.expires_at > NOW() AND s.expires_at <= $1`,
        [thresholdDate.toISOString()]
      );
      expiringSubs = res.rows;
    }

    for (const sub of expiringSubs) {
      try {
        let phone = sub.phone_number;
        let planTitle = sub.plan_title;
        if (!phone) {
          const userRes = await this.db.query('SELECT phone_number FROM users WHERE id = $1', [sub.user_id]);
          phone = userRes.rows[0]?.phone_number;
        }
        if (!planTitle) {
          const plan = await this.getById(sub.plan_id);
          planTitle = plan.titleFa;
        }
        const diffMs = new Date(sub.expires_at).getTime() - now.getTime();
        const daysRemaining = Math.max(1, Math.ceil(diffMs / (1000 * 3600 * 24)));
        if (phone) {
          await this.notificationsService.notifyExpiringSoon(phone, planTitle, daysRemaining);
          notifiedCount++;
        }
      } catch {
        // Safe isolation
      }
    }

    return notifiedCount;
  }

  private mapPlan(row: any): Plan {

    return {
      id: row.id,
      slug: row.slug,
      titleFa: row.title_fa,
      priceTomans: Number(row.price_tomans),
      creditsAwarded: row.credits_awarded,
      validityDays: row.validity_days,
      rolloverPercentage: Number(row.rollover_percentage),
      maxRolloverCredits: row.max_rollover_credits,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    };
  }
}

