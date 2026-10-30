'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Calendar, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'

import { useFinanceReport } from '@/hooks/use-finance-report'
import FinanceReportStatus from './FinanceReportStatus'
import { groupCashflowWeeks, readCashflowReport } from '@/lib/finanzas/report-read-contract'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import { parseDateLocal } from '@/lib/date-utils'

interface FlujoCajaItem {
  tipo: 'INGRESO' | 'EGRESO'
  concepto: string
  descripcion: string
  monto: number
  referencia_id: string
}

interface ProyeccionDia {
  fecha: string
  moneda: string
  saldo_inicial: number
  ingresos: number
  egresos: number
  flujo_neto: number
  saldo_final: number
  items: FlujoCajaItem[]
}

interface ResumenMoneda {
  moneda: string
  saldo_actual: number
  total_ingresos: number
  total_egresos: number
  flujo_neto: number
  saldo_proyectado: number
  alerta: 'SALDO_NEGATIVO' | 'SALDO_BAJO' | null
}

interface FlujoCajaData {
  periodo: {
    fecha_desde: string
    fecha_hasta: string
    dias: number
  }
  cuentas_bancarias: Array<{
    id: string
    nombre: string
    banco: string
    numero_cuenta: string
    moneda: string
    saldo_actual: number
  }>
  resumen: ResumenMoneda[]
  proyeccion: ProyeccionDia[]
  estadisticas: {
    total_cxp_pendientes: number
    total_cxc_pendientes: number
    total_movimientos: number
  }
}

interface FlujoCajaChartProps {
  diasProyeccion?: number
  cuentaBancariaId?: string
  onReadyChange?: (ready: boolean) => void
}

const panelClass = 'rounded-2xl border border-cyan-400/20 bg-card/65 p-5 text-foreground shadow-xl shadow-blue-950/20'
const metricClass = 'rounded-xl border border-cyan-400/15 bg-card/45 p-4'
const labelClass = 'text-xs font-semibold uppercase tracking-[0.14em] text-primary/80'
const valueClass = 'mt-2 text-2xl font-black text-white'
const buttonClass = 'inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-cyan-400/15'
const tableClass = '!m-0 w-full min-w-full table-fixed border-collapse !bg-card/80 text-sm !shadow-none'
const thClass = '!border-cyan-400/10 !bg-card/90 px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'
const tdClass = '!border-cyan-400/10 !bg-transparent px-3 py-3 text-foreground/90'

export default function FlujoCajaChart({ diasProyeccion = 90, cuentaBancariaId, onReadyChange }: FlujoCajaChartProps) {
  const { country, currency, formatCurrency } = useLocalizedMoney()
  const [selectedMoneda, setSelectedMoneda] = useState<string>(currency)
  const [vistaDetallada, setVistaDetallada] = useState(false)

  const params = new URLSearchParams({ dias_proyeccion: String(diasProyeccion) })
  if (cuentaBancariaId) params.append('cuenta_bancaria_id', cuentaBancariaId)
  const { data: flujoCaja, loading, error, reload: loadFlujoCaja } = useFinanceReport<FlujoCajaData>(
    `/api/finanzas/tesoreria/flujo-caja?${params.toString()}`, readCashflowReport, onReadyChange)

  useEffect(() => {
    if (flujoCaja?.resumen.length && !flujoCaja.resumen.some(row => row.moneda === selectedMoneda)) setSelectedMoneda(flujoCaja.resumen[0].moneda)
  }, [flujoCaja, selectedMoneda])

  const formatDate = (dateString: string) =>
    parseDateLocal(dateString).toLocaleDateString(country.locale || 'es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  if (loading || error) return <FinanceReportStatus loading={loading} retry={loadFlujoCaja} />

  if (!flujoCaja || flujoCaja.resumen.length === 0) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-cyan-400/20 bg-card/65 p-8 text-center text-muted-foreground">
        <TrendingUp className="mb-4 h-12 w-12 text-cyan-200/50" />
        <h3 className="text-lg font-bold text-white">No hay datos para proyectar</h3>
        <p className="mt-2 text-sm text-muted-foreground">No se encontraron cuentas bancarias activas o movimientos pendientes.</p>
        <button type="button" onClick={loadFlujoCaja} className="mt-4 rounded border px-4 py-2">Actualizar</button>
      </div>
    )
  }

  const resumenSeleccionado = flujoCaja.resumen.find((resumen) => resumen.moneda === selectedMoneda) || flujoCaja.resumen[0]
  const proyeccionFiltrada = flujoCaja.proyeccion.filter((dia) => dia.moneda === selectedMoneda)

  const proyeccionSemanal = groupCashflowWeeks(
    proyeccionFiltrada, flujoCaja.periodo.fecha_desde, flujoCaja.periodo.fecha_hasta)

  const hasAlert = resumenSeleccionado.alerta !== null

  return (
    <div data-finance-cashflow className={panelClass}>
      <div className="mb-5 flex flex-col gap-3 border-b border-cyan-400/10 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <TrendingUp className="mt-1 h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-black text-white">Flujo de Caja Proyectado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(flujoCaja.periodo.fecha_desde)} - {formatDate(flujoCaja.periodo.fecha_hasta)} ({flujoCaja.periodo.dias} dias)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setVistaDetallada(!vistaDetallada)} className={buttonClass}>
            {vistaDetallada ? 'Vista Semanal' : 'Vista Diaria'}
          </button>
          <button type="button" onClick={loadFlujoCaja} className={buttonClass}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>
      </div>

      {flujoCaja.resumen.length > 1 ? (
        <div className="mb-5">
          <label className={labelClass}>Moneda</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {flujoCaja.resumen.map((resumen) => (
              <button
                key={resumen.moneda}
                type="button"
                onClick={() => setSelectedMoneda(resumen.moneda)}
                className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${selectedMoneda === resumen.moneda ? 'border-cyan-300/40 bg-cyan-400/15 text-primary' : 'border-cyan-400/15 bg-card/45 text-muted-foreground hover:bg-cyan-400/10'}`}
              >
                {resumen.moneda}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={metricClass}>
          <div className={labelClass}>Saldo Actual</div>
          <div className={valueClass}>{formatCurrency(resumenSeleccionado.saldo_actual, selectedMoneda)}</div>
        </div>
        <div className={metricClass}>
          <div className={labelClass}>Ingresos Proyectados</div>
          <div className={valueClass}>+{formatCurrency(resumenSeleccionado.total_ingresos, selectedMoneda)}</div>
          <div className="mt-1 text-xs text-cyan-100/60">{flujoCaja.estadisticas.total_cxc_pendientes} CxC pendientes</div>
        </div>
        <div className={metricClass}>
          <div className={labelClass}>Egresos Proyectados</div>
          <div className={valueClass}>-{formatCurrency(resumenSeleccionado.total_egresos, selectedMoneda)}</div>
          <div className="mt-1 text-xs text-cyan-100/60">{flujoCaja.estadisticas.total_cxp_pendientes} CxP pendientes</div>
        </div>
        <div className={metricClass}>
          <div className={labelClass}>Saldo Proyectado</div>
          <div className={valueClass}>{formatCurrency(resumenSeleccionado.saldo_proyectado, selectedMoneda)}</div>
          <div className="mt-1 text-xs text-cyan-100/60">Flujo neto: {formatCurrency(resumenSeleccionado.flujo_neto, selectedMoneda)}</div>
        </div>
      </div>

      {hasAlert ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-border/30 bg-slate-400/10 p-4 text-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="text-sm font-bold">{resumenSeleccionado.alerta === 'SALDO_NEGATIVO' ? 'Saldo negativo proyectado' : 'Saldo bajo proyectado'}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {resumenSeleccionado.alerta === 'SALDO_NEGATIVO'
                ? 'El saldo proyectado sera negativo. Ajusta pagos o financiamiento.'
                : 'El saldo proyectado sera menor al 20% del saldo actual. Monitorea de cerca.'}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-5">
        <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-primary/80">
          {vistaDetallada ? 'Proyeccion Diaria' : 'Proyeccion Semanal'}
        </h4>

        {!vistaDetallada ? (
          <div className="grid gap-3">
            {proyeccionSemanal.map((semana, index) => {
              const isPositive = semana.flujo_neto >= 0
              const TrendIcon = isPositive ? TrendingUp : TrendingDown

              return (
                <div key={index} data-finance-week className="rounded-xl border border-cyan-400/15 bg-card/45 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <Calendar className="h-4 w-4 text-primary" />
                        Semana {semana.numero}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatDate(semana.fecha_inicio)} - {formatDate(semana.fecha_fin)}</div>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-4 xl:min-w-[680px]">
                      <span className="text-muted-foreground">Ingresos <strong className="block text-primary">{formatCurrency(semana.ingresos, selectedMoneda)}</strong></span>
                      <span className="text-muted-foreground">Egresos <strong className="block text-foreground">{formatCurrency(semana.egresos, selectedMoneda)}</strong></span>
                      <span className="text-muted-foreground">Flujo <strong className="flex items-center gap-1 text-primary"><TrendIcon className="h-4 w-4" />{formatCurrency(semana.flujo_neto, selectedMoneda)}</strong></span>
                      <span className="text-muted-foreground">Saldo final <strong className="block text-primary">{formatCurrency(semana.saldo_final, selectedMoneda)}</strong></span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-2xl border border-cyan-400/10">
            <table className={tableClass}>
              <thead className="sticky top-0 z-10">
                <tr>
                  {['Fecha', 'Saldo Inicial', 'Ingresos', 'Egresos', 'Flujo Neto', 'Saldo Final'].map((head) => (
                    <th key={head} className={`${thClass} ${head === 'Fecha' ? '' : 'text-right'}`}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cyan-400/10">
                {proyeccionFiltrada.slice(0, 30).map((dia, index) => (
                  <tr key={index} className="!bg-card/50 transition hover:!bg-card/80">
                    <td className={tdClass}>{formatDate(dia.fecha)}</td>
                    <td className={`${tdClass} text-right`}>{formatCurrency(dia.saldo_inicial, selectedMoneda)}</td>
                    <td className={`${tdClass} text-right font-semibold text-primary`}>+{formatCurrency(dia.ingresos, selectedMoneda)}</td>
                    <td className={`${tdClass} text-right font-semibold text-foreground/90`}>-{formatCurrency(dia.egresos, selectedMoneda)}</td>
                    <td className={`${tdClass} text-right font-semibold text-primary`}>{dia.flujo_neto >= 0 ? '+' : ''}{formatCurrency(dia.flujo_neto, selectedMoneda)}</td>
                    <td className={`${tdClass} text-right font-bold text-primary`}>{formatCurrency(dia.saldo_final, selectedMoneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {proyeccionFiltrada.length > 30 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Mostrando primeros 30 dias de {proyeccionFiltrada.length} dias proyectados.</div>
            ) : null}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-cyan-400/15 bg-card/45 p-4">
        <h4 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-primary/80">Estadisticas de Proyeccion</h4>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Total Movimientos" value={flujoCaja.estadisticas.total_movimientos} />
          <Stat label="CxC Pendientes" value={flujoCaja.estadisticas.total_cxc_pendientes} />
          <Stat label="CxP Pendientes" value={flujoCaja.estadisticas.total_cxp_pendientes} />
          <Stat label="Cuentas Bancarias" value={flujoCaja.cuentas_bancarias.length} />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  )
}
