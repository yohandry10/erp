import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SunatRetryService } from './sunat-retry.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { OseService } from '../ose/ose.service';
import { CpeService } from '../cpe/cpe.service';
import { GreService } from '../gre/gre.service';

describe('SunatRetryService', () => {
  let service: SunatRetryService;

  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
    update: jest.fn().mockReturnThis(),
  };

  const supabaseService = {
    getClient: jest.fn(() => mockSupabaseClient),
  };

  const cpeService = {
    retrySendToOse: jest.fn(),
  };

  const greService = {
    retryProcesarEnvioSunat: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SunatRetryService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: OseService, useValue: {} },
        { provide: CpeService, useValue: cpeService },
        { provide: GreService, useValue: greService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('false') } },
      ],
    }).compile();

    service = module.get(SunatRetryService);
    jest.clearAllMocks();
  });

  it('retryCpe: no cambia estado a ENVIADO y pasa idempotencyKey determinístico', async () => {
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { id: 'cpe-1', estado: 'RECHAZADO', retry_count: 0, next_retry_at: null },
      error: null,
    });

    await (service as any).retryCpe('cpe-1', 'tenant-1', 0);

    expect(mockSupabaseClient.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ estado: 'ENVIADO' }),
    );
    expect(cpeService.retrySendToOse).toHaveBeenCalledWith('cpe-1', {
      idempotencyKey: 'cpe.send:tenant-1:cpe-1',
    });
  });

  it('retryGre: no cambia estado a ENVIADO y pasa idempotencyKey determinístico', async () => {
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { id: 'gre-1', estado: 'RECHAZADO', retry_count: 0, next_retry_at: null },
      error: null,
    });

    await (service as any).retryGre('gre-1', 'tenant-1', 0);

    expect(mockSupabaseClient.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ estado: 'ENVIADO' }),
    );
    expect(greService.retryProcesarEnvioSunat).toHaveBeenCalledWith('gre-1', 'tenant-1', {
      idempotencyKey: 'gre.send:tenant-1:gre-1',
    });
  });
});

