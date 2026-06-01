import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PedidosService } from './pedidos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditService } from '../../audit/audit.service';
import { CPEIntegrationService } from './cpe-integration.service';
import { GREIntegrationService } from './gre-integration.service';
import { EventBusService } from '../../../shared/events/event-bus.service';
import { TaxCalculatorService } from '../../../shared/utils/tax-calculator';
import { TenantContextService } from '../../../shared/tenant/tenant-context.service';
import { DocumentosService } from '../../documentos.service';

type SupabaseResponse<T> = { data: T; error: any };

type TableResponses = Partial<{
  maybeSingle: SupabaseResponse<any>[];
  single: SupabaseResponse<any>[];
  limit: SupabaseResponse<any[]>[];
  insert: SupabaseResponse<any>[];
  update: SupabaseResponse<any>[];
  delete: SupabaseResponse<any>[];
}>;

class MockQueryBuilder {
  private mode: 'insert' | 'update' | 'delete' | 'select' = 'select';

  constructor(
    private readonly table: string,
    private readonly responses: TableResponses,
    private readonly spies: {
      insert?: jest.Mock;
      update?: jest.Mock;
      delete?: jest.Mock;
      select?: jest.Mock;
      eq?: jest.Mock;
    },
  ) {}

  select(_columns?: string) {
    this.mode = 'select';
    this.spies.select?.(this.table);
    return this;
  }

  eq(_column: string, _value: any) {
    this.spies.eq?.(this.table, _column, _value);
    return this;
  }

  single() {
    const next = this.responses.single?.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  }

  maybeSingle() {
    const next = this.responses.maybeSingle?.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  }

  limit(_count: number) {
    const next = this.responses.limit?.shift() ?? { data: [], error: null };
    return Promise.resolve(next);
  }

  insert(payload: any) {
    this.mode = 'insert';
    this.spies.insert?.(this.table, payload);
    return this;
  }

  update(payload: any) {
    this.mode = 'update';
    this.spies.update?.(this.table, payload);
    return this;
  }

  delete() {
    this.mode = 'delete';
    this.spies.delete?.(this.table);
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const response = this.consumeResponse();
    return Promise.resolve(response).then(onfulfilled, onrejected);
  }

  private consumeResponse() {
    if (this.mode === 'insert') {
      return this.responses.insert?.shift() ?? { data: null, error: null };
    }
    if (this.mode === 'update') {
      return this.responses.update?.shift() ?? { data: null, error: null };
    }
    if (this.mode === 'delete') {
      return this.responses.delete?.shift() ?? { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

function createMockSupabaseClient(responsesByTable: Record<string, TableResponses>) {
  const spies = {
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
  };

  const client = {
    from: jest.fn((table: string) => {
      const tableResponses = responsesByTable[table] ?? {};
      return new MockQueryBuilder(table, tableResponses, spies);
    }),
    rpc: jest.fn(),
    __spies: spies,
  };

  return client;
}

describe('PedidosService (facturación)', () => {
  let service: PedidosService;
  let mockSupabaseClient: ReturnType<typeof createMockSupabaseClient>;
  const cpeIntegrationService = {
    generarFacturaDesdePedido: jest.fn(),
  };

  beforeEach(async () => {
    mockSupabaseClient = createMockSupabaseClient({
      empresa_config: {
        single: [
          {
            data: {
              ruc: '20123456789',
              razon_social: 'Empresa Test SAC',
              direccion_fiscal: 'Av. Test 123',
              certificado_pfx: 'base64-pfx',
              certificado_password: 'secret',
            },
            error: null,
          },
        ],
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PedidosService,
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn().mockReturnValue(mockSupabaseClient) },
        },
        { provide: NotificationsService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: CPEIntegrationService, useValue: cpeIntegrationService },
        { provide: GREIntegrationService, useValue: { verificarSugerenciaGRE: jest.fn() } },
        { provide: EventBusService, useValue: {} },
        { provide: DocumentosService, useValue: {} },
        { provide: TaxCalculatorService, useValue: { calcularImpuestos: jest.fn() } },
        { provide: TenantContextService, useValue: { getTenantId: jest.fn() } },
      ],
    }).compile();

    service = module.get<PedidosService>(PedidosService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('no debe silenciar error al promover CONFIRMADO→LISTO_FACTURAR (flujo simplificado)', async () => {
    jest.spyOn(service as any, 'obtenerConfiguracionEmpresa').mockResolvedValue({
      usar_flujo_logistica: false,
    });
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      estado: 'CONFIRMADO',
      numero: 'PV-0001',
      detalle: [],
      factura_id: null,
    });
    jest.spyOn(service as any, 'updateEstado').mockRejectedValue(new Error('update failed'));

    await expect(service.generarFactura('pedido-1', 'tenant-1')).rejects.toBeInstanceOf(Error);
  });

  it('no debe descontar stock (flujo simplificado) si falla la generación de CPE', async () => {
    mockSupabaseClient = createMockSupabaseClient({
      empresa_config: {
        single: [
          {
            data: {
              ruc: '20123456789',
              razon_social: 'Empresa Test SAC',
              direccion_fiscal: 'Av. Test 123',
              certificado_pfx: 'base64-pfx',
              certificado_password: 'secret',
            },
            error: null,
          },
          {
            data: {
              ruc: '20123456789',
              razon_social: 'Empresa Test SAC',
              direccion_fiscal: 'Av. Test 123',
              certificado_pfx: 'base64-pfx',
              certificado_password: 'secret',
            },
            error: null,
          },
        ],
      },
      movimientos_inventario: {
        limit: [
          { data: [], error: null },
          { data: [{ id: 'mov-1' }], error: null },
        ],
      },
      pedidos_venta_detalle: {
        update: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
      pedido_backorders: {
        delete: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
    });

    (moduleRefSupabase(service) as any).getClient.mockReturnValue(mockSupabaseClient);

    jest.spyOn(service as any, 'obtenerConfiguracionEmpresa').mockResolvedValue({
      usar_flujo_logistica: false,
    });
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      estado: 'LISTO_FACTURAR',
      numero: 'PV-0001',
      detalle: [
        {
          id: 'det-1',
          producto_id: 'prod-1',
          cantidad: 2,
        },
      ],
      factura_id: null,
    });

    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    cpeIntegrationService.generarFacturaDesdePedido.mockRejectedValue(new BadRequestException('cpe fail'));

    await expect(service.generarFactura('pedido-1', 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.generarFactura('pedido-1', 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
  });

  it('descuenta stock después de obtener CPE idempotente en flujo simplificado', async () => {
    mockSupabaseClient = createMockSupabaseClient({
      empresa_config: {
        single: [
          {
            data: {
              ruc: '20123456789',
              razon_social: 'Empresa Test SAC',
              direccion_fiscal: 'Av. Test 123',
              certificado_pfx: 'base64-pfx',
              certificado_password: 'secret',
            },
            error: null,
          },
        ],
      },
      movimientos_inventario: {
        limit: [{ data: [], error: null }],
      },
      pedidos_venta_detalle: {
        maybeSingle: [{ data: { id: 'det-1' }, error: null }],
        update: [{ data: null, error: null }],
      },
      pedido_backorders: {
        delete: [{ data: null, error: null }],
      },
      pedidos_venta: {
        maybeSingle: [{ data: { id: 'pedido-1' }, error: null }],
      },
    });

    (moduleRefSupabase(service) as any).getClient.mockReturnValue(mockSupabaseClient);
    (service as any).eventBus = {
      emitFacturaEmitidaEvent: jest.fn(),
      emitVentaProcessed: jest.fn(),
    };
    (service as any).greIntegrationService.verificarSugerenciaGRE.mockResolvedValue({ sugerir: false });

    jest.spyOn(service as any, 'obtenerConfiguracionEmpresa').mockResolvedValue({
      usar_flujo_logistica: false,
      dias_vencimiento_factura: 30,
    });
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      estado: 'LISTO_FACTURAR',
      numero: 'PV-0001',
      cliente_id: 'cliente-1',
      subtotal: 100,
      igv: 18,
      total: 118,
      detalle: [
        {
          id: 'det-1',
          producto_id: 'prod-1',
          cantidad: 2,
          precio_unitario: 50,
          subtotal: 100,
        },
      ],
      factura_id: null,
    });

    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    cpeIntegrationService.generarFacturaDesdePedido.mockResolvedValue({
      factura_id: 'cpe-1',
      documento_id: 'doc-1',
      total: 118,
      estado: 'EMITIDO',
      serie: 'F001',
      numero: 1,
      fecha_emision: '2026-05-27',
      moneda: 'PEN',
    });

    const result = await service.generarFactura('pedido-1', 'tenant-1', 'user-1');

    expect(result).toEqual({ success: true, factura_id: 'cpe-1', sugerir_gre: false });
    expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('descontar_stock_y_liberar_reserva', expect.any(Object));
    expect(
      cpeIntegrationService.generarFacturaDesdePedido.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSupabaseClient.rpc.mock.invocationCallOrder[0]);
  });

  it('repara cantidad_facturada al reintentar un pedido que ya tiene factura', async () => {
    mockSupabaseClient = createMockSupabaseClient({
      empresa_config: {
        single: [
          {
            data: {
              ruc: '20123456789',
              razon_social: 'Empresa Test SAC',
              direccion_fiscal: 'Av. Test 123',
              certificado_pfx: 'base64-pfx',
              certificado_password: 'secret',
            },
            error: null,
          },
        ],
      },
      pedidos_venta_detalle: {
        maybeSingle: [{ data: { id: 'det-1' }, error: null }],
      },
    });

    (moduleRefSupabase(service) as any).getClient.mockReturnValue(mockSupabaseClient);
    (service as any).greIntegrationService.verificarSugerenciaGRE.mockResolvedValue({ sugerir: false });

    jest.spyOn(service as any, 'obtenerConfiguracionEmpresa').mockResolvedValue({
      usar_flujo_logistica: false,
    });
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      estado: 'LISTO_FACTURAR',
      numero: 'PV-0001',
      detalle: [
        {
          id: 'det-1',
          pedido_id: 'pedido-1',
          producto_id: 'prod-1',
          descripcion: 'Producto 1',
          cantidad: 2,
          cantidad_facturada: 1,
          precio_unitario: 50,
          subtotal: 100,
          created_at: '2026-05-27T00:00:00Z',
        },
      ],
      factura_id: 'cpe-1',
    });

    const result = await service.generarFactura('pedido-1', 'tenant-1', 'user-1');

    expect(result).toEqual({ success: true, factura_id: 'cpe-1', sugerir_gre: false });
    expect(cpeIntegrationService.generarFacturaDesdePedido).not.toHaveBeenCalled();
    expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
    expect(mockSupabaseClient.__spies.update).toHaveBeenCalledWith('pedidos_venta_detalle', {
      cantidad_facturada: 2,
      estado_item: 'FACTURADO',
    });
  });

  it('no oculta un fallo al reparar cantidad_facturada en reintentos idempotentes', async () => {
    mockSupabaseClient = createMockSupabaseClient({
      empresa_config: {
        single: [
          {
            data: {
              ruc: '20123456789',
              razon_social: 'Empresa Test SAC',
              direccion_fiscal: 'Av. Test 123',
              certificado_pfx: 'base64-pfx',
              certificado_password: 'secret',
            },
            error: null,
          },
        ],
      },
      pedidos_venta_detalle: {
        maybeSingle: [{ data: null, error: { message: 'update failed' } }],
      },
    });

    (moduleRefSupabase(service) as any).getClient.mockReturnValue(mockSupabaseClient);

    jest.spyOn(service as any, 'obtenerConfiguracionEmpresa').mockResolvedValue({
      usar_flujo_logistica: false,
    });
    jest.spyOn(service as any, 'findOne').mockResolvedValue({
      id: 'pedido-1',
      estado: 'LISTO_FACTURAR',
      numero: 'PV-0001',
      detalle: [
        {
          id: 'det-1',
          pedido_id: 'pedido-1',
          producto_id: 'prod-1',
          descripcion: 'Producto 1',
          cantidad: 2,
          cantidad_facturada: 1,
          precio_unitario: 50,
          subtotal: 100,
          created_at: '2026-05-27T00:00:00Z',
        },
      ],
      factura_id: 'cpe-1',
    });

    await expect(service.generarFactura('pedido-1', 'tenant-1', 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(cpeIntegrationService.generarFacturaDesdePedido).not.toHaveBeenCalled();
    expect(mockSupabaseClient.rpc).not.toHaveBeenCalled();
  });
});

function moduleRefSupabase(service: PedidosService) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (service as any).supabase as SupabaseService;
}
