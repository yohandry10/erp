import { BadRequestException } from '@nestjs/common';
import { GreService } from './gre.service';
import { CreateGuiaRemisionDto } from './gre.types';

function buildService() {
  return new GreService(
    { getClient: jest.fn(), update: jest.fn() } as any,
    { on: jest.fn(), emit: jest.fn(), eventEmitter: { eventNames: () => [] } } as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

function validGre(overrides: Partial<CreateGuiaRemisionDto> = {}): CreateGuiaRemisionDto {
  return {
    destinatario: 'Cliente GRE',
    direccionDestino: 'Av. Fiscal 123',
    fechaTraslado: new Date(Date.now() + 86400000).toISOString(),
    modalidad: 'TRANSPORTE_PUBLICO',
    motivo: 'VENTA',
    pesoTotal: 12.5,
    transportista: 'Transportes Auditados SAC',
    observaciones: 'GRE de prueba',
    ...overrides,
  };
}

describe('GreService validaciones de creación', () => {
  it('rechaza GRE sin datos obligatorios', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ destinatario: '' })))
      .toThrow(BadRequestException);
    expect(() => service.assertCreateGreDataValida(validGre({ direccionDestino: '' })))
      .toThrow(/dirección de destino/i);
  });

  it('rechaza peso o cantidad logística inválida antes de emitir', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ pesoTotal: 0 })))
      .toThrow(/peso total/i);
    expect(() => service.assertCreateGreDataValida(validGre({ pesoTotal: -1 })))
      .toThrow(/peso total/i);
  });

  it('exige transportista para transporte público y placa/licencia para privado', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre({ transportista: '' })))
      .toThrow(/transportista/i);
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      placaVehiculo: '',
      licenciaConducir: 'Q12345678',
    }))).toThrow(/placa/i);
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      placaVehiculo: 'ABC123',
      licenciaConducir: '',
    }))).toThrow(/licencia/i);
  });

  it('acepta GRE manual válida', () => {
    const service = buildService() as any;

    expect(() => service.assertCreateGreDataValida(validGre())).not.toThrow();
    expect(() => service.assertCreateGreDataValida(validGre({
      modalidad: 'TRANSPORTE_PRIVADO',
      transportista: undefined,
      placaVehiculo: 'ABC123',
      licenciaConducir: 'Q12345678',
    }))).not.toThrow();
  });
});
