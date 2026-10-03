import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Retrieves the authenticated member's subscription lifecycle details:
   * state: ACTIVE | EXPIRING_SOON | EXPIRED | NO_ACTIVE_SUBSCRIPTION
   * includes remaining days, total days, dates, plan details, and credit stats.
   */
  @Get('me')
  async getMySubscriptionDetails(@CurrentUser('sub') userId: string) {
    return this.plansService.getMemberSubscriptionDetails(userId);
  }
}
