import { ValidationPipe } from '@nestjs/common';
import { CreateOrdenCompraDto } from '../create-orden-compra.dto';
import { UpdateOrdenCompraDto } from '../update-orden-compra.dto';

describe('Moneda e idempotencia del formulario de orden', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const payload = {
    idempotency_key: 'qa-order-attempt',
    numero: 'OC-QA-001',
    proveedor_id: '11111111-1111-4111-8111-111111111111',
    detalles: [{ producto_id: '22222222-2222-4222-8222-222222222222', descripcion: 'Café', cantidad: 0.5, precio_unitario: 100 }],
  };
  it.each(['ARS', 'COP', 'PEN', 'USD'])('conserva %s en creación y edición', async moneda => {
    await expect(pipe.transform({ ...payload, moneda }, { type: 'body', metatype: CreateOrdenCompraDto })).resolves.toMatchObject({ moneda, idempotency_key: payload.idempotency_key });
    await expect(pipe.transform({ moneda }, { type: 'body', metatype: UpdateOrdenCompraDto })).resolves.toMatchObject({ moneda });
  });
  it('continúa admitiendo la moneda por defecto del tenant cuando se omite', async () => {
    await expect(pipe.transform(payload, { type: 'body', metatype: CreateOrdenCompraDto })).resolves.toMatchObject(payload);
  });
  it('rechaza el payload que enviaba el modal sin clave y no acepta divisas arbitrarias', async () => {
    const { idempotency_key: _key, ...withoutKey } = payload;
    await expect(pipe.transform(withoutKey, { type: 'body', metatype: CreateOrdenCompraDto })).rejects.toThrow();
    await expect(pipe.transform({ ...payload, moneda: 'INVALIDA' }, { type: 'body', metatype: CreateOrdenCompraDto })).rejects.toThrow();
    await expect(pipe.transform({ moneda: 'INVALIDA' }, { type: 'body', metatype: UpdateOrdenCompraDto })).rejects.toThrow();
    await expect(pipe.transform({ ...payload, total: 1 }, { type: 'body', metatype: CreateOrdenCompraDto })).rejects.toThrow();
  });
});
