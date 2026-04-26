'use client'

import { LucideIcon } from 'lucide-react'

interface FinanzasActionButtonProps {
  label: string
  onClick: () => void
  icon?: LucideIcon
  variant?: 'primary' | 'secondary' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

/**
 * Componente de botón de acción consistente para Finanzas
 * Proporciona botones uniformes con variantes y tamaños
 */
export default function FinanzasActionButton({
  label,
  onClick,
  icon: Icon,
  variant = 'primary',
  size = 'md',
  disabled = false
}: FinanzasActionButtonProps) {
  const variants: Record<
    NonNullable<FinanzasActionButtonProps['variant']>,
    { background: string; hoverBackground: string; color: string; border?: string }
  > = {
    primary: {
      background: '#3b82f6',
      hoverBackground: '#2563eb',
      color: 'white'
    },
    secondary: {
      background: 'white',
      hoverBackground: '#f3f4f6',
      color: '#374151',
      border: '1px solid #d1d5db'
    },
    danger: {
      background: '#ef4444',
      hoverBackground: '#dc2626',
      color: 'white'
    },
    success: {
      background: '#10b981',
      hoverBackground: '#059669',
      color: 'white'
    }
  }

  const sizes = {
    sm: {
      padding: '0.5rem 1rem',
      fontSize: '0.75rem'
    },
    md: {
      padding: '0.75rem 1.5rem',
      fontSize: '0.875rem'
    },
    lg: {
      padding: '1rem 2rem',
      fontSize: '1rem'
    }
  }

  const variantStyle = variants[variant]
  const sizeStyle = sizes[size]

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizeStyle,
        borderRadius: '8px',
        border: variantStyle.border || 'none',
        background: variantStyle.background,
        color: variantStyle.color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap'
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = variantStyle.hoverBackground
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = variantStyle.background
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
      {label}
    </button>
  )
}
