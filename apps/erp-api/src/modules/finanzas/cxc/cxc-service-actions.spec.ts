import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CxcService } from './cxc.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { AplicarNotaCreditoDto, TipoMovimientoCxc } from './dto';

describe('CxcService - acciones complementarias', () => {
  let service: CxcService;
  let auditService: AuditService;
  let mockSupabaseClient: any;

  const eventBusMock = {
    emitCobroRegistrado: jest.fn(),
    emitPagoFactura: jest.fn(),
    emitCuentaPorCobrarCreadaEvent: jest.fn(),
  };

  const auditServiceMock = {
    registrarCambio: jest.fn(),
  };

  const retencionesValidationMock = {
    validarCalculoAjustes: jest.fn().mockResolvedValue({ valido: true }),
    validarMontoPendiente: jest.fn().mockResolvedValue({ valido: true }),
  };

  beforeEach(async () => {
    mockSupabaseClient = {
      from: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CxcService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => mockSupabaseClient),
          },
        },
        {
          provide: EventBusService,
          useValue: eventBusMock,
        },
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
        {
          provide: RetencionesValidationService,
          useValue: retencionesValidationMock,
        },
      ],
    }).compile();

    service = module.get<CxcService>(CxcService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('aplicarNotaCredito', () => {
    it('delega en registrarPago con los metadatos de nota de crédito', async () => {
      const registrarPagoSpy = jest
        .spyOn(service, 'registrarPago')
        .mockResolvedValue({ success: true, data: { id: 'pago-001' } as any });

      const dto: AplicarNotaCreditoDto = {
        monto: 150,
        fecha_emision: '2025-10-10',
        serie: 'NC01',
        numero: '000123',
        documento_id: 'nc-uuid-1',
      };

      await service.aplicarNotaCredito('tenant-1', 'cxc-1', dto, 'user-1');

      expect(registrarPagoSpy).toHaveBeenCalledWith(
        'tenant-1',
        'cxc-1',
        expect.objectContaining({
          monto: dto.monto,
          fecha_pago: dto.fecha_emision,
          metodo_pago: 'NOTA_CREDITO',
          tipo: TipoMovimientoCxc.NOTA_CREDITO,
          idempotency_key: `cxc.nota_credito:tenant-1:${dto.documento_id}`,
        }),
        'user-1',
      );
    });

    it('genera idempotency key basada en serie-numero cuando no hay documento_id', async () => {
      const registrarPagoSpy = jest
        .spyOn(service, 'registrarPago')
        .mockResolvedValue({ success: true, data: { id: 'pago-002' } as any });

      const dto: AplicarNotaCreditoDto = {
        monto: 99.9,
        fecha_emision: '2025-10-11',
        serie: 'NC02',
        numero: '000001',
        motivo: 'Ajuste',
      };

      await service.aplicarNotaCredito('tenant-2', 'cxc-2', dto);

      expect(registrarPagoSpy).toHaveBeenCalledWith(
        'tenant-2',
        'cxc-2',
        expect.objectContaining({
          metodo_pago: 'NOTA_CREDITO',
          tipo: TipoMovimientoCxc.NOTA_CREDITO,
          idempotency_key: 'cxc.nota_credito:tenant-2:NC02-000001',
        }),
        undefined,
      );
    });
  });

  describe('reprogramarCuentaPorCobrar', () => {
    const tenantId = 'tenant-xyz';
    const cuentaId = 'cxc-xyz';

    it('actualiza fecha de vencimiento y registra auditoría', async () => {
      const cuentaAntes = { fecha_vencimiento: '2025-01-10' };
      const cuentaDespues = { id: cuentaId, fecha_vencimiento: '2099-12-31' };

      const obtenerSpy = jest
        .spyOn(service, 'obtenerCuentaPorCobrar')
        .mockResolvedValueOnce(cuentaAntes as any)
        .mockResolvedValueOnce(cuentaDespues as any);

      const updateEq2 = jest.fn().mockResolvedValue({ error: null });
      const updateEq1 = jest.fn().mockReturnValue({ eq: updateEq2 });
      const updateMock = jest.fn().mockReturnValue({ eq: updateEq1 });

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'cuentas_por_cobrar') {
          return { update: updateMock };
        }
        throw new Error(`Unexpected table ${table}`);
      });

      const result = await service.reprogramarCuentaPorCobrar(
        tenantId,
        cuentaId,
        {
          nueva_fecha_vencimiento: '2099-12-31',
          motivo: 'Extensión de plazo',
          comentarios: 'Aprobado por tesorería',
        },
        'user-99',
      );

      expect(obtenerSpy).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fecha_vencimiento: '2099-12-31',
          dias_mora: 0,
        }),
      );
      expect(updateEq1).toHaveBeenCalledWith('tenant_id', tenantId);
      expect(updateEq2).toHaveBeenCalledWith('id', cuentaId);
      expect(auditService.registrarCambio).toHaveBeenCalledWith(
        'cuentas_por_cobrar',
        'UPDATE',
        'user-99',
        expect.objectContaining({
          old: { fecha_vencimiento: cuentaAntes.fecha_vencimiento },
          new: expect.objectContaining({ fecha_vencimiento: '2099-12-31' }),
        }),
        tenantId,
        cuentaId,
        expect.objectContaining({
          accion: 'REPROGRAMAR_VENCIMIENTO',
          motivo: 'Extensión de plazo',
        }),
      );
      expect(result).toEqual({
        success: true,
        data: cuentaDespues,
      });
    });

    it('lanza excepción cuando la fecha es inválida', async () => {
      jest
        .spyOn(service, 'obtenerCuentaPorCobrar')
        .mockResolvedValueOnce({ fecha_vencimiento: '2025-01-10' } as any);

      await expect(
        service.reprogramarCuentaPorCobrar(
          tenantId,
          cuentaId,
          { nueva_fecha_vencimiento: 'fecha-invalida' },
          'user-100',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(auditService.registrarCambio).not.toHaveBeenCalled();
    });
  });
});
