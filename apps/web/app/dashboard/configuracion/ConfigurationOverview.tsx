'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  FileText,
  RefreshCw,
  Settings,
  ShieldCheck,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { cn } from '@/lib/utils'

interface ConfigurationStatus {
  isComplete: boolean
  completionPercentage: number
  missingItems?: string[]
  certificate?: {
    exists: boolean
    isValid: boolean
    expiresAt?: string
    daysUntilExpiration?: number
  }
  ruc?: {
    isConfigured: boolean
    missingFields?: string[]
  }
}

interface EmpresaConfig {
  ruc?: string
  razonSocial?: string
  nombreComercial?: string
  direccion?: string
  pais?: string
  ubigeo?: string
  departamento?: string
  provincia?: string
  distrito?: string
  telefono?: string
  email?: string
  regimen?: string
  tipo_empresa?: string
  usar_flujo_logistica?: boolean
  gre_obligatorio?: boolean
  gre_automatico_habilitado?: boolean
  umbral_gre_automatico?: number
  emisionCpeModo?: string
  oseActivo?: boolean
  oseUrl?: string
  oseStatusUrl?: string
  oseAuthTipo?: string
  serieFactura?: string
  serieBoleta?: string
  serieNotaCredito?: string
  serieNotaDebito?: string
  serieGuiaRemision?: string
}

interface OseStatus {
  configuracion?: {
    environment?: string
    url?: string
    ruc?: string
    certificateExists?: boolean
    usernameConfigured?: boolean
    passwordConfigured?: boolean
    requireRealCertificate?: boolean
  }
  verificacion?: {
    valid: boolean
    errors?: string[]
  }
  message?: string
}

interface LoadState {
  status: ConfigurationStatus | null
  empresa: EmpresaConfig | null
  ose: OseStatus | null
}

type Section = 'resumen' | 'empresa' | 'ventas'

const statusLabel = (ok: boolean) => (ok ? 'Correcto' : 'Requiere atención')

function StatusPill({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold',
        ok ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700',
      )}
    >
      {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {statusLabel(ok)}
    </span>
  )
}

function FieldRow({ label, value, ok = true }: { label: string; value?: string | number | boolean | null; ok?: boolean }) {
  const displayValue = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : value
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={cn('text-right text-sm font-semibold', ok ? 'text-slate-950' : 'text-blue-800')}>
        {displayValue === undefined || displayValue === null || displayValue === '' ? 'No configurado' : String(displayValue)}
      </span>
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
  ok,
}: {
  title: string
  icon: LucideIcon
  children: React.ReactNode
  ok: boolean
}) {
  return (
    <section className="activity-card p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-slate-950">
          <Icon className="h-[18px] w-[18px]" />
          {title}
        </h2>
        <StatusPill ok={ok} />
      </div>
      {children}
    </section>
  )
}

export default function ConfigurationOverview({ section = 'resumen' }: { section?: Section }) {
  const { get } = useApi({ showErrorToast: false, retries: 1, timeoutMs: 20000 })
  const [data, setData] = useState<LoadState>({ status: null, empresa: null, ose: null })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadConfiguration = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const [statusResponse, empresaResponse, oseResponse] = await Promise.all([
        get('/configuration/status'),
        get('/configuration/empresa'),
        get('/configuracion/ose'),
      ])

      if (!statusResponse?.success) {
        throw new Error(statusResponse?.message || 'No se pudo leer el estado de configuración')
      }

      if (!empresaResponse?.success) {
        throw new Error(empresaResponse?.message || 'No se pudo leer la configuración de empresa')
      }

      if (!oseResponse?.success) {
        throw new Error(oseResponse?.message || 'No se pudo leer la configuración OSE/SUNAT')
      }

      setData({
        status: statusResponse.data,
        empresa: empresaResponse.data,
        ose: oseResponse.data,
      })
    } catch (err) {
      console.error('[Configuracion] Error cargando configuración operativa:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido cargando configuración')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [get])

  useEffect(() => {
    loadConfiguration()
  }, [loadConfiguration])

  const checks = useMemo(() => {
    const status = data.status
    const empresa = data.empresa
    const ose = data.ose

    return {
      complete: status?.isComplete === true,
      ruc: status?.ruc?.isConfigured === true && !!empresa?.ruc,
      certificate: status?.certificate?.exists === true && status?.certificate?.isValid === true,
      ose: ose?.verificacion?.valid === true && ose?.configuracion?.certificateExists === true,
      fiscal: !!empresa?.regimen && empresa?.emisionCpeModo !== '',
      sales: !!empresa?.serieFactura && !!empresa?.serieBoleta,
      logistics: empresa?.usar_flujo_logistica === true || empresa?.gre_obligatorio === true || empresa?.gre_automatico_habilitado === true,
    }
  }, [data])

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="activity-card p-12 text-center">
          <div className="loading-spinner mx-auto mb-4" />
          <p className="m-0 text-slate-600">Cargando configuración operativa...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="activity-card border-slate-300 p-8">
          <div className="mb-3 flex items-center gap-3 text-slate-700">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="dashboard-title m-0">Configuración no disponible</h1>
          </div>
          <p className="dashboard-subtitle">{error}</p>
          <button className="refresh-btn" onClick={() => loadConfiguration(true)} disabled={refreshing}>
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const { status, empresa, ose } = data
  const hidden = (name: Section) => section !== 'resumen' && section !== name

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Configuración operativa</h1>
          <p className="dashboard-subtitle">
            Estado real de empresa, certificado, emisión fiscal, ventas y logística.
          </p>
        </div>
        <button className="refresh-btn" onClick={() => loadConfiguration(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link className="refresh-btn" href="/dashboard/configuracion">Resumen</Link>
        <Link className="refresh-btn" href="/dashboard/configuracion/empresa">Empresa</Link>
        <Link className="refresh-btn" href="/dashboard/configuracion/ventas">Ventas</Link>
        <Link className="refresh-btn" href="/dashboard/wizard">Editar en asistente</Link>
      </div>

      <div className="stats-grid mb-5">
        <div className="stat-card">
          <div className={cn('stat-icon', checks.complete ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700')}>
            {checks.complete ? <CheckCircle className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div className="stat-content">
            <h3>{status?.completionPercentage ?? 0}%</h3>
            <p>Configuración total</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={cn('stat-icon', checks.certificate ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700')}>
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="stat-content">
            <h3>{checks.certificate ? 'Válido' : 'Pendiente'}</h3>
            <p>Certificado digital</p>
          </div>
        </div>
        <div className="stat-card">
          <div className={cn('stat-icon', checks.ose ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700')}>
            <Settings className="h-6 w-6" />
          </div>
          <div className="stat-content">
            <h3>{checks.ose ? 'Operativo' : 'Revisar'}</h3>
            <p>SUNAT/OSE</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
        {!hidden('empresa') && (
          <SectionCard title="Empresa" icon={Building2} ok={checks.ruc}>
            <FieldRow label="RUC" value={empresa?.ruc} ok={!!empresa?.ruc} />
            <FieldRow label="Razón social" value={empresa?.razonSocial} ok={!!empresa?.razonSocial} />
            <FieldRow label="Nombre comercial" value={empresa?.nombreComercial} />
            <FieldRow label="Dirección fiscal" value={empresa?.direccion} ok={!!empresa?.direccion} />
            <FieldRow label="Ubigeo" value={empresa?.ubigeo} />
            <FieldRow label="Correo" value={empresa?.email} />
          </SectionCard>
        )}

        {!hidden('empresa') && (
          <SectionCard title="Fiscal y certificado" icon={ShieldCheck} ok={checks.certificate && checks.ose}>
            <FieldRow label="Certificado existe" value={status?.certificate?.exists} ok={status?.certificate?.exists === true} />
            <FieldRow label="Certificado válido" value={status?.certificate?.isValid} ok={status?.certificate?.isValid === true} />
            <FieldRow label="Vencimiento" value={status?.certificate?.expiresAt ? new Date(status.certificate.expiresAt).toLocaleDateString('es-PE') : null} ok={status?.certificate?.isValid === true} />
            <FieldRow label="OSE/SUNAT válido" value={ose?.verificacion?.valid} ok={ose?.verificacion?.valid === true} />
            <FieldRow label="Certificado OSE resuelto" value={ose?.configuracion?.certificateExists} ok={ose?.configuracion?.certificateExists === true} />
            <FieldRow label="Ambiente" value={ose?.configuracion?.environment} />
          </SectionCard>
        )}

        {!hidden('ventas') && (
          <SectionCard title="Ventas y documentos" icon={FileText} ok={checks.sales}>
            <FieldRow label="Modo emisión CPE" value={empresa?.emisionCpeModo} ok={!!empresa?.emisionCpeModo} />
            <FieldRow label="Serie factura" value={empresa?.serieFactura} ok={!!empresa?.serieFactura} />
            <FieldRow label="Serie boleta" value={empresa?.serieBoleta} ok={!!empresa?.serieBoleta} />
            <FieldRow label="Serie nota crédito" value={empresa?.serieNotaCredito} ok={!!empresa?.serieNotaCredito} />
            <FieldRow label="Serie nota débito" value={empresa?.serieNotaDebito} />
          </SectionCard>
        )}

        {!hidden('ventas') && (
          <SectionCard title="Logística y GRE" icon={Truck} ok={checks.logistics}>
            <FieldRow label="Flujo logístico" value={empresa?.usar_flujo_logistica} />
            <FieldRow label="GRE obligatorio" value={empresa?.gre_obligatorio} />
            <FieldRow label="GRE automático" value={empresa?.gre_automatico_habilitado} />
            <FieldRow label="Umbral GRE automático" value={empresa?.umbral_gre_automatico} />
            <FieldRow label="Serie guía remisión" value={empresa?.serieGuiaRemision} ok={!!empresa?.serieGuiaRemision} />
          </SectionCard>
        )}
      </div>

      {!!status?.missingItems?.length && (
        <div className="activity-card mt-4 border-blue-200 bg-blue-50 p-4">
          <h2 className="m-0 mb-2 text-base text-blue-900">Pendientes detectados por backend</h2>
          <ul className="m-0 list-disc pl-5 text-blue-900">
            {status.missingItems.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
