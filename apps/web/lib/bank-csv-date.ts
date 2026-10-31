/** Los formatos publicados en la importación; nunca normaliza una fecha imposible. */
export function parseBankCsvDate(input: string): string {
  const value = input.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const local = /^(\d{2})([/-])(\d{2})\2(\d{4})$/.exec(value)
  if (!iso && !local) throw new Error(`Formato de fecha inválido: ${input}`)
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(local![4]), Number(local![3]), Number(local![1])]
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Fecha inválida: ${input}`)
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
