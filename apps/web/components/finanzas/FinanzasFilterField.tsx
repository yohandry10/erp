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
    <div style={{ flex: 1, minWidth }}>
      <label style={{ 
        display: 'block', 
        fontSize: '0.875rem', 
        fontWeight: '500', 
        marginBottom: '0.5rem', 
        color: '#374151' 
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
