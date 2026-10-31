'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, Clock, DollarSign, Download, FileText, History, RefreshCw, XCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useCxcRead } from '@/hooks/use-cxc-read'
import { cxcPendingBalances, loadCxcCustomers, loadCxcList, readCxcHistory } from '@/lib/finanzas/cxc-read-contract'
import type { CxcReadScope } from '@/lib/finanzas/cxc-read-contract'
import { parseDateLocal } from '@/lib/date-utils'
import { usePermission } from '@/hooks/use-permission'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import { CobroModal, HistorialDrawer, NotaCreditoModal, ReprogramarModal } from '@/components/finanzas'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCountryContext } from '@/hooks/use-country-context'
import { downloadCsv } from '@/lib/csv-export'
import { formatFiscalDocumentNumber } from '@/lib/fiscal-document-number'
import { cxcCollectionAccount, cxcCollectionPendingPrefix, readCxcCollectionIntent } from '@/lib/finanzas/cxc-collection-operation'
import type { CxcCollectionAccount, CxcCollectionIntent } from '@/lib/finanzas/cxc-collection-operation'
import { cxcAdjustmentPendingKey, cxcAdjustmentPendingPrefix, readCxcAdjustmentIntent } from '@/lib/finanzas/cxc-adjustment-operation'
import type { CxcAdjustmentIntent, CxcAdjustmentKind, CxcAdjustmentSnapshot } from '@/lib/finanzas/cxc-adjustment-operation'

type EstadoCxc = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO'

type CuentaPorCobrar = {
  id: string
  serie: string | null
  numero: string | null
  cliente_id: string
  documento_id?: string | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  estado: string | null
  total: number
  saldo: number
  moneda: string
  tipo_documento: string | null
  observaciones?: string | null
  clientes?: {
    razon_social: string
    documento_numero: string | null
  }
}

type ClienteLigero = {
  id: string
  razon_social?: string | null
  nombre_comercial?: string | null
}

const ESTADO_META: Record<EstadoCxc, { label: string; className: string; icon: typeof Clock }> = {
  PENDIENTE: {
    label: 'Pendiente',
    className: 'border-amber-300/25 bg-amber-300/10 text-amber-400 dark:text-amber-200',
    icon: Clock,
  },
  PARCIAL: {
    label: 'Parcial',
    className: 'border-blue-300/25 bg-blue-300/10 text-primary dark:text-blue-200',
    icon: AlertCircle,
  },
  CANCELADO: {
    label: 'Cancelado',
    className: 'border-cyan-300/25 bg-cyan-300/10 text-primary',
    icon: CheckCircle,
  },
  VENCIDO: {
    label: 'Vencido',
    className: 'border-border/25 bg-slate-300/10 text-foreground',
    icon: XCircle,
  },
}

const normalizeEstadoCxc = (estado: string | null | undefined): EstadoCxc | null => {
  const normalized = String(estado ?? '').trim().toUpperCase()
  return normalized in ESTADO_META ? (normalized as EstadoCxc) : null
}

const initialFilters = {
  estado: '' as '' | EstadoCxc,
  clienteId: '',
  vencimientoDesde: '',
  vencimientoHasta: '',
  search: '',
}

const inputClass =
  'w-full rounded-xl border border-cyan-400/20 bg-card/75 px-3 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-300 focus:ring-4 focus:ring-cyan-400/10'

const labelClass = 'text-xs font-semibold uppercase tracking-[0.12em] text-primary/80'

export default function CuentasPorCobrarPage() {
  const country = useCountryContext()
  const { session, loading: authLoading } = useAuth()
  const { hasPermission: canCollect, loading: collectionPermissionLoading } = usePermission('finanzas', 'write', 'cxc.cobros')
  const { hasPermission: canReadClientes, loading: clientesPermissionLoading } = usePermission('ventas', 'ver', 'clientes')

  const [filters, setFilters] = useState(initialFilters)
  useEffect(() => {
    const documento = new URLSearchParams(window.location.search).get('documento')?.trim()
    if (documento) setFilters(current => ({ ...current, search: documento.slice(0, 80) }))
  }, [])
  const params = new URLSearchParams()
  if (filters.estado) params.set('estado', filters.estado)
  if (filters.clienteId) params.set('cliente_id', filters.clienteId)
  if (filters.vencimientoDesde) params.set('desde', filters.vencimientoDesde)
  if (filters.vencimientoHasta) params.set('hasta', filters.vencimientoHasta)
  if (filters.search) params.set('search', filters.search.trim())
  const endpoint = `/api/finanzas/cxc?${params.toString()}`
  const list = useCxcRead<CuentaPorCobrar[]>(endpoint, loadCxcList)
  const cuentas = useMemo(() => list.data || [], [list.data])
  const loading = list.loading, loadError = list.error, fetchCuentas = list.reload
  const customers = useCxcRead<ClienteLigero[]>('/api/ventas/clientes?limit=1000', loadCxcCustomers, canReadClientes && !clientesPermissionLoading)
  const clientes = useMemo(() => customers.data || [], [customers.data])
  const scopeKey = `${session?.user?.tenant_id || ''}:${session?.user?.id || ''}:${endpoint}`
  const [selection, setSelection] = useState<{ scope: string; cuenta: CuentaPorCobrar } | null>(null)
  const selectedCuenta = list.data && selection?.scope === scopeKey ? selection.cuenta : null
  const setSelectedCuenta = (cuenta: CuentaPorCobrar | null) => setSelection(cuenta ? { scope: scopeKey, cuenta } : null)
  const [showCobro, setShowCobro] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const collectionScope = `${session?.user?.tenant_id || ''}:${session?.user?.id || ''}`
  const [collectionTarget, setCollectionTarget] = useState<{ scope: string; cuenta: CxcCollectionAccount; source: CuentaPorCobrar[] | null; recovery: boolean } | null>(null)
  const [pendingCollections, setPendingCollections] = useState<{ scope: string; rows: CxcCollectionIntent[]; error: string | null }>({ scope: '', rows: [], error: null })
  const currentPending = pendingCollections.scope === collectionScope ? pendingCollections.rows : []
  const pendingError = pendingCollections.scope === collectionScope ? pendingCollections.error : null
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ scope: string; kind: CxcAdjustmentKind; cuenta: CuentaPorCobrar | CxcAdjustmentSnapshot; source: CuentaPorCobrar[] | null; recovery: boolean } | null>(null)
  const activeAdjustment = adjustmentTarget?.scope === collectionScope && !authLoading && canCollect && !collectionPermissionLoading
    && (adjustmentTarget.recovery || adjustmentTarget.source === list.data) ? adjustmentTarget : null
  const [pendingAdjustments, setPendingAdjustments] = useState<{ scope: string; rows: CxcAdjustmentIntent[]; error: string | null }>({ scope: '', rows: [], error: null })
  const currentAdjustments = pendingAdjustments.scope === collectionScope ? pendingAdjustments.rows : []
  const adjustmentError = pendingAdjustments.scope === collectionScope ? pendingAdjustments.error : null
  const refreshPendingAdjustments = useCallback(() => {
    if (!session?.user?.tenant_id || !session.user.id || authLoading || collectionPermissionLoading || !canCollect) {
      setPendingAdjustments({ scope: collectionScope, rows: [], error: null }); return
    }
    const scope = { tenantId: session.user.tenant_id, actorId: session.user.id }, rows: CxcAdjustmentIntent[] = []
    let error: string | null = null
    try {
      const prefix = cxcAdjustmentPendingPrefix(scope)
      for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()) {
        try {
          const intent = readCxcAdjustmentIntent(localStorage.getItem(key), scope)
          if (!intent || key !== cxcAdjustmentPendingKey(scope, intent.cuenta.id, intent.kind)) throw new Error('Identidad del pendiente inválida')
          rows.push(intent)
        } catch { error = 'No se pudieron verificar todos los ajustes pendientes. Se conservan sin reemplazarlos ni preparar otra solicitud.' }
      }
    } catch { error = 'No se pudo consultar el almacenamiento de ajustes pendientes. Reintenta su lectura antes de preparar otro ajuste.' }
    setPendingAdjustments({ scope: collectionScope, rows, error })
  }, [session?.user?.tenant_id, session?.user?.id, collectionScope, authLoading, collectionPermissionLoading, canCollect])
  useEffect(() => {
    refreshPendingAdjustments()
    window.addEventListener('storage', refreshPendingAdjustments)
    window.addEventListener('erp:cxc-adjustment-pending', refreshPendingAdjustments)
    return () => {
      window.removeEventListener('storage', refreshPendingAdjustments)
      window.removeEventListener('erp:cxc-adjustment-pending', refreshPendingAdjustments)
    }
  }, [refreshPendingAdjustments])
  useEffect(() => {
    if (adjustmentTarget && (adjustmentTarget.scope !== collectionScope || authLoading || !canCollect || collectionPermissionLoading
      || !adjustmentTarget.recovery && adjustmentTarget.source !== list.data)) setAdjustmentTarget(null)
  }, [adjustmentTarget, collectionScope, authLoading, canCollect, collectionPermissionLoading, list.data])
  const refreshPendingCollections = useCallback(() => {
    if (!session?.user?.tenant_id || !session.user.id || collectionPermissionLoading || !canCollect) {
      setPendingCollections({ scope: collectionScope, rows: [], error: null }); return
    }
    const scope = { tenantId: session.user.tenant_id, actorId: session.user.id }
    const rows: CxcCollectionIntent[] = []
    let error: string | null = null
    try {
      const prefix = cxcCollectionPendingPrefix(scope)
      for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()) {
        try {
          const intent = readCxcCollectionIntent(localStorage.getItem(key), scope, key.slice(prefix.length))
          if (!intent) throw new Error('Pendiente ausente')
          rows.push(intent)
        } catch { error = 'No se pudieron verificar todos los cobros pendientes. Se conservan; no se puede preparar otro cobro.' }
      }
    } catch { error = 'No se pudo consultar el almacenamiento de cobros pendientes. Reintenta su lectura antes de preparar otro cobro.' }
    setPendingCollections({ scope: collectionScope, rows, error })
  }, [session?.user?.tenant_id, session?.user?.id, collectionScope, collectionPermissionLoading, canCollect])
  useEffect(() => {
    refreshPendingCollections()
    window.addEventListener('storage', refreshPendingCollections)
    window.addEventListener('erp:cxc-collection-pending', refreshPendingCollections)
    return () => {
      window.removeEventListener('storage', refreshPendingCollections)
      window.removeEventListener('erp:cxc-collection-pending', refreshPendingCollections)
    }
  }, [refreshPendingCollections])
  useEffect(() => {
    setSelection(null); setShowHistorial(false)
  }, [list.data, scopeKey])
  useEffect(() => {
    if (collectionTarget && (collectionTarget.scope !== collectionScope || !canCollect || collectionPermissionLoading)) {
      setCollectionTarget(null); setShowCobro(false)
    }
  }, [collectionScope, canCollect, collectionPermissionLoading, collectionTarget])
  const historyId = showHistorial ? selectedCuenta?.id || '' : ''
  const loadHistory = useCallback(async (get: (endpoint: string) => Promise<any>, path: string, scope: CxcReadScope) =>
    readCxcHistory(await get(path), historyId, scope), [historyId])
  const history = useCxcRead(`/api/finanzas/cxc/${historyId}`, loadHistory, Boolean(historyId))
  const loadingHistorial = Boolean(historyId) && history.loading

  const exportarCuentas = () => {
    downloadCsv(
      `cuentas-por-cobrar-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Documento', 'Tipo', 'Cliente', 'Documento cliente', 'Emisión', 'Vencimiento', 'Moneda', 'Total', 'Saldo', 'Estado'],
      cuentas.map((cuenta) => [
        formatFiscalDocumentNumber(country.paisCodigo, cuenta.serie, cuenta.numero, { fallback: 'N/A' }),
        cuenta.tipo_documento,
        cuenta.clientes?.razon_social,
        cuenta.clientes?.documento_numero,
        cuenta.fecha_emision?.slice(0, 10),
        cuenta.fecha_vencimiento?.slice(0, 10),
        cuenta.moneda,
        Number(cuenta.total || 0).toFixed(2),
        Number(cuenta.saldo || 0).toFixed(2),
        cuenta.estado,
      ]),
    )
  }

  const resetFilters = () => setFilters(initialFilters)

  const stats = useMemo(() => {
    const total = cuentas.length
    const pendientes = cuentas.filter((cuenta) => normalizeEstadoCxc(cuenta.estado) === 'PENDIENTE').length
    const vencidas = cuentas.filter((cuenta) => normalizeEstadoCxc(cuenta.estado) === 'VENCIDO').length
    return { total, pendientes, vencidas, saldos: cxcPendingBalances(cuentas) }
  }, [cuentas])

  const isFiltersActive = useMemo(
    () => Boolean(filters.estado || filters.clienteId || filters.vencimientoDesde || filters.vencimientoHasta || filters.search),
    [filters],
  )

  const clientesFiltro = useMemo(() => {
    if (clientes.length > 0) return clientes

    const byId = new Map<string, ClienteLigero>()
    cuentas.forEach((cuenta) => {
      if (!cuenta.cliente_id || byId.has(cuenta.cliente_id)) return
      byId.set(cuenta.cliente_id, {
        id: cuenta.cliente_id,
        razon_social: cuenta.clientes?.razon_social ?? 'Cliente sin nombre',
      })
    })

    return Array.from(byId.values()).sort((a, b) =>
      (a.razon_social || a.nombre_comercial || '').localeCompare(
        b.razon_social || b.nombre_comercial || '',
        'es',
      ),
    )
  }, [clientes, cuentas])

  const formatCurrency = (value: number | null | undefined, currency: string = country.moneda || 'PEN') => {
    if (value === null || value === undefined) return '-'
    return new Intl.NumberFormat(country.locale || 'es-PE', { style: 'currency', currency }).format(value)
  }

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '-'
    const parsed = parseDateLocal(value)
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('es-PE')
  }

  const computeDiasAtraso = (value: string | null | undefined) => {
    if (!value) return 0
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 0
    const today = new Date()
    const diff = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff < 0 ? Math.abs(diff) : 0
  }

  const renderEstadoBadge = (estado: string | null | undefined) => {
    const normalizedEstado = normalizeEstadoCxc(estado)
    const meta = normalizedEstado
      ? ESTADO_META[normalizedEstado]
      : {
          label: estado ? String(estado) : 'Sin estado',
          className: 'border-border/25 bg-slate-300/10 text-foreground',
          icon: AlertCircle,
        }
    const Icon = meta.icon
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
        <Icon className="h-3.5 w-3.5" />
        {meta.label}
      </span>
    )
  }

  const openCobro = (cuenta: CuentaPorCobrar) => {
    if (!canCollect || collectionPermissionLoading || pendingError || !list.data) return
    setCollectionTarget({ scope: collectionScope, cuenta, source: list.data, recovery: false })
    setShowCobro(true)
  }

  const openNotaCredito = (cuenta: CuentaPorCobrar) => {
    if (!list.data || authLoading || !canCollect || collectionPermissionLoading || adjustmentError) return
    setAdjustmentTarget({ scope: collectionScope, kind: 'notas-credito', cuenta, source: list.data, recovery: false })
  }

  const openReprogramar = (cuenta: CuentaPorCobrar) => {
    if (!list.data || authLoading || !canCollect || collectionPermissionLoading || adjustmentError) return
    setAdjustmentTarget({ scope: collectionScope, kind: 'reprogramar', cuenta, source: list.data, recovery: false })
  }

  const openHistorial = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowHistorial(true)
  }

  const closeHistorial = () => {
    setShowHistorial(false)
    setSelectedCuenta(null)
  }

  const actionButtonClass = 'h-9 gap-1 border-cyan-400/20 bg-muted/30 px-3 text-xs text-primary hover:bg-muted/50 hover:text-foreground'

  return (
    <div className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <section className="rounded-3xl border border-cyan-400/20 bg-card/80 p-5 shadow-2xl shadow-blue-950/30">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-primary">
                ERP Receivables
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">Cuentas por Cobrar</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                CxC generadas desde ventas con cobros, notas de credito, reprogramaciones e historial.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={fetchCuentas} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
                <RefreshCw className="h-4 w-4" />
                Actualizar
              </Button>
              <Button type="button" onClick={exportarCuentas} disabled={loading || !!loadError || cuentas.length === 0} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
            </div>
          </div>
        </section>

        {canCollect && !collectionPermissionLoading && (currentPending.length > 0 || pendingError) && <section data-testid="cxc-pending-collections" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
          <h2 className="font-semibold">Cobros pendientes de confirmar</h2>
          <p className="mt-1 text-sm">Se conservan las solicitudes originales. Consulta el resultado del mismo cobro antes de preparar otro.</p>
          {pendingError && <p role="alert" className="mt-2 text-sm text-destructive">{pendingError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">{currentPending.map(intent => <Button key={intent.cuenta.id} type="button" variant="outline" data-testid={'cxc-recover-' + intent.cuenta.id} onClick={() => {
            setCollectionTarget({ scope: collectionScope, cuenta: cxcCollectionAccount(intent), source: null, recovery: true }); setShowCobro(true)
          }}>Recuperar cobro {formatFiscalDocumentNumber(country.paisCodigo, intent.cuenta.serie, intent.cuenta.numero) || intent.cuenta.id}</Button>)}
            <Button type="button" variant="outline" onClick={refreshPendingCollections}>Releer cobros pendientes</Button></div>
        </section>}

        {canCollect && !authLoading && !collectionPermissionLoading && (currentAdjustments.length > 0 || adjustmentError) && <section data-testid="cxc-pending-adjustments" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4">
          <h2 className="font-semibold">Ajustes pendientes de confirmar</h2>
          <p className="mt-1 text-sm">Recupera la solicitud original para confirmar su resultado. No se envía automáticamente al volver.</p>
          {adjustmentError && <p role="alert" className="mt-2 text-sm text-destructive">{adjustmentError}</p>}
          <div className="mt-3 flex flex-wrap gap-2">{currentAdjustments.map(intent => <Button key={intent.cuenta.id + ':' + intent.kind} type="button" variant="outline" data-testid={'cxc-recover-adjustment-' + intent.kind + '-' + intent.cuenta.id} onClick={() => {
            setAdjustmentTarget({ scope: collectionScope, kind: intent.kind, cuenta: intent.cuenta, source: null, recovery: true })
          }}>Recuperar {intent.kind === 'reprogramar' ? 'reprogramación' : 'nota'} {formatFiscalDocumentNumber(intent.country, intent.cuenta.serie, intent.cuenta.numero) || intent.cuenta.id}</Button>)}
            <Button type="button" variant="outline" onClick={refreshPendingAdjustments}>Releer ajustes pendientes</Button></div>
        </section>}

        {!loading && !loadError && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total', value: stats.total.toLocaleString('es-PE'), description: 'Cuentas registradas', icon: FileText },
            { label: 'Pendientes', value: stats.pendientes.toLocaleString('es-PE'), description: 'Por cobrar', icon: Clock },
            { label: 'Vencidas', value: stats.vencidas.toLocaleString('es-PE'), description: 'Atrasadas', icon: XCircle },
            { label: 'Saldo total', value: Object.entries(stats.saldos).map(([currency, amount]) => formatCurrency(amount, currency)).join(' · ') || formatCurrency(0), description: 'Pendiente por cobrar por moneda', icon: DollarSign },
          ].map(({ label, value, description, icon: Icon }) => (
            <Card key={label} className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className={labelClass}>{label}</div>
                  <div className="mt-3 text-2xl font-bold text-foreground">{value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{description}</div>
                </div>
                <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          ))}
        </section>}

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardHeader className="border-b border-cyan-400/10 px-5 py-4">
            <CardTitle className="text-base text-foreground">Filtros operativos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3 xl:items-end">
            <label className="space-y-2">
              <span className={labelClass}>Buscar</span>
              <input className={inputClass} type="text" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="Serie, numero, cliente, moneda" />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Estado</span>
              <select className={inputClass} value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value as EstadoCxc | '' }))}>
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="PARCIAL">Parcial</option>
                <option value="VENCIDO">Vencido</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Cliente</span>
              <select className={inputClass} value={filters.clienteId} onChange={(event) => setFilters((prev) => ({ ...prev, clienteId: event.target.value }))}>
                <option value="">Todos</option>
                {clientesFiltro.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.razon_social || cliente.nombre_comercial || 'Sin nombre'}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Desde</span>
              <input className={inputClass} type="date" value={filters.vencimientoDesde} onChange={(event) => setFilters((prev) => ({ ...prev, vencimientoDesde: event.target.value }))} />
            </label>
            <label className="space-y-2">
              <span className={labelClass}>Hasta</span>
              <input className={inputClass} type="date" value={filters.vencimientoHasta} onChange={(event) => setFilters((prev) => ({ ...prev, vencimientoHasta: event.target.value }))} />
            </label>
            {isFiltersActive && (
              <Button type="button" onClick={resetFilters} variant="outline" className="gap-2 border-cyan-400/20 bg-muted/30 text-primary hover:bg-muted/50 hover:text-foreground">
                <XCircle className="h-4 w-4" />
                Limpiar
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-cyan-400/20 bg-card/65 text-foreground shadow-xl shadow-blue-950/20">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p>Cargando cuentas por cobrar...</p>
              </div>
            ) : loadError ? (
              <div role="alert" className="flex min-h-[340px] flex-col items-center justify-center gap-4 p-8 text-center">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" onClick={fetchCuentas} variant="outline">Reintentar consulta</Button>
              </div>
            ) : cuentas.length === 0 ? (
              <div className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center">
                <FileText className="mb-3 h-12 w-12 text-cyan-200/50" />
                <h3 className="text-lg font-bold text-foreground">{isFiltersActive ? 'Sin resultados con los filtros aplicados' : 'No hay cuentas por cobrar'}</h3>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Las CxC se generan automaticamente cuando emites comprobantes de ventas.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-collapse text-sm">
                  <thead className="bg-card/80 text-xs uppercase tracking-[0.12em] text-primary/80">
                    <tr>
                      <th className="px-4 py-3 text-left">Documento</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left">Emision</th>
                      <th className="px-4 py-3 text-left">Vencimiento</th>
                      <th className="px-4 py-3 text-center">Atraso</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cyan-400/10">
                    {cuentas.map((cuenta) => {
                      const numeroCompleto = formatFiscalDocumentNumber(country.paisCodigo, cuenta.serie, cuenta.numero, { fallback: 'N/A' })
                      const diasAtraso = computeDiasAtraso(cuenta.fecha_vencimiento)
                      const saldo = Number(cuenta.saldo ?? 0)
                      const estadoNormalizado = normalizeEstadoCxc(cuenta.estado)
                      const puedeGestionar = saldo > 0 && estadoNormalizado !== 'CANCELADO'
                      return (
                        <tr key={cuenta.id} className="bg-card/35 text-foreground/90 transition hover:bg-card/70">
                          <td className="px-4 py-3">
                            <div className="font-mono font-semibold text-foreground">{numeroCompleto}</div>
                            <div className="text-xs text-muted-foreground">{cuenta.tipo_documento ?? '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-foreground">{cuenta.clientes?.razon_social ?? 'Cliente sin nombre'}</div>
                            <div className="text-xs text-muted-foreground">{cuenta.clientes?.documento_numero ?? '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(cuenta.fecha_emision)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(cuenta.fecha_vencimiento)}</td>
                          <td className="px-4 py-3 text-center font-bold text-foreground">{diasAtraso}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(cuenta.total, cuenta.moneda)}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary">{formatCurrency(saldo, cuenta.moneda)}</td>
                          <td className="px-4 py-3 text-center">{renderEstadoBadge(cuenta.estado)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openCobro(cuenta)} disabled={!puedeGestionar || Boolean(pendingError)} className="h-9 gap-1 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500">
                                  <DollarSign className="h-3.5 w-3.5" />
                                  Cobro
                                </Button>
                              </ProtectedComponent>
                              <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openNotaCredito(cuenta)} disabled={!puedeGestionar || Boolean(adjustmentError) || authLoading} variant="outline" className={actionButtonClass}>
                                  <FileText className="h-3.5 w-3.5" />
                                  Nota
                                </Button>
                              </ProtectedComponent>
                              <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openReprogramar(cuenta)} disabled={estadoNormalizado === 'CANCELADO' || Boolean(adjustmentError) || authLoading} variant="outline" className={actionButtonClass}>
                                  <Clock className="h-3.5 w-3.5" />
                                  Reprogramar
                                </Button>
                              </ProtectedComponent>
                              <ProtectedComponent modulo="finanzas" recurso="cxc" accion="read" fallback={null}>
                                <Button type="button" size="sm" onClick={() => openHistorial(cuenta)} variant="outline" className={actionButtonClass}>
                                  {loadingHistorial && selectedCuenta?.id === cuenta.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
                                  Historial
                                </Button>
                              </ProtectedComponent>
                              {/* «Detalle» apuntaba a /finanzas/cxc/{id}, que no
                                  existe: siempre daba 404. No se reapunta al drawer
                                  de historial porque ese botón sí exige el permiso
                                  finanzas.cxc.read y éste no estaba protegido:
                                  duplicarlo abriría una vía sin permiso al mismo
                                  dato. «Historial», al lado, ya lo muestra. */}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CobroModal
        isOpen={showCobro && collectionTarget?.scope === collectionScope && canCollect && !collectionPermissionLoading && (collectionTarget.recovery || Boolean(list.data && collectionTarget.source === list.data) || currentPending.some(intent => intent.cuenta.id === collectionTarget.cuenta.id))}
        cuenta={collectionTarget?.scope === collectionScope ? collectionTarget.cuenta : null}
        onClose={() => {
          setShowCobro(false)
          setCollectionTarget(null)
        }}
        onSuccess={fetchCuentas}
      />
      <NotaCreditoModal
        isOpen={activeAdjustment?.kind === 'notas-credito'}
        cuenta={activeAdjustment?.kind === 'notas-credito' ? activeAdjustment.cuenta : null}
        onClose={() => setAdjustmentTarget(null)}
        onSuccess={fetchCuentas}
      />
      <ReprogramarModal
        isOpen={activeAdjustment?.kind === 'reprogramar'}
        cuenta={activeAdjustment?.kind === 'reprogramar' ? activeAdjustment.cuenta : null}
        onClose={() => setAdjustmentTarget(null)}
        onSuccess={fetchCuentas}
      />
      <HistorialDrawer isOpen={showHistorial && Boolean(selectedCuenta)} onClose={closeHistorial} detalle={history.data}
        loading={loadingHistorial} error={history.error} onRetry={history.reload} />
    </div>
  )
}
