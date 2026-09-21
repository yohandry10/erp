type MoneyRow = { moneda?: string }

export function reportMoney(amount: number, currency?: string): string {
  return `${currency || 'Moneda no informada'} ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function reportTotals<T extends MoneyRow>(rows: T[], amount: (row: T) => number): [string, number][] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const currency = row.moneda || ''
    totals.set(currency, (totals.get(currency) || 0) + amount(row))
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b))
}

export function ReportMoneyTotals<T extends MoneyRow>({ rows, amount, className }: {
  rows: T[]
  amount: (row: T) => number
  className: string
}) {
  return <div data-testid="report-currency-totals">
    {reportTotals(rows, amount).map(([currency, total]) =>
      <p key={currency} className={className}>{reportMoney(total, currency)}</p>)}
  </div>
}
