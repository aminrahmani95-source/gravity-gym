import { Module, Global } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MockSmsProvider } from './mock-sms.provider';

@Global()
@Module({
  providers: [NotificationsService, MockSmsProvider],
  exports: [NotificationsService, MockSmsProvider],
})
export class NotificationsModule {}
