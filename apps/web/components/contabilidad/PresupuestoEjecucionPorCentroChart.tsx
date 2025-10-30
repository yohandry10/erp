'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { getEjecucionColor } from './PresupuestoEjecucionIndicator'

interface CentroEjecucion {
  centro_costo: {
    id: string
    codigo: string
    nombre: string
  }
  totales: {
    presupuestado: number
    ejecutado: number
    disponible: number
    porcentaje_ejecucion: number
  }
}

interface PresupuestoEjecucionPorCentroChartProps {
  centros: CentroEjecucion[]
}

export default function PresupuestoEjecucionPorCentroChart({ centros }: PresupuestoEjecucionPorCentroChartProps) {
  // Prepare data for the chart
  const chartData = centros.map(centro => ({
    nombre: centro.centro_costo.codigo,
    nombreCompleto: `${centro.centro_costo.codigo} - ${centro.centro_costo.nombre}`,
    presupuestado: centro.totales.presupuestado,
    ejecutado: centro.totales.ejecutado,
    disponible: centro.totales.disponible,
    porcentaje: centro.totales.porcentaje_ejecucion,
    color: getEjecucionColor(centro.totales.porcentaje_ejecucion)
  }))

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <p style={{ 
            margin: '0 0 8px 0', 
            fontWeight: '600', 
            color: '#111827',
            fontSize: '0.875rem'
          }}>
            {data.nombreCompleto}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>Presupuestado:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(data.presupuestado)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>Ejecutado:</span>
              <span style={{ fontWeight: '600', color: '#111827' }}>{formatCurrency(data.ejecutado)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ color: '#6b7280' }}>Disponible:</span>
              <span style={{ 
                fontWeight: '600', 
                color: data.disponible < 0 ? '#ef4444' : '#10b981' 
              }}>
                {formatCurrency(data.disponible)}
              </span>
            </div>
            <div style={{ 
              marginTop: '4px', 
              paddingTop: '4px', 
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px'
            }}>
              <span style={{ color: '#6b7280' }}>% Ejecución:</span>
              <span style={{ 
                fontWeight: '700', 
                color: data.color 
              }}>
                {formatPercentage(data.porcentaje)}
              </span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  if (centros.length === 0) {
    return (
      <div style={{
        padding: '3rem',
        background: '#f9fafb',
        borderRadius: '12px',
        textAlign: 'center',
        color: '#6b7280'
      }}>
        <p style={{ margin: 0 }}>No hay datos disponibles para mostrar</p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '400px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="nombre"
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fill: '#6b7280', fontSize: 11 }}
          />
          <YAxis 
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={formatCurrency}
            label={{ 
              value: 'Monto (PEN)', 
              angle: -90, 
              position: 'insideLeft',
              style: { fill: '#6b7280', fontSize: 12 }
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="rect"
          />
          <Bar 
            dataKey="presupuestado" 
            name="Presupuestado"
            fill="#3b82f6" 
            radius={[4, 4, 0, 0]}
          />
          <Bar 
            dataKey="ejecutado" 
            name="Ejecutado"
            radius={[4, 4, 0, 0]}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
