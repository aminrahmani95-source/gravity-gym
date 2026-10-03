import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as crypto from 'crypto';
import { AppConfigService } from './common/config/app-config.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Validate production configuration and secrets fail-closed at bootstrap
  AppConfigService.validateEnvironment();

  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks for clean database pool and redis termination
  app.enableShutdownHooks();

  // Enable explicit CORS for Web client
  const allowedOrigins = AppConfigService.getWebOrigins();
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Request-Id',
    exposedHeaders: 'X-Request-Id',
    credentials: true,
  });

  // Security headers, Request Correlation & Payload Limiting
  app.use((req: any, res: any, next: any) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self)');
    res.removeHeader('X-Powered-By');
    next();
  });

  // Global Exception Filter (sanitizes 500 errors and prevents stack trace leakage)
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global NestJS Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global API Prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`================================================================`);
  logger.log(`🏋️ Iranian Fitness Membership Platform API Server Active`);
  logger.log(`📡 URL: http://localhost:${port}/api/v1`);
  logger.log(`🔐 Architecture: Modular Monolith with Decoupled Credit Ledger`);
  logger.log(`🌐 Persian RTL Ready & Shaparak Payment Abstraction Initialized`);
  logger.log(`================================================================`);
}

bootstrap();
