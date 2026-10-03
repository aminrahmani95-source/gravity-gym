import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

export const KNOWN_INSECURE_DEV_SECRETS = new Set([
  'fallback_development_secret_minimum_32_characters_here',
  'secure_production_hmac_secret_key_minimum_32_characters',
  'super_secret_jwt_key_iranian_fitness_platform_2026_dev',
  'secure_hmac_secret_for_dynamic_rotating_qr_minimum_32_chars',
]);

export const DEFAULT_DEV_JWT_SECRET = 'fallback_development_secret_minimum_32_characters_here';
export const DEFAULT_DEV_QR_SECRET = 'secure_production_hmac_secret_key_minimum_32_characters';

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);

  onModuleInit() {
    AppConfigService.validateEnvironment();
    this.logger.log(`Environment configuration verified (NODE_ENV=${process.env.NODE_ENV || 'development'}).`);
  }

  /**
   * Centralized bootstrap validator.
   * Throws immediately with a fatal error if production environment variables are missing,
   * shorter than 32 characters, or configured with known development fallback strings.
   */
  static validateEnvironment(): void {
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) {
      return;
    }

    // 1. Validate JWT_SECRET
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: JWT_SECRET is not set in production mode. ' +
        'Insecure fallback defaults are strictly forbidden in production.'
      );
    }
    if (jwtSecret.length < 32) {
      throw new Error(
        `FATAL CONFIGURATION ERROR: JWT_SECRET must be at least 32 characters long in production (current length: ${jwtSecret.length}).`
      );
    }
    if (KNOWN_INSECURE_DEV_SECRETS.has(jwtSecret)) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: JWT_SECRET is configured with a known insecure development fallback string in production mode.'
      );
    }

    // 2. Validate QR_SIGNING_SECRET
    const qrSecret = process.env.QR_SIGNING_SECRET;
    if (!qrSecret) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: QR_SIGNING_SECRET is not set in production mode. ' +
        'Insecure fallback defaults are strictly forbidden in production.'
      );
    }
    if (qrSecret.length < 32) {
      throw new Error(
        `FATAL CONFIGURATION ERROR: QR_SIGNING_SECRET must be at least 32 characters long in production (current length: ${qrSecret.length}).`
      );
    }
    if (KNOWN_INSECURE_DEV_SECRETS.has(qrSecret)) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: QR_SIGNING_SECRET is configured with a known insecure development fallback string in production mode.'
      );
    }

    // 3. Validate WEB_ORIGIN
    const webOrigin = process.env.WEB_ORIGIN;
    if (!webOrigin) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: WEB_ORIGIN is not set in production mode. ' +
        'Explicit CORS origin configuration is required.'
      );
    }
    if (webOrigin.includes('*')) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: WEB_ORIGIN cannot be wildcard "*" when credentials are enabled in production mode.'
      );
    }

    // 4. Validate DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: DATABASE_URL is not set in production mode. ' +
        'Live PostgreSQL database connection string is strictly required.'
      );
    }
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: DATABASE_URL must start with "postgresql://" or "postgres://".'
      );
    }

    // 5. Validate REDIS_URL
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: REDIS_URL is not set in production mode. ' +
        'Live Redis connection string is strictly required.'
      );
    }
    if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
      throw new Error(
        'FATAL CONFIGURATION ERROR: REDIS_URL must start with "redis://" or "rediss://".'
      );
    }
  }

  static getJwtSecret(): string {
    AppConfigService.validateEnvironment();
    return process.env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
  }

  static getQrSecret(): string {
    AppConfigService.validateEnvironment();
    return process.env.QR_SIGNING_SECRET || DEFAULT_DEV_QR_SECRET;
  }

  static getWebOrigins(): string[] | string {
    const originEnv = process.env.WEB_ORIGIN;
    if (originEnv) {
      const origins = originEnv.split(',').map((o) => o.trim()).filter(Boolean);
      return origins.length === 1 ? origins[0] : origins;
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL CONFIGURATION ERROR: WEB_ORIGIN must be configured in production mode.');
    }
    // Safe development loopback defaults
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  get jwtSecret(): string {
    return AppConfigService.getJwtSecret();
  }

  get qrSecret(): string {
    return AppConfigService.getQrSecret();
  }

  get webOrigins(): string[] | string {
    return AppConfigService.getWebOrigins();
  }
}
