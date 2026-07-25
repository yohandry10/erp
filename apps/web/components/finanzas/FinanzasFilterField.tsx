'use client'

import { ReactNode } from 'react'

interface FinanzasFilterFieldProps {
  label: string
  children: ReactNode
  minWidth?: string
}

/**
 * Componente de campo de filtro consistente
 * Proporciona estructura uniforme para inputs de filtro
 */
export default function FinanzasFilterField({
  label,
  children,
  minWidth = '200px'
}: FinanzasFilterFieldProps) {
  return (
    <div className="flex-[1]">
      <label className="block text-[0.875rem] font-medium mb-2 text-foreground/85">
        {label}
      </label>
      {children}
    </div>
  )
}
