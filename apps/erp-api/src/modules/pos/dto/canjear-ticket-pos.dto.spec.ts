import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CanjearTicketPosDto } from './canjear-ticket-pos.dto';

const facturaValida = {
  idempotency_key: 'pos-canje-factura-1',
  tipo_documento: '01',
  cliente_id: '6394d65e-5dbd-4261-a028-280643e76da7',
  cliente_tipo_documento: '6',
  cliente_documento: '20100070970',
  cliente_nombre: 'Cliente Fiscal SAC',
};

describe('CanjearTicketPosDto', () => {
  it('acepta una intención 01 sin importes ni líneas mutables', async () => {
    const errors = await validate(plainToInstance(CanjearTicketPosDto, facturaValida), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });

  it('exige cliente activo identificable para una factura', async () => {
    const { cliente_id: _clienteId, ...sinCliente } = facturaValida;
    const errors = await validate(plainToInstance(CanjearTicketPosDto, sinCliente), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'cliente_id')).toBe(true);
  });

  it('rechaza importes e items enviados por el navegador', async () => {
    const errors = await validate(plainToInstance(CanjearTicketPosDto, {
      ...facturaValida,
      total: 1,
      items: [{ producto_id: 'otro-producto', cantidad: 999 }],
    }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['total', 'items']),
    );
  });

  it('limita el destino fiscal a factura 01 o boleta 03', async () => {
    const errors = await validate(plainToInstance(CanjearTicketPosDto, {
      ...facturaValida,
      tipo_documento: '07',
    }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.some((error) => error.property === 'tipo_documento')).toBe(true);
  });
});
