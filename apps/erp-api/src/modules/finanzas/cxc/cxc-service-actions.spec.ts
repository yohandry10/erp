import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CxcService } from './cxc.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { AuditService } from '../../audit/audit.service';
import { RetencionesValidationService } from '../shared/retenciones-validation.service';
import { AplicarNotaCreditoDto } from './dto';

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
    it('crea la nota fiscal referenciada mediante la RPC atómica 472', async () => {
      jest.spyOn(service, 'obtenerCuentaPorCobrar').mockResolvedValue({
        id: 'cxc-1',
        documento_id: '11111111-1111-4111-8111-111111111111',
      } as any);
      mockSupabaseClient.rpc = jest.fn().mockResolvedValue({
        data: { documento_id: 'nota-doc-1', cpe_id: 'nota-cpe-1' },
        error: null,
      });

      const dto: AplicarNotaCreditoDto = {
        monto: 150,
        fecha_emision: '2025-10-10',
        motivo: 'Ajuste comercial documentado',
        codigo_motivo: '10',
        idempotency_key: 'cxc-note:test-1',
      };

      const result = await service.aplicarNotaCredito(
        'tenant-1', 'cxc-1', dto, '22222222-2222-4222-8222-222222222222',
      );

      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith(
        'crear_nota_referenciada_tx',
        {
          p_tenant_id: 'tenant-1',
          p_actor_id: '22222222-2222-4222-8222-222222222222',
          p_documento_origen_id: '11111111-1111-4111-8111-111111111111',
          p_tipo_documento: '07',
          p_codigo_motivo: '10',
          p_motivo: 'Ajuste comercial documentado',
          p_monto_total: 150,
          p_idempotency_key: 'cxc-note:test-1',
        },
      );
      expect(result).toEqual({
        success: true,
        data: { documento_id: 'nota-doc-1', cpe_id: 'nota-cpe-1' },
      });
    });

    it('falla cerrado sin actor, documento origen o llave idempotente', async () => {
      const dto: AplicarNotaCreditoDto = {
        monto: 99.9,
        fecha_emision: '2025-10-11',
        motivo: 'Ajuste',
        idempotency_key: 'cxc-note:test-2',
      };

      await expect(
        service.aplicarNotaCredito('tenant-2', 'cxc-2', dto),
      ).rejects.toThrow('actor autenticado');

      jest.spyOn(service, 'obtenerCuentaPorCobrar').mockResolvedValue({
        id: 'cxc-2', documento_id: null,
      } as any);
      await expect(
        service.aplicarNotaCredito(
          'tenant-2', 'cxc-2', dto, '33333333-3333-4333-8333-333333333333',
        ),
      ).rejects.toThrow('documento fiscal origen');
      expect(mockSupabaseClient.rpc).toBeUndefined();
    });
  });

  describe('reprogramarCuentaPorCobrar', () => {
    const tenantId = 'tenant-xyz';
    const cuentaId = 'cxc-xyz';

    it('delega la reprogramación a una única RPC atómica', async () => {
      const cuentaDespues = { id: cuentaId, fecha_vencimiento: '2099-12-31' };
      mockSupabaseClient.rpc = jest.fn().mockResolvedValue({
        data: { cuenta: cuentaDespues, idempotent: false }, error: null,
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
        'reprogramacion-cxc-001',
      );
      expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reprogramar_cxc_tx', expect.objectContaining({
        p_tenant_id: tenantId, p_cxc_id: cuentaId, p_actor_id: 'user-99',
        p_idempotency_key: 'reprogramacion-cxc-001',
      }));
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      expect(auditService.registrarCambio).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        data: cuentaDespues,
      });
    });

    it('lanza excepción cuando la fecha es inválida', async () => {
      mockSupabaseClient.rpc = jest.fn().mockResolvedValue({
        data: null, error: { message: 'invalid input syntax for type date' },
      });

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
