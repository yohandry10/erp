import {
  Controller,
  Get,
  Module,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { RateLimitGuard } from '../src/shared/security/guards/rate-limit.guard';

@Controller('rate-limit')
class RateLimitFixtureController {
  @Get('normal')
  normal() {
    return { status: 'ok', policy: 'normal' };
  }

  @Get('export')
  @Throttle({ default: { limit: 1, ttl: 60 } })
  export() {
    return { status: 'ok', policy: 'export' };
  }

  @Get('health')
  @SkipThrottle()
  health() {
    return { status: 'ok', policy: 'health' };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60,
        limit: 2,
      },
    ]),
  ],
  controllers: [RateLimitFixtureController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
class RateLimitFixtureModule {}

describe('Rate limiting global + categorías (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitFixtureModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('aplica límite global para rutas normales', async () => {
    const client = request(app.getHttpServer());

    await client.get('/rate-limit/normal').expect(200);
    await client.get('/rate-limit/normal').expect(200);
    await client.get('/rate-limit/normal').expect(429);
  });

  it('aplica límite específico para rutas de reporte/export', async () => {
    const client = request(app.getHttpServer());

    await client.get('/rate-limit/export').expect(200);
    await client.get('/rate-limit/export').expect(429);
  });

  it('omite throttle para health', async () => {
    const client = request(app.getHttpServer());

    await client.get('/rate-limit/health').expect(200);
    await client.get('/rate-limit/health').expect(200);
    await client.get('/rate-limit/health').expect(200);
  });
});
