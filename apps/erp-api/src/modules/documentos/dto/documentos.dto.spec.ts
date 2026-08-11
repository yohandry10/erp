import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CrearDocumentoManualDto, CrearSerieDocumentoDto } from './documentos.dto';

describe('CrearDocumentoManualDto — frontera estricta', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const metadata = { type: 'body' as const, metatype: CrearDocumentoManualDto, data: '' };
  const valid = {
    tipo_documento: 'FACTURA',
    serie: 'F001',
    receptor_tipo_doc: 'RUC',
    receptor_numero_doc: '20100066603',
    receptor_razon_social: 'CLIENTE SAC',
    fecha_emision: '2026-08-09',
    moneda: 'PEN',
    condicion_pago: 'CONTADO',
    detalles: [{
      codigo_producto: 'S1',
      descripcion: 'Servicio',
      unidad_medida: 'ZZ',
      cantidad: 1,
      precio_unitario: 100,
      descuento_unitario: 0,
    }],
    idempotency_key: 'document-create:dto-test',
  };

  it('acepta sólo intención y líneas crudas', async () => {
    await expect(pipe.transform(valid, metadata)).resolves.toMatchObject(valid);
  });

  it.each(['total', 'subtotal', 'impuesto_igv', 'estado', 'numero'])(
    'rechaza el campo calculado/controlado por servidor %s',
    async (field) => {
      await expect(
        pipe.transform({ ...valid, [field]: field === 'estado' ? 'ACEPTADO' : 1 }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each(['NOTA_CREDITO', 'NOTA_DEBITO'])(
    'no permite crear %s sin referencia al comprobante original',
    async (tipo) => {
      await expect(
        pipe.transform({ ...valid, tipo_documento: tipo }, metadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('exige clave idempotente y al menos una línea', async () => {
    await expect(
      pipe.transform({ ...valid, idempotency_key: undefined, detalles: [] }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige idempotencia y una serie compatible con el límite de PostgreSQL', async () => {
    const seriesMetadata = {
      type: 'body' as const,
      metatype: CrearSerieDocumentoDto,
      data: '',
    };
    await expect(pipe.transform({
      tipo_documento: 'FACTURA',
      serie: 'F009',
      correlativo_maximo: 9999,
      idempotency_key: 'document-series:dto-test',
    }, seriesMetadata)).resolves.toMatchObject({ serie: 'F009' });
    await expect(pipe.transform({
      tipo_documento: 'FACTURA',
      serie: 'F009',
      correlativo_maximo: 9999,
    }, seriesMetadata)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({
      tipo_documento: 'FACTURA',
      serie: 'F1234567890',
      idempotency_key: 'document-series:dto-test',
    }, seriesMetadata)).rejects.toBeInstanceOf(BadRequestException);
  });
});
