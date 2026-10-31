import { batchTestKey, batchTestId, batchTestReceipt } from './asset-depreciation-batch.fixture';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
      const result = typeof valor === 'function' ? valor(filtros) : valor ?? { data: null, error: null };
      return Array.isArray(result.data) ? { ...result, count: result.data.length } : result;
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
      range: jest.fn(() => query),
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
                if(funcion==='registrar_lote_depreciacion_tx_570'&&!resultadosRpc[funcion])return {data:batchTestReceipt(parametros),error:null};
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

  describe('estimación prospectiva572', () => {
    const revision = { version: 572, periodo_inicio: '2026-02', meses_restantes: 23, base_centimos: 1100000, cuota_centimos: 47826, acumulada_anterior_centimos: 100000, adquisicion_centimos: 1200000, residual_centimos: 0 };
    const activo = { id: 'af-570', codigo: 'AF-570', valor_adquisicion: 12000, valor_residual: 0, vida_util_meses: 24, depreciacion_acumulada: 1000, fecha_inicio_depreciacion: '2026-01-01', situacion: 'ACTIVO', metadata: { depreciacion_revision_572: revision } };

    it('reparte el pendiente entre los meses restantes y absorbe los céntimos al final', () => {
      const actual = { ...activo };
      const cuotas = [];
      for (let indice = 0; indice < 23; indice++) {
        const fecha = new Date(Date.UTC(2026, 1 + indice, 1));
        const cuota = ActivosFijosService.cuotaDelPeriodo(actual, fecha.getUTCFullYear(), fecha.getUTCMonth() + 1);
        cuotas.push(cuota);
        actual.depreciacion_acumulada = Math.round((actual.depreciacion_acumulada + cuota) * 100) / 100;
      }
      expect(cuotas.slice(0, 22)).toEqual(Array(22).fill(478.26));
      expect(cuotas[22]).toBe(478.28);
      expect(actual.depreciacion_acumulada).toBe(12000);
      expect(ActivosFijosService.cuotaDelPeriodo(actual, 2028, 1)).toBe(0);
      expect(ActivosFijosService.cuotaDelPeriodo(activo, 2026, 1)).toBe(0);
    });

    it('el residual revisado se descuenta del pendiente, sin volver a dividir la adquisición', () => {
      const actual = { ...activo, vida_util_meses: 12, valor_residual: 1000, metadata: { depreciacion_revision_572: { ...revision, meses_restantes: 11, base_centimos: 1000000, cuota_centimos: 90909, residual_centimos: 100000 } } };
      expect(ActivosFijosService.cuotaDelPeriodo(actual, 2026, 2)).toBe(909.09);
    });

    it('cronograma conserva la cuota real y su acumulada histórica', async () => {
      tablas.activos_fijos = { data: activo, error: null };
      tablas.depreciaciones = { data: [{ id: 'history-jan', tenant_id: TENANT, activo_id: activo.id, periodo: '2026-01', monto_depreciacion: 1000, depreciacion_acumulada: 1000, valor_neto: 11000, estado: 'PENDIENTE', activo: true }], error: null };
      const rows = await service.obtenerCronograma(TENANT, activo.id);
      expect(rows).toHaveLength(24);
      expect(rows[0]).toEqual({ periodo: '2026-01', cuota: 1000, acumulada: 1000, valor_neto: 11000, registrada: true });
      expect(rows[1].cuota).toBe(478.26);
      expect(rows.at(-1)).toMatchObject({ cuota: 478.28, acumulada: 12000, valor_neto: 0 });
    });

    it('una cuota futura ya registrada permanece exacta al recargar el cronograma', async () => {
      tablas.activos_fijos = { data: { ...activo, depreciacion_acumulada: 1478.26 }, error: null };
      tablas.depreciaciones = { data: [
        { id: 'history-jan', tenant_id: TENANT, activo_id: activo.id, periodo: '2026-01', monto_depreciacion: 1000, depreciacion_acumulada: 1000, valor_neto: 11000, estado: 'PROCESADA' },
        { id: 'history-feb', tenant_id: TENANT, activo_id: activo.id, periodo: '2026-02', monto_depreciacion: 478.26, depreciacion_acumulada: 1478.26, valor_neto: 10521.74, estado: 'PENDIENTE' },
      ], error: null };
      const rows = await service.obtenerCronograma(TENANT, activo.id);
      expect(rows).toHaveLength(24);
      expect(rows[1]).toMatchObject({ cuota: 478.26, acumulada: 1478.26, valor_neto: 10521.74 });
      expect(rows[2].cuota).toBe(478.26);
      expect(rows.at(-1)).toMatchObject({ cuota: 478.28, valor_neto: 0 });
    });

    it('el historial indisponible no se sustituye por una proyección inventada', async () => {
      tablas.activos_fijos = { data: activo, error: null };
      tablas.depreciaciones = { data: null, error: { code: '42501', message: 'permission denied' } };
      await expect(service.obtenerCronograma(TENANT, activo.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('un activo retirado sólo muestra cuotas registradas', async () => {
      tablas.activos_fijos = { data: { ...activo, situacion: 'BAJA' }, error: null };
      tablas.depreciaciones = { data: [{ id: 'history-jan', tenant_id: TENANT, activo_id: activo.id, periodo: '2026-01', monto_depreciacion: 1000, depreciacion_acumulada: 1000, valor_neto: 11000, estado: 'PENDIENTE' }], error: null };
      expect(await service.obtenerCronograma(TENANT, activo.id)).toHaveLength(1);
    });

    it('una revisión corrupta falla cerrado sin producirNaN o una cuota cero falsa', () => {
      expect(() => ActivosFijosService.cuotaDelPeriodo({ ...activo, metadata: { depreciacion_revision_572: { ...revision, cuota_centimos: '47826' } } }, 2026, 2)).toThrow(ServiceUnavailableException);
    });
  });

  describe('errores observados en UAT', () => {
    const dto = { codigo: 'AF-UAT', nombre: 'Equipo', fecha_adquisicion: '2026-01-01', valor_adquisicion: 12000, vida_util_meses: 12 };

    it.each(['obtener', 'obtenerCronograma'] as const)('%s distingue lectura caída de ausencia', async metodo => {
      tablas.activos_fijos = { data: null, error: { code: '42501', message: 'permission denied for table activos_fijos' } };
      await expect(service[metodo](TENANT, 'af-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
      tablas.activos_fijos = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      await expect(service[metodo](TENANT, 'af-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      [{ code: '23505', message: 'duplicate key' }, ConflictException],
      [{ code: 'P0001', message: 'ACCOUNTING_MASTER_IDEMPOTENCY_CONFLICT' }, ConflictException],
      [{ code: '42501', message: 'permission denied for function gestionar_activo_diferido_tx' }, ServiceUnavailableException],
    ])('clasifica errores de alta sin exponer el mensaje SQL: %j', async (error, tipo) => {
      resultadosRpc.gestionar_activo_diferido_tx = { data: null, error };
      await expect(service.crear(TENANT, USER, dto)).rejects.toBeInstanceOf(tipo);
      await expect(service.crear(TENANT, USER, dto)).rejects.not.toThrow(error.message);
    });

    it('una edición ajena es404 y una edición indisponible es503', async () => {
      resultadosRpc.gestionar_activo_diferido_tx = { data: null, error: { message: 'ASSET_NOT_FOUND' } };
      await expect(service.actualizar(TENANT, 'af-1', { nombre: 'Cambio' }, USER)).rejects.toBeInstanceOf(NotFoundException);
      resultadosRpc.gestionar_activo_diferido_tx = { data: null, error: { code: '42501', message: 'permission denied' } };
      await expect(service.actualizar(TENANT, 'af-1', { nombre: 'Cambio' }, USER)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('una respuesta vacía del writer no acredita el alta ni la edición', async () => {
      resultadosRpc.gestionar_activo_diferido_tx = { data: null, error: null };
      await expect(service.crear(TENANT, USER, dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.actualizar(TENANT, 'af-1', { nombre: 'Cambio' }, USER)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('la lectura caída al depreciar responde503', async () => {
      tablas.activos_fijos = { data: null, error: { code: '42501', message: 'permission denied' } };
      await expect(service.depreciarPeriodo(TENANT, USER, 2026, 1, batchTestKey)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('la caída del writer de depreciación no se devuelve como éxito con omitidos', async () => {
      tablas.activos_fijos = { data: [{ id: batchTestId(1), tenant_id: TENANT, situacion: 'ACTIVO', codigo: 'AF-1', valor_adquisicion: 12000, valor_residual: 0, vida_util_meses: 12, depreciacion_acumulada: 0, fecha_inicio_depreciacion: '2026-01-01' }], error: null };
      resultadosRpc.registrar_lote_depreciacion_tx_570 = { data: null, error: { code: '08006', message: 'connection lost at registrar_lote_depreciacion_tx_570' } };
      await expect(service.depreciarPeriodo(TENANT, USER, 2026, 1, batchTestKey)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

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
    it('las cuotas ejecutadas agotan la base al céntimo y coinciden con el cronograma', () => {
      const activo = { valor_adquisicion: 1001, valor_residual: 1, vida_util_meses: 3,
        depreciacion_acumulada: 0, fecha_inicio_depreciacion: '2026-01-01' };
      const cuotas = [1, 2, 3].map(mes => {
        const cuota = ActivosFijosService.cuotaDelPeriodo(activo, 2026, mes);
        activo.depreciacion_acumulada = Math.round((activo.depreciacion_acumulada + cuota) * 100) / 100;
        return cuota;
      });
      expect(cuotas).toEqual([333.33, 333.33, 333.34]);
      expect(activo.valor_adquisicion - activo.depreciacion_acumulada).toBe(1);
    });

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

  describe('cronograma con cuotas registradas', () => {
    beforeEach(() => {
      tablas.activos_fijos = { data: { valor_adquisicion: 120, valor_residual: 18,
        vida_util_meses: 6, fecha_inicio_depreciacion: '2026-05-01', depreciacion_acumulada: 9,
        situacion: 'ACTIVO' }, error: null };
      tablas.depreciaciones = { data: [{ id: 'registered-1', tenant_id: TENANT, activo_id: 'af-1', periodo: '2026-05', monto_depreciacion: 9,
        depreciacion_acumulada: 9, valor_neto: 111, estado: 'PROCESADA' }], error: null };
    });

    it('preserva la cuota anterior a un cambio de estimación y ajusta sólo la proyección', async () => {
      const cuotas = await service.obtenerCronograma(TENANT, 'af-1');
      expect(cuotas).toHaveLength(6);
      expect(cuotas[0]).toEqual({ periodo: '2026-05', cuota: 9, acumulada: 9, valor_neto: 111, registrada: true });
      expect(cuotas[1]).toMatchObject({ periodo: '2026-06', cuota: 17, acumulada: 26, valor_neto: 94, registrada: false });
      expect(cuotas[5]).toMatchObject({ periodo: '2026-10', cuota: 25, acumulada: 102, valor_neto: 18, registrada: false });
      expect(rpcs).toHaveLength(0);
    });

    it.each(['BAJA', 'VENDIDO', 'DEPRECIADO'])('no proyecta cuotas después de retirar o agotar un activo %s', async situacion => {
      tablas.activos_fijos.data.situacion = situacion;
      expect(await service.obtenerCronograma(TENANT, 'af-1')).toEqual([
        { periodo: '2026-05', cuota: 9, acumulada: 9, valor_neto: 111, registrada: true },
      ]);
    });

    it('no convierte meses omitidos en depreciación registrada o proyectada del pasado', async () => {
      tablas.depreciaciones.data[0].periodo = '2026-07';
      const cuotas = await service.obtenerCronograma(TENANT, 'af-1');
      expect(cuotas.map(c => c.periodo)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
      expect(cuotas[3]).toMatchObject({ cuota: 59, acumulada: 102, valor_neto: 18 });
    });

    it('rechaza una lectura fallida del historial en lugar de recalcularlo como vacío', async () => {
      tablas.depreciaciones = { data: null, error: { message: 'unavailable' } };
      await expect(service.obtenerCronograma(TENANT, 'af-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('rechaza una lectura del activo que no coincide con su historial', async () => {
      tablas.activos_fijos.data.depreciacion_acumulada = 17;
      await expect(service.obtenerCronograma(TENANT, 'af-1')).rejects.toThrow(/no coincide/);
    });

    it('proyecta desde cero para un activo sin cuotas registradas', async () => {
      tablas.activos_fijos.data.depreciacion_acumulada = 0; tablas.depreciaciones.data = [];
      const cuotas = await service.obtenerCronograma(TENANT, 'af-1');
      expect(cuotas).toHaveLength(6); expect(cuotas.every(c => !c.registrada)).toBe(true);
      expect(cuotas[5]).toMatchObject({ cuota: 17, acumulada: 102, valor_neto: 18 });
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
            id: batchTestId(1),
            tenant_id: TENANT, situacion: 'ACTIVO',
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

      const resultado = await service.depreciarPeriodo(TENANT, USER, 2026, 1, batchTestKey);

      expect(resultado.data).toMatchObject({
        periodo: '2026-01',
        activos_depreciados: 1,
        total_depreciado: 1000
      });
      const registro = rpcs.find(r => r.funcion === 'registrar_lote_depreciacion_tx_570');
      expect(registro!.parametros.p_plan[0]).toMatchObject({
        source:{id:batchTestId(1)},
        cuota: 1000,
        acumulada: 1000,
        valor_neto: 11000
      });
    });

    it('marca como DEPRECIADO el activo que alcanza su valor residual', async () => {
      tablas['activos_fijos'] = {
        data: [
          {
            id: batchTestId(1),
            tenant_id: TENANT, situacion: 'ACTIVO',
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

      await service.depreciarPeriodo(TENANT, USER, 2026, 12, batchTestKey);

      const registro = rpcs.find(r => r.funcion === 'registrar_lote_depreciacion_tx_570');
      expect(registro!.parametros.p_plan[0].acumulada).toBe(12000);
      expect(registro!.parametros.p_plan[0].valor_neto).toBe(0);
    });

    it('un fallo de escritura del lote se propaga y nunca se confirma como omitido', async () => {
      tablas['activos_fijos'] = {
        data: [
          {
            id: batchTestId(1),
            tenant_id: TENANT, situacion: 'ACTIVO',
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
      resultadosRpc.registrar_lote_depreciacion_tx_570 = {
        data: null,
        error: { code: '23505', message: 'duplicate' }
      };

      await expect(service.depreciarPeriodo(TENANT,USER,2026,1,batchTestKey)).rejects.toThrow(/Conserve la solicitud/);
    });

    it('respeta el período contable cerrado', async () => {
      periodos.validarPeriodoAbierto.mockRejectedValueOnce(
        new BadRequestException('El período contable 2026-01 está CERRADO.')
      );

      await expect(service.depreciarPeriodo(TENANT, USER, 2026, 1, batchTestKey)).rejects.toThrow(/CERRADO/);
      expect(inserciones).toHaveLength(0);
      expect(rpcs.filter(r=>r.funcion==='registrar_lote_depreciacion_tx_570')).toHaveLength(0);
    });

    it('rechaza un mes inválido', async () => {
      await expect(service.depreciarPeriodo(TENANT, USER, 2026, 13, batchTestKey)).rejects.toBeInstanceOf(
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
