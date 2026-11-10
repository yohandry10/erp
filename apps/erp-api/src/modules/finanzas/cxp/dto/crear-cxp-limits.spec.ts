import { validateSync } from 'class-validator';
import { CrearCxpDto } from './crear-cxp.dto';

describe('D-13 límites monetarios de factura proveedor', () => {
  it.each(['subtotal', 'igv', 'total'])('rechaza %s que desborda numeric(14,2) antes de escribir', field => {
    const dto = Object.assign(new CrearCxpDto(), { [field]: 1_000_000_000_000 });
    const errors = validateSync(dto).filter(error => error.property === field);
    expect(errors).toEqual([expect.objectContaining({ constraints: expect.objectContaining({ max: 'SUPPLIER_INVOICE_AMOUNT_OUT_OF_RANGE' }) })]);
  });
  it.each(['subtotal', 'igv', 'total'])('admite el límite representable de %s', field => {
    const dto = Object.assign(new CrearCxpDto(), { [field]: 999_999_999_999.99 });
    expect(validateSync(dto).filter(error => error.property === field)).toEqual([]);
  });
});
