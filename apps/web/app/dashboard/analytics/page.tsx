'use client'

import { useState, useEffect } from 'react'
import { useApiCall } from '@/hooks/use-api'

// Componente simple para gráfico de barras
const BarChart = ({ data, title, color = '#3b82f6' }: { data: any, title: string, color?: string }) => {
  if (!data?.labels?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        Sin datos para mostrar
      </div>
    )
  }

  const maxValue = Math.max(...data.data)
  
  return (
    <div>
      <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#1f2937' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'end', gap: '8px', height: '200px', padding: '1rem' }}>
        {data.labels.map((label: string, index: number) => {
          const height = (data.data[index] / maxValue) * 160
          return (
            <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: '100%',
                  height: `${height}px`,
                  backgroundColor: color,
                  borderRadius: '4px 4px 0 0',
                  display: 'flex',
                  alignItems: 'end',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  paddingBottom: '4px',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                title={`${label}: ${data.data[index].toLocaleString()}`}
              >
                {height > 30 ? data.data[index].toLocaleString() : ''}
              </div>
              <div style={{ 
                fontSize: '0.7rem', 
                color: '#6b7280', 
                marginTop: '8px', 
                textAlign: 'center',
                transform: 'rotate(-45deg)',
                transformOrigin: 'center',
                whiteSpace: 'nowrap'
              }}>
                {label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Componente simple para gráfico de pastel
const PieChart = ({ data, title }: { data: any, title: string }) => {
  if (!data?.labels?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        Sin datos para mostrar
      </div>
    )
  }

  const total = data.data.reduce((sum: number, value: number) => sum + value, 0)
  let currentAngle = 0
  
  return (
    <div>
      <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#1f2937' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <div style={{ position: 'relative', width: '200px', height: '200px' }}>
          <svg width="200" height="200" style={{ transform: 'rotate(-90deg)' }}>
            {data.labels.map((label: string, index: number) => {
              const percentage = (data.data[index] / total) * 100
              const angle = (data.data[index] / total) * 360
              const radius = 80
              const centerX = 100
              const centerY = 100
              
              const x1 = centerX + radius * Math.cos((currentAngle * Math.PI) / 180)
              const y1 = centerY + radius * Math.sin((currentAngle * Math.PI) / 180)
              const x2 = centerX + radius * Math.cos(((currentAngle + angle) * Math.PI) / 180)
              const y2 = centerY + radius * Math.sin(((currentAngle + angle) * Math.PI) / 180)
              
              const largeArcFlag = angle > 180 ? 1 : 0
              
              const pathData = [
                `M ${centerX} ${centerY}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                'Z'
              ].join(' ')
              
              const color = data.backgroundColor[index] || `hsl(${(index * 137.5) % 360}, 70%, 60%)`
              
              currentAngle += angle
              
              return (
                <path
                  key={index}
                  d={pathData}
                  fill={color}
                  stroke="white"
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                >
                  <title>{`${label}: ${percentage.toFixed(1)}%`}</title>
                </path>
              )
            })}
          </svg>
        </div>
        
        <div style={{ flex: 1 }}>
          {data.labels.map((label: string, index: number) => {
            const percentage = ((data.data[index] / total) * 100).toFixed(1)
            const color = data.backgroundColor[index] || `hsl(${(index * 137.5) % 360}, 70%, 60%)`
            
            return (
              <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div 
                  style={{ 
                    width: '16px', 
                    height: '16px', 
                    backgroundColor: color, 
                    marginRight: '0.75rem',
                    borderRadius: '2px'
                  }} 
                />
                <span style={{ fontSize: '0.9rem', color: '#374151' }}>
                  {label}: {percentage}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Componente para KPI visual
const KPIGauge = ({ data, title }: { data: any, title: string }) => {
  // Verificación de seguridad para datos
  if (!data || typeof data.valor === 'undefined' || typeof data.objetivo === 'undefined') {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '1.5rem',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}>
        <h4 style={{ marginBottom: '1rem', color: '#1f2937' }}>{title}</h4>
        <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
          Sin datos disponibles
        </div>
      </div>
    )
  }

  const percentage = Math.min((data.valor / data.objetivo) * 100, 100)
  const color = percentage >= 80 ? '#10b981' : percentage >= 60 ? '#f59e0b' : '#ef4444'
  
  return (
    <div style={{ 
      textAlign: 'center', 
      padding: '1.5rem',
      backgroundColor: '#f8fafc',
      borderRadius: '8px',
      border: '1px solid #e2e8f0'
    }}>
      <h4 style={{ marginBottom: '1rem', color: '#1f2937' }}>{title}</h4>
      <div style={{ position: 'relative', width: '120px', height: '60px', margin: '0 auto 1rem' }}>
        <svg width="120" height="60" style={{ overflow: 'visible' }}>
          {/* Fondo del gauge */}
          <path
            d="M 10 50 A 50 50 0 0 1 110 50"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progreso del gauge */}
          <path
            d="M 10 50 A 50 50 0 0 1 110 50"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${(percentage / 100) * 157} 157`}
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div style={{ 
          position: 'absolute', 
          bottom: '10px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          fontSize: '1.2rem',
          fontWeight: '700',
          color: color
        }}>
          {data.valor.toFixed(1)}
        </div>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
        Objetivo: {data.objetivo} | Estado: {data.estado || 'N/A'}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [ventasTiempo, setVentasTiempo] = useState(null)
  const [deudasClientes, setDeudasClientes] = useState(null)
  const [deudasProveedores, setDeudasProveedores] = useState(null)
  const [ventasCategoria, setVentasCategoria] = useState(null)
  const [kpisVisuales, setKpisVisuales] = useState(null)
  const [periodo, setPeriodo] = useState('mensual')

  const api = useApiCall()

  useEffect(() => {
    cargarDatos()
  }, [periodo])

  const cargarDatos = async () => {
    try {
      console.log('📊 Cargando datos de analytics...')
      
      const [
        ventasResponse,
        deudasClientesResponse,
        deudasProveedoresResponse,
        ventasCategoriaResponse,
        kpisResponse
      ] = await Promise.all([
        api.get(`/api/analytics/ventas-tiempo?periodo=${periodo}`),
        api.get('/api/analytics/deudas-clientes'),
        api.get('/api/analytics/deudas-proveedores'),
        api.get('/api/analytics/ventas-categoria'),
        api.get('/api/analytics/kpis-visuales')
      ])

      // Procesar respuestas con verificación de éxito
      if (ventasResponse && ventasResponse.success && ventasResponse.data) {
        console.log('📈 Datos de ventas cargados:', ventasResponse.data)
        setVentasTiempo(ventasResponse.data)
      } else {
        console.log('❌ No se pudieron cargar datos de ventas')
        setVentasTiempo(null)
      }

      if (deudasClientesResponse && deudasClientesResponse.success && deudasClientesResponse.data) {
        console.log('👥 Datos de deudas clientes cargados:', deudasClientesResponse.data)
        setDeudasClientes(deudasClientesResponse.data)
      } else {
        console.log('❌ No se pudieron cargar datos de deudas clientes')
        setDeudasClientes(null)
      }

      if (deudasProveedoresResponse && deudasProveedoresResponse.success && deudasProveedoresResponse.data) {
        console.log('🏪 Datos de deudas proveedores cargados:', deudasProveedoresResponse.data)
        setDeudasProveedores(deudasProveedoresResponse.data)
      } else {
        console.log('❌ No se pudieron cargar datos de deudas proveedores')
        setDeudasProveedores(null)
      }

      if (ventasCategoriaResponse && ventasCategoriaResponse.success && ventasCategoriaResponse.data) {
        console.log('🏷️ Datos de ventas por categoría cargados:', ventasCategoriaResponse.data)
        setVentasCategoria(ventasCategoriaResponse.data)
      } else {
        console.log('❌ No se pudieron cargar datos de ventas por categoría')
        setVentasCategoria(null)
      }

      if (kpisResponse && kpisResponse.success && kpisResponse.data) {
        console.log('🎯 Datos de KPIs cargados:', kpisResponse.data)
        setKpisVisuales(kpisResponse.data)
      } else {
        console.log('❌ No se pudieron cargar datos de KPIs')
        setKpisVisuales(null)
      }

    } catch (error) {
      console.error('💥 Error cargando datos de analytics:', error)
    }
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">📈 Analytics Financiero</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            value={periodo} 
            onChange={(e) => setPeriodo(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db'
            }}
          >
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>

      {/* KPIs Visuales */}
      {kpisVisuales && (
        <div className="activity-card" style={{ marginBottom: '2rem' }}>
          <h2 style={{ marginBottom: '2rem' }}>🎯 Indicadores Clave de Rendimiento</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <KPIGauge data={kpisVisuales?.liquidez} title="💧 Liquidez" />
            <KPIGauge data={kpisVisuales?.rentabilidad} title="📈 Rentabilidad" />
            <KPIGauge data={kpisVisuales?.crecimiento} title="🚀 Crecimiento" />
            <div style={{ 
              textAlign: 'center', 
              padding: '1.5rem', 
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <h4 style={{ marginBottom: '1rem', color: '#1f2937' }}>⚡ Eficiencia</h4>
              {kpisVisuales?.eficiencia?.rotacionInventario !== undefined ? (
                <>
                  <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.5rem' }}>
                    {kpisVisuales.eficiencia.rotacionInventario.toFixed(1)}x
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Rotación de Inventario
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
                  Sin datos de rotación
                </div>
              )}
              
              {kpisVisuales?.eficiencia?.cicloEfectivo !== undefined ? (
                <>
                  <div style={{ fontSize: '1rem', fontWeight: '600', color: '#10b981', marginTop: '0.5rem' }}>
                    {kpisVisuales.eficiencia.cicloEfectivo.toFixed(0)} días
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Ciclo de Efectivo
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Sin datos de ciclo
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {/* Ventas en el Tiempo */}
        <div className="activity-card">
          <BarChart 
            data={ventasTiempo ? {
              labels: ventasTiempo.labels,
              data: ventasTiempo.datasets?.[0]?.data || []
            } : null} 
            title="📊 Evolución de Ventas" 
            color="#3b82f6"
          />
          {ventasTiempo?.totales && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Ventas Actuales:</span>
                <span style={{ fontWeight: '600', color: '#3b82f6' }}>
                  S/ {ventasTiempo.totales.ventasActuales.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                <span>Crecimiento:</span>
                <span style={{ 
                  fontWeight: '600', 
                  color: ventasTiempo.totales.crecimiento.includes('-') ? '#ef4444' : '#10b981' 
                }}>
                  {ventasTiempo.totales.crecimiento}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Ventas por Categoría */}
        <div className="activity-card">
          <PieChart 
            data={ventasCategoria?.graficoPie} 
            title="🏷️ Ventas por Categoría" 
          />
        </div>

        {/* Deudas de Clientes */}
        <div className="activity-card">
          <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#1f2937' }}>
            👥 Análisis de Cuentas por Cobrar
          </h3>
          {deudasClientes?.graficoEdadSaldos && (
            <BarChart 
              data={{
                labels: deudasClientes.graficoEdadSaldos.labels || [],
                data: deudasClientes.graficoEdadSaldos.data || []
              }}
              title="" 
              color="#10b981"
            />
          )}
          {deudasClientes?.totales && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#ecfdf5', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Total por Cobrar:</span>
                <span style={{ fontWeight: '600', color: '#10b981' }}>
                  S/ {deudasClientes.totales.totalPorCobrar.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                <span>Vencido:</span>
                <span style={{ fontWeight: '600', color: '#ef4444' }}>
                  S/ {deudasClientes.totales.vencido.toLocaleString()} 
                  ({deudasClientes.totales.porcentajeVencido.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Deudas a Proveedores */}
        <div className="activity-card">
          <h3 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#1f2937' }}>
            🏪 Análisis de Cuentas por Pagar
          </h3>
          {deudasProveedores?.graficoEdadSaldos && (
            <BarChart 
              data={{
                labels: deudasProveedores.graficoEdadSaldos.labels || [],
                data: deudasProveedores.graficoEdadSaldos.data || []
              }}
              title="" 
              color="#ef4444"
            />
          )}
          {deudasProveedores?.totales && (
            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fef2f2', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Total por Pagar:</span>
                <span style={{ fontWeight: '600', color: '#ef4444' }}>
                  S/ {deudasProveedores.totales.totalPorPagar.toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                <span>Vencido:</span>
                <span style={{ fontWeight: '600', color: '#7f1d1d' }}>
                  S/ {deudasProveedores.totales.vencido.toLocaleString()} 
                  ({deudasProveedores.totales.porcentajeVencido.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Análisis Explicativo */}
      <div className="activity-card" style={{ marginTop: '2rem' }}>
        <h2 style={{ marginBottom: '2rem' }}>🧠 Análisis Inteligente para Empresarios</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          <div style={{ padding: '1.5rem', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #0ea5e9' }}>
            <h3 style={{ color: '#0c4a6e', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
              💡 ¿Qué significan estos números?
            </h3>
            <ul style={{ color: '#075985', fontSize: '0.9rem', lineHeight: '1.6' }}>
              <li><strong>Liquidez:</strong> Tu capacidad de pagar deudas inmediatas</li>
              <li><strong>Cuentas por Cobrar:</strong> Dinero que te deben los clientes</li>
              <li><strong>Cuentas por Pagar:</strong> Dinero que debes a proveedores</li>
              <li><strong>Ciclo de Efectivo:</strong> Tiempo para convertir inventario en dinero</li>
            </ul>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #10b981' }}>
            <h3 style={{ color: '#065f46', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
              📈 Recomendaciones de Mejora
            </h3>
            <ul style={{ color: '#047857', fontSize: '0.9rem', lineHeight: '1.6' }}>
              <li>Mantén al menos 3 meses de gastos en efectivo</li>
              <li>Cobra a clientes en máximo 30 días</li>
              <li>Rota inventario al menos 6 veces al año</li>
              <li>Mantén margen de utilidad sobre 15%</li>
            </ul>
          </div>

          <div style={{ padding: '1.5rem', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #f59e0b' }}>
            <h3 style={{ color: '#92400e', marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
              ⚠️ Señales de Alerta
            </h3>
            <ul style={{ color: '#b45309', fontSize: '0.9rem', lineHeight: '1.6' }}>
              <li>Liquidez por debajo de 1.0 (crítico)</li>
              <li>Más del 20% de cuentas vencidas</li>
              <li>Inventario sin movimiento mayor a 90 días</li>
              <li>Gastos mayores a ingresos por 2+ meses</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}