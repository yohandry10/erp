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
