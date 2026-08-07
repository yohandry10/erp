'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

interface IngresosVsGastosChartProps {
  ingresos: number
  costos: number
  gastos: number
}

export function IngresosVsGastosChart({ ingresos, costos, gastos }: IngresosVsGastosChartProps) {
  const { formatCurrency } = useLocalizedMoney()
  const data = [
    {
      name: 'Ingresos',
      value: ingresos,
      color: 'var(--emerald-600)'
    },
    {
      name: 'Costos',
      value: costos,
      color: 'var(--amber-600)'
    },
    {
      name: 'Gastos',
      value: gastos,
      color: 'var(--red-600)'
    }
  ]

  return (
    <div className="w-[100%] h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--primary-200)" />
          <XAxis 
            dataKey="name" 
            tick={{ fill: 'var(--primary-700)', fontSize: 12 }}
          />
          <YAxis 
            tick={{ fill: 'var(--primary-700)', fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(value)}
          />
          <Tooltip 
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid var(--primary-300)',
              borderRadius: '8px',
              padding: '8px 12px'
            }}
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
