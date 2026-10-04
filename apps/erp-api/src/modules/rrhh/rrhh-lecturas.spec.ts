import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';
import { RrhhController } from './rrhh.controller';
import { CambiarEstadoCandidatoDto } from './dto/rrhh-acciones.dto';
import { PlanillasService } from './planillas.service';

describe('RRHH: sueldos, estados de candidato y lecturas', () => {
  it.each(['getHistorialPagos', 'generarComprobante', 'generarBoletaPago'])(
    '%s exige rrhh.planillas.read, no sólo rrhh.access',
    (method) => {
      const permission = Reflect.getMetadata(PERMISSION_KEY, (RrhhController.prototype as any)[method]);
      expect(permission?.raw).toBe('rrhh.planillas.read');
    },
  );

  it('el estado de candidato se normaliza y fuera del dominio responde 400', async () => {
    const valid = plainToInstance(CambiarEstadoCandidatoDto, { estado: ' Entrevista ' });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.estado).toBe('entrevista');
    const invalid = plainToInstance(CambiarEstadoCandidatoDto, { estado: 'estado-inventado' });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  describe('historial de pagos', () => {
    const service = (planilla: any, historial: any) => {
      const from = jest.fn((table: string) => {
        const result = table === 'planillas' ? planilla : historial;
        const query: any = {
          select: jest.fn(() => query), eq: jest.fn(() => query), order: jest.fn(async () => result),
          maybeSingle: jest.fn(async () => result),
        };
        return query;
      });
      return new (PlanillasService as any)({ getClient: () => ({ from }) });
    };

    it('una planilla ajena o inexistente responde 404', async () => {
      await expect(service({ data: null, error: null }, { data: [], error: null }).getHistorialPagos('p-1', 't-1'))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('una lectura fallida responde 503 en vez de una lista vacía', async () => {
      await expect(service({ data: { id: 'p-1' }, error: null }, { data: null, error: { code: '42501', message: 'permission denied' } })
        .getHistorialPagos('p-1', 't-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('devuelve el historial de la planilla propia', async () => {
      await expect(service({ data: { id: 'p-1' }, error: null }, { data: [{ id: 'h-1' }], error: null }).getHistorialPagos('p-1', 't-1'))
        .resolves.toEqual({ success: true, data: [{ id: 'h-1' }] });
    });
  });
});
