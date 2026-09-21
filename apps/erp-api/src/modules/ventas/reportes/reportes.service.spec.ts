import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

describe('ReportesService', () => {
  let service: ReportesService;
  let respuestas: Record<string, { data: any[]; count: number }>;
  let rpc: jest.Mock;

  /**
   * El builder de PostgREST encadena filtros y se resuelve al await. Se imita
   * devolviendo un thenable que entrega la respuesta fijada para cada tabla.
   */
  const crearClienteMock = () => ({
    rpc,
    from: (tabla: string) => {
      let start = 0;
      let end = Infinity;
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        not: () => builder,
        order: () => builder,
        range: (from: number, through: number) => { start = from; end = through; return builder; },
        gte: () => builder,
        lte: () => builder,
        lt: () => builder,
        then: (resolver: any) => {
          const fijada = respuestas[tabla] ?? { data: [], count: 0 };
          return Promise.resolve({ ...fijada, data: fijada.data.slice(start, end + 1), error: null }).then(resolver);
        },
      };
      return builder;
    },
  });

  beforeEach(async () => {
    rpc = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        {
          provide: SupabaseService,
          useValue: { getClient: jest.fn(() => crearClienteMock()) },
        },
      ],
    }).compile();

    service = module.get<ReportesService>(ReportesService);
  });

  describe('reportes por moneda', () => {
    const pedido = (moneda: string, total: number) => ({ cliente_id: 'same-client', moneda, total, estado: 'FACTURADO', clientes: { razon_social: 'Cliente', documento_numero: '20123456786' } });

    it('separa PEN y USD del mismo cliente y estado, sin sumar sus importes nominales', async () => {
      respuestas = { pedidos_venta: { count: 3, data: [pedido('PEN', 100), pedido('USD', 20), pedido('PEN', 50)] } };
      const ventas: any[] = await service.getVentasPorCliente('tenant-a');
      expect(ventas.map(row => [row.cliente_id, row.moneda, row.total])).toEqual([['same-client', 'PEN', 150], ['same-client', 'USD', 20]]);
      const estados: any[] = await service.getPedidosPorEstado('tenant-a');
      expect(estados.map(row => [row.estado, row.moneda, row.total])).toEqual([['FACTURADO', 'PEN', 150], ['FACTURADO', 'USD', 20]]);
      const top = await service.getTopClientes('tenant-a', undefined, undefined, 1);
      expect(top.map(row => [row.moneda, row.total_facturacion, row.porcentaje_total])).toEqual([['PEN', 150, 100], ['USD', 20, 100]]);
    });

    it('incluye pedidos posteriores a la primera página de PostgREST', async () => {
      respuestas = { pedidos_venta: { count: 1001, data: Array.from({ length: 1001 }, () => pedido('PEN', 1)) } };
      const ventas: any[] = await service.getVentasPorCliente('tenant-a');
      expect(ventas).toHaveLength(1);
      expect(ventas[0]).toMatchObject({ total: 1001, cantidad_pedidos: 1001 });
    });

    it('mantiene el código de catálogo y separa ventas del mismo producto en dos monedas', async () => {
      respuestas = { pedidos_venta_detalle: { count: 2, data: ['PEN', 'USD'].map(moneda => ({ producto_id: 'product', descripcion: 'Producto', productos: { codigo: 'SKU-01' }, pedidos_venta: { moneda }, cantidad: 1, precio_unitario: 10, subtotal: 10 })) } };
      expect(await service.getProductosMasVendidos('tenant-a')).toEqual(expect.arrayContaining([
        expect.objectContaining({ producto_id: 'product', producto_codigo: 'SKU-01', moneda: 'PEN', importe_total: 10 }),
        expect.objectContaining({ producto_id: 'product', producto_codigo: 'SKU-01', moneda: 'USD', importe_total: 10 }),
      ]));
    });

    it('cuenta pedidos únicos y pondera el precio por unidades, no por líneas', async () => {
      const line = { pedido_id: 'order-1', producto_id: 'product', descripcion: 'Producto', productos: { codigo: 'SKU-01' }, pedidos_venta: { moneda: 'PEN' } };
      respuestas = { pedidos_venta_detalle: { count: 2, data: [{ ...line, cantidad: 1, precio_unitario: 10, subtotal: 10 }, { ...line, cantidad: 9, precio_unitario: 20, subtotal: 180 }] } };
      expect(await service.getProductosMasVendidos('tenant-a')).toEqual([expect.objectContaining({ cantidad_pedidos: 1, unidades_vendidas: 10, importe_total: 190, precio_promedio: 19 })]);
    });
  });

  describe('getLeadTime', () => {
    it('filtra por calendario de Lima al cruzar el mes y conserva las fechas puras', async () => {
      respuestas = {
        pedidos_venta: { count: 2, data: ['instant', 'calendar'].map(factura_id => ({ factura_id, cotizaciones: { fecha: '2026-06-01' } })) },
        cpe: { count: 2, data: [{ id: 'instant', fecha_emision: '2026-07-01T02:00:00Z' }, { id: 'calendar', fecha_emision: '2026-07-01T00:00:00Z' }] },
      };
      const report = await service.getLeadTime('tenant-a', '2026-06-01', '2026-06-30');
      expect(report).toMatchObject({ total_conversiones: 1, promedio_dias: 29, tendencia: [{ periodo: '2026-06', promedio_dias: 29 }] });
    });

    it('usa emisión del CPE, promedia los dos valores centrales y ordena la tendencia mensual', async () => {
      respuestas = {
        pedidos_venta: { count: 4, data: [
          { factura_id: 'c', fecha: '2026-07-01', cotizaciones: { fecha: '2026-07-01' } },
          { factura_id: 'a', fecha: '2026-06-01', cotizaciones: { fecha: '2026-06-01' } },
          { factura_id: 'd', fecha: '2026-07-01', cotizaciones: { fecha: '2026-07-01' } },
          { factura_id: 'b', fecha: '2026-06-01', cotizaciones: { fecha: '2026-06-01' } },
        ] },
        cpe: { count: 4, data: [
          { id: 'a', fecha_emision: '2026-06-03T23:59:59+00:00' },
          { id: 'b', fecha_emision: '2026-06-05' },
          { id: 'c', fecha_emision: '2026-07-09' },
          { id: 'd', fecha_emision: '2026-07-11' },
        ] },
      };
      const report = await service.getLeadTime('tenant-a');
      expect(report).toMatchObject({ promedio_dias: 6, mediana_dias: 6, minimo_dias: 2, maximo_dias: 10, total_conversiones: 4 });
      expect(report.tendencia).toEqual([{ periodo: '2026-06', promedio_dias: 3 }, { periodo: '2026-07', promedio_dias: 9 }]);
      expect(report.por_rango.reduce((sum, item) => sum + item.cantidad, 0)).toBe(4);
    });

    it('devuelve un período sin conversiones cuando no hay comprobantes vinculados en el corte', async () => {
      respuestas = { pedidos_venta: { count: 1, data: [{ factura_id: 'outside-period', cotizaciones: { fecha: '2026-01-01' } }] }, cpe: { count: 0, data: [] } };
      expect(await service.getLeadTime('tenant-a', '2026-07-01', '2026-07-31')).toMatchObject({ total_conversiones: 0, tendencia: [], promedio_dias: 0 });
    });

    it('rechaza fechas históricas incoherentes sin publicar duraciones negativas', async () => {
      respuestas = { pedidos_venta: { count: 1, data: [{ factura_id: 'invalid', cotizaciones: { fecha: '2026-07-10' } }] }, cpe: { count: 1, data: [{ id: 'invalid', fecha_emision: '2026-07-01' }] } };
      await expect(service.getLeadTime('tenant-a')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPipelineVentas', () => {
    it('mide cada etapa sobre la anterior y no sobre las boletas del POS', async () => {
      // Escenario real que producia 2100%: el POS emite boletas que nunca
      // nacieron de un pedido, asi que dividirlas entre los pedidos del periodo
      // daba un ratio imposible.
      respuestas = {
        cotizaciones: {
          data: [
            { id: 'COT-1', total: 100, estado: 'CONVERTIDA', fecha: '2026-07-01', pedido_id: 'PED-1' },
            { id: 'COT-2', total: 200, estado: 'CONVERTIDA', fecha: '2026-07-02', pedido_id: 'PED-2' },
            { id: 'COT-3', total: 300, estado: 'ENVIADA', fecha: '2026-07-03', pedido_id: null },
            { id: 'COT-4', total: 400, estado: 'BORRADOR', fecha: '2026-07-04', pedido_id: null },
          ],
          count: 4,
        },
        pedidos_venta: {
          data: [
            { id: 'PED-1', total: 100, estado: 'FACTURADO', fecha: '2026-07-05' },
            { id: 'PED-2', total: 200, estado: 'PENDIENTE', fecha: '2026-07-06' },
          ],
          count: 2,
        },
        documentos: {
          // 21 comprobantes emitidos, casi todos boletas de mostrador.
          data: Array.from({ length: 21 }, (_, i) => ({
            id: `DOC-${i}`,
            total: 10,
            estado: 'EMITIDO',
            fecha_emision: '2026-07-07',
            tipo_documento: 'BOLETA',
          })),
          count: 21,
        },
      };

      const resultado: any = await service.getPipelineVentas('tenant-a');

      // 2 de 4 cotizaciones generaron pedido.
      expect(resultado.conversiones.cotizaciones_a_pedidos).toBe(50);
      // 1 de 2 pedidos llego a facturarse.
      expect(resultado.conversiones.pedidos_a_facturas).toBe(50);
      // Solo COT-1 termino facturada.
      expect(resultado.conversiones.total).toBe(25);

      // El volumen emitido se sigue informando, pero ya no mueve los ratios.
      expect(resultado.pipeline.facturas.cantidad).toBe(21);
      Object.values(resultado.conversiones).forEach((ratio) => {
        expect(ratio as number).toBeLessThanOrEqual(100);
      });
    });

    it('no divide entre cero cuando el periodo no tiene cotizaciones ni pedidos', async () => {
      respuestas = {
        cotizaciones: { data: [], count: 0 },
        pedidos_venta: { data: [], count: 0 },
        documentos: { data: [], count: 0 },
      };

      const resultado: any = await service.getPipelineVentas('tenant-a');

      expect(resultado.conversiones).toEqual({
        cotizaciones_a_pedidos: 0,
        pedidos_a_facturas: 0,
        total: 0,
      });
    });
  });

  describe('getAgingCxc', () => {
    it('delega el snapshot completo al reporte canónico sin excluir saldos antiguos', async () => {
      const payload = {
        fechaCorte: '2026-08-10',
        monedaBase: 'PEN',
        resumen: {
          cuentasAnalizadas: 2,
          totalPendienteBase: 275,
          totalPendientePorMoneda: { PEN: 100, USD: 50 },
          cuentasSinValuacion: 0,
        },
        buckets: [],
        saldoPorCliente: [],
        cuentasCriticas: [],
        detalle: [
          { id: 'cxc-antigua', moneda: 'PEN', montoOrigen: 100, montoBase: 100 },
          { id: 'cxc-usd', moneda: 'USD', montoOrigen: 50, montoBase: 175 },
        ],
      };
      rpc.mockResolvedValue({ data: payload, error: null });

      const resultado = await service.getAgingCxc(
        'tenant-a',
        '2026-08-10',
        'Cliente histórico',
      );

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith('reporte_cxc_aging_470', {
        p_tenant_id: 'tenant-a',
        p_fecha_corte: '2026-08-10',
        p_cliente_filtro: 'Cliente histórico',
        p_limit: 1000,
      });
      expect(resultado).toBe(payload);
      expect(payload.resumen.totalPendientePorMoneda).toEqual({ PEN: 100, USD: 50 });
    });

    it('usa el corte local del tenant cuando el consumidor no envía fecha', async () => {
      const payload = {
        fechaCorte: '2026-08-10',
        resumen: {},
        buckets: [],
        saldoPorCliente: [],
        cuentasCriticas: [],
        detalle: [],
      };
      rpc.mockResolvedValue({ data: payload, error: null });

      await service.getAgingCxc('tenant-a');

      expect(rpc).toHaveBeenCalledWith(
        'reporte_cxc_aging_470',
        expect.objectContaining({ p_fecha_corte: null, p_cliente_filtro: null }),
      );
    });

    it('rechaza un corte inexistente sin convertirlo en un reporte sin filtro', async () => {
      await expect(
        service.getAgingCxc('tenant-a', '2026-02-30'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
