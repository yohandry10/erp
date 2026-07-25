import { BadRequestException } from '@nestjs/common';
import { RrhhService } from './rrhh.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('RrhhService asistencia', () => {
  let service: RrhhService;
  let client: any;
  const chain = () => {
    const builder: any = {};
    builder.select = jest.fn(() => builder);
    builder.insert = jest.fn(() => builder);
    builder.update = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.single = jest.fn();
    return builder;
  };

  beforeEach(() => {
    client = {
      from: jest.fn(),
    };

    service = new RrhhService({
      getClient: jest.fn(() => client),
    } as unknown as SupabaseService);
  });

  it('registra entrada con tenant y sincronizacion de asistencia', async () => {
    const findBuilder = chain();
    findBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    const insertBuilder = chain();
    insertBuilder.select.mockResolvedValueOnce({
      data: [{ id: 'asis-1', hora_entrada: '08:00' }],
      error: null,
    });
    client.from
      .mockReturnValueOnce(findBuilder)
      .mockReturnValueOnce(insertBuilder);

    const result = await service.marcarAsistencia(
      'emp-1',
      '2026-05-14',
      'entrada',
      '08:00',
      'tenant-1',
    );

    expect(result.success).toBe(true);
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      id_empleado: 'emp-1',
      tenant_id: 'tenant-1',
      fecha: '2026-05-14',
      hora_entrada: '08:00',
    }));
  });

  it('rechaza entrada duplicada como conflicto de negocio, no 500', async () => {
    const findBuilder = chain();
    findBuilder.single.mockResolvedValueOnce({
      data: { id: 'asis-1', hora_entrada: '08:00' },
      error: null,
    });
    client.from.mockReturnValueOnce(findBuilder);

    await expect(service.marcarAsistencia(
      'emp-1',
      '2026-05-14',
      'entrada',
      '08:05',
      'tenant-1',
    )).rejects.toMatchObject({ status: 409 });
  });

  it('rechaza salida anterior a entrada como validacion 400', async () => {
    const findBuilder = chain();
    findBuilder.single.mockResolvedValueOnce({
      data: { id: 'asis-1', hora_entrada: '08:00', hora_salida: null },
      error: null,
    });
    client.from.mockReturnValueOnce(findBuilder);

    await expect(service.marcarAsistencia(
      'emp-1',
      '2026-05-14',
      'salida',
      '07:59',
      'tenant-1',
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RrhhService createContrato — normativa laboral peruana', () => {
  let service: RrhhService;
  let client: any;

  // Builder para la consulta de normativa: la fila del tenant no existe y la global trae RMV.
  const normativaChain = (rmv: number | null) => {
    const builder: any = {};
    for (const metodo of ['select', 'eq', 'is', 'lte', 'order', 'limit']) {
      builder[metodo] = jest.fn(() => builder);
    }
    builder.maybeSingle = jest.fn(async () => ({ data: rmv === null ? null : { rmv }, error: null }));
    return builder;
  };

  const base = {
    empleado_id: 'emp-1',
    tipo_contrato: 'indefinido',
    fecha_inicio: '2026-07-01',
    moneda: 'PEN',
  };

  beforeEach(() => {
    client = { from: jest.fn() };
    service = new RrhhService({ getClient: jest.fn(() => client) } as unknown as SupabaseService);
  });

  it('rechaza remuneracion menor a la RMV en jornada completa', async () => {
    // Primera llamada: fila del tenant (vacía). Segunda: fila global con RMV 1130.
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));

    await expect(service.createContrato(
      { ...base, jornada_laboral: 'tiempo_completo', sueldo_bruto: 900 },
      'tenant-1',
    )).rejects.toThrow(/RMV vigente/);
  });

  it('permite remuneracion bajo la RMV en part time', async () => {
    // En part time no se consulta normativa: la RMV completa no es exigible.
    const insertBuilder: any = {
      insert: jest.fn(() => insertBuilder),
      select: jest.fn(async () => ({ data: [{ id: 'ctr-1' }], error: null })),
    };
    client.from.mockReturnValueOnce(insertBuilder);

    const result = await service.createContrato(
      { ...base, jornada_laboral: 'part_time', sueldo_bruto: 700 },
      'tenant-1',
    );

    expect(result.success).toBe(true);
  });

  it('rechaza contrato sujeto a modalidad mayor a 5 anios', async () => {
    await expect(service.createContrato(
      { ...base, tipo_contrato: 'temporal', fecha_fin: '2031-08-01', sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/5 años/);
  });

  it('acepta contrato sujeto a modalidad de exactamente 5 anios', async () => {
    client.from
      .mockReturnValueOnce(normativaChain(null))
      .mockReturnValueOnce(normativaChain(1130));
    const insertBuilder: any = {
      insert: jest.fn(() => insertBuilder),
      select: jest.fn(async () => ({ data: [{ id: 'ctr-2' }], error: null })),
    };
    client.from.mockReturnValueOnce(insertBuilder);

    const result = await service.createContrato(
      { ...base, tipo_contrato: 'temporal', fecha_fin: '2031-07-01', sueldo_bruto: 2000 },
      'tenant-1',
    );

    expect(result.success).toBe(true);
  });

  it('rechaza periodo de prueba mayor al maximo legal de 12 meses', async () => {
    await expect(service.createContrato(
      { ...base, periodo_prueba_meses: 18, sueldo_bruto: 2000 },
      'tenant-1',
    )).rejects.toThrow(/periodo de prueba/i);
  });

  it('no exige RMV en locacion de servicios por no ser contrato laboral', async () => {
    const insertBuilder: any = {
      insert: jest.fn(() => insertBuilder),
      select: jest.fn(async () => ({ data: [{ id: 'ctr-3' }], error: null })),
    };
    client.from.mockReturnValueOnce(insertBuilder);

    const result = await service.createContrato(
      { ...base, tipo_contrato: 'locacion_servicios', sueldo_bruto: 500 },
      'tenant-1',
    );

    expect(result.success).toBe(true);
  });
});
