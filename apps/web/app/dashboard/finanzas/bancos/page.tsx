'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { 
  Plus, 
  RefreshCw,
  CreditCard,
  DollarSign,
  Eye,
  Edit,
  TrendingUp,
  TrendingDown,
  Building2
} from 'lucide-react'
import CuentaBancariaCard from '@/components/finanzas/CuentaBancariaCard'

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

interface SaldosConsolidados {
  por_moneda: Array<{
    moneda: string
    saldo_total: number
    saldo_activas: number
    cantidad_cuentas: number
    cantidad_activas: number
  }>
  por_cuenta: Array<{
    id: string
    nombre: string
    banco: string
    numero_cuenta: string
    tipo_cuenta: string
    moneda: string
    saldo: number
    activa: boolean
  }>
  total_cuentas: number
  total_cuentas_activas: number
}

export default function BancosPage() {
  const router = useRouter()
  const { get } = useApi()
  
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [saldosConsolidados, setSaldosConsolidados] = useState<SaldosConsolidados | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSaldos, setLoadingSaldos] = useState(true)

  const loadCuentas = useCallback(async () => {
    try {
      setLoading(true)
      const response = await get('/api/finanzas/bancos/cuentas')
      
      if (response?.success) {
        const data = response.data || []
        setCuentas(data)
      }
    } catch (error) {
      console.error('Error loading cuentas bancarias:', error)
      alert('Error: No se pudieron cargar las cuentas bancarias')
    } finally {
      setLoading(false)
    }
  }, [get])

  const loadSaldosConsolidados = useCallback(async () => {
    try {
      setLoadingSaldos(true)
      const response = await get('/api/finanzas/bancos/saldos')
      
      if (response?.success) {
        setSaldosConsolidados(response.data)
      }
    } catch (error) {
      console.error('Error loading saldos consolidados:', error)
    } finally {
      setLoadingSaldos(false)
    }
  }, [get])

  useEffect(() => {
    loadCuentas()
    loadSaldosConsolidados()
  }, [loadCuentas, loadSaldosConsolidados])

  const formatCurrency = (amount: number, moneda: string = 'PEN') => {
    const currency = moneda === 'USD' ? 'USD' : moneda === 'EUR' ? 'EUR' : 'PEN'
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  const cuentasActivas = cuentas.filter(c => c.activa)
  const cuentasInactivas = cuentas.filter(c => !c.activa)

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Cuentas Bancarias</h1>
          <p className="dashboard-subtitle">Gestiona las cuentas bancarias de la empresa</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            onClick={() => {
              loadCuentas()
              loadSaldosConsolidados()
            }}
            className="refresh-btn"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
          <button 
            className="refresh-btn"
            onClick={() => router.push('/dashboard/finanzas/bancos/nueva')}
          >
            <Plus size={20} />
            Nueva Cuenta
          </button>
        </div>
      </div>

      {/* Stats - Saldos Consolidados */}
      {!loadingSaldos && saldosConsolidados && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', marginBottom: '2rem' }}>
          <div className="stat-card">
            <div className="stat-header">
              <h3>TOTAL CUENTAS</h3>
              <CreditCard className="stat-icon" style={{ color: '#3b82f6' }} />
            </div>
            <div className="stat-value">{saldosConsolidados.total_cuentas}</div>
            <div className="stat-subtitle">
              {saldosConsolidados.total_cuentas_activas} activas
            </div>
          </div>

          {saldosConsolidados.por_moneda.map((consolidado) => (
            <div key={consolidado.moneda} className="stat-card">
              <div className="stat-header">
                <h3>SALDO {consolidado.moneda}</h3>
                <DollarSign className="stat-icon" style={{ 
                  color: consolidado.saldo_activas >= 0 ? '#10b981' : '#ef4444' 
                }} />
              </div>
              <div className="stat-value" style={{ 
                fontSize: '1.25rem',
                color: consolidado.saldo_activas >= 0 ? '#10b981' : '#ef4444'
              }}>
                {formatCurrency(consolidado.saldo_activas, consolidado.moneda)}
              </div>
              <div className="stat-subtitle">
                {consolidado.cantidad_activas} {consolidado.cantidad_activas === 1 ? 'cuenta activa' : 'cuentas activas'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cuentas Activas */}
      <div className="activity-section">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
            Cuentas Activas
          </h2>
          <span style={{ 
            fontSize: '0.875rem', 
            color: '#6b7280',
            fontWeight: '500'
          }}>
            {cuentasActivas.length} {cuentasActivas.length === 1 ? 'cuenta' : 'cuentas'}
          </span>
        </div>

        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Cargando cuentas bancarias...</p>
          </div>
        ) : cuentasActivas.length === 0 ? (
          <div className="activity-card">
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <CreditCard size={48} style={{ margin: '0 auto 1rem', color: '#9ca3af' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                No hay cuentas bancarias activas
              </h3>
              <p style={{ marginBottom: '1.5rem' }}>
                Crea una nueva cuenta bancaria para comenzar
              </p>
              <button
                onClick={() => router.push('/dashboard/finanzas/bancos/nueva')}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Plus size={16} />
                Nueva Cuenta Bancaria
              </button>
            </div>
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '1.5rem'
          }}>
            {cuentasActivas.map((cuenta) => (
              <CuentaBancariaCard
                key={cuenta.id}
                cuenta={cuenta}
                onView={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}`)}
                onEdit={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}/editar`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cuentas Inactivas */}
      {cuentasInactivas.length > 0 && (
        <div className="activity-section" style={{ marginTop: '2rem' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#6b7280' }}>
              Cuentas Inactivas
            </h2>
            <span style={{ 
              fontSize: '0.875rem', 
              color: '#9ca3af',
              fontWeight: '500'
            }}>
              {cuentasInactivas.length} {cuentasInactivas.length === 1 ? 'cuenta' : 'cuentas'}
            </span>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
            gap: '1.5rem',
            opacity: 0.7
          }}>
            {cuentasInactivas.map((cuenta) => (
              <CuentaBancariaCard
                key={cuenta.id}
                cuenta={cuenta}
                onView={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}`)}
                onEdit={() => router.push(`/dashboard/finanzas/bancos/${cuenta.id}/editar`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
