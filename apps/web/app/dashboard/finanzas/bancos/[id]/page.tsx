'use client'

import { useState, useEffect, useCallback } from 'react'
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

  const loadCuenta = useCallback(async () => {
    if (!cuentaId) return

    try {
      setLoading(true)
      const response = await get(`/api/finanzas/bancos/cuentas/${cuentaId}`)
      
      if (response?.success) {
        setCuenta(response.data)
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
      
      if (response?.success) {
        setMovimientos(response.data || [])
        setPagination(response.pagination || pagination)
      }
    } catch (error) {
      console.error('Error loading movimientos:', error)
      alert('Error: No se pudieron cargar los movimientos')
    } finally {
      setLoadingMovimientos(false)
    }
  }, [cuentaId, get, filters, pagination.limit])

  useEffect(() => {
    loadCuenta()
  }, [loadCuenta])

  useEffect(() => {
    loadMovimientos(1)
  }, [filters])

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
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-PE', {
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
      <div className="dashboard-container">
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Cargando cuenta bancaria...</p>
        </div>
      </div>
    )
  }

  if (!cuenta) {
    return (
      <div className="dashboard-container">
        <div className="activity-card">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
            <AlertCircle size={48} style={{ margin: '0 auto 1rem', color: '#ef4444' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Cuenta bancaria no encontrada
            </h3>
            <p style={{ marginBottom: '1.5rem' }}>
              La cuenta bancaria que buscas no existe o no tienes permisos para verla
            </p>
            <button
              onClick={() => router.push('/dashboard/finanzas/bancos')}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}
            >
              Volver a Cuentas Bancarias
            </button>
          </div>
        </div>
      </div>
    )
  }

  const saldoColor = cuenta.saldo >= 0 ? '#10b981' : '#ef4444'
  const activeFiltersCount = Object.values(filters).filter(v => v !== '' && v !== undefined).length

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => router.push('/dashboard/finanzas/bancos')}
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="dashboard-title">{cuenta.nombre}</h1>
            <p className="dashboard-subtitle">
              {cuenta.banco} • {cuenta.numero_cuenta}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => {
              loadCuenta()
              loadMovimientos(pagination.page)
            }}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Cuenta Info Card */}
      <div className="activity-card" style={{ marginBottom: '2rem' }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '2rem'
        }}>
          {/* Tipo de Cuenta */}
          <div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              marginBottom: '0.5rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Tipo de Cuenta
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem' 
            }}>
              <CreditCard size={20} style={{ color: '#3b82f6' }} />
              <span style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                {TIPO_CUENTA_LABELS[cuenta.tipo_cuenta] || cuenta.tipo_cuenta}
              </span>
            </div>
          </div>

          {/* Moneda */}
          <div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              marginBottom: '0.5rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Moneda
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem' 
            }}>
              <DollarSign size={20} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                {cuenta.moneda}
              </span>
            </div>
          </div>

          {/* Saldo */}
          <div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              marginBottom: '0.5rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Saldo Disponible
            </div>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: '700', 
              color: saldoColor 
            }}>
              {formatCurrency(cuenta.saldo, cuenta.moneda)}
            </div>
          </div>

          {/* Estado */}
          <div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              marginBottom: '0.5rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Estado
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {cuenta.activa ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: 'rgba(16, 185, 129, 0.1)',
                  color: '#10b981',
                  width: 'fit-content'
                }}>
                  <CheckCircle size={14} />
                  ACTIVA
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: 'rgba(107, 114, 128, 0.1)',
                  color: '#6b7280',
                  width: 'fit-content'
                }}>
                  <XCircle size={14} />
                  INACTIVA
                </span>
              )}
              {cuenta.permite_sobregiro && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: '#f59e0b',
                  width: 'fit-content'
                }}>
                  <AlertCircle size={14} />
                  PERMITE SOBREGIRO
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Movimientos Section */}
      <div className="activity-section">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
            Movimientos Bancarios
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={handleExportMovimientos}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Download size={16} />
              Exportar
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: showFilters ? '#f3f4f6' : 'white',
                color: '#374151',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                position: 'relative'
              }}
            >
              <Filter size={16} />
              Filtros
              {activeFiltersCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-0.5rem',
                  right: '-0.5rem',
                  background: '#3b82f6',
                  color: 'white',
                  borderRadius: '9999px',
                  width: '1.25rem',
                  height: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.625rem',
                  fontWeight: '700'
                }}>
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Fecha Desde
                </label>
                <input
                  type="date"
                  value={filters.fecha_desde || ''}
                  onChange={(e) => handleFilterChange('fecha_desde', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Fecha Hasta
                </label>
                <input
                  type="date"
                  value={filters.fecha_hasta || ''}
                  onChange={(e) => handleFilterChange('fecha_hasta', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Tipo
                </label>
                <select
                  value={filters.tipo || ''}
                  onChange={(e) => handleFilterChange('tipo', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Todos</option>
                  <option value="ABONO">Abono</option>
                  <option value="CARGO">Cargo</option>
                </select>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#374151',
                  marginBottom: '0.5rem'
                }}>
                  Conciliado
                </label>
                <select
                  value={filters.conciliado === '' ? '' : filters.conciliado?.toString()}
                  onChange={(e) => handleFilterChange('conciliado', e.target.value === '' ? '' : e.target.value === 'true')}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">Todos</option>
                  <option value="true">Conciliado</option>
                  <option value="false">Pendiente</option>
                </select>
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                <button
                  onClick={handleClearFilters}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    background: 'white',
                    color: '#374151',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
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
