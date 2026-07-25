import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CondicionPago,
  CreateFacturaDto,
  TipoDocumento,
} from '@erp-suite/dtos';

const facturaValida = {
  tipo_documento: TipoDocumento.FACTURA,
  serie: 'F001',
  numero: 1,
  fecha_emision: '2026-07-24T12:00:00.000Z',
  fecha_vencimiento: '2026-08-24T12:00:00.000Z',
  moneda: 'PEN',
  ruc_emisor: '20100070970',
  razon_social_emisor: 'ERP DEMO S.A.C.',
  tipo_documento_receptor: '6',
  documento_receptor: '20600000001',
  razon_social_receptor: 'CLIENTE QA S.A.C.',
  items: [{
    codigo: 'SERV-001',
    descripcion: 'Servicio QA',
    cantidad: 1,
    unidad: 'NIU',
    precio_unitario: 100,
    valor_venta: 100,
    igv: 18,
    precio_venta: 118,
  }],
  total_gravadas: 100,
  total_igv: 18,
  total_venta: 118,
};

describe('CreateFacturaDto — contrato público de condición de pago', () => {
  it('acepta una factura declarada explícitamente a crédito', async () => {
    const dto = plainToInstance(CreateFacturaDto, {
      ...facturaValida,
      condicion_pago: CondicionPago.CREDITO,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });

  it('rechaza condiciones distintas de CONTADO o CREDITO', async () => {
    const dto = plainToInstance(CreateFacturaDto, {
      ...facturaValida,
      condicion_pago: 'PLAZO',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'condicion_pago')).toBe(true);
  });
});
