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

  it('retryCpe: delega al owner durable SYSTEM sin DML ni contador paralelo', async () => {
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { id: 'cpe-1', estado: 'ERROR', retry_count: 0, next_retry_at: null },
      error: null,
    });

    await (service as any).retryCpe('cpe-1', 'tenant-1', 0);

    expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    expect(cpeService.retrySendToOse).toHaveBeenCalledWith('cpe-1', 'tenant-1', {
      idempotencyKey: 'cpe.send:tenant-1:cpe-1',
      origin: 'SYSTEM',
    });
  });

  it('solo selecciona CPE técnicos ERROR/ERROR; nunca RECHAZADO', async () => {
    mockSupabaseClient.limit.mockResolvedValueOnce({ data: [], error: null });

    await (service as any).processFailedCpes();

    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('estado', 'ERROR');
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('sunat_status', 'ERROR');
    expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('estado', 'RECHAZADO');
  });

  it('retryGre: delega el intento al claim 463 sin DML directo', async () => {
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: { id: 'gre-1', estado: 'RECHAZADO', retry_count: 0, next_retry_at: null },
      error: null,
    });

    await (service as any).retryGre('gre-1', 'tenant-1', 0);

    expect(mockSupabaseClient.update).not.toHaveBeenCalled();
    expect(greService.retryProcesarEnvioSunat).toHaveBeenCalledWith('gre-1', 'tenant-1', {
      idempotencyKey: 'gre.send:tenant-1:gre-1',
    });
  });

  it('solo selecciona GRE en ERROR para reintento automático', async () => {
    mockSupabaseClient.limit.mockResolvedValueOnce({ data: [], error: null });

    await (service as any).processFailedGres();

    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('estado', 'ERROR');
    expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('estado', 'RECHAZADO');
  });
});
