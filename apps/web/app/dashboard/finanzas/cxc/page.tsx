'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  RefreshCw,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Download,
  DollarSign,
  History,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import {
  CobroModal,
  NotaCreditoModal,
  ReprogramarModal,
  HistorialDrawer,
} from '@/components/finanzas'

type EstadoCxc = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'VENCIDO'

type CuentaPorCobrar = {
  id: string
  serie: string | null
  numero: string | null
  cliente_id: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  estado: EstadoCxc
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

type EstadoMeta = {
  label: string
  color: string
  background: string
  icon: typeof Clock
}

const ESTADO_META: Record<EstadoCxc, EstadoMeta> = {
  PENDIENTE: {
    label: 'Pendiente',
    color: '#f59e0b',
    background: 'rgba(245, 158, 11, 0.12)',
    icon: Clock,
  },
  PARCIAL: {
    label: 'Parcial',
    color: '#3b82f6',
    background: 'rgba(59, 130, 246, 0.12)',
    icon: AlertCircle,
  },
  CANCELADO: {
    label: 'Cancelado',
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.12)',
    icon: CheckCircle,
  },
  VENCIDO: {
    label: 'Vencido',
    color: '#ef4444',
    background: 'rgba(239, 68, 68, 0.12)',
    icon: XCircle,
  },
}

const initialFilters = {
  estado: '' as '' | EstadoCxc,
  clienteId: '',
  vencimientoDesde: '',
  vencimientoHasta: '',
  search: '',
}

export default function CuentasPorCobrarPage() {
  const router = useRouter()
  const { get } = useApi()

  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([])
  const [clientes, setClientes] = useState<ClienteLigero[]>([])
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [selectedCuenta, setSelectedCuenta] = useState<CuentaPorCobrar | null>(null)
  const [showCobro, setShowCobro] = useState(false)
  const [showNotaCredito, setShowNotaCredito] = useState(false)
  const [showReprogramar, setShowReprogramar] = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [detalleHistorial, setDetalleHistorial] = useState<any | null>(null)
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const fetchCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.estado) params.append('estado', filters.estado)
      if (filters.clienteId) params.append('cliente_id', filters.clienteId)
      if (filters.vencimientoDesde) params.append('desde', filters.vencimientoDesde)
      if (filters.vencimientoHasta) params.append('hasta', filters.vencimientoHasta)
      if (filters.search) params.append('search', filters.search.trim())

      const endpoint = params.toString() ? `/finanzas/cxc?${params.toString()}` : '/finanzas/cxc'
      const response = await get(endpoint)
      if (response?.success && Array.isArray(response.data)) {
        setCuentas(response.data as CuentaPorCobrar[])
      } else {
        setCuentas([])
      }
    } catch (error) {
      console.error('Error cargando cuentas por cobrar', error)
      setCuentas([])
    } finally {
      setLoading(false)
    }
  }, [filters, get])

  const fetchClientes = useCallback(async () => {
    try {
      const response = await get('/ventas/clientes?limit=1000')
      const data = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
      setClientes(data as ClienteLigero[])
    } catch (error) {
      console.error('Error cargando clientes', error)
      setClientes([])
    }
  }, [get])

  const fetchHistorial = useCallback(
    async (cxcId: string) => {
      try {
        setLoadingHistorial(true)
        const response = await get(`/finanzas/cxc/${cxcId}`)
        if (response?.success) {
          setDetalleHistorial(response.data ?? response)
        } else {
          setDetalleHistorial(response ?? null)
        }
      } catch (error) {
        console.error('Error cargando historial de CxC', error)
        setDetalleHistorial(null)
      } finally {
        setLoadingHistorial(false)
      }
    },
    [get],
  )

  useEffect(() => {
    fetchClientes()
  }, [fetchClientes])

  useEffect(() => {
    fetchCuentas()
  }, [fetchCuentas])

  const resetFilters = () => setFilters(initialFilters)

  const stats = useMemo(() => {
    const total = cuentas.length
    const pendientes = cuentas.filter((c) => c.estado === 'PENDIENTE').length
    const vencidas = cuentas.filter((c) => c.estado === 'VENCIDO').length
    const saldoPendiente = cuentas
      .filter((c) => c.estado !== 'CANCELADO')
      .reduce((sum, cuenta) => sum + Number(cuenta.saldo ?? 0), 0)

    return { total, pendientes, vencidas, saldoPendiente }
  }, [cuentas])

  const isFiltersActive = useMemo(
    () =>
      Boolean(
        filters.estado || filters.clienteId || filters.vencimientoDesde || filters.vencimientoHasta || filters.search,
      ),
    [filters],
  )

  const formatCurrency = (value: number | null | undefined, currency: string = 'PEN') => {
    if (value === null || value === undefined) return '—'
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value)
  }

  const formatDate = (value: string | null | undefined) => {
    if (!value) return '—'
    const candidate = value.includes('T') ? value : `${value}T00:00:00Z`
    const parsed = new Date(candidate)
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('es-PE')
  }

  const computeDiasAtraso = (value: string | null | undefined) => {
    if (!value) return 0
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return 0
    const today = new Date()
    const diff = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff < 0 ? Math.abs(diff) : 0
  }

  const renderEstadoBadge = (estado: EstadoCxc) => {
    const meta = ESTADO_META[estado]
    const Icon = meta.icon
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.35rem 0.8rem',
          borderRadius: '999px',
          background: meta.background,
          color: meta.color,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        <Icon size={14} />
        {meta.label}
      </span>
    )
  }

  const openCobro = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowCobro(true)
  }

  const openNotaCredito = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowNotaCredito(true)
  }

  const openReprogramar = (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowReprogramar(true)
  }

  const openHistorial = async (cuenta: CuentaPorCobrar) => {
    setSelectedCuenta(cuenta)
    setShowHistorial(true)
    setDetalleHistorial(null)
    await fetchHistorial(cuenta.id)
  }

  const closeHistorial = () => {
    setShowHistorial(false)
    setDetalleHistorial(null)
    setSelectedCuenta(null)
  }

  const ActionButton = ({
    children,
    disabled,
    onClick,
    variant = 'primary',
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick: () => void
    variant?: 'primary' | 'outline' | 'danger'
  }) => {
    const styles: Record<typeof variant, React.CSSProperties> = {
      primary: {
        background: disabled ? '#9ca3af' : '#2563eb',
        border: 'none',
        color: '#ffffff',
      },
      outline: {
        background: disabled ? '#f3f4f6' : '#ffffff',
        border: '1px solid #d1d5db',
        color: disabled ? '#9ca3af' : '#111827',
      },
      danger: {
        background: disabled ? '#9ca3af' : '#ef4444',
        border: 'none',
        color: '#ffffff',
      },
    }

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: '0.45rem 0.9rem',
          borderRadius: '8px',
          fontSize: '0.75rem',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...styles[variant],
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: '#0f172a' }}>Cuentas por Cobrar</h1>
          <p style={{ margin: '0.35rem 0 0', color: '#475569' }}>
            Controla CxC generadas desde Ventas y aplica cobros, notas de crédito o reprogramaciones con trazabilidad.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <ActionButton onClick={fetchCuentas}>
            <RefreshCw size={14} />
            Actualizar
          </ActionButton>
          <ActionButton
            onClick={() => alert('📥 Exportación en desarrollo')}
            variant="outline"
          >
            <Download size={14} />
            Exportar
          </ActionButton>
        </div>
      </header>

      <section
        style={{
          display: 'grid',
          gap: '1rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        <div style={{ borderRadius: '14px', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', background: 'rgba(59, 130, 246, 0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>Total</span>
            <FileText size={20} color="#1d4ed8" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
            {stats.total.toLocaleString('es-PE')}
          </div>
          <span style={{ fontSize: '0.85rem', color: '#475569' }}>Cuentas registradas</span>
        </div>
        <div style={{ borderRadius: '14px', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '1rem', background: 'rgba(251, 191, 36, 0.16)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Pendientes</span>
            <Clock size={20} color="#b45309" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#7c2d12', marginTop: '0.5rem' }}>
            {stats.pendientes.toLocaleString('es-PE')}
          </div>
          <span style={{ fontSize: '0.85rem', color: '#7c2d12' }}>Por cobrar</span>
        </div>
        <div style={{ borderRadius: '14px', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '1rem', background: 'rgba(254, 202, 202, 0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>Vencidas</span>
            <XCircle size={20} color="#b91c1c" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#7f1d1d', marginTop: '0.5rem' }}>
            {stats.vencidas.toLocaleString('es-PE')}
          </div>
          <span style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>Atrasadas</span>
        </div>
        <div style={{ borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '1rem', background: 'rgba(187, 247, 208, 0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Saldo total</span>
            <DollarSign size={20} color="#047857" />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065f46', marginTop: '0.5rem' }}>
            {formatCurrency(stats.saldoPendiente)}
          </div>
          <span style={{ fontSize: '0.85rem', color: '#065f46' }}>Pendiente por cobrar</span>
        </div>
      </section>

      <section
        style={{
          border: '1px solid rgba(148, 163, 184, 0.35)',
          borderRadius: '14px',
          padding: '1.25rem',
          background: 'rgba(248, 250, 252, 0.85)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Buscar
          </label>
          <input
            type="text"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Serie, número, cliente, moneda…"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #cbd5f5',
              background: '#ffffff',
            }}
          />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Estado
          </label>
          <select
            value={filters.estado}
            onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value as EstadoCxc | '' }))}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #cbd5f5',
              background: '#ffffff',
            }}
          >
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="VENCIDO">Vencido</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Cliente
          </label>
          <select
            value={filters.clienteId}
            onChange={(event) => setFilters((prev) => ({ ...prev, clienteId: event.target.value }))}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #cbd5f5',
              background: '#ffffff',
            }}
          >
            <option value="">Todos</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.razon_social || cliente.nombre_comercial || 'Sin nombre'}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Vencimiento desde
          </label>
          <input
            type="date"
            value={filters.vencimientoDesde}
            onChange={(event) => setFilters((prev) => ({ ...prev, vencimientoDesde: event.target.value }))}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #cbd5f5',
              background: '#ffffff',
            }}
          />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: '180px' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Vencimiento hasta
          </label>
          <input
            type="date"
            value={filters.vencimientoHasta}
            onChange={(event) => setFilters((prev) => ({ ...prev, vencimientoHasta: event.target.value }))}
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #cbd5f5',
              background: '#ffffff',
            }}
          />
        </div>
        {isFiltersActive && (
          <ActionButton onClick={resetFilters} variant="danger">
            <XCircle size={14} />
            Limpiar
          </ActionButton>
        )}
      </section>

      <section
        style={{
          border: '1px solid rgba(148, 163, 184, 0.35)',
          borderRadius: '16px',
          background: '#ffffff',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '3rem 0', color: '#475569' }}>
            <div className="loading-spinner" />
            Cargando cuentas por cobrar…
          </div>
        ) : cuentas.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '3rem 0' }}>
            <FileText size={48} style={{ marginBottom: '1rem', color: '#cbd5f5' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#0f172a' }}>
              {isFiltersActive ? 'Sin resultados con los filtros aplicados' : 'No hay cuentas por cobrar'}
            </h3>
            <p style={{ maxWidth: '420px', margin: '0 auto', color: '#64748b' }}>
              Las CxC se generan automáticamente cuando emites un comprobante de ventas. Registra nuevos cobros o notas de crédito desde las acciones.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left' }}>Documento</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left' }}>Cliente</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left' }}>Emisión</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'left' }}>Vencimiento</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'center' }}>Días atraso</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'right' }}>Saldo</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: '0.8rem 0.75rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((cuenta) => {
                  const numeroCompleto = [cuenta.serie, cuenta.numero].filter(Boolean).join('-') || 'N/A'
                  const diasAtraso = computeDiasAtraso(cuenta.fecha_vencimiento)
                  const saldo = Number(cuenta.saldo ?? 0)
                  const puedeGestionar = saldo > 0 && cuenta.estado !== 'CANCELADO'
                  return (
                    <tr key={cuenta.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.9rem 0.75rem' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>{numeroCompleto}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {cuenta.tipo_documento ?? '—'}
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 0.75rem', color: '#0f172a' }}>
                        <div style={{ fontWeight: 600 }}>
                          {cuenta.clientes?.razon_social ?? 'Cliente sin nombre'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {cuenta.clientes?.documento_numero ?? '—'}
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 0.75rem', color: '#475569' }}>{formatDate(cuenta.fecha_emision)}</td>
                      <td style={{ padding: '0.9rem 0.75rem', color: '#475569' }}>{formatDate(cuenta.fecha_vencimiento)}</td>
                      <td style={{ padding: '0.9rem 0.75rem', textAlign: 'center', color: diasAtraso > 0 ? '#b91c1c' : '#0f172a', fontWeight: 600 }}>
                        {diasAtraso}
                      </td>
                      <td style={{ padding: '0.9rem 0.75rem', textAlign: 'right', color: '#0f172a', fontWeight: 600 }}>
                        {formatCurrency(cuenta.total, cuenta.moneda)}
                      </td>
                      <td style={{ padding: '0.9rem 0.75rem', textAlign: 'right', color: saldo > 0 ? '#dc2626' : '#0f172a', fontWeight: 600 }}>
                        {formatCurrency(saldo, cuenta.moneda)}
                      </td>
                      <td style={{ padding: '0.9rem 0.75rem', textAlign: 'center' }}>
                        {renderEstadoBadge(cuenta.estado)}
                      </td>
                      <td style={{ padding: '0.9rem 0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '0.4rem' }}>
                          <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                            <ActionButton onClick={() => openCobro(cuenta)} disabled={!puedeGestionar}>
                              <DollarSign size={13} />
                              Cobro
                            </ActionButton>
                          </ProtectedComponent>
                          <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                            <ActionButton
                              onClick={() => openNotaCredito(cuenta)}
                              disabled={!puedeGestionar}
                              variant="outline"
                            >
                              <FileText size={13} />
                              Nota
                            </ActionButton>
                          </ProtectedComponent>
                          <ProtectedComponent modulo="finanzas" recurso="cxc.cobros" accion="write" fallback={null}>
                            <ActionButton
                              onClick={() => openReprogramar(cuenta)}
                              disabled={cuenta.estado === 'CANCELADO'}
                              variant="outline"
                            >
                              <Clock size={13} />
                              Reprogramar
                            </ActionButton>
                          </ProtectedComponent>
                          <ProtectedComponent modulo="finanzas" recurso="cxc" accion="read" fallback={null}>
                            <ActionButton onClick={() => openHistorial(cuenta)} variant="outline">
                              {loadingHistorial && selectedCuenta?.id === cuenta.id ? (
                                <RefreshCw size={13} className="animate-spin" />
                              ) : (
                                <History size={13} />
                              )}
                              Historial
                            </ActionButton>
                          </ProtectedComponent>
                          <ActionButton onClick={() => router.push(`/dashboard/finanzas/cxc/${cuenta.id}`)} variant="outline">
                            <Eye size={13} />
                            Detalle
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CobroModal
        isOpen={showCobro}
        cuenta={selectedCuenta}
        onClose={() => {
          setShowCobro(false)
          setSelectedCuenta(null)
        }}
        onSuccess={fetchCuentas}
      />
      <NotaCreditoModal
        isOpen={showNotaCredito}
        cuenta={selectedCuenta}
        onClose={() => {
          setShowNotaCredito(false)
          setSelectedCuenta(null)
        }}
        onSuccess={fetchCuentas}
      />
      <ReprogramarModal
        isOpen={showReprogramar}
        cuenta={selectedCuenta}
        onClose={() => {
          setShowReprogramar(false)
          setSelectedCuenta(null)
        }}
        onSuccess={fetchCuentas}
      />
      <HistorialDrawer
        isOpen={showHistorial}
        onClose={closeHistorial}
        detalle={loadingHistorial ? null : detalleHistorial}
      />
    </div>
  )
}
