'use client'

import { HelpCircle } from 'lucide-react'

interface HelpBotTriggerProps {
  onClick: () => void
  isOpen: boolean
}

export function HelpBotTrigger({ onClick, isOpen }: HelpBotTriggerProps) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Cerrar ayuda' : 'Abrir ayuda'}
      aria-expanded={isOpen}
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        backgroundColor: '#2563eb',
        color: 'white',
        border: 'none',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8'
        ;(e.currentTarget as HTMLElement).style.transform = isOpen ? 'rotate(45deg) scale(1.05)' : 'scale(1.05)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb'
        ;(e.currentTarget as HTMLElement).style.transform = isOpen ? 'rotate(45deg)' : 'rotate(0deg)'
      }}
    >
      <HelpCircle style={{ width: '24px', height: '24px' }} />
    </button>
  )
}
