'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck,
  RefreshCw,
  Upload,
} from 'lucide-react'

interface WizardStep {
  id: number
  title: string
  description: string
  status: 'pending' | 'current' | 'completed'
}

interface ConciliacionWizardProps {
  conciliacionId: string
  conciliacion: any
  onComplete: () => void
}

const panelClass = 'overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/70 text-slate-100 shadow-xl shadow-blue-950/20'
const stepPanelClass = 'p-6 text-center md:p-8'
const metricClass = 'rounded-xl border border-cyan-400/15 bg-slate-950/45 p-5'
const metricLabelClass = 'text-sm font-semibold text-cyan-200/70'
const metricValueClass = 'mt-2 text-2xl font-black text-white'
const primaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
const outlineButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-45'

function StepIntro({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Upload
  title: string
  description: string
}) {
  return (
    <div className="mb-6 text-center">
      <Icon className="mx-auto mb-4 h-14 w-14 text-cyan-200" />
      <h3 className="text-2xl font-black text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">{description}</p>
    </div>
  )
}

function StatCard({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
  return (
    <div className={metricClass}>
      <div className={metricLabelClass}>{label}</div>
      <div className={metricValueClass}>{value}</div>
      {helper ? <div className="mt-2 text-sm text-cyan-100/60">{helper}</div> : null}
    </div>
  )
}

export default function ConciliacionWizard({
  conciliacionId,
  conciliacion,
  onComplete,
}: ConciliacionWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [extractoImportado] = useState(false)
  const [matchAutomaticoEjecutado, setMatchAutomaticoEjecutado] = useState(false)
  const [estadisticas, setEstadisticas] = useState<any>(null)

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

  const steps: WizardStep[] = [
    { id: 1, title: 'Importar Extracto', description: 'Sube el archivo CSV del banco', status: currentStep > 1 ? 'completed' : currentStep === 1 ? 'current' : 'pending' },
    { id: 2, title: 'Match Automatico', description: 'Ejecuta la conciliacion automatica', status: currentStep > 2 ? 'completed' : currentStep === 2 ? 'current' : 'pending' },
    { id: 3, title: 'Ajustes Manuales', description: 'Revisa y ajusta los matches', status: currentStep > 3 ? 'completed' : currentStep === 3 ? 'current' : 'pending' },
    { id: 4, title: 'Revisar Diferencias', description: 'Verifica el resultado final', status: currentStep > 4 ? 'completed' : currentStep === 4 ? 'current' : 'pending' },
    { id: 5, title: 'Cerrar Conciliacion', description: 'Finaliza el proceso', status: currentStep === 5 ? 'current' : 'pending' },
  ]

  const loadEstadisticas = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/diferencias`,
        {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
      )
      if (response.ok) {
        const data = await response.json()
        setEstadisticas(data.data)
      }
    } catch (error) {
      console.error('Error loading estadisticas:', error)
    }
  }, [API_BASE_URL, conciliacionId])

  useEffect(() => {
    loadEstadisticas()
  }, [loadEstadisticas])

  const handleMatchAutomatico = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/finanzas/conciliacion/${conciliacionId}/match-automatico`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        },
      )

      if (response.ok) {
        setMatchAutomaticoEjecutado(true)
        await loadEstadisticas()
        alert('Match automatico ejecutado exitosamente')
      } else {
        const error = await response.json()
        alert('Error: ' + (error.message || 'No se pudo ejecutar el match automatico'))
      }
    } catch (error) {
      console.error('Error executing match automatico:', error)
      alert('Error: No se pudo ejecutar el match automatico')
    } finally {
      setLoading(false)
    }
  }

  const handleNextStep = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1)
  }

  const handlePrevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: conciliacion?.cuentas_bancarias?.moneda || 'PEN',
    }).format(amount)

  const pendingSystem = estadisticas?.movimientos_sistema?.pendientes || 0
  const pendingBank = estadisticas?.movimientos_extracto?.pendientes || 0
  const netDifference = estadisticas?.saldos?.diferencia_neta || 0
  const isBalanced = Math.abs(netDifference) < 0.01

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className={stepPanelClass}>
            <StepIntro icon={Upload} title="Importar Extracto Bancario" description="Sube el archivo CSV del extracto bancario para comenzar la conciliacion." />
            <button type="button" onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacionId}`)} className={primaryButtonClass}>
              Ir a Importar CSV
            </button>
            {extractoImportado ? <div className="mx-auto mt-6 max-w-md rounded-xl border border-cyan-300/30 bg-cyan-300/10 p-4 text-cyan-100">Extracto importado correctamente</div> : null}
          </div>
        )

      case 2:
        return (
          <div className="p-6 md:p-8">
            <StepIntro icon={RefreshCw} title="Match Automatico" description="El sistema intentara conciliar automaticamente los movimientos por monto y fecha." />
            {estadisticas ? (
              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <StatCard label="Movimientos Sistema" value={estadisticas.movimientos_sistema.total} helper={`${estadisticas.movimientos_sistema.conciliados} conciliados`} />
                <StatCard label="Movimientos Extracto" value={estadisticas.movimientos_extracto.total} helper={`${estadisticas.movimientos_extracto.conciliados} conciliados`} />
              </div>
            ) : null}
            <div className="text-center">
              <button type="button" onClick={handleMatchAutomatico} disabled={loading || matchAutomaticoEjecutado} className={primaryButtonClass}>
                {loading ? 'Ejecutando...' : matchAutomaticoEjecutado ? 'Ejecutado' : 'Ejecutar Match Automatico'}
              </button>
            </div>
          </div>
        )

      case 3:
        return (
          <div className={stepPanelClass}>
            <StepIntro icon={Eye} title="Ajustes Manuales" description="Revisa los movimientos y realiza ajustes manuales si es necesario." />
            {estadisticas ? (
              <div className="mx-auto mb-6 max-w-lg rounded-xl border border-cyan-400/20 bg-slate-950/45 p-5 text-left">
                <div className="mb-3 font-semibold text-cyan-100">Pendientes de conciliar</div>
                <div className="flex justify-between text-sm text-slate-300"><span>Sistema</span><strong className="text-white">{pendingSystem}</strong></div>
                <div className="mt-2 flex justify-between text-sm text-slate-300"><span>Extracto</span><strong className="text-white">{pendingBank}</strong></div>
              </div>
            ) : null}
            <button type="button" onClick={() => router.push(`/dashboard/finanzas/conciliacion/${conciliacionId}`)} className={primaryButtonClass}>
              Ir a Tabla de Conciliacion
            </button>
          </div>
        )

      case 4:
        return (
          <div className="p-6 md:p-8">
            <StepIntro icon={AlertCircle} title="Revisar Diferencias" description="Verifica los saldos y diferencias antes de cerrar." />
            {estadisticas ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <StatCard label="Saldo Libro" value={formatCurrency(estadisticas.saldos.saldo_libro)} />
                  <StatCard label="Saldo Banco" value={formatCurrency(estadisticas.saldos.saldo_banco)} />
                  <StatCard label="Diferencia" value={formatCurrency(netDifference)} />
                </div>
                <div className={`rounded-xl border p-5 text-center ${isBalanced ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-slate-400/30 bg-slate-400/10 text-slate-100'}`}>
                  <div className="text-lg font-bold">{isBalanced ? 'Conciliacion cuadrada' : 'Hay diferencias'}</div>
                  <div className="mt-1 text-sm opacity-80">{isBalanced ? 'Los saldos coinciden.' : 'Revisa los movimientos pendientes antes de cerrar.'}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <StatCard label="Progreso Sistema" value={`${estadisticas.metricas.porcentaje_conciliado_sistema.toFixed(1)}%`} />
                  <StatCard label="Progreso Extracto" value={`${estadisticas.metricas.porcentaje_conciliado_extracto.toFixed(1)}%`} />
                </div>
              </div>
            ) : null}
          </div>
        )

      case 5:
        return (
          <div className={stepPanelClass}>
            <StepIntro icon={FileCheck} title="Cerrar Conciliacion" description="Finaliza el proceso de conciliacion y marca los movimientos como conciliados." />
            {estadisticas ? (
              <div className={`mx-auto mb-6 max-w-xl rounded-xl border p-5 text-left ${pendingSystem === 0 && pendingBank === 0 ? 'border-cyan-300/30 bg-cyan-300/10' : 'border-slate-400/30 bg-slate-400/10'}`}>
                <div className="mb-3 font-semibold text-white">Estado final</div>
                <div className="flex justify-between text-sm text-slate-300"><span>Sistema pendientes</span><strong className="text-white">{pendingSystem}</strong></div>
                <div className="mt-2 flex justify-between text-sm text-slate-300"><span>Extracto pendientes</span><strong className="text-white">{pendingBank}</strong></div>
                <div className="mt-3 flex justify-between border-t border-cyan-400/10 pt-3 text-sm text-slate-300"><span>Diferencia final</span><strong className="text-white">{formatCurrency(netDifference)}</strong></div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onComplete()
                router.push(`/dashboard/finanzas/conciliacion/${conciliacionId}`)
              }}
              className={primaryButtonClass}
            >
              Ir a Cerrar Conciliacion
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className={panelClass}>
      <div className="border-b border-cyan-400/10 bg-slate-950/45 p-5">
        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-5">
          {steps.map((step) => (
            <div key={step.id} className="flex flex-col items-center text-center">
              <div className={`mb-2 flex size-10 items-center justify-center rounded-full border text-sm font-bold ${step.status === 'completed' ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : step.status === 'current' ? 'border-blue-300/30 bg-blue-500/20 text-blue-100' : 'border-slate-500/30 bg-slate-900 text-slate-500'}`}>
                {step.status === 'completed' ? <CheckCircle className="h-5 w-5" /> : step.id}
              </div>
              <div className={`text-xs font-semibold uppercase tracking-[0.12em] ${step.status === 'current' ? 'text-white' : 'text-slate-400'}`}>{step.title}</div>
              <div className="mt-1 hidden text-xs text-slate-500 xl:block">{step.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-[400px]">{renderStepContent()}</div>

      <div className="flex items-center justify-between border-t border-cyan-400/10 p-5">
        <button type="button" onClick={handlePrevStep} disabled={currentStep === 1} className={outlineButtonClass}>
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <div className="text-sm font-semibold text-slate-400">Paso {currentStep} de {steps.length}</div>
        <button type="button" onClick={handleNextStep} disabled={currentStep === 5} className={outlineButtonClass}>
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
