import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memoryStore: Map<string, { value: string; expiresAt?: number }> = new Map();
  private isMemoryMode = false;

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;
    if (process.env.NODE_ENV === 'production') {
      if (!redisUrl) {
        throw new Error('FATAL SECURITY ERROR: REDIS_URL is not set in production. In-memory Redis fallback is strictly forbidden in production mode.');
      }
      try {
        this.client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          connectTimeout: 3000,
        });
        await this.client.ping();
        this.logger.log('Connected to Redis successfully in production mode.');
        return;
      } catch (err) {
        throw new Error(`FATAL SECURITY ERROR: Redis connection failed in production mode (${(err as Error).message}). Refusing to run in-memory fallback.`);
      }
    }

    if (redisUrl && process.env.NODE_ENV !== 'test') {
      try {
        this.client = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: () => null // Don't retry endlessly if Redis is down locally
        });

        this.client.on('error', (err) => {
          if (!this.isMemoryMode) {
            this.logger.warn(`Redis connection error (${err.message}). Activating In-Memory cache & Redlock emulator.`);
            this.isMemoryMode = true;
          }
        });

        await this.client.ping();
        this.logger.log('Connected to Redis server successfully.');
        return;
      } catch (err) {
        this.logger.warn(`Redis not accessible (${(err as Error).message}). Using In-Memory fallback.`);
      }
    }

    this.isMemoryMode = true;
    this.logger.log('In-Memory Redis & Distributed Mutex Emulator active.');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  get isInMemory(): boolean {
    return this.isMemoryMode;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; mode: 'redis' | 'in-memory'; error?: string }> {
    const start = Date.now();
    try {
      if (this.client && !this.isMemoryMode) {
        await this.client.ping();
        return { ok: true, latencyMs: Date.now() - start, mode: 'redis' };
      }
      return { ok: true, latencyMs: Date.now() - start, mode: 'in-memory' };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        mode: this.isMemoryMode ? 'in-memory' : 'redis',
        error: (err as Error).message,
      };
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.client && !this.isMemoryMode) {
      try {
        return await this.client.get(key);
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`CRITICAL SECURITY FAILURE: Redis get failed in production mode (${(err as Error).message}). Refusing unsafe in-memory fallback.`);
        }
      }
    }

    this.cleanExpired(key);
    const item = this.memoryStore.get(key);
    return item ? item.value : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client && !this.isMemoryMode) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`CRITICAL SECURITY FAILURE: Redis set failed in production mode (${(err as Error).message}). Refusing unsafe in-memory fallback.`);
        }
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.memoryStore.set(key, { value, expiresAt });
  }

  async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.client && !this.isMemoryMode) {
      try {
        if (ttlSeconds) {
          const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
          return res === 'OK';
        } else {
          const res = await this.client.setnx(key, value);
          return res === 1;
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`CRITICAL SECURITY FAILURE: Redis setnx failed in production mode (${(err as Error).message}). Refusing unsafe in-memory fallback.`);
        }
      }
    }

    this.cleanExpired(key);
    if (this.memoryStore.has(key)) {
      return false;
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.memoryStore.set(key, { value, expiresAt });
    return true;
  }

  async del(key: string): Promise<number> {
    if (this.client && !this.isMemoryMode) {
      try {
        return await this.client.del(key);
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`CRITICAL SECURITY FAILURE: Redis del failed in production mode (${(err as Error).message}). Refusing unsafe in-memory fallback.`);
        }
      }
    }

    const had = this.memoryStore.delete(key);
    return had ? 1 : 0;
  }

  /**
   * Distributed Lock Primitive (Redlock)
   * Prevents concurrent check-ins or race conditions across terminals
   */
  async acquireLock(resource: string, ttlMs = 10000): Promise<{ lockId: string } | null> {
    const lockKey = `lock:${resource}`;
    const lockId = crypto.randomUUID();
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    const acquired = await this.setnx(lockKey, lockId, ttlSeconds);
    if (acquired) {
      return { lockId };
    }
    return null;
  }

  async releaseLock(resource: string, lockId: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;
    const current = await this.get(lockKey);
    if (current === lockId) {
      await this.del(lockKey);
      return true;
    }
    return false;
  }

  private cleanExpired(key: string) {
    const item = this.memoryStore.get(key);
    if (item && item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
    }
  }
}
