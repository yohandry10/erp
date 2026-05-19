'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  moneda: string
  saldo: number
}

interface PagoProximo {
  id: string
  numero_documento: string
  fecha_vencimiento: string
  saldo: number
  moneda: string
  dias_hasta_vencimiento: number
  urgencia: string
  proveedor: {
    razon_social: string
  }
}

interface ResumenFlujo {
  moneda: string
  saldo_actual: number
  total_ingresos: number
  total_egresos: number
  flujo_neto: number
  saldo_proyectado: number
  alerta: string | null
}

const URGENCIA_CONFIG = {
  VENCIDA: {
    label: 'Vencida',
    className: 'border-amber-300/35 bg-amber-300/10 text-amber-100',
  },
  HOY: {
    label: 'Vence hoy',
    className: 'border-amber-300/35 bg-amber-300/10 text-amber-100',
  },
  URGENTE: {
    label: 'Urgente',
    className: 'border-sky-300/35 bg-sky-300/10 text-sky-100',
  },
  PROXIMA: {
    label: 'Próxima',
    className: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  },
  NORMAL: {
    label: 'Normal',
    className: 'border-slate-400/30 bg-slate-400/10 text-slate-200',
  },
}

export default function TesoreriaPage() {
  const router = useRouter()
  const { get } = useApi({ retries: 1, timeoutMs: 8000 })

  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [proximosPagos, setProximosPagos] = useState<PagoProximo[]>([])
  const [resumenFlujo, setResumenFlujo] = useState<ResumenFlujo[]>([])
  const [loading, setLoading] = useState(true)

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true)

      const cuentasResponse = await get('/api/finanzas/bancos/cuentas')
      if (cuentasResponse?.success) {
        setCuentas(cuentasResponse.data || [])
      }

      const hoy = new Date()
      const en15Dias = new Date()
      en15Dias.setDate(hoy.getDate() + 15)

      const programacionResponse = await get(
        `/api/finanzas/tesoreria/programacion?fecha_hasta=${en15Dias.toISOString().split('T')[0]}&limit=10`,
      )
      if (programacionResponse?.success) {
        setProximosPagos(programacionResponse.data || [])
      }

      const flujoResponse = await get('/api/finanzas/tesoreria/flujo-caja?dias_proyeccion=30')
      if (flujoResponse?.success && flujoResponse.data?.resumen) {
        setResumenFlujo(flujoResponse.data.resumen || [])
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [get])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(amount)
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

  const getUrgenciaBadge = (urgencia: string) => {
    const config = URGENCIA_CONFIG[urgencia as keyof typeof URGENCIA_CONFIG]
    if (!config) return null

    return (
      <Badge variant="outline" className={cn('whitespace-nowrap', config.className)}>
        {config.label}
      </Badge>
    )
  }

  const totalSaldoPEN = cuentas.filter((c) => c.moneda === 'PEN').reduce((sum, c) => sum + c.saldo, 0)
  const totalSaldoUSD = cuentas.filter((c) => c.moneda === 'USD').reduce((sum, c) => sum + c.saldo, 0)
  const totalPorPagarPEN = proximosPagos.filter((p) => p.moneda === 'PEN').reduce((sum, p) => sum + p.saldo, 0)
  const totalPorPagarUSD = proximosPagos.filter((p) => p.moneda === 'USD').reduce((sum, p) => sum + p.saldo, 0)
  const pagosVencidos = proximosPagos.filter((p) => p.urgencia === 'VENCIDA').length
  const pagosUrgentes = proximosPagos.filter((p) => p.urgencia === 'HOY' || p.urgencia === 'URGENTE').length

  if (loading) {
    return (
      <div className="min-h-full bg-slate-950 p-6 text-slate-100">
        <Card className="border-cyan-400/20 bg-slate-950/70">
          <CardContent className="flex min-h-80 flex-col items-center justify-center gap-4">
            <RefreshCw className="h-8 w-8 animate-spin text-cyan-300" />
            <p className="text-sm text-slate-300">Cargando información de tesorería...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_34%),linear-gradient(135deg,#020617_0%,#061a2f_58%,#020617_100%)] p-4 text-slate-100 group-data-[erp-theme=light]/dashboard:bg-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950 lg:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Card className="border-cyan-400/20 bg-slate-950/75 shadow-2xl shadow-cyan-950/20 group-data-[erp-theme=light]/dashboard:bg-white">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge variant="outline" className="mb-2 border-cyan-400/30 bg-cyan-400/10 text-cyan-100">
                ERP Treasury Center
              </Badge>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950 lg:text-3xl">
                Tesorería
              </h1>
              <p className="mt-1 text-sm text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-600">
                Saldos bancarios, pagos próximos, flujo proyectado y acciones financieras críticas.
              </p>
            </div>
            <Button variant="outline" className="border-cyan-400/30 bg-slate-950/50 text-cyan-100 hover:bg-cyan-400/10" onClick={loadDashboardData}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={DollarSign} label="Saldo PEN" value={formatCurrency(totalSaldoPEN, 'PEN')} detail={`${cuentas.filter((c) => c.moneda === 'PEN').length} cuenta(s)`} />
          <MetricCard icon={DollarSign} label="Saldo USD" value={formatCurrency(totalSaldoUSD, 'USD')} detail={`${cuentas.filter((c) => c.moneda === 'USD').length} cuenta(s)`} />
          <MetricCard icon={TrendingDown} label="Por pagar 15 días" value={formatCurrency(totalPorPagarPEN, 'PEN')} detail={`${formatCurrency(totalPorPagarUSD, 'USD')} en USD`} />
          <MetricCard icon={AlertCircle} label="Alertas" value={(pagosVencidos + pagosUrgentes).toString()} detail={`${pagosVencidos} vencidos, ${pagosUrgentes} urgentes`} />
        </div>

        {resumenFlujo.length > 0 && (
          <Card className="border-cyan-400/20 bg-slate-950/70 group-data-[erp-theme=light]/dashboard:bg-white">
            <CardHeader className="flex flex-row items-center justify-between border-b border-cyan-400/10 p-4">
              <CardTitle className="text-base text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950">Proyección de flujo (30 días)</CardTitle>
              <Button variant="outline" className="border-cyan-400/30 bg-slate-950/50 text-cyan-100 hover:bg-cyan-400/10" onClick={() => router.push('/dashboard/finanzas/tesoreria/flujo-caja')}>
                Ver detalle
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {resumenFlujo.map((resumen) => (
                <Card key={resumen.moneda} className="border-cyan-400/20 bg-slate-950/55">
                  <CardContent className="space-y-4 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase text-cyan-200/75">{resumen.moneda}</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-50">{formatCurrency(resumen.saldo_proyectado, resumen.moneda)}</p>
                      <p className="text-xs text-slate-400">Saldo proyectado</p>
                    </div>

                    <div className="space-y-2 text-sm">
                      <FlowLine label="Ingresos" value={`+${formatCurrency(resumen.total_ingresos, resumen.moneda)}`} tone="positive" />
                      <FlowLine label="Egresos" value={`-${formatCurrency(resumen.total_egresos, resumen.moneda)}`} tone="negative" />
                      <div className="border-t border-cyan-400/10 pt-2">
                        <FlowLine
                          label="Flujo neto"
                          value={`${resumen.flujo_neto >= 0 ? '+' : ''}${formatCurrency(resumen.flujo_neto, resumen.moneda)}`}
                          tone={resumen.flujo_neto >= 0 ? 'positive' : 'negative'}
                          strong
                        />
                      </div>
                    </div>

                    {resumen.alerta && (
                      <Alert className="border-amber-300/30 bg-amber-300/10 text-amber-100">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {resumen.alerta === 'SALDO_NEGATIVO' ? 'Saldo negativo proyectado' : 'Saldo bajo proyectado'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-cyan-400/20 bg-slate-950/70 group-data-[erp-theme=light]/dashboard:bg-white">
          <CardHeader className="flex flex-col gap-3 border-b border-cyan-400/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950">Próximos pagos (15 días)</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="border-cyan-400/30 bg-slate-950/50 text-cyan-100 hover:bg-cyan-400/10" onClick={() => router.push('/dashboard/finanzas/tesoreria/programacion')}>
                <Calendar className="mr-2 h-4 w-4" />
                Ver programación
              </Button>
              <Button className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white" onClick={() => router.push('/dashboard/finanzas/tesoreria/lote')}>
                <CreditCard className="mr-2 h-4 w-4" />
                Pago masivo
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {proximosPagos.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950">No hay pagos próximos</h2>
                  <p className="mt-1 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-600">
                    No hay cuentas por pagar con vencimiento en los próximos 15 días.
                  </p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-cyan-400/10 hover:bg-transparent">
                    <TableHead>Urgencia</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>N° documento</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proximosPagos.map((pago) => (
                    <TableRow key={pago.id} className="border-cyan-400/10 hover:bg-cyan-400/5">
                      <TableCell>{getUrgenciaBadge(pago.urgencia)}</TableCell>
                      <TableCell className="font-medium text-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-950">
                        {pago.proveedor?.razon_social || 'N/A'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-300 group-data-[erp-theme=light]/dashboard:text-slate-700">{pago.numero_documento}</TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-100 group-data-[erp-theme=light]/dashboard:text-slate-950">{formatDate(pago.fecha_vencimiento)}</div>
                        <div className={cn('mt-1 text-xs', pago.dias_hasta_vencimiento < 0 ? 'text-amber-200' : 'text-slate-400')}>
                          {pago.dias_hasta_vencimiento < 0
                            ? `Vencido hace ${Math.abs(pago.dias_hasta_vencimiento)} días`
                            : pago.dias_hasta_vencimiento === 0
                              ? 'Vence hoy'
                              : `Vence en ${pago.dias_hasta_vencimiento} días`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-100">
                        {formatCurrency(pago.saldo, pago.moneda)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white" onClick={() => router.push(`/dashboard/finanzas/cxp/${pago.id}`)}>
                          Ver detalle
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <QuickAction icon={Clock} title="Cuentas por pagar" description="Gestiona cuentas pendientes con proveedores." onClick={() => router.push('/dashboard/finanzas/cxp')} />
          <QuickAction icon={Calendar} title="Programación de pagos" description="Planifica pagos por fecha de vencimiento." onClick={() => router.push('/dashboard/finanzas/tesoreria/programacion')} />
          <QuickAction icon={CreditCard} title="Pago masivo" description="Procesa múltiples pagos en una operación." onClick={() => router.push('/dashboard/finanzas/tesoreria/lote')} />
          <QuickAction icon={DollarSign} title="Cuentas bancarias" description="Administra saldos y bancos de la empresa." onClick={() => router.push('/dashboard/finanzas/bancos')} />
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ElementType
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="border-cyan-400/20 bg-slate-950/70 group-data-[erp-theme=light]/dashboard:bg-white">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200/75 group-data-[erp-theme=light]/dashboard:text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950">{value}</p>
            <p className="mt-1 text-xs text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-600">{detail}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FlowLine({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string
  value: string
  tone: 'positive' | 'negative'
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn('text-slate-400', strong && 'font-semibold text-slate-200')}>{label}:</span>
      <span className={cn('font-semibold', tone === 'positive' ? 'text-cyan-200' : 'text-amber-100', strong && 'font-bold')}>
        {value}
      </span>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ElementType
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-lg border border-cyan-400/20 bg-slate-950/70 p-4 text-left shadow-lg shadow-cyan-950/10 transition hover:border-cyan-300/50 hover:bg-cyan-400/10 group-data-[erp-theme=light]/dashboard:bg-white"
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/10 text-cyan-200 transition group-hover:bg-cyan-400/20">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-50 group-data-[erp-theme=light]/dashboard:text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-400 group-data-[erp-theme=light]/dashboard:text-slate-600">{description}</p>
    </button>
  )
}
