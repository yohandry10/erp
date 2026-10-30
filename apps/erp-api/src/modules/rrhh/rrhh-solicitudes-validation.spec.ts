import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RrhhService } from './rrhh.service';
import { CrearSolicitudDto } from './dto/rrhh-operaciones.dto';
import { CalcularLiquidacionDto, CalcularDepositosCtsDto } from './dto/rrhh-acciones.dto';

const solicitud = {
  id_empleado: 'c3f34589-9555-46b8-a9e6-4b54201011d6',
  tipo: 'vacaciones', fecha_inicio: '2026-02-28', fecha_fin: '2026-03-02',
};
const opciones = { whitelist: true, forbidNonWhitelisted: true };

describe('Solicitudes laborales desde la UI', () => {
  it('deriva días inclusivos sin depender de zona horaria y conserva actor/intención', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: 's1' }, error: null });
    const service = new RrhhService({ getClient: () => ({ rpc }) } as any);
    await service.createSolicitud(solicitud, 'tenant', 'actor', 'solicitud-1');
    expect(rpc).toHaveBeenCalledWith('ejecutar_operacion_rrhh_tx', {
      p_tenant_id: 'tenant', p_actor_id: 'actor', p_operacion: 'REQUEST_CREATE',
      p_payload: { ...solicitud, dias: 3 }, p_idempotency_key: 'solicitud-1',
    });
  });

  it.each([
    { fecha_inicio: '2026-02-30' }, { fecha_fin: '2026-02-27' },
    { tipo: 'no-es-un-tipo' }, { dias: 1 }, { dias: 0 }, { dias: 3.5 },
  ])('rechaza una solicitud incoherente antes de escribir (%j)', async (cambio) => {
    const getClient = jest.fn();
    const service = new RrhhService({ getClient } as any);
    await expect(service.createSolicitud({ ...solicitud, ...cambio }, 'tenant', 'actor', 'solicitud-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('una lectura fallida de solicitudes devuelve indisponibilidad', async () => {
    const q: any = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    q.then = (resolve: any) => resolve({ data: null, error: { code: '42501' } });
    const service = new RrhhService({ getClient: () => ({ from: () => q }) } as any);
    await expect(service.getSolicitudes(undefined, undefined, 'tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('el DTO exige empleado, tipo y fechas reales, sin permitir campos extra', () => {
    expect(validateSync(plainToInstance(CrearSolicitudDto, solicitud), opciones)).toHaveLength(0);
    const errores = validateSync(plainToInstance(CrearSolicitudDto, {
      fecha_inicio: '2026-02-30', fecha_fin: '2026-03-01', tipo: 'inventado', estado: 'aprobada',
    }), opciones).map(e => e.property);
    expect(errores).toEqual(expect.arrayContaining(['id_empleado', 'tipo', 'fecha_inicio', 'estado']));
  });
});

describe('DTO de fuente histórica para CTS', () => {
  const fuente = { periodo: '2026-07', monto: 1275.33, fecha_pago: '2026-07-15', referencia: 'Boleta histórica', bonificacion_extraordinaria: 114.78 };
  it('acepta el importe histórico explícito con bonificación y mantiene la estructura', () => {
    const dto = plainToInstance(CalcularLiquidacionDto, { motivo_terminacion: 'renuncia', fecha_terminacion: '2026-10-31', gratificacion_previa: fuente });
    expect(validateSync(dto, opciones)).toHaveLength(0);
    expect(dto.gratificacion_previa).toMatchObject(fuente);
    const cts = plainToInstance(CalcularDepositosCtsDto, { periodo: '2026-11', gratificaciones_previas: [{ empleado_id: solicitud.id_empleado, ...fuente }] });
    expect(validateSync(cts, opciones)).toHaveLength(0);
  });
  it('acepta una base histórica independiente del importe realmente pagado', () => {
    const dto = plainToInstance(CalcularLiquidacionDto, { motivo_terminacion: 'renuncia', fecha_terminacion: '2026-10-31',
      remuneracion_gratificacion_previa: { periodo: '2026-09', monto: 1913, referencia: 'Contrato septiembre' } });
    expect(validateSync(dto, opciones)).toHaveLength(0);
  });
  it.each([{ monto: -1 }, { monto: 1.001 }, { periodo: '2026-06' }, { fecha_pago: '2026-02-30' }, { propiedad_extra: true }])(
    'rechaza una fuente inválida o campos extra (%j)', (cambio) => {
      const dto = plainToInstance(CalcularLiquidacionDto, { motivo_terminacion: 'renuncia', fecha_terminacion: '2026-10-31', gratificacion_previa: { ...fuente, ...cambio } });
      expect(validateSync(dto, opciones).map(e => e.property)).toContain('gratificacion_previa');
    },
  );
});
