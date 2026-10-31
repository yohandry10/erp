export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

/** La boleta refleja conceptos guardados, separados del aporte patronal. */
export function generarBoletaPlanillaHtml(data: any, options: {
  currencySymbol: string; locale: string; countryCode: string;
}) {
  const { currencySymbol, locale, countryCode } = options;
  const money = (value: unknown) => `${escapeHtml(currencySymbol)} ${Number(value ?? 0).toFixed(2)}`;
  const conceptos = (data.empleado_planilla_conceptos || []).map((item: any) => {
    const concepto = item.conceptos_planilla || {};
    const codigo = String(concepto.codigo || '');
    const tipo = String(concepto.tipo || concepto.metadata?.tipo || '').toLowerCase();
    const nombre = countryCode === 'PE' && codigo === '007'
      ? 'Bonificación extraordinaria'
      : concepto.nombre || 'Concepto';
    return { ...item, codigo, nombre, tipo:
      ['ingreso', 'descuento', 'aporte'].includes(tipo) ? tipo
        : /^0\d\d$/.test(codigo) ? 'ingreso'
          : /^1\d\d$/.test(codigo) ? 'descuento'
            : /^2\d\d$/.test(codigo) ? 'aporte' : 'otro' };
  });
  const rows = (tipo: string) => conceptos.filter((item: any) => item.tipo === tipo)
    .map((item: any) => `<tr><td>${escapeHtml(item.codigo)}</td><td>${escapeHtml(item.nombre)}</td><td class="amount">${money(item.monto)}</td></tr>`).join('');
  const section = (tipo: string, title: string, total?: unknown) => `<section><h2>${title}</h2>
    <table><thead><tr><th>Código</th><th>Concepto</th><th class="amount">Importe</th></tr></thead><tbody>
    ${rows(tipo) || '<tr><td colspan="3">Sin conceptos</td></tr>'}
    ${total === undefined ? '' : `<tr class="total"><td colspan="2">TOTAL ${title}</td><td class="amount">${money(total)}</td></tr>`}
    </tbody></table></section>`;
  const title = countryCode === 'AR' ? 'Recibo de sueldo' : countryCode === 'CO' ? 'Desprendible de nómina' : 'Boleta de pago';
  const taxLabel = countryCode === 'AR' ? 'CUIT' : countryCode === 'CO' ? 'NIT' : 'RUC';
  const employee = data.empleados || {};
  const planilla = data.planillas || {};
  const paidDate = String(data.fecha_pago || planilla.fecha_pago || '').slice(0, 10);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(paidDate)
    ? new Date(Number(paidDate.slice(0, 4)), Number(paidDate.slice(5, 7)) - 1, Number(paidDate.slice(8, 10))).toLocaleDateString(locale)
    : 'Pendiente';
  const essalud = data.metadata?.essalud;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>body{font:14px Arial,sans-serif;color:#172033;max-width:850px;margin:28px auto;padding:20px}
    h1{margin:16px 0}h2{font-size:15px;margin:20px 0 8px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #d5dbe3;text-align:left}
    .amount{text-align:right}.total{font-weight:bold}.neto{font-size:18px;background:#e9f1f8;padding:14px;margin-top:20px}.note{font-size:12px;color:#475569}
    @media print{body{margin:0;max-width:none;padding:10mm}section{break-inside:avoid}}</style></head><body>
    <header><strong>${escapeHtml(data.empresa?.razon_social)}</strong><div>${taxLabel}: ${escapeHtml(data.empresa?.ruc)}</div>
    <h1>${title}</h1><div>Período: ${escapeHtml(planilla.periodo)} · Estado: ${escapeHtml(planilla.estado)}</div></header>
    <p><strong>Empleado:</strong> ${escapeHtml(employee.nombres)} ${escapeHtml(employee.apellidos)}<br>
    <strong>Documento:</strong> ${escapeHtml(employee.numero_documento)}<br><strong>Puesto:</strong> ${escapeHtml(employee.puesto)}<br>
    <strong>Fecha de pago:</strong> ${escapeHtml(fecha)}</p>
    ${section('ingreso', 'INGRESOS', data.total_ingresos)}
    ${section('descuento', 'DESCUENTOS', data.total_descuentos)}
    ${section('aporte', 'APORTES DEL EMPLEADOR', data.total_aportes)}
    ${essalud ? `<p class="note">EsSalud patronal bruto: ${money(essalud.bruto)} · Crédito EPS imputado: ${money(essalud.credito_eps)} · EsSalud neto: ${money(essalud.neto)}. El aporte patronal no se descuenta del salario.</p>` : ''}
    ${conceptos.some((item: any) => item.tipo === 'otro') ? section('otro', 'OTROS CONCEPTOS') : ''}
    <div class="neto"><strong>NETO A PAGAR: ${money(data.neto_pagar)}</strong></div>
    <p class="note">Generado con conceptos persistidos de la planilla. ${escapeHtml(new Date().toLocaleString(locale))}</p>
    </body></html>`;
}
