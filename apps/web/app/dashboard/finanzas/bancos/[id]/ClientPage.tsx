'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import {
  ArrowLeft,
  RefreshCw,
  CreditCard,
  Building2,
  DollarSign,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Calendar
} from 'lucide-react'
import MovimientosBancariosTable from '@/components/finanzas/MovimientosBancariosTable'

interface CuentaBancaria {
  id: string
  nombre: string
  banco: string
  numero_cuenta: string
  tipo_cuenta: string
  moneda: string
  saldo: number
  permite_sobregiro: boolean
  activa: boolean
  created_at: string
  updated_at: string
}

interface MovimientoBancario {
  id: string
  cuenta_bancaria_id: string
  tipo: 'ABONO' | 'CARGO'
  monto: number
  fecha: string
  descripcion: string
  referencia: string | null
  conciliado: boolean
  cxp_id: string | null
  proveedor_id: string | null
  proveedores?: {
    id: string
    razon_social: string
    ruc: string
  }
  created_at: string
}

interface Filters {
  fecha_desde?: string
  fecha_hasta?: string
  tipo?: 'ABONO' | 'CARGO' | ''
  conciliado?: boolean | ''
}

const TIPO_CUENTA_LABELS: Record<string, string> = {
  CORRIENTE: 'Corriente',
  AHORROS: 'Ahorros',
  DETRACCION: 'Detracción',
  PLAZO_FIJO: 'Plazo Fijo',
}

const toNumber = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const normalizeCuenta = (raw: any): CuentaBancaria => ({
  id: raw?.id || '',
  nombre: raw?.nombre || 'Cuenta bancaria',
  banco: raw?.banco || 'Banco',
  numero_cuenta: raw?.numero_cuenta || raw?.numeroCuenta || 'N/A',
  tipo_cuenta: raw?.tipo_cuenta || 'CORRIENTE',
  moneda: raw?.moneda || 'PEN',
  saldo: toNumber(raw?.saldo ?? raw?.saldo_actual),
  permite_sobregiro: Boolean(raw?.permite_sobregiro),
  activa: raw?.activa ?? raw?.estado !== 'INACTIVA',
  created_at: raw?.created_at || '',
  updated_at: raw?.updated_at || '',
})

export default function CuentaBancariaDetallePage() {
  const router = useRouter()
  const params = useParams()
  const { get } = useApi()
  const cuentaId = params?.id as string

  const [cuenta, setCuenta] = useState<CuentaBancaria | null>(null)
  const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMovimientos, setLoadingMovimientos] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<Filters>({})
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  })
  const movimientosRequestSeq = useRef(0)

  const loadCuenta = useCallback(async () => {
    if (!cuentaId) return

    try {
      setLoading(true)
      const response = await get(`/api/finanzas/bancos/cuentas/${cuentaId}`)

      if (response?.success) {
        setCuenta(normalizeCuenta(response.data))
      }
    } catch (error) {
      console.error('Error loading cuenta bancaria:', error)
      alert('Error: No se pudo cargar la cuenta bancaria')
    } finally {
      setLoading(false)
    }
  }, [cuentaId, get])

  const loadMovimientos = useCallback(async (page: number = 1) => {
    if (!cuentaId) return

    const requestId = ++movimientosRequestSeq.current

    try {
      setLoadingMovimientos(true)

      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.fecha_desde && { fecha_desde: filters.fecha_desde }),
        ...(filters.fecha_hasta && { fecha_hasta: filters.fecha_hasta }),
        ...(filters.tipo && { tipo: filters.tipo }),
        ...(filters.conciliado !== '' && filters.conciliado !== undefined && {
          conciliado: filters.conciliado.toString()
        }),
      })

      const response = await get(`/api/finanzas/bancos/cuentas/${cuentaId}/movimientos?${queryParams}`)

      if (requestId !== movimientosRequestSeq.current) {
        return
      }

      if (response?.success) {
        setMovimientos(Array.isArray(response.data) ? response.data : [])
        setPagination(prev => response.pagination || prev)
      }
    } catch (error) {
      if (requestId !== movimientosRequestSeq.current) {
        return
      }
      console.error('Error loading movimientos:', error)
      alert('Error: No se pudieron cargar los movimientos')
    } finally {
      if (requestId === movimientosRequestSeq.current) {
        setLoadingMovimientos(false)
      }
    }
  }, [cuentaId, get, filters, pagination.limit])

  useEffect(() => {
    loadCuenta()
  }, [loadCuenta])

  useEffect(() => {
    loadMovimientos(1)
  }, [loadMovimientos])

  const handleFilterChange = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleClearFilters = () => {
    setFilters({})
  }

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : moneda === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(toNumber(amount))
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleExportMovimientos = async () => {
    if (!cuentaId) return

    try {
      const queryParams = new URLSearchParams({
        ...(filters.fecha_desde && { fecha_desde: filters.fecha_desde }),
        ...(filters.fecha_hasta && { fecha_hasta: filters.fecha_hasta }),
        ...(filters.tipo && { tipo: filters.tipo }),
        ...(filters.conciliado !== '' && filters.conciliado !== undefined && {
          conciliado: filters.conciliado.toString()
        }),
      })

      const response = await get(`/api/finanzas/bancos/cuentas/${cuentaId}/movimientos/exportar?${queryParams}`)

      if (response?.success && response.data) {
        // Crear un blob con el contenido CSV
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })

        // Crear un enlace temporal para descargar
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', response.filename || 'movimientos.csv')
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } else {
        alert('Error: No se pudo exportar los movimientos')
      }
    } catch (error) {
      console.error('Error exportando movimientos:', error)
      alert('Error: No se pudieron exportar los movimientos')
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="flex min-h-48 items-center justify-center">
          <div className="inline-block size-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
          <p>Cargando cuenta bancaria...</p>
        </div>
      </div>
    )
  }

  if (!cuenta) {
    return (
      <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
        <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl">
          <div className="text-center p-12 text-muted-foreground">
            <AlertCircle size={48} className="text-red-500" />
            <h3 className="text-[1.125rem] font-semibold mb-2">
              Cuenta bancaria no encontrada
            </h3>
            <p className="mb-6">
              La cuenta bancaria que buscas no existe o no tienes permisos para verla
            </p>
            <button
              onClick={() => router.push('/dashboard/finanzas/bancos')} className="py-3 px-6 rounded-lg border-0 bg-blue-500 text-white cursor-pointer text-[0.875rem] font-semibold"
            >
              Volver a Cuentas Bancarias
            </button>
          </div>
        </div>
      </div>
    )
  }

  const saldoColor = toNumber(cuenta.saldo) >= 0 ? '#10b981' : '#ef4444'
  const activeFiltersCount = Object.values(filters).filter(v => v !== '' && v !== undefined).length

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/finanzas/bancos')} className="p-2 rounded-lg border bg-card cursor-pointer flex items-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">{cuenta.nombre}</h1>
            <p className="mt-2 text-base text-muted-foreground">
              {cuenta.banco} • {cuenta.numero_cuenta}
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => {
              loadCuenta()
              loadMovimientos(pagination.page)
            }}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 py-2.5 text-sm font-semibold leading-5 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 py-3 px-6"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Cuenta Info Card */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-8">
        <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-8">
          {/* Tipo de Cuenta */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">
              Tipo de Cuenta
            </div>
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-blue-500" />
              <span className="text-base font-semibold text-foreground">
                {TIPO_CUENTA_LABELS[cuenta.tipo_cuenta] || cuenta.tipo_cuenta}
              </span>
            </div>
          </div>

          {/* Moneda */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">
              Moneda
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={20} className="text-[#10b981]" />
              <span className="text-base font-semibold text-foreground">
                {cuenta.moneda}
              </span>
            </div>
          </div>

          {/* Saldo */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">
              Saldo Disponible
            </div>
            <div className="text-2xl font-bold">
              {formatCurrency(cuenta.saldo, cuenta.moneda)}
            </div>
          </div>

          {/* Estado */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">
              Estado
            </div>
            <div className="flex flex-col gap-2">
              {cuenta.activa ? (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-semibold bg-[rgba(16,_185,_129,_0.1)] text-[#10b981]">
                  <CheckCircle size={14} />
                  ACTIVA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-semibold bg-[rgba(107,_114,_128,_0.1)] text-muted-foreground">
                  <XCircle size={14} />
                  INACTIVA
                </span>
              )}
              {cuenta.permite_sobregiro && (
                <span className="inline-flex items-center gap-1 py-1 px-3 rounded-full text-xs font-semibold bg-[rgba(245,_158,_11,_0.1)] text-amber-500">
                  <AlertCircle size={14} />
                  PERMITE SOBREGIRO
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Movimientos Section */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            Movimientos Bancarios
          </h2>
          <div className="flex gap-3 items-center">
            <button
              onClick={handleExportMovimientos} className="py-3 px-4 rounded-lg border bg-card text-foreground/85 cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2"
            >
              <Download size={16} />
              Exportar
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)} className="py-3 px-4 rounded-lg border text-foreground/85 cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2 relative"
            >
              <Filter size={16} />
              Filtros
              {activeFiltersCount > 0 && (
                <span className="absolute bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[0.625rem] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 text-card-foreground shadow-md backdrop-blur-xl mb-6">
            <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
              <div>
                <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                  Fecha Desde
                </label>
                <input
                  type="date"
                  value={filters.fecha_desde || ''}
                  onChange={(e) => handleFilterChange('fecha_desde', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                  Fecha Hasta
                </label>
                <input
                  type="date"
                  value={filters.fecha_hasta || ''}
                  onChange={(e) => handleFilterChange('fecha_hasta', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
                />
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                  Tipo
                </label>
                <select
                  value={filters.tipo || ''}
                  onChange={(e) => handleFilterChange('tipo', e.target.value)} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
                >
                  <option value="">Todos</option>
                  <option value="ABONO">Abono</option>
                  <option value="CARGO">Cargo</option>
                </select>
              </div>

              <div>
                <label className="block text-[0.875rem] font-medium text-foreground/85 mb-2">
                  Conciliado
                </label>
                <select
                  value={filters.conciliado === '' ? '' : filters.conciliado?.toString()}
                  onChange={(e) => handleFilterChange('conciliado', e.target.value === '' ? '' : e.target.value === 'true')} className="w-[100%] p-2 rounded-[6px] border text-[0.875rem]"
                >
                  <option value="">Todos</option>
                  <option value="true">Conciliado</option>
                  <option value="false">Pendiente</option>
                </select>
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={handleClearFilters} className="py-2 px-4 rounded-[6px] border bg-card text-foreground/85 cursor-pointer text-[0.875rem] font-medium"
                >
                  Limpiar Filtros
                </button>
              </div>
            )}
          </div>
        )}

        {/* Movimientos Table */}
        <MovimientosBancariosTable
          movimientos={movimientos}
          loading={loadingMovimientos}
          moneda={cuenta.moneda}
          pagination={pagination}
          onPageChange={loadMovimientos}
        />
      </div>
    </div>
  )
}

