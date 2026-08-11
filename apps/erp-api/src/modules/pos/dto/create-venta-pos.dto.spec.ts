import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVentaPosDto } from './create-venta-pos.dto';

describe('CreateVentaPosDto rolling-deploy compatibility', () => {
  it('acepta el snapshot informativo enviado por la imagen Web anterior', async () => {
    const dto = plainToInstance(CreateVentaPosDto, {
      idempotency_key: 'pos-browser-proof-1',
      cliente_documento: '99999999',
      cliente_nombre: 'Cliente General',
      items: [
        {
          producto_id: 'producto-demo',
          cantidad: 1,
          precio_unitario: 89.9,
          subtotal: 89.9,
        },
      ],
      comprobante: {
        serie: 'B001',
        correlativo: '00000001',
        tipo: '03',
        numero: 'B001-00000001',
        fecha: new Date().toISOString(),
        cliente: { documento: '99999999' },
        items: [{ cantidad: 1 }],
        subtotal: 89.9,
        descuentos: 0,
        impuestos: 16.18,
        total: 106.08,
        metodoPago: { codigo: 'EFECTIVO' },
        estado: 'PENDIENTE_PAGO',
      },
      descuento_global: {
        tipo: 'PORCENTAJE',
        valor: 0,
        descripcion: 'Descuento global POS',
      },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });

  it('preserva la intención explícita de ticket interno sin CPE', async () => {
    const dto = plainToInstance(CreateVentaPosDto, {
      idempotency_key: 'pos-ticket-interno-1',
      cliente_documento: '00000000',
      cliente_tipo_documento: '0',
      cliente_nombre: 'Consumidor final',
      emitir_cpe: false,
      items: [{
        producto_id: 'producto-demo',
        cantidad: 1,
        precio_unitario: 20,
      }],
      comprobante: {
        tipo: 'TICKET',
        serie: 'T001',
      },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
    expect(dto.emitir_cpe).toBe(false);
    expect(dto.comprobante?.tipo).toBe('TICKET');
  });
});
