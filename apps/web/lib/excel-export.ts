import * as XLSX from 'xlsx'

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
  const workbook = XLSX.utils.book_new()

  sheets.forEach(sheet => {
    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(sheet.data, {
      header: sheet.columns.map(col => col.key)
    })

    // Set column headers
    const headerRow = sheet.columns.map(col => col.header)
    XLSX.utils.sheet_add_aoa(worksheet, [headerRow], { origin: 'A1' })

    // Set column widths
    worksheet['!cols'] = sheet.columns.map(col => ({
      wch: col.width || 15
    }))

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })

  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, filename)
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
