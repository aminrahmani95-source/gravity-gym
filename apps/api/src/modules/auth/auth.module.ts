import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AppConfigService } from '../../common/config/app-config.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: AppConfigService.getJwtSecret(),
        signOptions: { expiresIn: '72h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
