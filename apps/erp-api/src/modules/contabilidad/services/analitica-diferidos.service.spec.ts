import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DistribucionAnaliticaService } from './distribucion-analitica.service';
import { DiferidosService } from './diferidos.service';
import { PeriodosService } from './periodos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { TipoDiferido } from '@erp-suite/dtos';

const construirCliente = (
  tablas: Record<string, any>,
  inserciones: Array<{ tabla: string; payload: any }>,
  actualizaciones: Array<{ tabla: string; payload: any }>,
  rpcs: Array<{ funcion: string; parametros: any }>,
  resultadosRpc: Record<string, any> = {}
) => ({
  rpc: jest.fn(async (funcion: string, parametros: any) => {
    rpcs.push({ funcion, parametros });
    return resultadosRpc[funcion] ?? { data: [], error: null };
  }),
  from: jest.fn((tabla: string) => {
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
      update: jest.fn((payload: any) => {
        actualizaciones.push({ tabla, payload });
        return query;
      }),
      delete: jest.fn(() => query),
      eq: jest.fn((columna: string) => {
        filtros.push(columna);
        return query;
      }),
      in: jest.fn(() => query),
      order: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  })
});

/**
 * Distribución analítica (§3.7).
 *
 * El foco está en el reparto de importes: un residuo mal tratado no rompe
 * ningún cuadre —la distribución no toca los asientos— pero deja céntimos sin
 * imputar en todos los reportes analíticos.
 */
describe('DistribucionAnaliticaService', () => {
  let service: DistribucionAnaliticaService;

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let actualizaciones: Array<{ tabla: string; payload: any }>;
  let rpcs: Array<{ funcion: string; parametros: any }>;

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    actualizaciones = [];
    rpcs = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DistribucionAnaliticaService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => construirCliente(tablas, inserciones, actualizaciones, rpcs))
          }
        }
      ]
    }).compile();

    service = module.get<DistribucionAnaliticaService>(DistribucionAnaliticaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('repartirImporte', () => {
    it('reparte por porcentaje exacto', () => {
      const reparto = DistribucionAnaliticaService.repartirImporte(1000, [
        { centro_costo_id: 'a', porcentaje: 60 },
        { centro_costo_id: 'b', porcentaje: 40 }
      ]);

      expect(reparto.map(r => r.monto)).toEqual([600, 400]);
    });

    it('el último destino absorbe el residuo del redondeo', () => {
      // 100 entre tres al 33,33% da 99,99: sin el ajuste, un céntimo quedaría
      // sin imputar en cada línea repartida en tercios.
      const reparto = DistribucionAnaliticaService.repartirImporte(100, [
        { centro_costo_id: 'a', porcentaje: 33.33 },
        { centro_costo_id: 'b', porcentaje: 33.33 },
        { centro_costo_id: 'c', porcentaje: 33.34 }
      ]);

      expect(reparto.map(r => r.monto)).toEqual([33.33, 33.33, 33.34]);
      expect(reparto.reduce((s, r) => s + r.monto, 0)).toBe(100);
    });

    it('reparte el valor absoluto: un abono también se imputa', () => {
      const reparto = DistribucionAnaliticaService.repartirImporte(-500, [
        { centro_costo_id: 'a', porcentaje: 50 },
        { centro_costo_id: 'b', porcentaje: 50 }
      ]);

      expect(reparto.map(r => r.monto)).toEqual([250, 250]);
    });

    it('un solo destino recibe el importe íntegro', () => {
      const reparto = DistribucionAnaliticaService.repartirImporte(777.77, [
        { centro_costo_id: 'a', porcentaje: 100 }
      ]);

      expect(reparto[0].monto).toBe(777.77);
    });
  });

  describe('validarPorcentajes', () => {
    it('acepta un reparto en tercios', () => {
      expect(() =>
        DistribucionAnaliticaService.validarPorcentajes([
          { centro_costo_id: 'a', porcentaje: 33.33 },
          { centro_costo_id: 'b', porcentaje: 33.33 },
          { centro_costo_id: 'c', porcentaje: 33.34 }
        ])
      ).not.toThrow();
    });

    it('rechaza un reparto que no suma 100', () => {
      expect(() =>
        DistribucionAnaliticaService.validarPorcentajes([
          { centro_costo_id: 'a', porcentaje: 60 },
          { centro_costo_id: 'b', porcentaje: 30 }
        ])
      ).toThrow(/deben sumar 100/);
    });

    it('rechaza el mismo destino repetido', () => {
      expect(() =>
        DistribucionAnaliticaService.validarPorcentajes([
          { centro_costo_id: 'a', porcentaje: 50 },
          { centro_costo_id: 'a', porcentaje: 50 }
        ])
      ).toThrow(/dos veces/);
    });
  });

  describe('asignar', () => {
    it('rechaza destinos de otro eje', async () => {
      tablas['detalle_asientos'] = { data: { id: 'd1', debe: 1000, haber: 0 }, error: null };
      tablas['centros_costo'] = {
        data: [
          { id: 'c1', nombre: 'Lima', eje: 'SUCURSAL', activo: true },
          { id: 'c2', nombre: 'Proyecto A', eje: 'PROYECTO', activo: true }
        ],
        error: null
      };

      await expect(
        service.asignar(TENANT, USER, {
          detalle_asiento_id: 'd1',
          eje: 'SUCURSAL',
          imputaciones: [
            { centro_costo_id: 'c1', porcentaje: 50 },
            { centro_costo_id: 'c2', porcentaje: 50 }
          ]
        })
      ).rejects.toThrow(/no pertenecen al eje SUCURSAL/);

      expect(inserciones).toHaveLength(0);
    });

    it('rechaza destinos inactivos', async () => {
      tablas['detalle_asientos'] = { data: { id: 'd1', debe: 1000, haber: 0 }, error: null };
      tablas['centros_costo'] = {
        data: [{ id: 'c1', nombre: 'Cerrado', eje: 'CENTRO_COSTO', activo: false }],
        error: null
      };

      await expect(
        service.asignar(TENANT, USER, {
          detalle_asiento_id: 'd1',
          eje: 'CENTRO_COSTO',
          imputaciones: [{ centro_costo_id: 'c1', porcentaje: 100 }]
        })
      ).rejects.toThrow(/destinos inactivos/);
    });

    it('deriva el importe imputado del debe menos el haber de la línea', async () => {
      tablas['detalle_asientos'] = { data: { id: 'd1', debe: 900, haber: 0 }, error: null };
      tablas['centros_costo'] = {
        data: [
          { id: 'c1', nombre: 'Lima', eje: 'CENTRO_COSTO', activo: true },
          { id: 'c2', nombre: 'Cusco', eje: 'CENTRO_COSTO', activo: true }
        ],
        error: null
      };
      await service.asignar(TENANT, USER, {
        detalle_asiento_id: 'd1',
        eje: 'centro_costo',
        imputaciones: [
          { centro_costo_id: 'c1', porcentaje: 70 },
          { centro_costo_id: 'c2', porcentaje: 30 }
        ]
      });

      expect(rpcs).toEqual([
        {
          funcion: 'asignar_distribucion_analitica_tx',
          parametros: {
            p_tenant_id: TENANT,
            p_detalle_asiento_id: 'd1',
            p_eje: 'CENTRO_COSTO',
            p_imputaciones: [
              { centro_costo_id: 'c1', porcentaje: 70, monto: 630 },
              { centro_costo_id: 'c2', porcentaje: 30, monto: 270 }
            ],
            p_created_by: USER
          }
        }
      ]);
      expect(inserciones).toHaveLength(0);
    });
  });
});

/**
 * Ingresos y gastos diferidos (§3.8).
 */
describe('DiferidosService', () => {
  let service: DiferidosService;
  let periodos: { validarPeriodoAbierto: jest.Mock };

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let actualizaciones: Array<{ tabla: string; payload: any }>;
  let rpcs: Array<{ funcion: string; parametros: any }>;
  let resultadosRpc: Record<string, any>;

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    actualizaciones = [];
    rpcs = [];
    resultadosRpc = {
      devengar_diferidos_tx: { data: { asiento: { id: 'asiento-dev' } }, error: null }
    };
    periodos = { validarPeriodoAbierto: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiferidosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() =>
              construirCliente(tablas, inserciones, actualizaciones, rpcs, resultadosRpc)
            )
          }
        },
        { provide: PeriodosService, useValue: periodos }
      ]
    }).compile();

    service = module.get<DiferidosService>(DiferidosService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calcularCronograma', () => {
    it('la última cuota absorbe el residuo', () => {
      const cuotas = DiferidosService.calcularCronograma({
        montoTotal: 1000,
        periodos: 3,
        fechaInicio: new Date('2026-01-01T00:00:00Z')
      });

      expect(cuotas.map(c => c.monto)).toEqual([333.33, 333.33, 333.34]);
      expect(cuotas[2].acumulado).toBe(1000);
      expect(cuotas[2].pendiente).toBe(0);
    });

    it('el cronograma cruza el fin de año', () => {
      const cuotas = DiferidosService.calcularCronograma({
        montoTotal: 1200,
        periodos: 12,
        fechaInicio: new Date('2026-07-01T00:00:00Z')
      });

      expect(cuotas[0].periodo).toBe('2026-07');
      expect(cuotas[6].periodo).toBe('2027-01');
      expect(cuotas[11].periodo).toBe('2027-06');
    });
  });

  describe('cuotaDelPeriodo', () => {
    const base = {
      monto_total: 1200,
      monto_devengado: 0,
      periodos: 12,
      fecha_inicio: '2026-01-01'
    };

    it('devuelve la cuota dentro del calendario', () => {
      expect(DiferidosService.cuotaDelPeriodo(base, 2026, 3)).toBe(100);
    });

    it('devuelve cero fuera del calendario', () => {
      expect(DiferidosService.cuotaDelPeriodo(base, 2025, 12)).toBe(0);
      expect(DiferidosService.cuotaDelPeriodo(base, 2027, 1)).toBe(0);
    });

    it('recorta la última cuota a lo que queda pendiente', () => {
      expect(
        DiferidosService.cuotaDelPeriodo({ ...base, monto_devengado: 1150 }, 2026, 12)
      ).toBe(50);
    });
  });

  describe('devengarPeriodo', () => {
    const diferidoGasto = {
      id: 'dif-1',
      nombre: 'Seguro anual',
      tipo: 'GASTO',
      cuenta_diferido_id: 'cuenta-18',
      cuenta_resultado_id: 'cuenta-65',
      monto_total: 1200,
      monto_devengado: 0,
      periodos: 12,
      fecha_inicio: '2026-01-01',
      centro_costo_id: 'cc-1'
    };

    const conDiferidos = (filas: any[]) => {
      tablas['diferidos'] = { data: filas, error: null };
      tablas['asientos_contables'] = (filtros: string[]) =>
        filtros.includes('source_event_id')
          ? { data: null, error: null }
          : { data: { id: 'asiento-dev' }, error: null };
      tablas['detalle_asientos'] = { data: null, error: null };
      tablas['diferidos_devengos'] = { data: null, error: null };
    };

    it('un gasto diferido carga resultados y descarga el balance', async () => {
      conDiferidos([diferidoGasto]);

      const resultado = await service.devengarPeriodo(TENANT, USER, 2026, 3);

      expect(resultado).toMatchObject({
        periodo: '2026-03',
        diferidos_devengados: 1,
        total_devengado: 100
      });

      const lineas = rpcs.find(r => r.funcion === 'devengar_diferidos_tx')!.parametros.p_detalles;
      expect(lineas).toEqual([
        expect.objectContaining({ cuenta_id: 'cuenta-65', debe: 100, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-18', debe: 0, haber: 100 })
      ]);
    });

    it('un ingreso diferido invierte los lados', async () => {
      conDiferidos([
        {
          ...diferidoGasto,
          tipo: 'INGRESO',
          cuenta_diferido_id: 'cuenta-49',
          cuenta_resultado_id: 'cuenta-70'
        }
      ]);

      await service.devengarPeriodo(TENANT, USER, 2026, 3);

      const lineas = rpcs.find(r => r.funcion === 'devengar_diferidos_tx')!.parametros.p_detalles;
      expect(lineas).toEqual([
        expect.objectContaining({ cuenta_id: 'cuenta-49', debe: 100, haber: 0 }),
        expect.objectContaining({ cuenta_id: 'cuenta-70', debe: 0, haber: 100 })
      ]);
    });

    it('genera un solo asiento para varios diferidos y cuadra', async () => {
      conDiferidos([
        diferidoGasto,
        { ...diferidoGasto, id: 'dif-2', nombre: 'Alquiler', monto_total: 600, periodos: 6 }
      ]);

      const resultado = await service.devengarPeriodo(TENANT, USER, 2026, 3);

      expect(resultado.diferidos_devengados).toBe(2);
      expect(resultado.total_devengado).toBe(200);

      expect(rpcs.filter(r => r.funcion === 'devengar_diferidos_tx')).toHaveLength(1);

      const lineas = rpcs.find(r => r.funcion === 'devengar_diferidos_tx')!.parametros.p_detalles;
      const debe = lineas.reduce((s: number, l: any) => s + l.debe, 0);
      const haber = lineas.reduce((s: number, l: any) => s + l.haber, 0);
      expect(Math.round(debe * 100)).toBe(Math.round(haber * 100));
    });

    it('marca DEVENGADO el diferido que completa su calendario', async () => {
      conDiferidos([{ ...diferidoGasto, monto_devengado: 1100 }]);

      await service.devengarPeriodo(TENANT, USER, 2026, 12);

      const items = rpcs.find(r => r.funcion === 'devengar_diferidos_tx')!.parametros.p_items;
      expect(items).toEqual([
        expect.objectContaining({ diferido_id: 'dif-1', monto: 100, monto_acumulado: 1200 })
      ]);
    });

    it('no escribe nada si ningún diferido toca este período', async () => {
      conDiferidos([{ ...diferidoGasto, fecha_inicio: '2027-01-01' }]);

      const resultado = await service.devengarPeriodo(TENANT, USER, 2026, 3);

      expect(resultado.diferidos_devengados).toBe(0);
      expect(resultado.omitidos).toHaveLength(1);
      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('rechaza el segundo devengo del mismo período', async () => {
      conDiferidos([diferidoGasto]);
      tablas['asientos_contables'] = { data: { id: 'asiento-previo' }, error: null };

      await expect(service.devengarPeriodo(TENANT, USER, 2026, 3)).rejects.toThrow(
        /ya fue registrado/
      );
    });

    it('respeta el período contable cerrado', async () => {
      conDiferidos([diferidoGasto]);
      periodos.validarPeriodoAbierto.mockRejectedValueOnce(
        new BadRequestException('El período contable 2026-03 está CERRADO.')
      );

      await expect(service.devengarPeriodo(TENANT, USER, 2026, 3)).rejects.toThrow(/CERRADO/);
      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('no intenta compensaciones parciales cuando la transacción de devengo falla', async () => {
      conDiferidos([diferidoGasto]);
      resultadosRpc.devengar_diferidos_tx = {
        data: null,
        error: { message: 'fallo atómico' }
      };

      await expect(service.devengarPeriodo(TENANT, USER, 2026, 3)).rejects.toThrow(
        /fallo atómico/
      );

      expect(rpcs).toHaveLength(1);
      expect(inserciones).toHaveLength(0);
      expect(actualizaciones).toHaveLength(0);
    });
  });

  describe('crear', () => {
    it('rechaza usar la misma cuenta de balance y resultados', async () => {
      await expect(
        service.crear(TENANT, USER, {
          nombre: 'Seguro',
          tipo: TipoDiferido.GASTO,
          cuenta_diferido_id: 'cuenta-18',
          cuenta_resultado_id: 'cuenta-18',
          monto_total: 1200,
          periodos: 12,
          fecha_inicio: '2026-01-01'
        })
      ).rejects.toThrow(/no pueden ser la misma/);

      expect(inserciones).toHaveLength(0);
    });
  });
});
