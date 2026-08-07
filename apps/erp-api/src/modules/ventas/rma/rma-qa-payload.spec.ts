import { Test, TestingModule } from '@nestjs/testing';
import { RmaService } from './rma.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { InventarioService } from '../../inventario/inventario.service';
import { DocumentosService } from '../../documentos.service';
import { AlmacenesService } from '../../inventario/almacenes/almacenes.service';

type SupabaseResponse<T> = { data: T; error: any };

type TableResponses = Partial<{
  maybeSingle: SupabaseResponse<any>[];
  update: SupabaseResponse<any>[];
  insert: SupabaseResponse<any>[];
}>;

class MockQueryBuilder {
  private mode: 'update' | 'insert' | 'select' = 'select';

  constructor(
    private readonly table: string,
    private readonly responses: TableResponses,
  ) {}

  select(_columns?: string) {
    this.mode = 'select';
    return this;
  }

  eq(_column: string, _value: any) {
    return this;
  }

  maybeSingle() {
    const next = this.responses.maybeSingle?.shift() ?? { data: null, error: null };
    return Promise.resolve(next);
  }

  update(_payload: any) {
    this.mode = 'update';
    return this;
  }

  insert(_payload: any) {
    this.mode = 'insert';
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
    if (this.mode === 'update') {
      return this.responses.update?.shift() ?? { data: null, error: null };
    }
    if (this.mode === 'insert') {
      return this.responses.insert?.shift() ?? { data: null, error: null };
    }
    return { data: null, error: null };
  }
}

function createMockSupabaseClient(responsesByTable: Record<string, TableResponses>) {
  return {
    from: jest.fn((table: string) => new MockQueryBuilder(table, responsesByTable[table] ?? {})),
  };
}

describe('RmaService (nota de crédito)', () => {
  it('QA: inspeccionar payload de la nota de credito', async () => {
    const mockSupabaseClient = createMockSupabaseClient({
      pedidos_venta: {
        maybeSingle: [
          {
            data: {
              id: 'pedido-1',
              numero: 'PV-0001',
              cliente_id: 'cliente-1',
              clientes: { razon_social: 'Cliente SA', numero_documento: '20123456789', documento_tipo: '6' },
              detalle: [
                {
                  id: 'det-1',
                  descripcion: 'Item',
                  precio_unitario: 10,
                  producto_id: 'prod-1',
                  cantidad: 1,
                  cantidad_despachada: 1,
                },
              ],
            },
            error: null,
          },
        ],
      },
      empresa_config: {
        maybeSingle: [{ data: { moneda_defecto: 'USD' }, error: null }],
      },
      rma_solicitudes: {
        update: [{ data: null, error: null }],
      },
      rma_eventos: {
        insert: [{ data: null, error: null }],
      },
    });

    const documentosService = {
      crearDocumento: jest.fn().mockResolvedValue({ data: { id: 'doc-nc-1' } }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RmaService,
        { provide: SupabaseService, useValue: { getClient: jest.fn().mockReturnValue(mockSupabaseClient) } },
        { provide: InventarioService, useValue: {} },
        { provide: DocumentosService, useValue: documentosService },
        { provide: AlmacenesService, useValue: {} },
      ],
    }).compile();

    const service = module.get<RmaService>(RmaService);

    jest.spyOn(service as any, 'obtenerPorId').mockResolvedValue({
      id: 'rma-1',
      pedido_id: 'pedido-1',
      estado: 'RECIBIDA',
      nota_credito_documento_id: null,
      items: [{ detalle_id: 'det-1', producto_id: 'prod-1', cantidad_devuelta: 1, cantidad_autorizada: 1 }],
    });

    await service.generarNotaCredito('tenant-1', 'user-1', 'rma-1', { serie: 'NC01', motivo: 'DEV' } as any);

    const payload = documentosService.crearDocumento.mock.calls[0][0];
    console.log("PAYLOAD_NC:", JSON.stringify({ total: payload.total, subtotal: payload.subtotal, impuesto_igv: payload.impuesto_igv, detalle0: payload.detalles[0] }));
    expect(payload).toBeDefined();
  });

  // Una nota de credito por devolucion tiene que reversar tambien el IGV de lo
  // devuelto (SUNAT, Catalogo 09). Si solo reversa el valor de venta, el IGV de
  // esa mercaderia sigue declarado como impuesto por pagar.
  it('reversa el IGV de la mercaderia devuelta', async () => {
    const mockSupabaseClient = createMockSupabaseClient({
      pedidos_venta: {
        maybeSingle: [
          {
            data: {
              id: 'pedido-1',
              numero: 'PV-0001',
              cliente_id: 'cliente-1',
              clientes: { razon_social: 'Cliente SA', numero_documento: '20123456789', documento_tipo: '6' },
              detalle: [
                { id: 'det-1', descripcion: 'Item gravado', precio_unitario: 100, producto_id: 'prod-1', cantidad: 1, cantidad_despachada: 1 },
              ],
            },
            error: null,
          },
        ],
      },
      empresa_config: {
        maybeSingle: [{ data: { moneda_defecto: 'PEN', igv_porcentaje: 18 }, error: null }],
      },
      productos: {
        maybeSingle: [{ data: null, error: null }],
      },
      rma_solicitudes: { update: [{ data: null, error: null }] },
      rma_eventos: { insert: [{ data: null, error: null }] },
    });

    const documentosService = { crearDocumento: jest.fn().mockResolvedValue({ data: { id: 'doc-nc-2' } }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RmaService,
        { provide: SupabaseService, useValue: { getClient: jest.fn().mockReturnValue(mockSupabaseClient) } },
        { provide: InventarioService, useValue: {} },
        { provide: DocumentosService, useValue: documentosService },
        { provide: AlmacenesService, useValue: {} },
      ],
    }).compile();

    const service = module.get<RmaService>(RmaService);
    jest.spyOn(service as any, 'obtenerPorId').mockResolvedValue({
      id: 'rma-1',
      pedido_id: 'pedido-1',
      estado: 'RECIBIDA',
      nota_credito_documento_id: null,
      items: [{ detalle_id: 'det-1', producto_id: 'prod-1', cantidad_devuelta: 1, cantidad_autorizada: 1 }],
    });

    await service.generarNotaCredito('tenant-1', 'user-1', 'rma-1', { serie: 'NC01', motivo: 'DEV' } as any);

    const payload = documentosService.crearDocumento.mock.calls[0][0];
    expect(payload.subtotal).toBe(100);
    expect(payload.impuesto_igv).toBe(18);
    expect(payload.total).toBe(118);
    expect(payload.detalles[0].impuesto_igv).toBe(18);
    expect(payload.detalles[0].total_item).toBe(118);
  });
});
