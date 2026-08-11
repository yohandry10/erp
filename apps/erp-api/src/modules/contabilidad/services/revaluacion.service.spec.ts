import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RevaluacionService } from './revaluacion.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { TiposCambioService } from './tipos-cambio.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

/**
 * Diferencia de cambio (Fase 2).
 *
 * El foco es el signo. Una diferencia de cambio con el signo invertido no
 * revienta ningún test de cuadre — el asiento sigue balanceando — pero
 * convierte una ganancia en pérdida en el estado de resultados.
 */
describe('RevaluacionService', () => {
  let service: RevaluacionService;
  let tiposCambio: {
    obtenerMonedaLocal: jest.Mock;
    obtenerVigente: jest.Mock;
  };
  let periodos: { validarPeriodoAbierto: jest.Mock };

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;

  const construirQuery = (tabla: string) => {
    const filtros: string[] = [];
    const resultado = () => {
      const valor = tablas[tabla];
      return typeof valor === 'function' ? valor(filtros) : valor ?? { data: null, error: null };
    };
    const query: any = {
      select: jest.fn(() => query),
      insert: jest.fn((payload: any) => {
        inserciones.push({ tabla, payload });
        return query;
      }),
      update: jest.fn(() => query),
      delete: jest.fn(() => query),
      eq: jest.fn((columna: string) => {
        filtros.push(columna);
        return query;
      }),
      neq: jest.fn(() => query),
      not: jest.fn(() => query),
      in: jest.fn(() => query),
      gte: jest.fn(() => query),
      lte: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  };

  const cuentas = new Map<string, any>([
    ['12', { id: 'cuenta-12', codigo: '12' }],
    ['42', { id: 'cuenta-42', codigo: '42' }],
    ['676', { id: 'cuenta-676', codigo: '676' }],
    ['776', { id: 'cuenta-776', codigo: '776' }]
  ]);

  /**
   * `asientos_contables` se consulta para la idempotencia (filtrando por
   * source_event_id) y luego se inserta. El mock los distingue por el filtro:
   * sin asiento previo, con inserción exitosa.
   */
  const sinAsientoPrevio = (filtros: string[]) =>
    filtros.includes('source_event_id')
      ? { data: null, error: null }
      : { data: { id: 'asiento-reval', numero_asiento: 99 }, error: null };

  beforeEach(async () => {
    tablas = { asientos_contables: sinAsientoPrevio };
    inserciones = [];
    tiposCambio = {
      obtenerMonedaLocal: jest.fn().mockResolvedValue('PEN'),
      obtenerVigente: jest.fn()
    };
    periodos = { validarPeriodoAbierto: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevaluacionService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({
              from: jest.fn((tabla: string) => construirQuery(tabla)),
              rpc: jest.fn(async (nombre: string, payload: any) => {
                inserciones.push({ tabla: `rpc:${nombre}`, payload });
                return { data: { id: 'asiento-reval', numero_asiento: 99 }, error: null };
              })
            }))
          }
        },
        { provide: PeriodosService, useValue: periodos },
        {
          provide: PlanCuentasService,
          useValue: { obtenerCuentasPorCodigos: jest.fn().mockResolvedValue(cuentas) }
        },
        { provide: TiposCambioService, useValue: tiposCambio }
      ]
    }).compile();

    service = module.get<RevaluacionService>(RevaluacionService);
  });

  afterEach(() => jest.clearAllMocks());

  const conCotizacion = (compra: number, venta: number) =>
    tiposCambio.obtenerVigente.mockResolvedValue({ compra, venta });

  const conPosiciones = (cxc: any[], cxp: any[]) => {
    tablas['cuentas_por_cobrar'] = { data: cxc, error: null };
    tablas['cuentas_por_pagar'] = { data: cxp, error: null };
  };

  describe('signo de la diferencia', () => {
    it('una cuenta por cobrar en USD con el dólar al alza produce ganancia', async () => {
      // 1000 USD contabilizados a 3.700 y valuados a 3.800 → +100 PEN.
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      conCotizacion(3.8, 3.85);

      const resultado = await service.simular(TENANT, '2026-08-31');

      expect(resultado.posiciones).toHaveLength(1);
      expect(resultado.posiciones[0].diferencia).toBe(100);
      expect(resultado.total_ganancia).toBe(100);
      expect(resultado.total_perdida).toBe(0);
    });

    it('una cuenta por pagar en USD con el dólar al alza produce pérdida', async () => {
      // La misma variación sobre un pasivo es pérdida: se debe más en soles.
      conPosiciones(
        [],
        [{ id: 'cxp-1', moneda: 'USD', estado: 'PENDIENTE', saldo: 1000, tipo_cambio_origen: 3.7 }]
      );
      conCotizacion(3.8, 3.8);

      const resultado = await service.simular(TENANT, '2026-08-31');

      expect(resultado.posiciones[0].diferencia).toBe(-100);
      expect(resultado.total_perdida).toBe(100);
      expect(resultado.total_ganancia).toBe(0);
    });

    it('una cuenta por cobrar con el dólar a la baja produce pérdida', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 500, tipo_cambio_origen: 3.9 }],
        []
      );
      conCotizacion(3.8, 3.85);

      const resultado = await service.simular(TENANT, '2026-08-31');

      expect(resultado.posiciones[0].diferencia).toBe(-50);
      expect(resultado.total_perdida).toBe(50);
    });
  });

  describe('lado de la cotización', () => {
    it('valúa activos al tipo de cambio compra y pasivos al de venta', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 100, tipo_cambio_origen: 3.5 }],
        [{ id: 'cxp-1', moneda: 'USD', estado: 'PENDIENTE', saldo: 100, tipo_cambio_origen: 3.5 }]
      );
      conCotizacion(3.7, 3.9);

      const resultado = await service.simular(TENANT, '2026-08-31');

      const cxc = resultado.posiciones.find(p => p.tipo === 'CXC')!;
      const cxp = resultado.posiciones.find(p => p.tipo === 'CXP')!;
      expect(cxc.tipo_cambio_cierre).toBe(3.7);
      expect(cxp.tipo_cambio_cierre).toBe(3.9);
    });
  });

  describe('exclusiones', () => {
    it('excluye documentos sin tipo de cambio de origen, diciendo por qué', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: null }],
        []
      );
      conCotizacion(3.8, 3.85);

      const resultado = await service.simular(TENANT, '2026-08-31');

      expect(resultado.posiciones).toHaveLength(0);
      expect(resultado.excluidas).toHaveLength(1);
      expect(resultado.excluidas![0].motivo).toMatch(/no registra el tipo de cambio/);
    });

    it('excluye la posición si no hay cotización vigente a la fecha', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      tiposCambio.obtenerVigente.mockResolvedValue(null);

      const resultado = await service.simular(TENANT, '2026-08-31');

      expect(resultado.posiciones).toHaveLength(0);
      expect(resultado.excluidas![0].motivo).toMatch(/No hay tipo de cambio USD\/PEN/);
    });

    it('ignora documentos anulados y saldados', async () => {
      conPosiciones(
        [
          { id: 'cxc-1', moneda: 'USD', estado: 'ANULADA', monto_pendiente: 1000, tipo_cambio_origen: 3.7 },
          { id: 'cxc-2', moneda: 'USD', estado: 'PAGADA', monto_pendiente: 0, tipo_cambio_origen: 3.7 }
        ],
        []
      );
      conCotizacion(3.8, 3.85);

      const resultado = await service.simular(TENANT, '2026-08-31');

      expect(resultado.posiciones).toHaveLength(0);
      expect(resultado.excluidas).toBeUndefined();
    });
  });

  describe('asiento generado', () => {
    it('cuadra y registra ganancia y pérdida en bruto, sin compensarlas', async () => {
      // Ganancia en la CxC (+100) y pérdida en la CxP (-60): el neto es 40,
      // pero el estado de resultados debe mostrar los dos importes.
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        [{ id: 'cxp-1', moneda: 'USD', estado: 'PENDIENTE', saldo: 600, tipo_cambio_origen: 3.7 }]
      );
      conCotizacion(3.8, 3.8);

      await service.ejecutar(TENANT, USER, '2026-08-31');

      const llamada = inserciones.find(i => i.tabla === 'rpc:crear_asiento_con_detalles_tx')!.payload;
      const cabecera = llamada.p_asiento;
      const lineas = llamada.p_detalles;

      const totalDebe = lineas.reduce((s: number, l: any) => s + l.debe, 0);
      const totalHaber = lineas.reduce((s: number, l: any) => s + l.haber, 0);
      expect(Math.round(totalDebe * 100)).toBe(Math.round(totalHaber * 100));

      expect(lineas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 100, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-42', debe: 0, haber: 60 }),
          expect.objectContaining({ cuenta_id: 'cuenta-676', debe: 60, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-776', debe: 0, haber: 100 })
        ])
      );
      expect(cabecera.origen).toBe('REVALUACION_MONEDA');
      expect(cabecera.estado).toBe('CONFIRMADO');
    });

    it('usa un source_event_id uuid derivado de la fecha, no un texto libre', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      conCotizacion(3.8, 3.8);

      await service.ejecutar(TENANT, USER, '2026-08-31');

      const cabecera = inserciones.find(i => i.tabla === 'rpc:crear_asiento_con_detalles_tx')!.payload.p_asiento;
      expect(cabecera.source_event_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('rechaza el segundo corte sobre la misma fecha', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      conCotizacion(3.8, 3.8);
      tablas['asientos_contables'] = { data: { id: 'asiento-previo', numero_asiento: 7 }, error: null };

      await expect(service.ejecutar(TENANT, USER, '2026-08-31')).rejects.toThrow(
        /Ya existe un asiento de revaluación/
      );
      expect(inserciones).toHaveLength(0);
    });

    it('no escribe nada si no hay diferencia que registrar', async () => {
      conPosiciones([], []);

      await expect(service.ejecutar(TENANT, USER, '2026-08-31')).rejects.toThrow(
        /No hay diferencia de cambio que registrar/
      );
      expect(inserciones).toHaveLength(0);
    });

    it('respeta el período contable cerrado', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      conCotizacion(3.8, 3.8);
      periodos.validarPeriodoAbierto.mockRejectedValueOnce(
        new BadRequestException('El período contable 2026-08 está CERRADO.')
      );

      await expect(service.ejecutar(TENANT, USER, '2026-08-31')).rejects.toThrow(/CERRADO/);
      expect(inserciones).toHaveLength(0);
    });
  });

  describe('calcularDiferenciaRealizada', () => {
    it('cobrar una CxC en USD con el dólar al alza es ganancia', () => {
      expect(
        RevaluacionService.calcularDiferenciaRealizada({
          tipo: 'CXC',
          importeMonedaOrigen: 1000,
          tipoCambioOrigen: 3.7,
          tipoCambioLiquidacion: 3.8
        })
      ).toBe(100);
    });

    it('pagar una CxP en USD con el dólar al alza es pérdida', () => {
      expect(
        RevaluacionService.calcularDiferenciaRealizada({
          tipo: 'CXP',
          importeMonedaOrigen: 1000,
          tipoCambioOrigen: 3.7,
          tipoCambioLiquidacion: 3.8
        })
      ).toBe(-100);
    });

    it('rechaza cotizaciones no positivas en lugar de devolver un número sin sentido', () => {
      expect(() =>
        RevaluacionService.calcularDiferenciaRealizada({
          tipo: 'CXC',
          importeMonedaOrigen: 1000,
          tipoCambioOrigen: 0,
          tipoCambioLiquidacion: 3.8
        })
      ).toThrow(BadRequestException);
    });
  });
});
