import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { EconomicsService } from './economics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@gym-app/shared-types';
import { ValidateBoundingDto, UpdateClubPricingDto, RecommendTierDto } from './dto/economics.dto';

@Controller('economics')
export class EconomicsController {
  constructor(private readonly economicsService: EconomicsService) {}

  @Get('rules')
  async getSystemRules() {
    return this.economicsService.getSystemRules();
  }

  @Get('validate-bounding')
  async validateBoundingGet(
    @Query('creditCost') creditCost?: string,
    @Query('monetaryPayoutTomans') monetaryPayoutTomans?: string,
  ) {
    return this.economicsService.validateGoldenBounding(
      Number(creditCost) || 0,
      Number(monetaryPayoutTomans) || 0,
    );
  }

  @Post('validate-bounding')
  async validateBoundingPost(
    @Body() dto: ValidateBoundingDto,
  ) {
    return this.economicsService.validateGoldenBounding(dto.creditCost, dto.monetaryPayoutTomans);
  }

  @Put('gym-pricing/:gymId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateClubPricing(
    @Param('gymId') gymId: string,
    @Body() dto: UpdateClubPricingDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.economicsService.setClubPricingOverride(gymId, dto, adminId);
  }

  @Get('recommend-tier')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async recommendTierGet(
    @Query('retailWalkinPrice') retailWalkinPrice?: string,
    @Query('retailMonthlyPrice') retailMonthlyPrice?: string,
    @Query('facilityIndex') facilityIndex?: string,
    @Query('locationIndex') locationIndex?: string,
  ) {
    return this.economicsService.calculateTierRecommendation(
      Number(retailWalkinPrice) || 0,
      Number(retailMonthlyPrice) || 0,
      Number(facilityIndex) || 0,
      Number(locationIndex) || 0,
    );
  }

  @Post('recommend-tier')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async recommendTierPost(
    @Body() dto: RecommendTierDto,
  ) {
    return this.economicsService.calculateTierRecommendation(
      dto.retailWalkinPrice,
      dto.retailMonthlyPrice,
      dto.facilityIndex,
      dto.locationIndex,
    );
  }
}
