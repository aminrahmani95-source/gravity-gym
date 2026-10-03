import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from './common/database/database.service';
import { RedisService } from './common/redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  check() {
    return this.liveness();
  }

  @Get('live')
  liveness() {
    return {
      status: 'ok',
      service: 'gravity-api',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  async readiness() {
    const isProduction = process.env.NODE_ENV === 'production';
    const [dbHealth, redisHealth] = await Promise.all([
      this.db.ping(),
      this.redis.ping(),
    ]);

    // In production, failure to reach real PostgreSQL or real Redis is degraded/unhealthy
    const isDbUnhealthy = !dbHealth.ok || (isProduction && dbHealth.mode === 'in-memory');
    const isRedisUnhealthy = !redisHealth.ok || (isProduction && redisHealth.mode === 'in-memory');

    const healthy = !isDbUnhealthy && !isRedisUnhealthy;

    const payload = {
      status: healthy ? 'ok' : 'degraded',
      service: 'gravity-api',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      dependencies: {
        database: dbHealth,
        redis: redisHealth,
      },
    };

    if (!healthy) {
      throw new HttpException(payload, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return payload;
  }

  @Get('metrics')
  metrics() {
    const mem = process.memoryUsage();
    return {
      service: 'gravity-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssBytes: mem.rss,
        heapTotalBytes: mem.heapTotal,
        heapUsedBytes: mem.heapUsed,
        externalBytes: mem.external,
      },
      database: {
        mode: this.db.isInMemory ? 'in-memory' : 'postgresql',
        totalQueriesExecuted: this.db.getQueryCount(),
      },
      redis: {
        mode: this.redis.isInMemory ? 'in-memory' : 'redis',
      },
    };
  }
}
