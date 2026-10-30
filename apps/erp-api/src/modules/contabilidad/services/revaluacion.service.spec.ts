import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EjecutarRevaluacionDto } from '@erp-suite/dtos';
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
    const cortes: Record<string, string> = {};
    const resultado = () => {
      const valor = tablas[tabla];
      const result = typeof valor === 'function' ? valor(filtros) : valor ?? { data: null, error: null };
      return Array.isArray(result.data) ? { ...result, data: result.data.filter((row: any) =>
        Object.entries(cortes).every(([key, date]) => !row[key] || row[key] <= date)) } : result;
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
      lte: jest.fn((column: string, date: string) => { cortes[column] = date; return query; }),
      order: jest.fn(() => query),
      range: jest.fn(() => query),
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
    tablas = { asientos_contables: sinAsientoPrevio,empresa_config:{data:{tenant_id:TENANT,pais:'PE'},error:null},tipos_cambio:{data:[],count:0,error:null} };
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
                return tablas[`rpc:${nombre}`] ?? { data: { ...payload.p_simulacion, asiento_id: 'asiento-reval', numero_asiento: 99 }, error: null };
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

  const conCotizacion = (compra: number, venta: number) =>{
    tiposCambio.obtenerVigente.mockResolvedValue({ compra, venta });
    tablas.tipos_cambio={data:[{id:'rate-1',tenant_id:TENANT,moneda_origen:'USD',moneda_destino:'PEN',fecha:'2026-08-01',compra,venta,activo:true,estado:'ACTIVO'}],count:1,error:null};
  };

  const conPosiciones = (cxc: any[], cxp: any[]) => {
    tablas['cuentas_por_cobrar'] = { data: cxc.map(r=>({tenant_id:TENANT,fecha_emision:'2026-08-01',...r})),count:cxc.length,error:null };
    tablas['cuentas_por_pagar'] = { data: cxp.map(r=>({tenant_id:TENANT,fecha_emision:'2026-08-01',...r})),count:cxp.length,error:null };
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
    it('no incluye CxC ni CxP emitidas después del corte; sí incluye su día de emisión', async () => {
      conPosiciones(
        [{ id: 'cxc-futura', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 100, tipo_cambio_origen: 3.7, fecha_emision: '2026-09-01' }],
        [{ id: 'cxp-futura', moneda: 'USD', estado: 'PENDIENTE', saldo: 100, tipo_cambio_origen: 3.7, fecha_emision: '2026-09-01' }]
      );
      conCotizacion(3.8, 3.8);
      expect((await service.simular(TENANT, '2026-08-31')).posiciones).toHaveLength(0);
      expect((await service.simular(TENANT, '2026-09-01')).posiciones).toHaveLength(2);
    });
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
    it('conserva la simulación revisada al pasar por el ValidationPipe real', async () => {
      conPosiciones([], [{ id: 'cxp-1', moneda: 'USD', estado: 'PENDIENTE', saldo: 11.8, tipo_cambio_origen: 3.75 }]);
      conCotizacion(3.710001, 3.760001);
      const simulacion = await service.simular(TENANT, '2026-10-08');
      const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true } });
      const dto = await pipe.transform({ fecha: simulacion.fecha, simulacion, idempotency_key: 'fx-reviewed-intent' },
        { type: 'body', metatype: EjecutarRevaluacionDto });
      expect(JSON.parse(JSON.stringify(dto.simulacion))).toEqual(JSON.parse(JSON.stringify(simulacion)));
    });
    it('entrega a la transacción tenant, actor y simulación sin compensar ganancia/pérdida', async () => {
      // Ganancia en la CxC (+100) y pérdida en la CxP (-60): el neto es 40,
      // pero el estado de resultados debe mostrar los dos importes.
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        [{ id: 'cxp-1', moneda: 'USD', estado: 'PENDIENTE', saldo: 600, tipo_cambio_origen: 3.7 }]
      );
      conCotizacion(3.8, 3.8);

      await service.ejecutar(TENANT, USER, '2026-08-31');

      const llamada = inserciones.find(i => i.tabla === 'rpc:registrar_revaluacion_tx_570')!.payload;
      expect(llamada).toEqual(expect.objectContaining({ p_tenant_id: TENANT, p_actor_id: USER, p_fecha: '2026-08-31' }));
      expect(llamada.p_simulacion).toEqual(expect.objectContaining({ total_ganancia: 100, total_perdida: 60, diferencia_neta: 40 }));
    });

    it('identifica la intención de un consumidor sin clave explícita con un UUID estable', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      conCotizacion(3.8, 3.8);

      await service.ejecutar(TENANT, USER, '2026-08-31');

      const llamada = inserciones.find(i => i.tabla === 'rpc:registrar_revaluacion_tx_570')!.payload;
      expect(llamada.p_idempotency_key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('rechaza el segundo corte sobre la misma fecha', async () => {
      conPosiciones(
        [{ id: 'cxc-1', moneda: 'USD', estado: 'PENDIENTE', monto_pendiente: 1000, tipo_cambio_origen: 3.7 }],
        []
      );
      conCotizacion(3.8, 3.8);
      tablas['rpc:registrar_revaluacion_tx_570'] = { data: null, error: { message: 'Ya existe un asiento de revaluación vigente.' } };

      await expect(service.ejecutar(TENANT, USER, '2026-08-31')).rejects.toThrow(
        /Ya existe un asiento de revaluación/
      );
      expect(inserciones).toHaveLength(1);
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
