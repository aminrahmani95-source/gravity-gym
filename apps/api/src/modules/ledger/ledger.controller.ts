import { Controller, Get, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('summary')
  async getWalletSummary(@CurrentUser('sub') userId: string) {
    return this.ledgerService.getWalletSummary(userId);
  }

  @Get('invariants-audit')
  async auditMyLedger(@CurrentUser('sub') userId: string) {
    return this.ledgerService.verifyLedgerInvariants(userId);
  }
}
