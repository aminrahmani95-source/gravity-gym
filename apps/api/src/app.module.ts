import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AppConfigModule } from './common/config/app-config.module';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { GymsModule } from './modules/gyms/gyms.module';
import { PlansModule } from './modules/plans/plans.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { EconomicsModule } from './modules/economics/economics.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SettlementsModule } from './modules/settlements/settlements.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CoachesModule } from './modules/coaches/coaches.module';
import { ClassesModule } from './modules/classes/classes.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    GymsModule,
    PlansModule,
    LedgerModule,
    EconomicsModule,
    CheckinModule,
    PaymentsModule,
    SettlementsModule,
    AdminModule,
    NotificationsModule,
    CoachesModule,
    ClassesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
