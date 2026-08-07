export type CsvValue = string | number | boolean | null | undefined

const protectSpreadsheetCell = (value: CsvValue) => {
  const text = value === null || value === undefined ? '' : String(value)
  // Evita que datos de clientes/proveedores se ejecuten como fórmulas al abrir
  // el CSV en Excel o LibreOffice.
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

const escapeCsvCell = (value: CsvValue) => {
  const protectedValue = protectSpreadsheetCell(value)
  return `"${protectedValue.replace(/"/g, '""')}"`
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: CsvValue[][],
): void {
  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n')

  const blob = new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
