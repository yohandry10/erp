'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { parseDateLocal } from '@/lib/date-utils'
import toast from 'react-hot-toast'
import { useLocalizedMoney } from '@/hooks/use-localized-money'
import {
  Plus,
  RefreshCw,
  PackageX,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Eye,
  Filter,
  X
} from 'lucide-react'

interface Devolucion {
  id: string
  numero: string
  recepcion_id?: string
  orden_id: string
  proveedor_id: string
  fecha_devolucion: string
  estado: 'PENDIENTE' | 'EMITIDA' | 'ANULADA'
  motivo: string
  subtotal: number
  igv: number
  total: number
  observaciones?: string
  emitido_por?: string
  emitido_at?: string
  created_at: string
  orden?: {
    id: string
    numero: string
  }
  proveedor?: {
    id: string
    razon_social: string
    ruc: string
  }
  recepcion?: {
    id: string
    numero: string
  }
}

export default function DevolucionesPage() {
  const router = useRouter()
  const { get } = useApi()
  const { formatCurrency: formatLocalizedCurrency, locale, taxIdLabel } = useLocalizedMoney()

  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    estado: '',
    proveedor_id: '',
    fecha_desde: '',
    fecha_hasta: ''
  })
  const [showFilters, setShowFilters] = useState(false)

  const loadDevoluciones = useCallback(async () => {
    try {
      setLoading(true)

      const params = new URLSearchParams()
      if (filtros.estado) params.append('estado', filtros.estado)
      if (filtros.proveedor_id) params.append('proveedor_id', filtros.proveedor_id)
      if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde)
      if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta)

      const queryString = params.toString()
      const url = `/api/compras/devoluciones${queryString ? `?${queryString}` : ''}`

      const response = await get(url)
      const devolucionesData = Array.isArray(response) ? response : response?.data

      if (Array.isArray(devolucionesData)) {
        setDevoluciones(devolucionesData)
      }
    } catch (error) {
      console.error('Error loading devoluciones:', error)
      toast.error('Error: No se pudieron cargar las devoluciones')
    } finally {
      setLoading(false)
    }
  }, [get, filtros])

  useEffect(() => {
    loadDevoluciones()
  }, [loadDevoluciones])

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '-'
    return formatLocalizedCurrency(amount)
  }

  const formatDate = (dateString: string) => {
    return parseDateLocal(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
  }

  const getEstadoBadge = (estado: string) => {
    const styles = {
      PENDIENTE: { bg: 'var(--amber-100)', color: 'var(--amber-800)', icon: Clock },
      EMITIDA: { bg: 'var(--emerald-100)', color: 'var(--emerald-800)', icon: CheckCircle },
      ANULADA: { bg: 'var(--red-100)', color: 'var(--red-800)', icon: XCircle }
    }

    const style = styles[estado as keyof typeof styles] || styles.PENDIENTE
    const Icon = style.icon

    return (
      <span className="inline-flex items-center gap-[4px] py-[4px] px-3 rounded-xl text-xs font-semibold">
        <Icon size={14} />
        {estado}
      </span>
    )
  }

  const estadisticas = {
    total: devoluciones.length,
    pendientes: devoluciones.filter(d => d.estado === 'PENDIENTE').length,
    emitidas: devoluciones.filter(d => d.estado === 'EMITIDA').length,
    anuladas: devoluciones.filter(d => d.estado === 'ANULADA').length
  }

  const hasActiveFilters = filtros.estado || filtros.proveedor_id || filtros.fecha_desde || filtros.fecha_hasta

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-[4px]">
            Devoluciones a Proveedor
          </h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Gestión de devoluciones de mercancía
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 py-2.5 px-4 border rounded-lg cursor-pointer text-sm font-medium"
          >
            <Filter size={18} />
            Filtros
            {hasActiveFilters && (
              <span className="bg-[var(--primary-600)] text-white rounded-[0.625rem] py-[2px] px-[6px] text-[11px] font-semibold">
                {[filtros.estado, filtros.proveedor_id, filtros.fecha_desde, filtros.fecha_hasta]
                  .filter(Boolean).length}
              </span>
            )}
          </button>

          <button
            onClick={loadDevoluciones}
            disabled={loading} className="flex items-center gap-2 py-2.5 px-4 border rounded-lg bg-card text-sm font-medium"
          >
            <RefreshCw size={18} />
            Actualizar
          </button>

          <button
            onClick={() => router.push('/dashboard/compras/devoluciones/nueva')} className="flex items-center gap-2 py-2.5 px-5 bg-[var(--primary-600)] text-white border-0 rounded-lg cursor-pointer text-sm font-semibold"
          >
            <Plus size={18} />
            Nueva Devolución
          </button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <div className="bg-card border rounded-xl p-5 mb-6">
          <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-4">
            <div>
              <label className="block mb-[6px] text-[13px] font-medium">
                Estado
              </label>
              <select
                value={filtros.estado}
                onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })} className="w-[100%] py-2 px-3 border rounded-[6px] text-sm"
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="EMITIDA">Emitida</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </div>

            <div>
              <label className="block mb-[6px] text-[13px] font-medium">
                Fecha Desde
              </label>
              <input
                type="date"
                value={filtros.fecha_desde}
                onChange={(e) => setFiltros({ ...filtros, fecha_desde: e.target.value })} className="w-[100%] py-2 px-3 border rounded-[6px] text-sm"
              />
            </div>

            <div>
              <label className="block mb-[6px] text-[13px] font-medium">
                Fecha Hasta
              </label>
              <input
                type="date"
                value={filtros.fecha_hasta}
                onChange={(e) => setFiltros({ ...filtros, fecha_hasta: e.target.value })} className="w-[100%] py-2 px-3 border rounded-[6px] text-sm"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={() => setFiltros({ estado: '', proveedor_id: '', fecha_desde: '', fecha_hasta: '' })} className="flex items-center gap-[6px] py-[6px] px-3 bg-[var(--red-50)] text-[var(--red-700)] border rounded-[6px] cursor-pointer text-[13px] font-medium"
            >
              <X size={14} />
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4 mb-6">
        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--blue-100)] flex items-center justify-center">
              <PackageX size={24} className="text-[var(--blue-600)]" />
            </div>
            <div>
              <p className="text-2xl font-bold mb-[2px]">
                {estadisticas.total}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Total Devoluciones
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--amber-100)] flex items-center justify-center">
              <Clock size={24} className="text-[var(--amber-600)]" />
            </div>
            <div>
              <p className="text-2xl font-bold mb-[2px]">
                {estadisticas.pendientes}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Pendientes
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--emerald-100)] flex items-center justify-center">
              <CheckCircle size={24} className="text-[var(--emerald-600)]" />
            </div>
            <div>
              <p className="text-2xl font-bold mb-[2px]">
                {estadisticas.emitidas}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Emitidas
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--red-100)] flex items-center justify-center">
              <XCircle size={24} className="text-[var(--red-600)]" />
            </div>
            <div>
              <p className="text-2xl font-bold mb-[2px]">
                {estadisticas.anuladas}
              </p>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Anuladas
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-[60px] text-center text-[var(--text-secondary)]">
            Cargando devoluciones...
          </div>
        ) : devoluciones.length === 0 ? (
          <div className="p-[60px] text-center">
            <PackageX size={48} className="text-[var(--text-tertiary)]" />
            <p className="text-[var(--text-secondary)] mb-2">
              No hay devoluciones registradas
            </p>
            <button
              onClick={() => router.push('/dashboard/compras/devoluciones/nueva')} className="py-2 px-4 bg-[var(--primary-600)] text-white border-0 rounded-[6px] cursor-pointer text-sm font-medium"
            >
              Crear primera devolución
            </button>
          </div>
        ) : (
          <table className="w-[100%]">
            <thead>
              <tr className="bg-[var(--gray-50)] border-b">
                <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-secondary)]">
                  NÚMERO
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-secondary)]">
                  PROVEEDOR
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-secondary)]">
                  ORDEN COMPRA
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-secondary)]">
                  RECEPCIÓN
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-secondary)]">
                  FECHA
                </th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-[var(--text-secondary)]">
                  MOTIVO
                </th>
                <th className="py-3 px-4 text-right text-xs font-semibold text-[var(--text-secondary)]">
                  TOTAL
                </th>
                <th className="py-3 px-4 text-center text-xs font-semibold text-[var(--text-secondary)]">
                  ESTADO
                </th>
                <th className="py-3 px-4 text-center text-xs font-semibold text-[var(--text-secondary)]">
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody>
              {devoluciones.map((devolucion) => (
                <tr
                  key={devolucion.id} className="border-b transition"
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--gray-50)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <td className="p-4 text-sm font-semibold">
                    {devolucion.numero}
                  </td>
                  <td className="p-4 text-sm">
                    <div>
                      <div className="font-medium">{devolucion.proveedor?.razon_social || '-'}</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {taxIdLabel}: {devolucion.proveedor?.ruc || '-'}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm">
                    {devolucion.orden?.numero || '-'}
                  </td>
                  <td className="p-4 text-sm">
                    {devolucion.recepcion?.numero || '-'}
                  </td>
                  <td className="p-4 text-sm">
                    {formatDate(devolucion.fecha_devolucion)}
                  </td>
                  <td className="p-4 text-[13px] max-w-[200px]">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--text-secondary)]">
                      {devolucion.motivo}
                    </div>
                  </td>
                  <td className="p-4 text-sm font-semibold text-right">
                    {formatCurrency(devolucion.total)}
                  </td>
                  <td className="p-4 text-center">
                    {getEstadoBadge(devolucion.estado)}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => router.push(`/dashboard/compras/devoluciones/${devolucion.id}`)} className="py-[6px] px-3 bg-[var(--primary-50)] text-[var(--primary-700)] border-0 rounded-[6px] cursor-pointer text-[13px] font-medium inline-flex items-center gap-[4px]"
                    >
                      <Eye size={14} />
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
