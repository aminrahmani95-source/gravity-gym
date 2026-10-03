import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@gym-app/shared-types';
import { GenerateSettlementBatchDto, ApproveSettlementBatchDto } from './dto/settlement.dto';

@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  async getBatches(@Query('gymId') gymId?: string) {
    return this.settlementsService.getSettlementBatches(gymId);
  }

  @Get(':batchId')
  async getBatchById(@Param('batchId') batchId: string) {
    return this.settlementsService.getSettlementBatchById(batchId);
  }

  @Post('generate-batch/:gymId')
  async generateBatch(
    @Param('gymId') gymId: string,
    @Body() dto: GenerateSettlementBatchDto,
  ) {
    return this.settlementsService.generateSettlementBatch(gymId, dto.cycleStart, dto.cycleEnd);
  }

  @Post('approve/:batchId')
  async approveBatch(
    @Param('batchId') batchId: string,
    @Body() dto: ApproveSettlementBatchDto,
  ) {
    return this.settlementsService.approveAndDisburse(batchId, dto.bankReferenceRrn);
  }
}
