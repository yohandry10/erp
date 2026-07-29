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
import { Skeleton } from '@/components/ui/skeleton'
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
    /** true solo si el certificado pertenece al RUC con el que se emite. */
    rucMatches?: boolean
    rucsEnCertificado?: string[]
    motivoTitularidad?: string
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
        ok ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground/85',
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
    <div className="flex justify-between gap-4 border-b border-border py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-right text-sm font-semibold', ok ? 'text-foreground' : 'text-primary')}>
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
    <section className="relative flex h-full flex-col rounded-2xl border border-border bg-card/95 text-card-foreground shadow-md backdrop-blur-xl p-5">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
          <Icon className="h-[18px] w-[18px]" />
          {title}
        </h2>
        <StatusPill ok={ok} />
      </div>
      <div className="flex flex-1 flex-col justify-between gap-1">{children}</div>
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
    const logisticsEnabled =
      empresa?.usar_flujo_logistica === true ||
      empresa?.gre_obligatorio === true ||
      empresa?.gre_automatico_habilitado === true

    return {
      complete: status?.isComplete === true,
      ruc: status?.ruc?.isConfigured === true && !!empresa?.ruc,
      certificate: status?.certificate?.exists === true && status?.certificate?.isValid === true,
      ose: ose?.verificacion?.valid === true && ose?.configuracion?.certificateExists === true,
      fiscal: !!empresa?.regimen && empresa?.emisionCpeModo !== '',
      sales: !!empresa?.serieFactura && !!empresa?.serieBoleta,
      logistics: !logisticsEnabled || !!empresa?.serieGuiaRemision,
    }
  }, [data])

  const certificado = data?.status?.certificate
  const certificadoAjeno = certificado?.exists === true && certificado?.rucMatches === false
  const estadoCertificado = certificadoAjeno
    ? { titulo: 'No corresponde', detalle: certificado?.motivoTitularidad }
    : checks.certificate
      ? { titulo: 'Válido', detalle: null as string | null }
      : {
          titulo: 'Pendiente',
          detalle: 'Súbelo emitido a nombre del RUC con el que vas a facturar.',
        }

  const operationalChecks = [
    checks.ruc,
    checks.certificate,
    checks.ose,
    checks.fiscal,
    checks.sales,
    checks.logistics,
  ]
  const operationalReadiness = Math.round(
    (operationalChecks.filter(Boolean).length / operationalChecks.length) * 100,
  )
  const isOperationallyReady = operationalChecks.every(Boolean)

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 text-foreground md:p-6" aria-busy="true">
        <span className="sr-only" aria-live="polite">Cargando configuración operativa</span>
        <div className="rounded-2xl border border-border bg-card/95 p-6 shadow-lg md:p-8">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="mt-3 h-5 w-[34rem] max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map(item => <Skeleton key={item} className="h-36 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {[0, 1, 2].map(item => <Skeleton key={item} className="h-72 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl border-border p-8">
          <div className="mb-3 flex items-center gap-3 text-foreground/85">
            <AlertTriangle className="h-6 w-6" />
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground m-0">Configuración no disponible</h1>
          </div>
          <p className="mt-2 text-base text-muted-foreground">{error}</p>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={() => loadConfiguration(true)} disabled={refreshing}>
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
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Configuración operativa</h1>
          <p className="mt-2 text-base text-muted-foreground">
            Estado real de empresa, certificado, emisión fiscal, ventas y logística.
          </p>
        </div>
        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50" onClick={() => loadConfiguration(true)} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Secciones de configuración">
        {([
          ['resumen', '/dashboard/configuracion', 'Resumen'],
          ['empresa', '/dashboard/configuracion/empresa', 'Empresa'],
          ['ventas', '/dashboard/configuracion/ventas', 'Ventas'],
        ] as const).map(([name, href, label]) => {
          const active = section === name
          return (
            <Link
              key={name}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-accent',
              )}
            >
              {label}
            </Link>
          )
        })}
        <Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent" href="/dashboard/wizard">Editar en asistente</Link>
      </nav>

      <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-stretch gap-5 mb-5">
        <div className="relative flex h-full min-h-36 flex-col overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className={cn('inline-flex size-11 items-center justify-center rounded-xl', isOperationallyReady ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
            {isOperationallyReady ? <CheckCircle className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div className="stat-content">
            <h3>{operationalReadiness}%</h3>
            <p>Preparación operativa</p>
          </div>
        </div>
        <div className="relative flex h-full min-h-36 flex-col overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className={cn('inline-flex size-11 items-center justify-center rounded-xl', checks.certificate ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="stat-content">
            <h3>{estadoCertificado.titulo}</h3>
            <p>Certificado digital</p>
            {estadoCertificado.detalle && (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                {estadoCertificado.detalle}
              </p>
            )}
          </div>
        </div>
        <div className="relative flex h-full min-h-36 flex-col overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-ring/50 hover:shadow-lg">
          <div className={cn('inline-flex size-11 items-center justify-center rounded-xl', checks.ose ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
            <Settings className="h-6 w-6" />
          </div>
          <div className="stat-content">
            <h3>{checks.ose ? 'Operativo' : 'Revisar'}</h3>
            <p>SUNAT/OSE</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-stretch gap-4">
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
            <FieldRow
              label="Emitido al RUC que factura"
              value={certificado?.rucsEnCertificado?.length ? certificado.rucsEnCertificado.join(', ') : null}
              ok={certificado?.rucMatches === true}
            />
            <p className="mt-auto pt-3 text-xs leading-snug text-muted-foreground">
              SUNAT rechaza los comprobantes firmados con un certificado que no
              pertenece al RUC emisor. Debe estar a nombre de la empresa.
            </p>
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
        <div className="relative mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <h2 className="m-0 mb-2 text-base font-semibold text-primary">Pendientes detectados por backend</h2>
          <ul className="m-0 list-disc pl-5 text-foreground/85">
            {status.missingItems.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
