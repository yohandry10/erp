import { AlertCircle, Building2, CheckCircle, CreditCard, DollarSign, Edit, Eye, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  tipo_cuenta: string
  moneda: string
  saldo: number
  permite_sobregiro: boolean
  activa: boolean
}

interface CuentaBancariaCardProps {
  cuenta: CuentaBancaria
  onView: () => void
  onEdit: () => void
}

const TIPO_CUENTA_LABELS: Record<string, string> = {
  CORRIENTE: 'Corriente',
  AHORROS: 'Ahorros',
  DETRACCION: 'Detraccion',
  PLAZO_FIJO: 'Plazo fijo',
}

export default function CuentaBancariaCard({ cuenta, onView, onEdit }: CuentaBancariaCardProps) {
  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : moneda === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(amount)
  }

  return (
    <Card className="overflow-hidden border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
      <div className="h-1 bg-cyan-400/70" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
              <CreditCard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">
                {TIPO_CUENTA_LABELS[cuenta.tipo_cuenta] || cuenta.tipo_cuenta}
              </div>
              <h3 className="mt-1 truncate text-lg font-bold text-white">{cuenta.nombre}</h3>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${cuenta.activa ? 'border-cyan-300/25 bg-cyan-300/10 text-primary' : 'border-border/25 bg-slate-300/10 text-foreground'}`}>
            {cuenta.activa ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {cuenta.activa ? 'Activa' : 'Inactiva'}
          </span>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4 text-primary/80" />
          <span className="font-medium">{cuenta.banco}</span>
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-card/70 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Numero de cuenta</div>
          <div className="mt-2 break-all font-mono text-sm font-bold tracking-wide text-white">{cuenta.numero_cuenta}</div>
        </div>

        <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/80">Saldo disponible</div>
              <div className="mt-2 text-2xl font-black text-primary">{formatCurrency(cuenta.saldo, cuenta.moneda)}</div>
            </div>
            <DollarSign className="h-8 w-8 text-cyan-200/50" />
          </div>
        </div>

        {cuenta.permite_sobregiro && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm font-semibold text-amber-400 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            Permite sobregiro
          </div>
        )}

        <div className="mt-5 grid gap-2 border-t border-cyan-400/10 pt-4 sm:grid-cols-2">
          <Button type="button" onClick={onView} variant="outline" className="gap-2 border-cyan-400/20 bg-white/10 text-primary hover:bg-white/15 hover:text-white">
            <Eye className="h-4 w-4" />
            Movimientos
          </Button>
          <Button type="button" onClick={onEdit} className="gap-2 bg-blue-600 text-white hover:bg-blue-500">
            <Edit className="h-4 w-4" />
            Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
