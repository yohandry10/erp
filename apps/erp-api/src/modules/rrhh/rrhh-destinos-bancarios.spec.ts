import 'reflect-metadata';
import { RrhhService } from './rrhh.service';
import { RrhhController } from './rrhh.controller';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

describe('Destinos bancarios para CTS y liquidaciones', () => {
  it('cada lectura exige su permiso de pago y no permiso general de consulta RRHH', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, RrhhController.prototype.getDestinosBancariosCts).raw).toBe('rrhh.cts.deposit');
    expect(Reflect.getMetadata(PERMISSION_KEY, RrhhController.prototype.getDestinosBancariosLiquidacion).raw).toBe('rrhh.liquidaciones.pay');
  });
  it('limita la consulta al tenant y bancos activos, sin saldos ni movimientos', async () => {
    const chain: any = { select: jest.fn(() => chain), eq: jest.fn(() => chain), order: jest.fn(async () => ({ data: [{ id: 'bank-local', moneda: 'PEN' }], error: null })) };
    const client = { from: jest.fn(() => chain) };
    const service = new RrhhService({ getClient: () => client } as any);
    await expect(service.getDestinosBancariosLaborales('tenant-laboral')).resolves.toEqual({ success: true, data: [{ id: 'bank-local', moneda: 'PEN' }] });
    expect(chain.eq.mock.calls).toEqual([['tenant_id', 'tenant-laboral'], ['activa', true], ['activo', true]]);
    expect(chain.select).toHaveBeenCalledWith('id,nombre,banco,numero_cuenta,moneda');
  });
  it('una lectura fallida no se presenta como una empresa sin bancos', async () => {
    const chain: any = { select: () => chain, eq: () => chain, order: async () => ({ data: null, error: { code: '42501', message: 'denied' } }) };
    const service = new RrhhService({ getClient: () => ({ from: () => chain }) } as any);
    await expect(service.getDestinosBancariosLaborales('tenant-laboral')).rejects.toMatchObject({ status: 503 });
    await expect(service.getDestinosBancariosLaborales('')).rejects.toMatchObject({ status: 400 });
  });
});
