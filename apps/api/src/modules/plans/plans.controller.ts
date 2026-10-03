import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async getAll() {
    return this.plansService.getAll();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.plansService.getById(id);
  }

  @Get('user/current-subscription')
  @UseGuards(JwtAuthGuard)
  async getCurrentSubscription(@CurrentUser('sub') userId: string) {
    return this.plansService.getUserSubscription(userId);
  }

  @Get('user/subscription-details')
  @UseGuards(JwtAuthGuard)
  async getSubscriptionDetails(@CurrentUser('sub') userId: string) {
    return this.plansService.getMemberSubscriptionDetails(userId);
  }
}

