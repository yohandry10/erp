import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrearNotaReferenciadaDto } from './referenced-note.dto';

describe('CrearNotaReferenciadaDto 529', () => {
  const base = {
    documento_origen_id: '33333333-3333-4333-8333-333333333333',
    motivo: 'Ajuste comercial válido',
    monto_total: 119,
  };

  it.each([
    ['07', '04'],
    ['08', '01'],
    ['91', '1'],
    ['92', '2'],
  ])('acepta el contrato estructural %s con motivo %s', async (tipo, motivo) => {
    const dto = plainToInstance(CrearNotaReferenciadaDto, {
      ...base,
      tipo_documento: tipo,
      codigo_motivo: motivo,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('acepta líneas fiscales explícitas con cantidad, base, impuesto y total coherentes', async () => {
    const dto = plainToInstance(CrearNotaReferenciadaDto, {
      ...base,
      tipo_documento: '91',
      codigo_motivo: '1',
      lineas: [{
        source_document_line_id: '44444444-4444-4444-8444-444444444444',
        cantidad: 1.5,
        base: 100,
        impuesto: 19,
        total: 119,
      }],
      prorrateo_global: false,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rechaza una línea fiscal sin UUID o con importes negativos', async () => {
    const dto = plainToInstance(CrearNotaReferenciadaDto, {
      ...base,
      tipo_documento: '92',
      codigo_motivo: '2',
      lineas: [{
        source_document_line_id: 'no-es-uuid',
        cantidad: 0,
        base: -1,
        impuesto: -1,
        total: 0,
      }],
    });

    const errors = await validate(dto);
    expect(errors.find((error) => error.property === 'lineas')?.children?.[0]?.children?.length)
      .toBeGreaterThan(0);
  });

  it('rechaza tipos ajenos y motivos no numéricos antes de SQL', async () => {
    const dto = plainToInstance(CrearNotaReferenciadaDto, {
      ...base,
      tipo_documento: '90',
      codigo_motivo: 'OTRO',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['tipo_documento', 'codigo_motivo']),
    );
  });
});
