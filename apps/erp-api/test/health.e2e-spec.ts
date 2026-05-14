import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppController } from '../src/app.controller';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../src/shared/supabase/supabase.service';

describe('Health and version endpoints (e2e)', () => {
  const buildController = (dependencyReady: boolean) => {
    const rpcMock = jest.fn(async () => {
      return dependencyReady ? { data: [], error: null } : { data: null, error: { message: 'db unavailable' } };
    });

    const mockSupabase = {
      getPublicClient: () => ({
        rpc: rpcMock,
      }),
    } as unknown as SupabaseService;

    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'APP_VERSION') {
          return '9.9.9';
        }
        if (key === 'APP_COMMIT_SHA') {
          return 'abc123';
        }
        if (key === 'APP_BUILD_DATE') {
          return '2026-04-27T00:00:00Z';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    return { rpcMock, mockSupabase, mockConfig };
  };

  const bootstrap = async (dependencyReady: boolean): Promise<{
    app: INestApplication;
    rpcMock: jest.Mock;
  }> => {
    const { rpcMock, mockSupabase, mockConfig } = buildController(dependencyReady);

    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: SupabaseService,
          useValue: mockSupabase,
        },
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    return { app, rpcMock };
  };

  it('GET /api/health/live responde liveness sin dependencias', async () => {
    const { app } = await bootstrap(true);
    const client = request(app.getHttpServer());

    const response = await client.get('/api/health/live').expect(200);
    expect(response.body.status).toBe('alive');
    expect(response.body.version).toBe('1.0.0');

    await app.close();
  });

  it('GET /api/health/version incluye metadata de runtime', async () => {
    const { app } = await bootstrap(true);
    const client = request(app.getHttpServer());

    const response = await client.get('/api/health/version').expect(200);
    expect(response.body.service).toBe('erp-api');
    expect(response.body.version).toBe('9.9.9');
    expect(response.body.commit).toBe('abc123');
    expect(response.body.buildDate).toBe('2026-04-27T00:00:00Z');

    await app.close();
  });

  it('GET /api/health/ready devuelve OK cuando la DB está disponible', async () => {
    const { app, rpcMock } = await bootstrap(true);
    const client = request(app.getHttpServer());

    const response = await client.get('/api/health/ready').expect(200);
    expect(response.body.status).toBe('ready');
    expect(response.body.checks.database).toBe('ok');
    expect(rpcMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('GET /api/health/ready devuelve 503 cuando DB no responde', async () => {
    const { app, rpcMock } = await bootstrap(false);
    const client = request(app.getHttpServer());

    const response = await client.get('/api/health/ready').expect(503);
    const payload = response.body.message ?? response.body;
    expect(payload.status).toBe('unready');
    expect(payload.failures).toContain('database');
    expect(rpcMock).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
