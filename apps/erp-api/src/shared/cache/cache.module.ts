import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';

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
        const redisClient = new Redis({
          host: configService.get('REDIS_HOST') || 'localhost',
          port: parseInt(configService.get('REDIS_PORT') || '6379'),
          password: configService.get('REDIS_PASSWORD'),
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          lazyConnect: true,
        });

        redisClient.on('error', (err: Error) => {
          console.error('❌ [Redis] Error de conexión:', err.message);
        });

        redisClient.on('connect', () => {
          console.log('✅ [Redis] Conectado exitosamente');
        });

        await redisClient.connect().catch((err: Error) => {
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

