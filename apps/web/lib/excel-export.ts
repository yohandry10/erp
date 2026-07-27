/**
 * Utility functions for exporting data to Excel
 */

export interface ExcelColumn {
  header: string
  key: string
  width?: number
}

export interface ExcelSheet {
  name: string
  data: any[]
  columns: ExcelColumn[]
}

/**
 * Export data to Excel file
 */
export function exportToExcel(sheets: ExcelSheet[], filename: string) {
  const workbookXml = createSpreadsheetXml(sheets)
  const blob = new Blob([workbookXml], {
    type: 'application/vnd.ms-excel;charset=utf-8'
  })
  const downloadName = filename.replace(/\.xlsx$/i, '.xls')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function createSpreadsheetXml(sheets: ExcelSheet[]): string {
  const worksheets = sheets.map(sheet => {
    const columns = sheet.columns
      .map(column => `<Column ss:Width="${(column.width || 15) * 7}"/>`)
      .join('')

    const headerRow = `<Row>${sheet.columns
      .map(column => createCell(column.header, 'String'))
      .join('')}</Row>`

    const dataRows = sheet.data
      .map(row => `<Row>${sheet.columns
        .map(column => createCell(row[column.key] ?? '', 'String'))
        .join('')}</Row>`)
      .join('')

    return `<Worksheet ss:Name="${escapeXml(sheet.name)}"><Table>${columns}${headerRow}${dataRows}</Table></Worksheet>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  ${worksheets}
</Workbook>`
}

function createCell(value: unknown, type: 'String' | 'Number'): string {
  return `<Cell><Data ss:Type="${type}">${escapeXml(String(value))}</Data></Cell>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Format currency for Excel
 */
export function formatCurrencyForExcel(amount: number): string {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

/**
 * Format percentage for Excel
 */
export function formatPercentageForExcel(value: number): string {
  return `${value.toFixed(2)}%`
}
