'use client'

import { Banknote, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type CashTenderPanelProps = {
  currencySymbol: string
  total: number
  value: string
  onChange: (value: string) => void
}

const parseAmount = (value: string) => {
  const amount = Number(value.replace(',', '.'))
  return Number.isFinite(amount) ? amount : 0
}

const formatAmount = (value: number) => value.toFixed(2)

export function CashTenderPanel({ currencySymbol, total, value, onChange }: CashTenderPanelProps) {
  const received = parseAmount(value)
  const payableTotal = Number(total.toFixed(2))
  const remaining = Math.max(0, payableTotal - received)
  const change = Math.max(0, received - payableTotal)
  const suggestions = Array.from(new Set([
    payableTotal,
    Math.ceil(payableTotal / 10) * 10,
    Math.ceil(payableTotal / 50) * 50,
  ])).filter((amount) => amount > 0)

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Banknote className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">Cobro en efectivo</p>
          <p className="text-xs text-muted-foreground">Ingrese lo recibido para calcular el vuelto.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div className="space-y-2">
          <Label htmlFor="pos-efectivo-recibido">Efectivo recibido</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              {currencySymbol}
            </span>
            <Input
              id="pos-efectivo-recibido"
              inputMode="decimal"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="h-11 pl-10 text-base font-semibold"
              placeholder="0.00"
              aria-describedby="pos-efectivo-ayuda"
            />
          </div>
          <p id="pos-efectivo-ayuda" className="text-xs text-muted-foreground">
            Total: {currencySymbol} {formatAmount(payableTotal)}
          </p>
        </div>

        <div className={`rounded-lg border p-3 ${remaining > 0 ? 'bg-destructive/5' : 'bg-emerald-500/10'}`}>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" />
            {remaining > 0 ? 'Falta recibir' : 'Vuelto'}
          </div>
          <p className={`mt-1 text-xl font-bold ${remaining > 0 ? 'text-destructive' : 'text-emerald-400 dark:text-emerald-300'}`}>
            {currencySymbol} {formatAmount(remaining > 0 ? remaining : change)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Importes rápidos</span>
        {suggestions.map((amount) => (
          <Button
            key={amount}
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onChange(formatAmount(amount))}
          >
            {currencySymbol} {formatAmount(amount)}
          </Button>
        ))}
      </div>
    </div>
  )
}
