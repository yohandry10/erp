import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PlantillasAsientosService } from './plantillas-asientos.service';
import { AsientosService } from './asientos.service';
import { SupabaseService } from '../../../shared/supabase/supabase.service';
import { PeriodicidadPlantilla } from '@erp-suite/dtos';

describe('PlantillasAsientosService', () => {
  let service: PlantillasAsientosService;
  let asientos: { crearAsientoManual: jest.Mock };

  const TENANT = 'tenant-1';
  const USER = 'user-1';

  let tablas: Record<string, any>;
  let inserciones: Array<{ tabla: string; payload: any }>;
  let rpcs: Array<{ funcion: string; parametros: any }>;

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
      not: jest.fn(() => query),
      lte: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(() => query),
      single: jest.fn(async () => resultado()),
      maybeSingle: jest.fn(async () => resultado()),
      then: (onFulfilled: any) => Promise.resolve(resultado()).then(onFulfilled)
    };
    return query;
  };

  const detallesValidos = [
    { cuenta_id: 'cuenta-63', debe: 500, haber: 0, concepto: 'Alquiler' },
    { cuenta_id: 'cuenta-42', debe: 0, haber: 500, concepto: 'Arrendador' }
  ];

  beforeEach(async () => {
    tablas = {};
    inserciones = [];
    rpcs = [];
    asientos = {
      crearAsientoManual: jest.fn().mockResolvedValue({ id: 'asiento-1', numero_asiento: 10 })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlantillasAsientosService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: jest.fn(() => ({
              from: jest.fn((tabla: string) => construirQuery(tabla)),
              rpc: jest.fn(async (funcion: string, parametros: any) => {
                rpcs.push({ funcion, parametros });
                return tablas[`rpc:${funcion}`] ?? { data: { id: 'plantilla-1' }, error: null };
              })
            }))
          }
        },
        { provide: AsientosService, useValue: asientos }
      ]
    }).compile();

    service = module.get<PlantillasAsientosService>(PlantillasAsientosService);
  });

  afterEach(() => jest.clearAllMocks());

  /**
   * Aritmética de la agenda.
   *
   * Es la parte con más superficie de error de toda la fase: un desliz aquí no
   * rompe ningún cuadre, simplemente hace que la provisión de un mes caiga en
   * el mes equivocado o no caiga nunca.
   */
  describe('calcularProximaEjecucion', () => {
    const calc = PlantillasAsientosService.calcularProximaEjecucion;
    const iso = (fecha: Date | null) => fecha?.toISOString().slice(0, 10);

    it('mensual avanza un mes conservando el día', () => {
      expect(iso(calc(new Date('2026-01-15T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, 15))).toBe(
        '2026-02-15'
      );
    });

    it('el día 31 en un mes de 30 se ancla al último día, no salta de mes', () => {
      // La provisión de abril tiene que caer en abril.
      expect(iso(calc(new Date('2026-03-31T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, 31))).toBe(
        '2026-04-30'
      );
    });

    it('el día 31 de enero cae en el 28 de febrero en año no bisiesto', () => {
      expect(iso(calc(new Date('2026-01-31T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, 31))).toBe(
        '2026-02-28'
      );
    });

    it('el día 31 de enero cae en el 29 de febrero en año bisiesto', () => {
      expect(iso(calc(new Date('2028-01-31T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, 31))).toBe(
        '2028-02-29'
      );
    });

    it('-1 significa último día del mes destino', () => {
      expect(iso(calc(new Date('2026-01-31T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, -1))).toBe(
        '2026-02-28'
      );
      expect(iso(calc(new Date('2026-03-31T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, -1))).toBe(
        '2026-04-30'
      );
    });

    it('trimestral y anual avanzan el número de meses correcto', () => {
      expect(iso(calc(new Date('2026-01-15T00:00:00Z'), PeriodicidadPlantilla.TRIMESTRAL, 15))).toBe(
        '2026-04-15'
      );
      expect(iso(calc(new Date('2026-01-15T00:00:00Z'), PeriodicidadPlantilla.ANUAL, 15))).toBe(
        '2027-01-15'
      );
    });

    it('diciembre cruza correctamente al año siguiente', () => {
      expect(iso(calc(new Date('2026-12-15T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, 15))).toBe(
        '2027-01-15'
      );
    });

    it('NINGUNA no agenda nada', () => {
      expect(calc(new Date('2026-01-15T00:00:00Z'), PeriodicidadPlantilla.NINGUNA, 15)).toBeNull();
    });

    it('sin día declarado conserva el del origen', () => {
      expect(iso(calc(new Date('2026-01-10T00:00:00Z'), PeriodicidadPlantilla.MENSUAL, null))).toBe(
        '2026-02-10'
      );
    });
  });

  describe('validación de la plantilla', () => {
    it('rechaza una plantilla descuadrada antes de guardarla', async () => {
      await expect(
        service.crear(TENANT, USER, {
          nombre: 'Descuadrada',
          concepto: 'Provisión',
          detalles: [
            { cuenta_id: 'cuenta-63', debe: 500, haber: 0, concepto: 'a' },
            { cuenta_id: 'cuenta-42', debe: 0, haber: 400, concepto: 'b' }
          ]
        })
      ).rejects.toThrow(/no cuadra/);

      expect(inserciones).toHaveLength(0);
    });

    it('rechaza una plantilla con un solo movimiento', async () => {
      await expect(
        service.crear(TENANT, USER, {
          nombre: 'Incompleta',
          concepto: 'Provisión',
          detalles: [{ cuenta_id: 'cuenta-63', debe: 500, haber: 0, concepto: 'a' }]
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('creación', () => {
    beforeEach(() => {
      tablas['plantillas_asientos'] = {
        data: {
          id: 'plantilla-1',
          nombre: 'Provisión',
          concepto: 'Provisión mensual',
          periodicidad: 'MENSUAL',
          crear_en_estado: 'BORRADOR',
          activa: true
        },
        error: null
      };
      tablas['plantillas_asientos_detalle'] = { data: [], error: null };
    });

    it('una plantilla recurrente queda agendada desde su fecha de inicio', async () => {
      await service.crear(TENANT, USER, {
        nombre: 'Alquiler',
        concepto: 'Provisión de alquiler',
        periodicidad: PeriodicidadPlantilla.MENSUAL,
        dia_ejecucion: 1,
        fecha_inicio: '2026-09-01',
        detalles: detallesValidos
      });

      const cabecera = rpcs.find(i => i.funcion === 'guardar_plantilla_con_detalles_tx')!.parametros.p_plantilla;
      expect(cabecera.fecha_inicio).toBe('2026-09-01');
      expect(cabecera.periodicidad).toBe('MENSUAL');
    });

    it('una plantilla sin periodicidad no se agenda', async () => {
      await service.crear(TENANT, USER, {
        nombre: 'Reutilizable',
        concepto: 'Asiento tipo',
        detalles: detallesValidos
      });

      const llamada = rpcs.find(i => i.funcion === 'guardar_plantilla_con_detalles_tx')!;
      const cabecera = llamada.parametros.p_plantilla;
      expect(llamada.parametros.p_plantilla_id).toBeNull();
      expect(cabecera.periodicidad).toBe('NINGUNA');
    });

    it('el asiento generado nace en BORRADOR por omisión', async () => {
      await service.crear(TENANT, USER, {
        nombre: 'Alquiler',
        concepto: 'Provisión',
        detalles: detallesValidos
      });

      const cabecera = rpcs.find(i => i.funcion === 'guardar_plantilla_con_detalles_tx')!.parametros.p_plantilla;
      expect(cabecera.crear_en_estado).toBe('BORRADOR');
    });

    it('preserva el orden de llegada de las líneas para que la RPC las numere', async () => {
      await service.crear(TENANT, USER, {
        nombre: 'Alquiler',
        concepto: 'Provisión',
        detalles: detallesValidos
      });

      const lineas = rpcs.find(i => i.funcion === 'guardar_plantilla_con_detalles_tx')!.parametros.p_detalles;
      expect(lineas).toEqual(detallesValidos);
    });

    it('envía cabecera y líneas a una única operación transaccional', async () => {
      await service.crear(TENANT, USER, {
        nombre: 'Alquiler',
        concepto: 'Provisión',
        detalles: detallesValidos
      });

      expect(rpcs).toContainEqual({
        funcion: 'guardar_plantilla_con_detalles_tx',
        parametros: expect.objectContaining({
          p_tenant_id: TENANT,
          p_user_id: USER,
          p_plantilla_id: null,
          p_detalles: detallesValidos
        })
      });
    });
  });

  describe('generación', () => {
    const plantillaActiva = {
      id: 'plantilla-1',
      nombre: 'Provisión de alquiler',
      concepto: 'Provisión mensual de alquiler',
      referencia: 'ALQ',
      periodicidad: 'MENSUAL',
      crear_en_estado: 'BORRADOR',
      activa: true
    };

    const conPlantilla = (plantilla: any, historial: any = null) => {
      tablas['plantillas_asientos'] = { data: plantilla, error: null };
      tablas['plantillas_asientos_detalle'] = {
        data: detallesValidos.map((d, i) => ({ ...d, orden: i + 1 })),
        error: null
      };
      tablas['plantillas_asientos_historial'] = { data: historial, error: null };
    };

    it('instancia el asiento con el concepto y el estado de la plantilla', async () => {
      conPlantilla(plantillaActiva);

      await service.generar(TENANT, USER, 'plantilla-1', { fecha: '2026-09-30' });

      expect(asientos.crearAsientoManual).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.objectContaining({
          fecha: '2026-09-30',
          concepto: 'Provisión mensual de alquiler',
          referencia: 'ALQ',
          estado: 'BORRADOR'
        }),
        expect.objectContaining({
          sourceEventId: expect.any(String),
          origen: 'PLANTILLA_CONTABLE',
          tipoAsiento: 'AJUSTE',
          plantillaId: 'plantilla-1',
          plantillaPeriodo: '2026-09'
        })
      );
    });

    it('permite sobrescribir los importes conservando el reparto contable', async () => {
      conPlantilla(plantillaActiva);

      await service.generar(TENANT, USER, 'plantilla-1', {
        fecha: '2026-09-30',
        detalles: [
          { cuenta_id: 'cuenta-63', debe: 750, haber: 0, concepto: 'Alquiler septiembre' },
          { cuenta_id: 'cuenta-42', debe: 0, haber: 750, concepto: 'Arrendador' }
        ]
      });

      const payload = asientos.crearAsientoManual.mock.calls[0][2];
      expect(payload.detalles[0].debe).toBe(750);
      expect(payload.detalles[1].haber).toBe(750);
    });

    it('rechaza importes sobrescritos que no cuadran', async () => {
      conPlantilla(plantillaActiva);

      await expect(
        service.generar(TENANT, USER, 'plantilla-1', {
          fecha: '2026-09-30',
          detalles: [
            { cuenta_id: 'cuenta-63', debe: 750, haber: 0, concepto: 'a' },
            { cuenta_id: 'cuenta-42', debe: 0, haber: 700, concepto: 'b' }
          ]
        })
      ).rejects.toThrow(/no cuadra/);

      expect(asientos.crearAsientoManual).not.toHaveBeenCalled();
    });

    it('no genera dos veces en el mismo período', async () => {
      conPlantilla(plantillaActiva, { id: 'hist-1', asiento_id: 'asiento-previo' });

      await expect(
        service.generar(TENANT, USER, 'plantilla-1', { fecha: '2026-09-30' })
      ).rejects.toThrow(/ya generó un asiento para el período 2026-09/);

      expect(asientos.crearAsientoManual).not.toHaveBeenCalled();
    });

    it('no duplica el asiento si falló el historial de una ejecución anterior', async () => {
      conPlantilla(plantillaActiva);
      tablas['asientos_contables'] = {
        data: { id: 'asiento-huerfano-de-historial', numero_asiento: 77 },
        error: null
      };

      await expect(
        service.generar(TENANT, USER, 'plantilla-1', { fecha: '2026-09-30' })
      ).rejects.toThrow(/ya generó un asiento para el período 2026-09/);

      expect(asientos.crearAsientoManual).not.toHaveBeenCalled();
    });

    it('una plantilla inactiva no genera nada', async () => {
      conPlantilla({ ...plantillaActiva, activa: false });

      await expect(
        service.generar(TENANT, USER, 'plantilla-1', { fecha: '2026-09-30' })
      ).rejects.toThrow(/inactiva/);

      expect(asientos.crearAsientoManual).not.toHaveBeenCalled();
    });

    it('registra el origen automático cuando lo dispara el scheduler', async () => {
      conPlantilla(plantillaActiva);

      await service.generar(TENANT, USER, 'plantilla-1', { fecha: '2026-09-30' }, true);

      expect(asientos.crearAsientoManual).toHaveBeenCalledWith(
        TENANT,
        USER,
        expect.any(Object),
        expect.objectContaining({
          plantillaPeriodo: '2026-09',
          plantillaAutomatico: true
        })
      );
    });
  });
});
