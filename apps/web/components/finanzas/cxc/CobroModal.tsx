'use client'

'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useApi } from '@/hooks/use-api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface CuentaPorCobrarResumen {
  id: string
  saldo: number
  moneda: string
  serie?: string | null
  numero?: string | null
  clientes?: {
    razon_social?: string | null
  }
}

interface CuentaBancariaResumen {
  id: string
  nombre?: string
  banco?: string
  numero_cuenta?: string
  moneda?: string
  activa?: boolean
}

interface CobroModalProps {
  isOpen: boolean
  cuenta: CuentaPorCobrarResumen | null
  onClose: () => void
  onSuccess: () => void
}

const METODOS_PAGO = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia bancaria' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'TARJETA', label: 'Tarjeta' },
]

const formatCurrency = (value: number, currency: string = 'PEN') =>
  Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value || 0)

export function CobroModal({ isOpen, cuenta, onClose, onSuccess }: CobroModalProps) {
  const { get, post } = useApi({ showSuccessToast: true })
  const [monto, setMonto] = useState('')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().split('T')[0])
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [cuentaBancariaId, setCuentaBancariaId] = useState('')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancariaResumen[]>([])
  const [loadingBancos, setLoadingBancos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saldoDisponible = useMemo(() => cuenta?.saldo ?? 0, [cuenta])

  useEffect(() => {
    if (!isOpen || !cuenta) {
      return
    }

    setMonto(saldoDisponible > 0 ? String(saldoDisponible) : '')
    setMetodoPago('EFECTIVO')
    setCuentaBancariaId('')
    setReferencia('')
    setNotas('')
    setError(null)

    const loadBancos = async () => {
      try {
        setLoadingBancos(true)
        const response = await get('/api/finanzas/bancos/cuentas')
        const lista = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
        const activos = lista.filter(
          (item: any) => item.activa !== false && (!cuenta.moneda || item.moneda === cuenta.moneda)
        )
        setCuentasBancarias(activos)
      } catch (err) {
        console.error('Error cargando cuentas bancarias', err)
        setCuentasBancarias([])
      } finally {
        setLoadingBancos(false)
      }
    }

    loadBancos()
  }, [isOpen, cuenta, saldoDisponible, get])

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cuenta) return

    const montoNumber = parseFloat(monto)
    if (Number.isNaN(montoNumber) || montoNumber <= 0) {
      setError('El monto debe ser mayor a cero')
      return
    }

    if (montoNumber - saldoDisponible > 0.05) {
      setError(
        `El monto no puede superar el saldo pendiente (${formatCurrency(saldoDisponible, cuenta.moneda)})`
      )
      return
    }

    try {
      setSaving(true)
      setError(null)
      const generateIdempotencyKey = () => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID()
        }
        return `cxc-cobro-${Date.now()}`
      }

      const payload = {
        monto: montoNumber,
        fecha_pago: fechaPago,
        metodo_pago: metodoPago,
        cuenta_bancaria_id: cuentaBancariaId || undefined,
        referencia: referencia || undefined,
        notas: notas || undefined,
        idempotency_key: generateIdempotencyKey(),
      }

      const response = await post(`/api/finanzas/cxc/${cuenta.id}/pagos`, payload)
      if (response) {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      console.error('Error registrando cobro', err)
      setError(err?.message ?? 'No se pudo registrar el cobro')
    } finally {
      setSaving(false)
    }
  }

  const tituloDocumento = useMemo(() => {
    if (!cuenta) return ''
    const numero = [cuenta.serie, cuenta.numero].filter(Boolean).join('-')
    return numero || cuenta.id
  }, [cuenta])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            Aplica un cobro a la cuenta por cobrar {tituloDocumento}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="monto">Monto</Label>
              <Input
                id="monto"
                type="number"
                min="0"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Saldo pendiente: {formatCurrency(saldoDisponible, cuenta?.moneda || 'PEN')}
              </p>
            </div>

            <div>
              <Label htmlFor="fecha_pago">Fecha de cobro</Label>
              <Input
                id="fecha_pago"
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                required
              />
            </div>

            <div>
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione método" />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((metodo) => (
                    <SelectItem key={metodo.value} value={metodo.value}>
                      {metodo.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Cuenta bancaria (opcional)</Label>
              <Select
                value={cuentaBancariaId}
                onValueChange={setCuentaBancariaId}
                disabled={loadingBancos || cuentasBancarias.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingBancos ? 'Cargando cuentas...' : 'Selecciona una cuenta'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin cuenta bancaria</SelectItem>
                  {cuentasBancarias.map((cuentaBanco) => (
                    <SelectItem key={cuentaBanco.id} value={cuentaBanco.id}>
                      {`${cuentaBanco.nombre || cuentaBanco.banco || 'Cuenta'}${
                        cuentaBanco.numero_cuenta ? ` - ${cuentaBanco.numero_cuenta}` : ''
                      }`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="referencia">Referencia</Label>
              <Input
                id="referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Número de operación, cheque, etc."
              />
            </div>

            <div>
              <Label htmlFor="notas">Notas internas</Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                placeholder="Observaciones adicionales"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Registrando...' : 'Registrar cobro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
