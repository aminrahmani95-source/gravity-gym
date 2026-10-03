import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { CoachesService } from './coaches.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  UserRole,
  CoachVerificationStatus,
  CreateCoachProfileDto,
  UpdateCoachProfileDto,
} from '@gym-app/shared-types';

@Controller('coaches')
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  /**
   * Public: List all verified and active coaches.
   */
  @Get()
  async getPublicCoaches() {
    return this.coachesService.getAll(CoachVerificationStatus.VERIFIED, true);
  }

  /**
   * Coach / Authenticated: Get my own coach profile.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@CurrentUser('sub') userId: string) {
    const coach = await this.coachesService.getByUserId(userId);
    if (!coach) {
      throw new NotFoundException('پروفایل مربیگری برای این کاربر ثبت نشده است.');
    }
    return coach;
  }

  /**
   * Public / Authenticated Member: Submit application to become a coach.
   * Creates PENDING coach application without granting privileged role.
   */
  @Post('apply')
  @UseGuards(JwtAuthGuard)
  async applyForCoach(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateCoachProfileDto,
  ) {
    return this.coachesService.applyForCoach(userId, dto);
  }

  /**
   * Verified Coach: Update my own coach profile.
   */
  @Put('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateMyProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateCoachProfileDto,
  ) {
    return this.coachesService.updateProfile(userId, dto);
  }

  /**
   * Backward-compatible delegation.
   */
  @Post('me')
  @UseGuards(JwtAuthGuard)
  async createOrUpdateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateCoachProfileDto | UpdateCoachProfileDto,
  ) {
    return this.coachesService.createOrUpdateProfile(userId, dto);
  }

  /**
   * Coach / Admin: Get comprehensive financial overview and earnings ledger.
   */
  @Get('me/financials')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getMyFinancials(@CurrentUser('sub') userId: string) {
    const coach = await this.coachesService.getByUserId(userId);
    if (!coach) {
      throw new NotFoundException('پروفایل مربیگری یافت نشد.');
    }
    return this.coachesService.getFinancialOverview(coach.id);
  }

  /**
   * Admin / Super Admin: Directly provision a new verified Coach.
   */
  @Post('admin/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adminCreateCoach(
    @CurrentUser('sub') adminId: string,
    @Body() dto: any,
  ) {
    return this.coachesService.createCoachByAdmin(adminId, dto);
  }

  /**
   * Admin: List all coaches with filtering.
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAdminCoaches(
    @Query('status') status?: CoachVerificationStatus,
    @Query('onlyActive') onlyActive?: string,
  ) {
    return this.coachesService.getAll(status, onlyActive === 'true');
  }

  /**
   * Admin: Verify coach or update verification status / commission rate.
   */
  @Put('admin/:id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verifyCoach(
    @CurrentUser('sub') adminId: string,
    @Param('id') coachId: string,
    @Body() body: { status: CoachVerificationStatus; commissionRate?: number },
  ) {
    return this.coachesService.verifyCoach(adminId, coachId, body.status, body.commissionRate);
  }

  /**
   * Admin: Generate a settlement batch for a coach over a cycle.
   */
  @Post('admin/:id/settlements/generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateSettlement(
    @Param('id') coachId: string,
    @Body() body: { cycleStart: string; cycleEnd: string },
  ) {
    return this.coachesService.generateSettlementBatch(coachId, body.cycleStart, body.cycleEnd);
  }

  /**
   * Admin: Disburse settlement batch via Paya.
   */
  @Post('admin/settlements/:batchId/disburse')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async disburseSettlement(
    @CurrentUser('sub') adminId: string,
    @Param('batchId') batchId: string,
    @Body() body: { rrn?: string; payaId?: string },
  ) {
    return this.coachesService.approveAndDisburseSettlement(batchId, adminId, body.rrn, body.payaId);
  }

  /**
   * Admin: List all coach settlement batches.
   */
  @Get('admin/settlements')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAdminSettlements(@Query('coachId') coachId?: string) {
    return this.coachesService.getSettlementBatches(coachId);
  }

  /**
   * Public: Get coach profile by ID.
   */
  @Get(':id')
  async getCoachById(@Param('id') id: string) {
    return this.coachesService.getById(id);
  }
}
