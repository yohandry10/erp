'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

interface ActivosVsPasivosChartProps {
  activos: number
  pasivos: number
  patrimonio: number
}

export function ActivosVsPasivosChart({ activos, pasivos, patrimonio }: ActivosVsPasivosChartProps) {
  const { formatCurrency } = useLocalizedMoney()
  const data = [
    {
      name: 'Activos',
      value: activos,
      color: 'var(--emerald-600)'
    },
    {
      name: 'Pasivos',
      value: pasivos,
      color: 'var(--red-600)'
    },
    {
      name: 'Patrimonio',
      value: patrimonio,
      color: 'var(--blue-600)'
    }
  ]

  const renderCustomLabel = (entry: any) => {
    const percent = ((entry.value / (activos + pasivos + patrimonio)) * 100).toFixed(1)
    return `${percent}%`
  }

  return (
    <div className="w-[100%] h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid var(--primary-300)',
              borderRadius: '8px',
              padding: '8px 12px'
            }}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value, entry: any) => {
              return `${value}: ${formatCurrency(entry.payload.value)}`
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
