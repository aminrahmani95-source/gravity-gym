import { Module } from '@nestjs/common';
import { EconomicsService } from './economics.service';
import { EconomicsController } from './economics.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EconomicsController],
  providers: [EconomicsService],
  exports: [EconomicsService],
})
export class EconomicsModule {}
