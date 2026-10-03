import { Module, forwardRef } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PlansModule } from '../plans/plans.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [
    AuthModule,
    LedgerModule,
    PlansModule,
    forwardRef(() => ClassesModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
