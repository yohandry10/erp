/** CSV de archivos locales; un salto de línea entre comillas pertenece al campo. */
export function parseCsvRecords(content: string): string[][] {
  const records: string[][] = []
  let columns: string[] = [], field = '', quoted = false, closedQuote = false
  const fail = (message: string): never => { throw new Error(`Registro ${records.length + 1}: ${message}`) }
  const finishField = () => { columns.push(field.trim()); field = ''; closedQuote = false }
  const finishRecord = () => { finishField(); if (columns.some(value => value !== '')) records.push(columns); columns = [] }
  const input = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') { quoted = false; closedQuote = true }
      else field += char
    } else if (char === ',') finishField()
    else if (char === '\n') finishRecord()
    else if (char === '"') {
      if (field.trim().length || closedQuote) fail('comillas inesperadas en el campo')
      field = ''; quoted = true
    } else if (closedQuote) {
      if (!/^[ \t]$/.test(char)) fail('contenido después del cierre de comillas')
    } else field += char
    if (field.length > 4096) fail('el campo supera 4096 caracteres; no se truncará')
  }
  if (quoted) fail('comillas sin cerrar')
  if (field || columns.length || closedQuote) finishRecord()
  return records
}
