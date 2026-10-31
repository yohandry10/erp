import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PlanillasService } from './planillas.service';

function escenario(options: { boleta?: any; error?: any; empresa?: any; empresaError?: any } = {}) {
  const consultas: Record<string, any> = {};
  const base = options.boleta ?? { id: 'detalle', tenant_id: 'tenant', id_empleado: 'employee', id_planilla: 'payroll', empleados: { id: 'employee', tenant_id: 'tenant' }, planillas: { id: 'payroll', tenant_id: 'tenant' }, empleado_planilla_conceptos: [
    { monto: 800, conceptos_planilla: { codigo: '006', nombre: 'Gratificación', metadata: { tipo: 'ingreso' } } },
  ] };
  const client = { from: jest.fn((table: string) => {
    const result = table === 'empresa_config'
      ? { data: options.empresa ?? { ruc: '20100070970', razon_social: 'Empresa de prueba', pais: 'PE' }, error: options.empresaError ?? null }
      : table === 'empleado_planilla_conceptos'
        ? { data: base.empleado_planilla_conceptos.map((row: any, index: number) => ({ ...row, id: `concept-${index}`, tenant_id: 'tenant', empleado_planilla_id: 'detalle' })), count: base.empleado_planilla_conceptos.length, error: null }
        : { data: base, error: options.error ?? null };
    const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), order: jest.fn(() => q), range: jest.fn(() => q), then: (resolve: any) => Promise.resolve(result).then(resolve), single: jest.fn().mockResolvedValue(result), maybeSingle: jest.fn().mockResolvedValue(result) };
    consultas[table] = q; return q;
  }) };
  return { consultas, service: new PlanillasService({ getClient: () => client } as any, {} as any) };
}

describe('Boleta con empresa y conceptos persistidos del tenant', () => {
  it('conserva concepto monetario y consulta razón social/RUC del mismo tenant', async () => {
    const { service, consultas } = escenario();
    const result = await service.getBoleta('detalle', 'tenant');
    expect(result).toMatchObject({ empresa: { razon_social: 'Empresa de prueba', ruc: '20100070970' },
      empleado_planilla_conceptos: [{ monto: 800, conceptos_planilla: { codigo: '006', tipo: 'ingreso' } }] });
    expect(consultas.empleado_planilla.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
    expect(consultas.empresa_config.eq).toHaveBeenCalledWith('tenant_id', 'tenant');
  });
  it('lectura de boleta ausente no consulta datos de empresa ni inventa otra boleta', async () => {
    const { service, consultas } = escenario({ error: { code: 'PGRST116' } });
    await expect(service.getBoleta('ajena', 'tenant')).rejects.toBeInstanceOf(NotFoundException);
    expect(consultas.empresa_config).toBeUndefined();
  });
  it('empresa incompleta bloquea impresión sin nombre comercial fijo', async () => {
    const { service } = escenario({ empresa: { ruc: '', razon_social: '' } });
    await expect(service.getBoleta('detalle', 'tenant')).rejects.toBeInstanceOf(ConflictException);
  });
  it('fallo de lectura de empresa es indisponibilidad y no omite identificación', async () => {
    const { service } = escenario({ empresaError: { code: '08006' } });
    await expect(service.getBoleta('detalle', 'tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
