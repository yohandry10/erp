import { RrhhService } from './rrhh.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

describe('boleta HTML: texto de empleado, período y estado', () => {
  const service = new RrhhService({} as SupabaseService);
  const totals = { pais: 'PE', moneda: 'PEN', mes: '2026-11', totalBruto: 1800, totalDescuentos: 234, totalNeto: 1566 };
  const render = (employee: Record<string, unknown>, state = 'PAGADO', month = '2026-11') =>
    (service as any).generarBoletaHTML(employee, [{ fecha_pago: '2026-11-06', metodo_pago: 'efectivo', monto_bruto: 1800, descuentos: 234, monto_neto: 1566, estado: state }], { ...totals, mes: month }) as string;

  it.each(['nombres', 'apellidos', 'numero_documento', 'email', 'puesto', 'departamento'])(
    'trata %s como texto aunque contenga etiquetas, comillas o entidades', field => {
      const payload = '</title><img src=x onerror="alert(1)">&\'á';
      const html = render({ [field]: payload });
      expect(html).not.toContain(payload);
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;/title&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;á');
    },
  );
  it('escapa también el estado y las dos apariciones del período', () => {
    const html = render({}, '<svg onload=alert(1)>', '<script>alert(2)</script>');
    expect(html).not.toContain('<svg'); expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html.match(/&lt;script&gt;alert\(2\)&lt;\/script&gt;/g)).toHaveLength(2);
  });
  it('conserva tildes e importes calculados sin convertir la moneda', () => {
    const html = render({ nombres: 'José', apellidos: 'Muñoz', puesto: 'Cajero' });
    expect(html).toContain('José Muñoz'); expect(html).toContain('Cajero');
    expect(html).toContain('1,800.00'); expect(html).toContain('234.00'); expect(html).toContain('1,566.00');
    expect(html).toContain('<!DOCTYPE html>');
  });
});
