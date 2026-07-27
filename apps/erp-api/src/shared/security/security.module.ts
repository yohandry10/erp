import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SecurityService } from './security.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { AdaptiveRateLimitGuard } from './guards/adaptive-rate-limit.guard';
import { AdaptiveRateLimitService } from './adaptive-rate-limit.service';
import { PiiEncryptionService } from './pii-encryption.service';
import { ValidationInterceptor } from './interceptors/validation.interceptor';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: parseInt(configService.get('THROTTLE_TTL', '60000')),
          limit: parseInt(configService.get('THROTTLE_LIMIT', '100')),
        },
      ],
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '1h'),
        },
      }),
    }),
  ],
  providers: [
    SecurityService,
    RateLimitGuard,
    AuthRateLimitGuard,
    AdaptiveRateLimitGuard,
    AdaptiveRateLimitService,
    PiiEncryptionService,
    ValidationInterceptor,
  ],
  exports: [
    SecurityService,
    RateLimitGuard,
    AuthRateLimitGuard,
    AdaptiveRateLimitGuard,
    AdaptiveRateLimitService,
    PiiEncryptionService,
    ValidationInterceptor,
  ],
})
export class SecurityModule {}
