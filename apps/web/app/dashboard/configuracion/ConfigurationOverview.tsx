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
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCountryContext } from '@/hooks/use-country-context'
import { parseDateLocal } from '@/lib/date-utils'

interface ConfigurationStatus {
  isComplete: boolean
  isDemo?: boolean
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
  fiscal?: {
    isEnabled: boolean
    isReady: boolean
    missingItems?: string[]
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
  monedaDefecto?: string
  arcaActivo?: boolean
  arcaEnvironment?: string
  arcaWsaaUrl?: string
  arcaWsfeUrl?: string
  arcaCuitRepresentada?: string
  arcaPuntoVenta?: number
  arcaCondicionIva?: string
  ingresosBrutos?: string
  dianActivo?: boolean
  dianEnvironment?: string
  dianSoftwareId?: string
  dianTestSetId?: string
  dianResolucionNumero?: string
  dianResolucionPrefijo?: string
  dianRegimenFiscal?: string
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
  rrhh: any | null
}

type Section = 'resumen' | 'empresa' | 'ventas' | 'rrhh'

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
  const country = useCountryContext()
  const isArgentina = country.paisCodigo === 'AR'
  const isColombia = country.paisCodigo === 'CO'
  const isPeru = country.paisCodigo === 'PE'
  const documentoFiscal = country.documentoFiscal || 'RUC'
  const autoridadFiscal = country.servicioFiscal || 'SUNAT'
  const { get, post } = useApi({ showErrorToast: false, retries: 1, timeoutMs: 20000 })
  const [data, setData] = useState<LoadState>({ status: null, empresa: null, ose: null, rrhh: null })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dianTestResult, setDianTestResult] = useState<string | null>(null)
  const [testingDian, setTestingDian] = useState(false)

  const testDian = useCallback(async () => {
    setTestingDian(true)
    setDianTestResult(null)
    try {
      const response = await post('/configuration/colombia/dian/test', {})
      const result = response?.data?.data ?? response?.data ?? response
      setDianTestResult(result?.message || (result?.ready ? 'Configuración DIAN preparada.' : 'DIAN requiere completar datos.'))
    } catch (err) {
      setDianTestResult(err instanceof Error ? err.message : 'No se pudo probar DIAN.')
    } finally {
      setTestingDian(false)
    }
  }, [post])

  const loadConfiguration = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      const [statusResponse, empresaResponse, authorityResponse, rrhhResponse] = await Promise.all([
        get('/configuration/status'),
        get('/configuration/empresa'),
        !isPeru
          ? Promise.resolve({ success: true, data: null })
          : get('/configuracion/ose'),
        get('/rrhh/configuracion-laboral'),
      ])

      if (!statusResponse?.success) {
        throw new Error(statusResponse?.message || 'No se pudo leer el estado de configuración')
      }

      if (!empresaResponse?.success) {
        throw new Error(empresaResponse?.message || 'No se pudo leer la configuración de empresa')
      }

      if (!authorityResponse?.success) {
        throw new Error(authorityResponse?.message || `No se pudo leer la configuración ${autoridadFiscal}`)
      }

      setData({
        status: statusResponse.data,
        empresa: empresaResponse.data,
        ose: authorityResponse.data,
        rrhh: rrhhResponse?.success ? rrhhResponse.data : null,
      })
    } catch (err) {
      console.error('[Configuracion] Error cargando configuración operativa:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido cargando configuración')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [autoridadFiscal, get, isPeru])

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
      certificate:
        status?.certificate?.isValid === true &&
        (status?.isDemo === true || status?.certificate?.exists === true),
      ose: isArgentina
        ? status?.isDemo === true ||
          (empresa?.arcaActivo === true &&
            !!empresa?.arcaWsaaUrl &&
            !!empresa?.arcaWsfeUrl &&
            !!empresa?.arcaCuitRepresentada &&
            !!empresa?.arcaPuntoVenta)
        : isColombia
          ? status?.isDemo === true ||
            (empresa?.dianActivo === true &&
              !!empresa?.dianSoftwareId &&
              !!empresa?.dianResolucionNumero &&
              !!empresa?.dianResolucionPrefijo)
          : ose?.verificacion?.valid === true && ose?.configuracion?.certificateExists === true,
      fiscal: status?.fiscal?.isReady === true,
      sales: isArgentina
        ? !!empresa?.arcaPuntoVenta && !!empresa?.arcaCondicionIva
        : isColombia
          ? !!empresa?.dianResolucionPrefijo && !!empresa?.dianResolucionNumero
          : !!empresa?.serieFactura && !!empresa?.serieBoleta,
      logistics: !isPeru || !logisticsEnabled || !!empresa?.serieGuiaRemision,
      labor: isArgentina || isColombia ? data.rrhh?.readiness?.ready === true : true,
    }
  }, [data, isArgentina, isColombia, isPeru])

  const certificado = data?.status?.certificate
  const certificadoAjeno = certificado?.exists === true && certificado?.rucMatches === false
  const estadoCertificado = data?.status?.isDemo === true
    ? {
        titulo: 'Simulado en demo',
        detalle: `La demo no transmite a ${autoridadFiscal}; una empresa real debe cargar su certificado del ${documentoFiscal}.`,
      }
    : certificadoAjeno
    ? { titulo: 'No corresponde', detalle: certificado?.motivoTitularidad }
    : checks.certificate
      ? { titulo: 'Válido', detalle: null as string | null }
      : {
          titulo: 'Pendiente',
          detalle: `Súbelo emitido a nombre del ${documentoFiscal} con el que vas a facturar.`,
        }

  const operationalChecks = [checks.ruc, checks.sales, checks.logistics, checks.labor]
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
            El ERP operativo se evalúa separado de la emisión fiscal, que usa exclusivamente los datos del cliente.
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
          ['rrhh', '/dashboard/configuracion/rrhh', 'RRHH'],
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
            <p>Preparación del ERP</p>
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
            <h3>{status?.fiscal?.isReady ? 'Listo' : status?.fiscal?.isEnabled ? 'Revisar' : 'Opcional'}</h3>
            <p>{autoridadFiscal}{isArgentina ? ' WSAA/WSFE' : isColombia ? ' UBL/CUFE' : '/OSE'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-stretch gap-4">
        {!hidden('empresa') && (
          <SectionCard title="Empresa" icon={Building2} ok={checks.ruc}>
            <FieldRow label={documentoFiscal} value={empresa?.ruc} ok={!!empresa?.ruc} />
            <FieldRow label="Razón social" value={empresa?.razonSocial} ok={!!empresa?.razonSocial} />
            <FieldRow label="Nombre comercial" value={empresa?.nombreComercial} />
            <FieldRow label="Dirección fiscal" value={empresa?.direccion} ok={!!empresa?.direccion} />
            <FieldRow
              label={isArgentina ? 'Provincia fiscal' : isColombia ? 'Código postal' : 'Ubigeo'}
              value={isArgentina ? (empresa as any)?.provinciaFiscal : empresa?.ubigeo}
            />
            <FieldRow label="Correo" value={empresa?.email} />
            <Link className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/dashboard/configuracion/sucursales">
              Establecimientos anexos
            </Link>
          </SectionCard>
        )}

        {!hidden('empresa') && (
          <SectionCard title="Fiscal y certificado" icon={ShieldCheck} ok={checks.certificate && checks.ose}>
            <FieldRow label="Certificado existe" value={status?.certificate?.exists} ok={status?.certificate?.exists === true} />
            <FieldRow label="Certificado válido" value={status?.certificate?.isValid} ok={status?.certificate?.isValid === true} />
            <FieldRow
              label="Vencimiento"
              value={
                status?.certificate?.expiresAt
                  ? parseDateLocal(status.certificate.expiresAt).toLocaleDateString(country.locale || 'es-PE')
                  : status?.isDemo
                    ? 'No aplica en demo'
                    : null
              }
              ok={status?.certificate?.isValid === true}
            />
            <FieldRow
              label={`Emitido al ${documentoFiscal} que factura`}
              value={certificado?.rucsEnCertificado?.length ? certificado.rucsEnCertificado.join(', ') : null}
              ok={certificado?.rucMatches === true}
            />
            <p className="mt-auto pt-3 text-xs leading-snug text-muted-foreground">
              {autoridadFiscal} exige que el certificado corresponda al {documentoFiscal} emisor.
              Debe estar a nombre de la empresa o representación autorizada.
            </p>
            {isArgentina ? (
              <>
                <FieldRow label="ARCA activo" value={empresa?.arcaActivo} ok={empresa?.arcaActivo === true} />
                <FieldRow label="CUIT representada" value={empresa?.arcaCuitRepresentada} ok={!!empresa?.arcaCuitRepresentada} />
                <FieldRow label="Punto de venta" value={empresa?.arcaPuntoVenta} ok={!!empresa?.arcaPuntoVenta} />
                <FieldRow label="Condición IVA" value={empresa?.arcaCondicionIva} ok={!!empresa?.arcaCondicionIva} />
                <FieldRow label="Ambiente" value={empresa?.arcaEnvironment} />
              </>
            ) : isColombia ? (
              <>
                <FieldRow
                  label="DIAN activo"
                  value={status?.isDemo === true ? 'Simulado, sin transmisión' : empresa?.dianActivo}
                  ok={empresa?.dianActivo === true || status?.isDemo === true}
                />
                <FieldRow label="Software ID" value={empresa?.dianSoftwareId} ok={!!empresa?.dianSoftwareId} />
                <FieldRow label="Test Set ID" value={empresa?.dianTestSetId} ok={!!empresa?.dianTestSetId} />
                <FieldRow label="Resolución DIAN" value={empresa?.dianResolucionNumero} ok={!!empresa?.dianResolucionNumero} />
                <FieldRow label="Prefijo autorizado" value={empresa?.dianResolucionPrefijo} ok={!!empresa?.dianResolucionPrefijo} />
                <FieldRow label="Ambiente" value={empresa?.dianEnvironment} />
                <button
                  type="button"
                  onClick={testDian}
                  disabled={testingDian}
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
                >
                  {testingDian ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
                  Probar conexión DIAN
                </button>
                {dianTestResult && <p className="mt-2 text-xs text-muted-foreground">{dianTestResult}</p>}
              </>
            ) : (
              <>
                <FieldRow label="OSE/SUNAT válido" value={ose?.verificacion?.valid} ok={ose?.verificacion?.valid === true} />
                <FieldRow label="Certificado OSE resuelto" value={ose?.configuracion?.certificateExists} ok={ose?.configuracion?.certificateExists === true} />
                <FieldRow label="Ambiente" value={ose?.configuracion?.environment} />
              </>
            )}
          </SectionCard>
        )}

        {!hidden('ventas') && (
          <SectionCard title="Ventas y documentos" icon={FileText} ok={checks.sales}>
            <FieldRow label="Modo emisión CPE" value={empresa?.emisionCpeModo} ok={!!empresa?.emisionCpeModo} />
            <FieldRow label="Serie factura" value={empresa?.serieFactura} ok={!!empresa?.serieFactura} />
            <FieldRow
              label={isColombia ? 'Serie documento equivalente' : 'Serie boleta'}
              value={empresa?.serieBoleta}
              ok={!!empresa?.serieBoleta}
            />
            <FieldRow label="Serie nota crédito" value={empresa?.serieNotaCredito} ok={!!empresa?.serieNotaCredito} />
            <FieldRow label="Serie nota débito" value={empresa?.serieNotaDebito} />
          </SectionCard>
        )}

        {!hidden('rrhh') && (
          <SectionCard title={`RRHH ${country.paisNombre || ''}`} icon={Users} ok={checks.labor}>
            <FieldRow
              label="Moneda de planilla"
              value={country.moneda}
              ok={isArgentina ? country.moneda === 'ARS' : isColombia ? country.moneda === 'COP' : country.moneda === 'PEN'}
            />
            <FieldRow label="Documento laboral" value={isArgentina ? 'CUIL' : isColombia ? 'CC' : 'DNI'} />
            {isArgentina ? (
              <>
                <FieldRow label="Convenio colectivo" value={data.rrhh?.configuracion?.convenio_colectivo_codigo} ok={!!data.rrhh?.configuracion?.convenio_colectivo_codigo} />
                <FieldRow label="ART configurada" value={data.rrhh?.configuracion?.art_razon_social} ok={Number(data.rrhh?.configuracion?.art_tasa || 0) > 0} />
                <FieldRow label="Libro de Sueldos Digital" value={data.rrhh?.configuracion?.libro_sueldos_digital_habilitado} ok={data.rrhh?.configuracion?.libro_sueldos_digital_habilitado === true} />
                <FieldRow label="Formulario 931" value={data.rrhh?.configuracion?.formulario_931_habilitado} ok={data.rrhh?.configuracion?.formulario_931_habilitado === true} />
                <FieldRow label="Configuración confirmada" value={data.rrhh?.configuracion?.configuracion_confirmada} ok={checks.labor} />
                <Link className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/dashboard/configuracion/rrhh">
                  Configurar RRHH Argentina
                </Link>
              </>
            ) : isColombia ? (
              <>
                <FieldRow label="Operador PILA" value={data.rrhh?.configuracion?.operador_pila} ok={!!data.rrhh?.configuracion?.operador_pila} />
                <FieldRow label="EPS" value={data.rrhh?.configuracion?.eps_default} ok={!!data.rrhh?.configuracion?.eps_default} />
                <FieldRow label="Fondo de pensión" value={data.rrhh?.configuracion?.fondo_pension_default} ok={!!data.rrhh?.configuracion?.fondo_pension_default} />
                <FieldRow label="ARL" value={data.rrhh?.configuracion?.arl_default} ok={Number(data.rrhh?.configuracion?.arl_tasa || 0) > 0} />
                <FieldRow label="Caja de compensación" value={data.rrhh?.configuracion?.caja_compensacion_default} ok={!!data.rrhh?.configuracion?.caja_compensacion_default} />
                <FieldRow label="Nómina electrónica" value={data.rrhh?.configuracion?.nomina_electronica_habilitada} ok={data.rrhh?.configuracion?.nomina_electronica_habilitada === true} />
                <Link className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/dashboard/configuracion/rrhh">
                  Configurar RRHH Colombia
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                AFP/ONP, EsSalud, gratificaciones, quinta categoría y CTS permanecen configurados para Perú.
              </p>
            )}
          </SectionCard>
        )}

        {!hidden('ventas') && (
          <SectionCard title={isPeru ? 'Logística y GRE' : 'Logística y remisiones'} icon={Truck} ok={checks.logistics}>
            <FieldRow label="Flujo logístico" value={empresa?.usar_flujo_logistica} />
            {!isPeru ? (
              <>
                <FieldRow label="Documento de traslado" value={isArgentina ? 'Remito' : 'Remisión / transporte'} ok />
                <FieldRow label="Moneda logística" value={country.moneda} ok />
              </>
            ) : (
              <>
                <FieldRow label="GRE obligatorio" value={empresa?.gre_obligatorio} />
                <FieldRow label="GRE automático" value={empresa?.gre_automatico_habilitado} />
                <FieldRow label="Umbral GRE automático" value={empresa?.umbral_gre_automatico} />
                <FieldRow label="Serie guía remisión" value={empresa?.serieGuiaRemision} ok={!!empresa?.serieGuiaRemision} />
              </>
            )}
          </SectionCard>
        )}
      </div>

        {!status?.isDemo && !!status?.missingItems?.length && (
        <div className="relative mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <h2 className="m-0 mb-2 text-base font-semibold text-primary">Pendientes detectados por backend</h2>
          <ul className="m-0 list-disc pl-5 text-foreground/85">
            {status.missingItems.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
        )}
        {!status?.isDemo && !!status?.fiscal?.missingItems?.length && (
          <div className="relative mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-card-foreground shadow-sm">
            <h2 className="m-0 mb-2 text-base font-semibold text-foreground">Emisión fiscal (opcional)</h2>
            <p className="mb-2 text-sm text-muted-foreground">
              Estos datos no bloquean el ERP. Son necesarios únicamente cuando la empresa decida transmitir electrónicamente.
            </p>
            <ul className="m-0 list-disc pl-5 text-foreground/85">
              {status.fiscal.missingItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
    </div>
  )
}
