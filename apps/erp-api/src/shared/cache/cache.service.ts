import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private fallbackCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private useRedis: boolean = false;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redisClient: any,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    if (this.redisClient && this.redisClient.status === 'ready') {
      this.useRedis = true;
      this.logger.log('✅ [CacheService] Usando Redis para cache distribuido');
    } else {
      this.useRedis = false;
      this.logger.warn('⚠️ [CacheService] Redis no disponible, usando cache en memoria (fallback)');
    }
  }

  async onModuleDestroy() {
    if (this.redisClient && this.redisClient.status === 'ready') {
      await this.redisClient.quit();
    }
  }

  /** Comprobación activa de Redis usada sólo por readiness. */
  async getRuntimeHealth(): Promise<{
    ready: boolean;
    required: boolean;
    status: string;
    mode: 'redis' | 'memory';
  }> {
    const configured = this.configService.get<string | boolean>('REDIS_REQUIRED');
    const required = configured === true || configured === 'true'
      || this.configService.get<string>('NODE_ENV') === 'production';
    const status = String(this.redisClient?.status ?? 'missing');
    if (!required) {
      return { ready: true, required, status, mode: this.useRedis ? 'redis' : 'memory' };
    }
    if (!this.redisClient || status !== 'ready') {
      return { ready: false, required, status, mode: 'memory' };
    }
    try {
      const pong = await this.redisClient.ping();
      return { ready: pong === 'PONG', required, status, mode: 'redis' };
    } catch {
      return { ready: false, required, status: String(this.redisClient.status ?? 'error'), mode: 'redis' };
    }
  }

  /**
   * Obtiene un valor del cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.useRedis && this.redisClient.status === 'ready') {
        const value = await this.redisClient.get(key);
        if (value) {
          return JSON.parse(value);
        }
        return null;
      } else {
        // Fallback a memoria
        const entry = this.fallbackCache.get(key);
        if (entry && Date.now() < entry.expiresAt) {
          return entry.data;
        }
        if (entry) {
          this.fallbackCache.delete(key);
        }
        return null;
      }
    } catch (error) {
      this.logger.error(`❌ [CacheService] Error obteniendo cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Guarda un valor en el cache con TTL
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      if (this.useRedis && this.redisClient.status === 'ready') {
        await this.redisClient.setex(key, ttlSeconds, JSON.stringify(value));
      } else {
        // Fallback a memoria
        this.fallbackCache.set(key, {
          data: value,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }
    } catch (error) {
      this.logger.error(`❌ [CacheService] Error guardando cache key ${key}:`, error);
    }
  }

  /**
   * Elimina una clave del cache
   */
  async del(key: string): Promise<void> {
    try {
      if (this.useRedis && this.redisClient.status === 'ready') {
        await this.redisClient.del(key);
      } else {
        this.fallbackCache.delete(key);
      }
    } catch (error) {
      this.logger.error(`❌ [CacheService] Error eliminando cache key ${key}:`, error);
    }
  }

  /**
   * Elimina múltiples claves que coinciden con un patrón
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      if (this.useRedis && this.redisClient.status === 'ready') {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
          return keys.length;
        }
        return 0;
      } else {
        // Fallback: eliminar claves que coincidan con el patrón
        let deleted = 0;
        for (const key of this.fallbackCache.keys()) {
          if (this.matchPattern(key, pattern)) {
            this.fallbackCache.delete(key);
            deleted++;
          }
        }
        return deleted;
      }
    } catch (error) {
      this.logger.error(`❌ [CacheService] Error eliminando cache pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Helper para hacer match de patrones simple (solo soporta * al final)
   */
  private matchPattern(key: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return key.startsWith(prefix);
    }
    return key === pattern;
  }

  /**
   * Limpia todas las claves expiradas del cache en memoria (fallback)
   */
  cleanExpired(): void {
    if (!this.useRedis) {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, entry] of this.fallbackCache.entries()) {
        if (now >= entry.expiresAt) {
          this.fallbackCache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.logger.debug(`🧹 [CacheService] Limpieza de cache: ${cleaned} entradas eliminadas`);
      }
    }
  }
}

