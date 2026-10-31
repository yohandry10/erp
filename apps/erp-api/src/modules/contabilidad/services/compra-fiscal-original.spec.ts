import { compraFiscalOriginal } from './compra-fiscal-original';
import { consolidarFuentesMensuales } from './tributos-mensuales.service';

const returned = {
  id: 'invoice-1', tipo_documento: 'FACTURA', estado: 'PARCIAL',
  subtotal: 4465, igv: 803.7, total: 5268.7,
  original_fiscal_amounts: { subtotal: 4700, igv: 846, total: 5546 },
  metadata: { ultima_devolucion_id: 'return-1', ultima_devolucion_total: 277.3 },
};

describe('Comprobante original de compra y ajuste documentado', () => {
  it('tributación resta la NC una vez del comprobante original sin volver descontar la devolución', () => {
    const note = { tipo_documento: 'NOTA_CREDITO', estado: 'PAGADA', subtotal: 235, igv: 42.3, total: 277.3 };
    const { fuentes } = consolidarFuentesMensuales([], [], [returned, note]);
    expect(fuentes.compras_gravadas).toBe(4465);
    expect(fuentes.igv_compras).toBe(803.7);
    expect(fuentes.compras_totales_mes).toBe(5268.7);
    expect(returned.subtotal).toBe(4465);
  });

  it('mantiene la factura fiscal cuando una devolución completa sólo cancela la obligación', () => {
    const invoice = { ...returned, estado: 'ANULADA', metadata: {
      ultima_devolucion_id: 'return-2', ultima_devolucion_total: returned.total,
    } };
    expect(compraFiscalOriginal(invoice).estado).toBe('REGISTRADA');
    const { fuentes } = consolidarFuentesMensuales([], [], [invoice]);
    expect(fuentes.compras_totales_mes).toBe(5546);
  });

  it('una anulación manual después de una devolución parcial sigue excluida de impuestos', () => {
    const { fuentes } = consolidarFuentesMensuales([], [], [{ ...returned, estado: 'ANULADA' }]);
    expect(fuentes.cantidad_compras).toBe(0);
  });

  it('anulación completa por NC conserva original y resta sólo la nota', () => {
    const invoice = { ...returned, estado: 'ANULADA', metadata: {
      ultima_nota_credito_proveedor_id: 'nc-570', cancelada_por_nota_credito: true,
    } };
    const note = { tipo_documento: 'NOTA_CREDITO', estado: 'PAGADA', subtotal: 4700, igv: 846, total: 5546 };
    const { fuentes } = consolidarFuentesMensuales([], [], [invoice, note]);
    expect(fuentes.compras_totales_mes).toBe(0);
    expect(fuentes.igv_compras).toBe(0);
    expect(compraFiscalOriginal(invoice).estado).toBe('REGISTRADA');
  });

  it('rechaza legado ajustado sin importes originales en vez de exportar el neto como factura', () => {
    expect(() => compraFiscalOriginal({ ...returned, original_fiscal_amounts: null })).toThrow('Reconcilie');
  });
});
