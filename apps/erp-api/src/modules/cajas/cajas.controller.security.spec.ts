import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { CajasController } from './cajas.controller';

describe('CajasController: lectura tenant-scoped y preview de cierre', () => {
  const permissionFor = (method: keyof CajasController) =>
    Reflect.getMetadata(PERMISSION_KEY, CajasController.prototype[method]);

  it('protege el ledger con el mismo permiso de lectura de sesiones', () => {
    expect(permissionFor('obtenerMovimientos')?.raw).toBe('cajas.sesiones.ver');
  });

  it('protege el preview con el permiso de precierre', () => {
    expect(permissionFor('validarCierre')?.raw).toBe('cajas.precierre.ver');
  });

  it('separa el cierre operativo del cierre administrativo forzado', () => {
    expect(permissionFor('cerrarCajaAvanzado')?.raw).toBe('cajas.cierre');
    expect(permissionFor('cerrarSesionAdministrativa')?.raw).toBe(
      'cajas.cierre_administrativo',
    );
  });

  it('reserva alta/rotación y directorio de PIN al permiso administrativo explícito', () => {
    expect(permissionFor('rotarPinSupervisor')?.raw).toBe('users.manage');
    expect(permissionFor('listarSupervisoresGestionPin')?.raw).toBe('users.manage');
    expect(permissionFor('listarSupervisoresAutorizados')?.raw).toBe('cajas.cierre');
  });

  it('delega el tenant del contexto y no acepta uno suministrado por el cliente', async () => {
    const service = {
      obtenerMovimientos: jest.fn().mockResolvedValue([{ id: 'mov-1' }]),
    } as any;
    const controller = new CajasController(service);

    const result = await controller.obtenerMovimientos('tenant-seguro', 'sesion-1');

    expect(service.obtenerMovimientos).toHaveBeenCalledWith(
      'tenant-seguro',
      'sesion-1',
    );
    expect(result).toEqual({ success: true, data: [{ id: 'mov-1' }] });
  });

  it('deriva tenant y actor del contexto al rotar el PIN', async () => {
    const service = {
      rotarPinSupervisor: jest.fn().mockResolvedValue({
        supervisor_id: '51800000-0000-4000-8000-000000000009',
        pin_version: 2,
      }),
    } as any;
    const controller = new CajasController(service);

    await controller.rotarPinSupervisor(
      'tenant-seguro',
      { id: 'admin-seguro' },
      '51800000-0000-4000-8000-000000000009',
      { pin: '481590' },
      'pin-rotate-518-1',
    );

    expect(service.rotarPinSupervisor).toHaveBeenCalledWith(
      'tenant-seguro',
      'admin-seguro',
      '51800000-0000-4000-8000-000000000009',
      '481590',
      'pin-rotate-518-1',
    );
  });
});
