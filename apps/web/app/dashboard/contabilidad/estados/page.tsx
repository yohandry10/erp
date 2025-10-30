'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BalanceComprobacion } from '@/components/contabilidad/BalanceComprobacion'
import { EstadoResultados } from '@/components/contabilidad/EstadoResultados'
import { BalanceGeneral } from '@/components/contabilidad/BalanceGeneral'
import { FileText, Calendar, RefreshCw } from 'lucide-react'

export default function EstadosFinancierosPage() {
  const { get } = useApi()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('balance-comprobacion')
  
  // Selector de período
  const currentDate = new Date()
  const [anio, setAnio] = useState(currentDate.getFullYear())
  const [mes, setMes] = useState(currentDate.getMonth() + 1)
  
  // Comparación con período anterior
  const [showComparison, setShowComparison] = useState(false)

  // Generar años disponibles (últimos 5 años + próximo año)
  const years = Array.from({ length: 7 }, (_, i) => currentDate.getFullYear() - 5 + i)
  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ]

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await get(`/api/contabilidad/estados/refrescar?anio=${anio}&mes=${mes}`)
      // Trigger reload in child components by changing key
      window.location.reload()
    } catch (error) {
      console.error('Error refrescando estados financieros:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--primary-100)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-600)'
            }}>
              <FileText size={24} />
            </div>
            <h1 className="dashboard-title">Estados Financieros</h1>
          </div>
          <p className="dashboard-subtitle">
            Balance de Comprobación, Estado de Resultados y Balance General
          </p>
        </div>
      </div>

      {/* Selector de Período */}
      <div className="activity-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Calendar size={20} style={{ color: 'var(--primary-600)' }} />
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-800)', margin: 0 }}>
              Seleccionar Período
            </h2>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.75rem', 
                fontWeight: '600', 
                marginBottom: '0.5rem',
                color: 'var(--primary-700)'
              }}>
                Año
              </label>
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                style={{
                  padding: '0.75rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  background: 'white',
                  minWidth: '120px'
                }}
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '0.75rem', 
                fontWeight: '600', 
                marginBottom: '0.5rem',
                color: 'var(--primary-700)'
              }}>
                Mes
              </label>
              <select
                value={mes}
                onChange={(e) => setMes(Number(e.target.value))}
                style={{
                  padding: '0.75rem',
                  border: '1px solid var(--primary-300)',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  background: 'white',
                  minWidth: '150px'
                }}
              >
                {months.map(month => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </div>

            <div style={{ paddingTop: '1.5rem' }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                color: 'var(--primary-700)'
              }}>
                <input
                  type="checkbox"
                  checked={showComparison}
                  onChange={(e) => setShowComparison(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer'
                  }}
                />
                Comparar con período anterior
              </label>
            </div>

            <div style={{ paddingTop: '1.5rem' }}>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="refresh-btn"
                style={{ padding: '0.75rem 1.5rem' }}
              >
                <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                {loading ? 'Refrescando...' : 'Refrescar Vistas'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="balance-comprobacion">
            Balance de Comprobación
          </TabsTrigger>
          <TabsTrigger value="estado-resultados">
            Estado de Resultados
          </TabsTrigger>
          <TabsTrigger value="balance-general">
            Balance General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="balance-comprobacion">
          <BalanceComprobacion anio={anio} mes={mes} showComparison={showComparison} />
        </TabsContent>

        <TabsContent value="estado-resultados">
          <EstadoResultados anio={anio} mes={mes} showComparison={showComparison} />
        </TabsContent>

        <TabsContent value="balance-general">
          <BalanceGeneral anio={anio} mes={mes} showComparison={showComparison} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
