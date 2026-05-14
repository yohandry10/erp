import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';

export function isRedisRequired(configService: ConfigService): boolean {
  return configService.get<string | boolean>('REDIS_REQUIRED') === true
    || configService.get<string | boolean>('REDIS_REQUIRED') === 'true'
    || configService.get<string>('NODE_ENV') === 'production';
}

export function createRedisRetryStrategy(redisRequired: boolean) {
  return (times: number): number | null => {
    if (!redisRequired && times > 3) {
      return null;
    }

    return Math.min(times * 50, 2000);
  };
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    CacheService,
    CacheInvalidationService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: async (configService: ConfigService) => {
        const Redis = require('ioredis');
        const redisRequired = isRedisRequired(configService);
        const redisClient = new Redis({
          host: configService.get('REDIS_HOST') || 'localhost',
          port: parseInt(configService.get('REDIS_PORT') || '6379'),
          password: configService.get('REDIS_PASSWORD'),
          maxRetriesPerRequest: 3,
          retryStrategy: createRedisRetryStrategy(redisRequired),
          lazyConnect: true,
        });

        redisClient.on('error', (err: Error) => {
          console.error('❌ [Redis] Error de conexión:', err.message);
        });

        redisClient.on('connect', () => {
          console.log('✅ [Redis] Conectado exitosamente');
        });

        await redisClient.connect().catch((err: Error) => {
          if (redisRequired) {
            throw new Error(`Redis requerido no disponible: ${err.message}`);
          }
          console.warn('⚠️ [Redis] No se pudo conectar. El cache funcionará en modo degradado (in-memory).', err.message);
        });

        return redisClient;
      },
      inject: [ConfigService],
    },
  ],
  exports: [CacheService, CacheInvalidationService],
})
export class CacheModule {}

