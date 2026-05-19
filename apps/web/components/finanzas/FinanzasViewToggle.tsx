'use client'

import { LucideIcon } from 'lucide-react'

interface ViewOption {
  value: string
  label: string
  icon: LucideIcon
}

interface FinanzasViewToggleProps {
  options: ViewOption[]
  value: string
  onChange: (value: string) => void
}

/**
 * Componente de toggle de vista consistente para Finanzas
 * Proporciona cambio uniforme entre diferentes vistas (lista, gráfico, etc.)
 */
export default function FinanzasViewToggle({
  options,
  value,
  onChange
}: FinanzasViewToggleProps) {
  return (
    <div className="flex gap-2 bg-[#f3f4f6] p-1 rounded-2">
      {options.map((option) => {
        const Icon = option.icon
        const isActive = value === option.value

        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)} className="py-2 px-4 rounded-[6px] border-0 cursor-pointer text-[0.875rem] font-semibold flex items-center gap-2 transition"
          >
            <Icon size={16} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
