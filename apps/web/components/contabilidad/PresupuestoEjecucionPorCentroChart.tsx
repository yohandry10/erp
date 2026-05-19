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
        <div className="bg-white border rounded-2 p-3 shadow">
          <p className="mt-0 mr-0 mb-2 ml-0 font-semibold text-gray-900 text-[0.875rem]">
            {data.nombreCompleto}
          </p>
          <div className="flex flex-col gap-[4px] text-3">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Presupuestado:</span>
              <span className="font-semibold text-gray-900">{formatCurrency(data.presupuestado)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Ejecutado:</span>
              <span className="font-semibold text-gray-900">{formatCurrency(data.ejecutado)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Disponible:</span>
              <span className="font-semibold">
                {formatCurrency(data.disponible)}
              </span>
            </div>
            <div className="mt-[4px] pt-[4px] border-t flex justify-between gap-4">
              <span className="text-gray-500">% Ejecución:</span>
              <span className="font-bold">
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
      <div className="p-12 bg-[#f9fafb] rounded-3 text-center text-gray-500">
        <p className="m-0">No hay datos disponibles para mostrar</p>
      </div>
    )
  }

  return (
    <div className="w-[100%] h-[400px]">
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
