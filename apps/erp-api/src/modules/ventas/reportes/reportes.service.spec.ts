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
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        lte: () => builder,
        then: (resolver: any) => {
          const fijada = respuestas[tabla] ?? { data: [], count: 0 };
          return Promise.resolve({ ...fijada, error: null }).then(resolver);
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
