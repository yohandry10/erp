import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ActivosFijosService } from './activos-fijos.service';
import { PeriodosService } from './periodos.service';
import { PlanCuentasService } from './plan-cuentas.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { MotivoBajaActivo } from '@erp-suite/dtos';

/**
 * Activos fijos (Fase 4).
 *
 * El grueso de las pruebas está en la aritmética: una cuota mal redondeada no
 * rompe ningún cuadre, simplemente deja céntimos colgando para siempre y hace
 * que el activo nunca llegue a su valor residual.
 */
describe('ActivosFijosService', () => {
  let service: ActivosFijosService;
  let periodos: { validarPeriodoAbierto: jest.Mock };

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let actualizaciones: Array<{ tabla: string; payload: any }>;
  let rpcs: Array<{ funcion: string; parametros: any }>;
  let resultadosRpc: Record<string, any>;

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
      update: jest.fn((payload: any) => {
        actualizaciones.push({ tabla, payload });
        return query;
      }),
      delete: jest.fn(() => query),
      eq: jest.fn((columna: string) => {
        filtros.push(columna);
        return query;
      }),
      gte: jest.fn(() => query),
      lte: jest.fn(() => query),
      order: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  };

  const cuentas = new Map<string, any>([
    ['33', { id: 'cuenta-33' }],
    ['39', { id: 'cuenta-39' }],
    ['65', { id: 'cuenta-65' }],
    ['75', { id: 'cuenta-75' }],
    ['12', { id: 'cuenta-12' }]
  ]);

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    actualizaciones = [];
    rpcs = [];
    resultadosRpc = {
      gestionar_activo_diferido_tx: {
        data: { record: { id: 'af-1', codigo: 'AF-1', nombre: 'Equipo', fecha_adquisicion: '2026-03-15',
          fecha_inicio_depreciacion: '2026-03-15', valor_adquisicion: 1000, valor_residual: 0,
          vida_util_meses: 12, depreciacion_acumulada: 0, situacion: 'ACTIVO' } }, error: null,
      },
      registrar_depreciacion_tx: { data: { depreciacion: { id: 'dep-1' } }, error: null },
      dar_baja_activo_tx: {
        data: {
          asiento: { id: 'asiento-baja', numero_asiento: 50 },
          activo: { id: 'af-1', codigo: 'AF-1', situacion: 'BAJA' }
        },
        error: null
      }
    };
    periodos = { validarPeriodoAbierto: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivosFijosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({
              from: jest.fn((tabla: string) => construirQuery(tabla)),
              rpc: jest.fn(async (funcion: string, parametros: any) => {
                rpcs.push({ funcion, parametros });
                return resultadosRpc[funcion] ?? { data: null, error: null };
              })
            }))
          }
        },
        { provide: PeriodosService, useValue: periodos },
        {
          provide: PlanCuentasService,
          useValue: { obtenerCuentasPorCodigos: jest.fn().mockResolvedValue(cuentas) }
        }
      ]
    }).compile();

    service = module.get<ActivosFijosService>(ActivosFijosService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calcularCronograma', () => {
    const calc = ActivosFijosService.calcularCronograma;

    it('reparte la base depreciable en cuotas iguales', () => {
      const cuotas = calc({
        valorAdquisicion: 12000,
        valorResidual: 0,
        vidaUtilMeses: 12,
        fechaInicio: new Date('2026-01-01T00:00:00Z')
      });

      expect(cuotas).toHaveLength(12);
      expect(cuotas[0]).toMatchObject({ periodo: '2026-01', cuota: 1000, acumulada: 1000 });
      expect(cuotas[11]).toMatchObject({ periodo: '2026-12', acumulada: 12000, valor_neto: 0 });
    });

    it('la última cuota absorbe el residuo del redondeo', () => {
      // 10.000 en 3 meses son 3.333,33 y sobra un céntimo. Sin el ajuste, el
      // activo se quedaría en 0,01 para siempre.
      const cuotas = calc({
        valorAdquisicion: 10000,
        valorResidual: 0,
        vidaUtilMeses: 3,
        fechaInicio: new Date('2026-01-01T00:00:00Z')
      });

      expect(cuotas[0].cuota).toBe(3333.33);
      expect(cuotas[1].cuota).toBe(3333.33);
      expect(cuotas[2].cuota).toBe(3333.34);
      expect(cuotas[2].acumulada).toBe(10000);
      expect(cuotas[2].valor_neto).toBe(0);
    });

    it('respeta el valor residual: el activo nunca deprecia por debajo', () => {
      const cuotas = calc({
        valorAdquisicion: 10000,
        valorResidual: 1000,
        vidaUtilMeses: 9,
        fechaInicio: new Date('2026-01-01T00:00:00Z')
      });

      expect(cuotas[8].acumulada).toBe(9000);
      expect(cuotas[8].valor_neto).toBe(1000);
    });

    it('el cronograma cruza correctamente el fin de año', () => {
      const cuotas = calc({
        valorAdquisicion: 1200,
        valorResidual: 0,
        vidaUtilMeses: 14,
        fechaInicio: new Date('2026-11-01T00:00:00Z')
      });

      expect(cuotas[0].periodo).toBe('2026-11');
      expect(cuotas[2].periodo).toBe('2027-01');
      expect(cuotas[13].periodo).toBe('2027-12');
    });

    it('un activo sin base depreciable no genera cronograma', () => {
      expect(
        calc({
          valorAdquisicion: 5000,
          valorResidual: 5000,
          vidaUtilMeses: 12,
          fechaInicio: new Date('2026-01-01T00:00:00Z')
        })
      ).toEqual([]);
    });
  });

  describe('cuotaDelPeriodo', () => {
    const activoBase = {
      valor_adquisicion: 12000,
      valor_residual: 0,
      vida_util_meses: 12,
      depreciacion_acumulada: 0,
      fecha_inicio_depreciacion: '2026-01-01'
    };

    it('devuelve la cuota dentro de la vida útil', () => {
      expect(ActivosFijosService.cuotaDelPeriodo(activoBase, 2026, 1)).toBe(1000);
      expect(ActivosFijosService.cuotaDelPeriodo(activoBase, 2026, 6)).toBe(1000);
    });

    it('devuelve cero antes del inicio de la depreciación', () => {
      expect(ActivosFijosService.cuotaDelPeriodo(activoBase, 2025, 12)).toBe(0);
    });

    it('devuelve cero una vez agotada la vida útil', () => {
      expect(ActivosFijosService.cuotaDelPeriodo(activoBase, 2027, 1)).toBe(0);
    });

    it('recorta la última cuota a lo que queda pendiente', () => {
      // Ya se depreciaron 11.500 de 12.000: solo quedan 500, no 1.000.
      expect(
        ActivosFijosService.cuotaDelPeriodo(
          { ...activoBase, depreciacion_acumulada: 11500 },
          2026,
          12
        )
      ).toBe(500);
    });

    it('no deprecia si ya se alcanzó el valor residual', () => {
      expect(
        ActivosFijosService.cuotaDelPeriodo(
          { ...activoBase, valor_residual: 2000, depreciacion_acumulada: 10000 },
          2026,
          12
        )
      ).toBe(0);
    });
  });

  describe('alta', () => {
    it('rechaza un valor residual mayor que el de adquisición', async () => {
      await expect(
        service.crear(TENANT, USER, {
          codigo: 'AF-1',
          nombre: 'Equipo',
          fecha_adquisicion: '2026-01-01',
          valor_adquisicion: 1000,
          valor_residual: 1500,
          vida_util_meses: 12
        })
      ).rejects.toThrow(/no puede superar/);

      expect(inserciones).toHaveLength(0);
    });

    it('arranca la depreciación en la fecha de adquisición si no se indica otra', async () => {
      await service.crear(TENANT, USER, {
        codigo: 'AF-1',
        nombre: 'Equipo',
        fecha_adquisicion: '2026-03-15',
        valor_adquisicion: 1000,
        vida_util_meses: 12
      });

      expect(rpcs).toContainEqual(expect.objectContaining({
        funcion: 'gestionar_activo_diferido_tx',
        parametros: expect.objectContaining({ p_entity: 'ASSET', p_action: 'CREATE' }),
      }));
      expect(inserciones).toHaveLength(0);
    });
  });

  describe('depreciarPeriodo', () => {
    it('registra la cuota y actualiza la acumulada del activo', async () => {
      tablas['activos_fijos'] = {
        data: [
          {
            id: 'af-1',
            codigo: 'AF-1',
            valor_adquisicion: 12000,
            valor_residual: 0,
            vida_util_meses: 12,
            depreciacion_acumulada: 0,
            fecha_inicio_depreciacion: '2026-01-01'
          }
        ],
        error: null
      };
      tablas['depreciaciones'] = { data: null, error: null };

      const resultado = await service.depreciarPeriodo(TENANT, USER, 2026, 1);

      expect(resultado).toMatchObject({
        periodo: '2026-01',
        activos_depreciados: 1,
        total_depreciado: 1000
      });
      const registro = rpcs.find(r => r.funcion === 'registrar_depreciacion_tx');
      expect(registro!.parametros).toMatchObject({
        p_activo_id: 'af-1',
        p_periodo: '2026-01',
        p_monto: 1000,
        p_acumulado: 1000,
        p_valor_neto: 11000
      });
    });

    it('marca como DEPRECIADO el activo que alcanza su valor residual', async () => {
      tablas['activos_fijos'] = {
        data: [
          {
            id: 'af-1',
            codigo: 'AF-1',
            valor_adquisicion: 12000,
            valor_residual: 0,
            vida_util_meses: 12,
            depreciacion_acumulada: 11000,
            fecha_inicio_depreciacion: '2026-01-01'
          }
        ],
        error: null
      };
      tablas['depreciaciones'] = { data: null, error: null };

      await service.depreciarPeriodo(TENANT, USER, 2026, 12);

      const registro = rpcs.find(r => r.funcion === 'registrar_depreciacion_tx');
      expect(registro!.parametros.p_acumulado).toBe(12000);
      expect(registro!.parametros.p_valor_neto).toBe(0);
    });

    it('traduce el choque contra el índice único a un motivo entendible', async () => {
      tablas['activos_fijos'] = {
        data: [
          {
            id: 'af-1',
            codigo: 'AF-1',
            valor_adquisicion: 12000,
            valor_residual: 0,
            vida_util_meses: 12,
            depreciacion_acumulada: 0,
            fecha_inicio_depreciacion: '2026-01-01'
          }
        ],
        error: null
      };
      resultadosRpc.registrar_depreciacion_tx = {
        data: null,
        error: { code: '23505', message: 'duplicate' }
      };

      const resultado = await service.depreciarPeriodo(TENANT, USER, 2026, 1);

      expect(resultado.activos_depreciados).toBe(0);
      expect(resultado.omitidos![0].motivo).toMatch(/ya tiene registrada su depreciación/);
    });

    it('respeta el período contable cerrado', async () => {
      periodos.validarPeriodoAbierto.mockRejectedValueOnce(
        new BadRequestException('El período contable 2026-01 está CERRADO.')
      );

      await expect(service.depreciarPeriodo(TENANT, USER, 2026, 1)).rejects.toThrow(/CERRADO/);
      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('rechaza un mes inválido', async () => {
      await expect(service.depreciarPeriodo(TENANT, USER, 2026, 13)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  describe('darDeBaja', () => {
    const activoParcialmenteDepreciado = {
      id: 'af-1',
      codigo: 'AF-1',
      nombre: 'Camioneta',
      valor_adquisicion: 10000,
      valor_residual: 0,
      vida_util_meses: 60,
      depreciacion_acumulada: 4000,
      situacion: 'ACTIVO'
    };

    const conActivo = (activo: any) => {
      tablas['activos_fijos'] = { data: activo, error: null };
      tablas['asientos_contables'] = (filtros: string[]) =>
        filtros.length === 0
          ? { data: { id: 'asiento-baja', numero_asiento: 50 }, error: null }
          : { data: activo, error: null };
      tablas['detalle_asientos'] = { data: null, error: null };
    };

    const lineasDelAsiento = () =>
      rpcs.find(r => r.funcion === 'dar_baja_activo_tx')!.parametros.p_detalles as any[];

    const cuadra = (lineas: any[]) =>
      Math.round(lineas.reduce((s, l) => s + l.debe, 0) * 100) ===
      Math.round(lineas.reduce((s, l) => s + l.haber, 0) * 100);

    it('una baja cancela la acumulada y lleva el valor neto a gasto', async () => {
      conActivo(activoParcialmenteDepreciado);

      await service.darDeBaja(TENANT, USER, 'af-1', {
        fecha: '2026-09-30',
        tipo: MotivoBajaActivo.BAJA
      });

      const lineas = lineasDelAsiento();
      expect(cuadra(lineas)).toBe(true);
      expect(lineas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cuenta_id: 'cuenta-39', debe: 4000, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-65', debe: 6000, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-33', debe: 0, haber: 10000 })
        ])
      );
    });

    it('una venta añade la cuenta por cobrar y el ingreso, y sigue cuadrando', async () => {
      conActivo(activoParcialmenteDepreciado);

      await service.darDeBaja(TENANT, USER, 'af-1', {
        fecha: '2026-09-30',
        tipo: MotivoBajaActivo.VENTA,
        valor_venta: 7000
      });

      const lineas = lineasDelAsiento();
      expect(cuadra(lineas)).toBe(true);
      expect(lineas).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cuenta_id: 'cuenta-12', debe: 7000, haber: 0 }),
          expect.objectContaining({ cuenta_id: 'cuenta-75', debe: 0, haber: 7000 })
        ])
      );
    });

    it('un activo totalmente depreciado se da de baja sin línea de gasto', async () => {
      conActivo({ ...activoParcialmenteDepreciado, depreciacion_acumulada: 10000 });

      await service.darDeBaja(TENANT, USER, 'af-1', {
        fecha: '2026-09-30',
        tipo: MotivoBajaActivo.BAJA
      });

      const lineas = lineasDelAsiento();
      expect(cuadra(lineas)).toBe(true);
      expect(lineas.find((l: any) => l.cuenta_id === 'cuenta-65')).toBeUndefined();
    });

    it('una venta sin importe se rechaza', async () => {
      conActivo(activoParcialmenteDepreciado);

      await expect(
        service.darDeBaja(TENANT, USER, 'af-1', {
          fecha: '2026-09-30',
          tipo: MotivoBajaActivo.VENTA
        })
      ).rejects.toThrow(/requiere el importe/);

      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('un activo ya retirado no se puede retirar otra vez', async () => {
      conActivo({ ...activoParcialmenteDepreciado, situacion: 'VENDIDO' });

      await expect(
        service.darDeBaja(TENANT, USER, 'af-1', {
          fecha: '2026-09-30',
          tipo: MotivoBajaActivo.BAJA
        })
      ).rejects.toThrow(/ya fue retirado/);
    });

    it('respeta el período contable cerrado', async () => {
      conActivo(activoParcialmenteDepreciado);
      periodos.validarPeriodoAbierto.mockRejectedValueOnce(
        new BadRequestException('El período contable 2026-09 está CERRADO.')
      );

      await expect(
        service.darDeBaja(TENANT, USER, 'af-1', {
          fecha: '2026-09-30',
          tipo: MotivoBajaActivo.BAJA
        })
      ).rejects.toThrow(/CERRADO/);

      expect(inserciones).toHaveLength(0);
      expect(rpcs).toHaveLength(0);
    });

    it('un fallo transaccional no intenta borrar ni reparar por llamadas separadas', async () => {
      conActivo(activoParcialmenteDepreciado);
      resultadosRpc.dar_baja_activo_tx = {
        data: null,
        error: { message: 'fallo atómico' }
      };

      await expect(
        service.darDeBaja(TENANT, USER, 'af-1', {
          fecha: '2026-09-30',
          tipo: MotivoBajaActivo.BAJA
        })
      ).rejects.toThrow(/fallo atómico/);

      expect(rpcs).toHaveLength(1);
      expect(inserciones).toHaveLength(0);
      expect(actualizaciones).toHaveLength(0);
    });
  });
});
