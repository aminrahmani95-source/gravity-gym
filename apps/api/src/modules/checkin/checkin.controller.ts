import { Controller, Post, Get, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { CheckinService } from './checkin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@gym-app/shared-types';
import { GenerateQrDto, VerifyCheckinDto } from './dto/checkin.dto';

@Controller('checkin')
@UseGuards(JwtAuthGuard)
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  /**
   * User generates a short-lived (45s) dynamic QR code for entry
   */
  @Post('generate-qr')
  async generateQr(
    @CurrentUser('sub') userId: string,
    @Body() dto: GenerateQrDto,
  ) {
    return this.checkinService.generateDynamicQr(userId, dto.gymId, dto.clientLat, dto.clientLng);
  }

  /**
   * Gym Reception counter scans the member's dynamic QR code.
   * Executes the 8-Stage Server-Side Validation Pipeline and returns the Privacy-Compliant Confirmation.
   */
  @Post('reception-verify')
  @UseGuards(RolesGuard)
  @Roles(UserRole.GYM_STAFF, UserRole.GYM_OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async receptionVerify(
    @CurrentUser('sub') staffUserId: string,
    @CurrentUser('assignedGymId') staffGymId: string,
    @CurrentUser('role') staffRole: UserRole,
    @Body() dto: VerifyCheckinDto,
  ) {
    if ((staffRole === UserRole.GYM_STAFF || staffRole === UserRole.GYM_OWNER) && !staffGymId) {
      throw new ForbiddenException('حساب کاربری پرسنل به هیچ مجموعه ورزشی معتبری منتسب نشده است.');
    }
    return this.checkinService.verifyAndConsumeCheckin(dto.qrToken, staffUserId, staffGymId);
  }

  /**
   * Member retrieves their personal visit and check-in history.
   * Scoped exclusively to the authenticated user.
   */
  @Get('history')
  async getMyHistory(@CurrentUser('sub') userId: string) {
    return this.checkinService.getUserCheckinHistory(userId);
  }
}

