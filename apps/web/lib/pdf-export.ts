import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Utility functions for exporting data to PDF
 */

export interface PDFColumn {
  header: string
  dataKey: string
  width?: number
}

export interface PDFSection {
  title: string
  data: any[]
  columns: PDFColumn[]
}

/**
 * Moneda del documento que se está exportando.
 *
 * `formatCurrency` fijaba 'PEN' y se usa en 43 sitios de este fichero, así que el
 * PDF del estado de resultados de una empresa argentina salía en soles. Y un PDF
 * es peor que una pantalla: se guarda, se manda y se firma.
 *
 * Se guarda en el módulo en lugar de pasarla por los 43 sitios porque la
 * generación es síncrona: cada función de exportación la fija al empezar y nadie
 * más escribe mientras tanto.
 */
let monedaDelDocumento = ''

function usarMoneda(moneda?: string | null) {
  monedaDelDocumento = String(moneda ?? '').trim().toUpperCase()
}

/**
 * Formatea un importe con la moneda del documento. Sin moneda conocida se imprime
 * el número solo: es preferible a etiquetarlo con una divisa que no es la suya.
 */
export function formatCurrency(amount: number): string {
  if (!monedaDelDocumento) {
    return new Intl.NumberFormat('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: monedaDelDocumento,
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Export Balance de Comprobación to PDF
 */
export function exportBalanceComprobacionToPDF(
  data: any[],
  anio: number,
  mes: number,
  totales: any,
  moneda?: string,
) {
  usarMoneda(moneda)
  const doc = new jsPDF('landscape')
  
  // Title
  doc.setFontSize(18)
  doc.text('Balance de Comprobación', 14, 20)
  
  // Period
  doc.setFontSize(12)
  doc.text(`Período: ${anio} - ${String(mes).padStart(2, '0')}`, 14, 28)
  
  // Table
  const tableData = data.map(item => [
    item.cuenta,
    item.nombre,
    formatCurrency(item.saldo_inicial),
    formatCurrency(item.debe),
    formatCurrency(item.haber),
    formatCurrency(item.saldo_final)
  ])
  
  // Add totals row
  tableData.push([
    '',
    'TOTALES',
    formatCurrency(totales.saldo_inicial),
    formatCurrency(totales.debe),
    formatCurrency(totales.haber),
    formatCurrency(totales.saldo_final)
  ])
  
  autoTable(doc, {
    startY: 35,
    head: [['Cuenta', 'Nombre', 'Saldo Inicial', 'Debe', 'Haber', 'Saldo Final']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 25, halign: 'left' },
      1: { cellWidth: 80, halign: 'left' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 35, halign: 'right' }
    },
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    footStyles: {
      fillColor: [229, 231, 235],
      textColor: 0,
      fontStyle: 'bold'
    }
  })
  
  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }
  
  // Save
  doc.save(`Balance_Comprobacion_${anio}_${String(mes).padStart(2, '0')}.pdf`)
}

/**
 * Export Estado de Resultados to PDF
 */
export function exportEstadoResultadosToPDF(
  data: any,
  anio: number,
  mes: number,
  moneda?: string,
) {
  usarMoneda(moneda)
  const doc = new jsPDF()
  
  // Title
  doc.setFontSize(18)
  doc.text('Estado de Resultados (P&L)', 14, 20)
  
  // Period
  doc.setFontSize(12)
  doc.text(`Período: ${anio} - ${String(mes).padStart(2, '0')}`, 14, 28)
  
  const margenBruto = data.ingresos.total_ingresos > 0 
    ? (data.costos.utilidad_bruta / data.ingresos.total_ingresos) * 100 
    : 0
  const margenNeto = data.ingresos.total_ingresos > 0 
    ? (data.utilidad_neta / data.ingresos.total_ingresos) * 100 
    : 0
  
  // Prepare table data
  const tableData = [
    ['INGRESOS', '', ''],
    ['Ventas', formatCurrency(data.ingresos.ventas), ''],
    ['Otros Ingresos', formatCurrency(data.ingresos.otros_ingresos), ''],
    ['Total Ingresos', formatCurrency(data.ingresos.total_ingresos), '100.00%'],
    ['', '', ''],
    ['COSTOS', '', ''],
    ['Costo de Ventas', `(${formatCurrency(data.costos.costo_ventas)})`, `${((data.costos.costo_ventas / data.ingresos.total_ingresos) * 100).toFixed(2)}%`],
    ['Utilidad Bruta', formatCurrency(data.costos.utilidad_bruta), `${margenBruto.toFixed(2)}%`],
    ['', '', ''],
    ['GASTOS OPERATIVOS', '', ''],
    ['Gastos Administrativos', `(${formatCurrency(data.gastos.gastos_administrativos)})`, `${((data.gastos.gastos_administrativos / data.ingresos.total_ingresos) * 100).toFixed(2)}%`],
    ['Gastos de Ventas', `(${formatCurrency(data.gastos.gastos_ventas)})`, `${((data.gastos.gastos_ventas / data.ingresos.total_ingresos) * 100).toFixed(2)}%`],
    ['Gastos Financieros', `(${formatCurrency(data.gastos.gastos_financieros)})`, `${((data.gastos.gastos_financieros / data.ingresos.total_ingresos) * 100).toFixed(2)}%`],
    ['Total Gastos', `(${formatCurrency(data.gastos.total_gastos)})`, `${((data.gastos.total_gastos / data.ingresos.total_ingresos) * 100).toFixed(2)}%`],
    ['', '', ''],
    ['UTILIDAD NETA', formatCurrency(data.utilidad_neta), `${margenNeto.toFixed(2)}%`]
  ]
  
  autoTable(doc, {
    startY: 35,
    head: [['Concepto', 'Monto', '% sobre Ingresos']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 90, halign: 'left' },
      1: { cellWidth: 50, halign: 'right' },
      2: { cellWidth: 40, halign: 'right' }
    },
    styles: {
      fontSize: 10,
      cellPadding: 4
    },
    didParseCell: function(data) {
      // Bold for section headers and totals
      if (data.row.index === 0 || data.row.index === 3 || data.row.index === 5 || 
          data.row.index === 7 || data.row.index === 9 || data.row.index === 13 || 
          data.row.index === 16) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [229, 231, 235]
      }
    }
  })
  
  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }
  
  // Save
  doc.save(`Estado_Resultados_${anio}_${String(mes).padStart(2, '0')}.pdf`)
}

/**
 * Export Balance General to PDF
 */
export function exportBalanceGeneralToPDF(
  data: any,
  anio: number,
  mes: number,
  moneda?: string,
) {
  usarMoneda(moneda)
  const doc = new jsPDF()
  
  // Title
  doc.setFontSize(18)
  doc.text('Balance General', 14, 20)
  
  // Period
  doc.setFontSize(12)
  doc.text(`Período: ${anio} - ${String(mes).padStart(2, '0')}`, 14, 28)
  
  // Prepare table data
  const tableData = [
    ['ACTIVOS', ''],
    ['', ''],
    ['Activos Corrientes', ''],
    ['  Efectivo y Equivalentes', formatCurrency(data.activos.corrientes.efectivo)],
    ['  Cuentas por Cobrar', formatCurrency(data.activos.corrientes.cuentas_por_cobrar)],
    ['  Inventarios', formatCurrency(data.activos.corrientes.inventarios)],
    ['  Otros Activos', formatCurrency(data.activos.corrientes.otros_activos)],
    ['Total Activos Corrientes', formatCurrency(data.activos.corrientes.total_corrientes)],
    ['', ''],
    ['Activos No Corrientes', ''],
    ['  Activos Fijos', formatCurrency(data.activos.no_corrientes.activos_fijos)],
    ['  (-) Depreciación Acumulada', `(${formatCurrency(data.activos.no_corrientes.depreciacion_acumulada)})`],
    ['  Otros Activos', formatCurrency(data.activos.no_corrientes.otros_activos)],
    ['Total Activos No Corrientes', formatCurrency(data.activos.no_corrientes.total_no_corrientes)],
    ['', ''],
    ['TOTAL ACTIVOS', formatCurrency(data.activos.total_activos)],
    ['', ''],
    ['', ''],
    ['PASIVOS', ''],
    ['', ''],
    ['Pasivos Corrientes', ''],
    ['  Cuentas por Pagar', formatCurrency(data.pasivos.corrientes.cuentas_por_pagar)],
    ['  Tributos por Pagar', formatCurrency(data.pasivos.corrientes.tributos_por_pagar)],
    ['  Remuneraciones por Pagar', formatCurrency(data.pasivos.corrientes.remuneraciones_por_pagar)],
    ['  Otros Pasivos', formatCurrency(data.pasivos.corrientes.otros_pasivos)],
    ['Total Pasivos Corrientes', formatCurrency(data.pasivos.corrientes.total_corrientes)],
    ['', ''],
    ['Pasivos No Corrientes', ''],
    ['  Deudas a Largo Plazo', formatCurrency(data.pasivos.no_corrientes.deudas_largo_plazo)],
    ['  Otros Pasivos', formatCurrency(data.pasivos.no_corrientes.otros_pasivos)],
    ['Total Pasivos No Corrientes', formatCurrency(data.pasivos.no_corrientes.total_no_corrientes)],
    ['', ''],
    ['TOTAL PASIVOS', formatCurrency(data.pasivos.total_pasivos)],
    ['', ''],
    ['', ''],
    ['PATRIMONIO', ''],
    ['', ''],
    ['  Capital', formatCurrency(data.patrimonio.capital)],
    ['  Resultados Acumulados', formatCurrency(data.patrimonio.resultados_acumulados)],
    ['  Resultado del Ejercicio', formatCurrency(data.patrimonio.resultado_ejercicio)],
    ['TOTAL PATRIMONIO', formatCurrency(data.patrimonio.total_patrimonio)],
    ['', ''],
    ['TOTAL PASIVOS + PATRIMONIO', formatCurrency(data.pasivos.total_pasivos + data.patrimonio.total_patrimonio)]
  ]
  
  autoTable(doc, {
    startY: 35,
    head: [['Concepto', 'Monto']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 120, halign: 'left' },
      1: { cellWidth: 60, halign: 'right' }
    },
    styles: {
      fontSize: 10,
      cellPadding: 3
    },
    didParseCell: function(data) {
      // Bold for main sections and totals
      if (data.row.index === 0 || data.row.index === 7 || data.row.index === 13 || 
          data.row.index === 15 || data.row.index === 18 || data.row.index === 25 || 
          data.row.index === 30 || data.row.index === 32 || data.row.index === 35 || 
          data.row.index === 40 || data.row.index === 43) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [229, 231, 235]
      }
    }
  })
  
  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(
      `Página ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }
  
  // Save
  doc.save(`Balance_General_${anio}_${String(mes).padStart(2, '0')}.pdf`)
}
