import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CrearComprobanteUiDto } from './crear-comprobante-ui.dto';

/**
 * La emisión desde pantalla es el flujo más caro de romper: un 400 aquí impide
 * facturar. El DTO tuvo que declarar los alias que el servicio acepta y también
 * los campos que el formulario envía sin que nadie los lea, porque con
 * `forbidNonWhitelisted` omitir uno bastaría para dejar la emisión inservible.
 */
const OPCIONES = { whitelist: true, forbidNonWhitelisted: true };

function validar(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(CrearComprobanteUiDto, payload), OPCIONES);
}

// Copia de lo que CpeModal manda: formData completo más los totales calculados.
const comprobanteDeLaPantalla = {
  tipoComprobante: '01',
  serie: 'F001',
  clienteTipoDocumento: 'RUC',
  clienteRuc: '20512345671',
  clienteRazonSocial: 'Distribuidora Andina S.A.C.',
  clienteDireccion: 'Av. Industrial 500',
  fechaEmision: '2026-08-20',
  fechaVencimiento: '',
  moneda: 'PEN',
  tipoOperacion: '0101',
  observaciones: '',
  items: [
    {
      codigo: 'P-1',
      descripcion: 'Cuaderno A4 96 hojas',
      cantidad: 10,
      unidadMedida: 'NIU',
      valorUnitario: 5.5,
      precioUnitario: 6.49,
      descuento: 0,
      igv: 9.9,
      total: 64.9,
    },
  ],
  subtotal: 55,
  totalIgv: 9.9,
  total: 64.9,
};

describe('CrearComprobanteUiDto', () => {
  it('acepta el comprobante tal y como lo envía la pantalla', () => {
    expect(validar(comprobanteDeLaPantalla)).toHaveLength(0);
  });

  it('acepta tipoOperacion y observaciones aunque el servicio no los lea', () => {
    // El formulario los manda siempre; sin declararlos, emitir daría 400.
    expect(comprobanteDeLaPantalla.tipoOperacion).toBe('0101');
    expect(validar({ ...comprobanteDeLaPantalla, observaciones: 'Entrega en almacén' })).toHaveLength(0);
  });

  it('acepta los alias en snake_case que también soporta el servicio', () => {
    expect(
      validar({
        tipo_documento: '01',
        serie: 'F001',
        documento_receptor: '20512345671',
        razon_social_receptor: 'Cliente S.A.C.',
        direccion_receptor: 'Calle 1',
        total_gravadas: 55,
        total_igv: 9.9,
        total_venta: 64.9,
        fecha_emision: '2026-08-20',
        idempotency_key: 'cpe-ui-1',
        items: [{ descripcion: 'Servicio', cantidad: 1, valor_venta: 55, igv: 9.9 }],
      }),
    ).toHaveLength(0);
  });

  it('exige al menos un ítem', () => {
    const errores = validar({ ...comprobanteDeLaPantalla, items: [] });
    expect(errores.map((e) => e.property)).toContain('items');
  });

  it('rechaza un ítem sin descripción', () => {
    const errores = validar({
      ...comprobanteDeLaPantalla,
      items: [{ cantidad: 1, valorUnitario: 10 }],
    });
    expect(errores.map((e) => e.property)).toContain('items');
  });

  it('rechaza cantidades negativas', () => {
    const errores = validar({
      ...comprobanteDeLaPantalla,
      items: [{ descripcion: 'X', cantidad: -1 }],
    });
    expect(errores.map((e) => e.property)).toContain('items');
  });

  it('rechaza campos que el emisor no debe fijar desde el cliente', () => {
    const errores = validar({ ...comprobanteDeLaPantalla, ruc_emisor: '20999999999' });
    expect(errores.map((e) => e.property)).toContain('ruc_emisor');
  });
});
