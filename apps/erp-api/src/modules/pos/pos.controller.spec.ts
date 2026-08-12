import { HttpException, HttpStatus } from '@nestjs/common';
import { PosController } from './pos.controller';

/**
 * Una venta que no se registró respondía 201 Created con `success: false` en el
 * cuerpo. Los clientes, proxies y reintentos automáticos miran el código HTTP,
 * no el cuerpo: un 201 dice "creado" y nadie creó nada.
 */
describe('PosController.procesarVenta (contrato HTTP del fallo)', () => {
  const user = { id: 'u1', tenant_id: 't1' };
  const crear = (resultado: any) => {
    const posService = { procesarVenta: jest.fn().mockResolvedValue(resultado) } as any;
    return { controller: new PosController(posService), posService };
  };

  it('devuelve el resultado tal cual cuando la venta se registra', async () => {
    const ok = { success: true, venta_id: 'v1', total: 135.58 };
    const { controller } = crear(ok);

    await expect(controller.procesarVenta({} as any, { user })).resolves.toBe(ok);
  });

  it.each([
    ['DATABASE_ERROR', HttpStatus.INTERNAL_SERVER_ERROR],
    ['VALIDATION_ERROR', HttpStatus.BAD_REQUEST],
    ['CONFIG_ERROR', HttpStatus.BAD_REQUEST],
    ['CAJA_CERRADA', HttpStatus.CONFLICT],
  ])('traduce error.tipo=%s a HTTP %i', async (tipo, esperado) => {
    const { controller } = crear({
      success: false,
      message: 'no se pudo',
      error: { tipo, mensaje: 'detalle', codigo: 'X' },
    });

    await expect(controller.procesarVenta({} as any, { user })).rejects.toMatchObject({
      status: esperado,
    });
  });

  it('trata como 400 los rechazos tempranos que no traen error.tipo', async () => {
    const { controller } = crear({
      success: false,
      message: 'Falta idempotency_key para procesar la venta',
    });

    await expect(controller.procesarVenta({} as any, { user })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('nunca responde 2xx cuando success es false', async () => {
    const { controller } = crear({ success: false, message: 'fallo' });

    const error = await controller.procesarVenta({} as any, { user }).catch((e) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBeGreaterThanOrEqual(400);
  });

  it('conserva el cuerpo original para no romper a la UI', async () => {
    const cuerpo = {
      success: false,
      message: 'cannot extract elements from a scalar',
      error: { tipo: 'DATABASE_ERROR', mensaje: 'cannot extract elements from a scalar', codigo: '22023' },
    };
    const { controller } = crear(cuerpo);

    const error = await controller.procesarVenta({} as any, { user }).catch((e) => e);

    expect((error as HttpException).getResponse()).toEqual(cuerpo);
  });
});
