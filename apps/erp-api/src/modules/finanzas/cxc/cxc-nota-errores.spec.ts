import { ConflictException } from '@nestjs/common';
import { CxcService } from './cxc.service';

// La factura semilla de la demo guarda su CPE como 'FACTURA' y el writer de notas
// sólo acepta '01'/'03': el rechazo debe explicar el motivo, no un texto genérico.
describe('CxC · motivo de una nota de crédito rechazada', () => {
  const traducir = (message: string) =>
    (Object.create(CxcService.prototype) as any).errorNotaCredito({ code: '23514', message });

  it('explica por qué el comprobante de origen no admite la nota', () => {
    const error = traducir('REFERENCED_NOTE_SOURCE_CPE_INVALID');
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toContain('no tiene un comprobante electrónico que admita la nota');
  });

  it('conserva la traducción de una factura sin aceptación fiscal', () => {
    expect(traducir('REFERENCED_NOTE_SOURCE_NOT_FISCALLY_ACCEPTED').message).toContain('aceptación de SUNAT');
  });
});
