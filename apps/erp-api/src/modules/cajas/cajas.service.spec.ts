import { Test, TestingModule } from '@nestjs/testing';
import { CajasService } from './cajas.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { ConfiguracionCajaService } from './services/configuracion-caja.service';
import { AutorizacionesCajaService } from './services/autorizaciones-caja.service';
import { CashReconciliationService } from './services/cash-reconciliation.service';
import { CashReportsService } from './services/cash-reports.service';
import { CashMovementsService } from './services/cash-movements.service';
import { CashClosingService } from './services/cash-closing.service';
import { CashWithdrawalsService } from './services/cash-withdrawals.service';
import { CashShiftChangesService } from './services/cash-shift-changes.service';
import { NotFoundException } from '@nestjs/common';

describe('CajasService', () => {
  let service: CajasService;
  let mockSupabaseClient: any;

  const createSupabaseQuery = () => {
    const resultQueue: any[] = [];
    const q: any = {
      maybeSingle: jest.fn(),
      single: jest.fn(),
      pushResult: (r: any) => { resultQueue.push(r); return q; },
      then: (resolve: any) =>
        Promise.resolve(
          resultQueue.length ? resultQueue.shift() : { data: null, error: null },
        ).then(resolve),
    };
    q.from = jest.fn().mockReturnValue(q);
    q.select = jest.fn().mockReturnValue(q);
    q.insert = jest.fn().mockReturnValue(q);
    q.update = jest.fn().mockReturnValue(q);
    q.delete = jest.fn().mockReturnValue(q);
    q.order = jest.fn().mockReturnValue(q);
    q.eq = jest.fn().mockReturnValue(q);
    return q;
  };

  beforeEach(async () => {
    mockSupabaseClient = createSupabaseQuery();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CajasService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn().mockReturnValue(mockSupabaseClient),
          },
        },
        { provide: ConfiguracionCajaService, useValue: {} as Partial<ConfiguracionCajaService> },
        { provide: AutorizacionesCajaService, useValue: {} as Partial<AutorizacionesCajaService> },
        { provide: CashReconciliationService, useValue: {} as Partial<CashReconciliationService> },
        { provide: CashReportsService, useValue: {} as Partial<CashReportsService> },
        { provide: CashMovementsService, useValue: {} as Partial<CashMovementsService> },
        { provide: CashClosingService, useValue: {} as Partial<CashClosingService> },
        { provide: CashWithdrawalsService, useValue: {} as Partial<CashWithdrawalsService> },
        { provide: CashShiftChangesService, useValue: {} as Partial<CashShiftChangesService> },
      ],
    }).compile();

    service = module.get<CajasService>(CajasService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('debería estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Aislamiento multi-tenant (P2.2)', () => {
    it('listarCajas debe filtrar por tenant_id', async () => {
      mockSupabaseClient.pushResult({
        data: [
          { id: 'caja-a', tenant_id: 'tenant-a' },
          { id: 'caja-a2', tenant_id: 'tenant-a' },
        ],
        error: null,
      });

      const cajas = await service.listarCajas('tenant-a');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cajas');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
      expect(cajas).toHaveLength(2);
    });

    it('crearCaja debe insertar con tenant_id del contexto', async () => {
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: 'caja-1',
          tenant_id: 'tenant-a',
          nombre: 'Caja Principal',
        },
        error: null,
      });

      await service.crearCaja('tenant-a', { nombre: 'Caja Principal' } as any, 'user-1');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('cajas');
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            tenant_id: 'tenant-a',
            nombre: 'Caja Principal',
            creado_por: 'user-1',
          }),
        ]),
      );
    });

    it('actualizarCaja no debe actualizar registros de otro tenant', async () => {
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: { id: 'caja-a' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'caja-a' }, error: null });

      await service.actualizarCaja('tenant-a', 'caja-a', { nombre: 'Caja Editada' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'caja-a');
      expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('tenant_id', 'tenant-b');
    });

    it('actualizarCaja debe lanzar NotFoundException si el recurso pertenece a otro tenant', async () => {
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { message: 'No encontrado' },
      });

      await expect(service.actualizarCaja('tenant-a', 'caja-cross', { nombre: 'Nope' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

