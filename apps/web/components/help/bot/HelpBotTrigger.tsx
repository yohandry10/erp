'use client'

import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
      className={cn(
        'fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border-0 bg-blue-600 text-white shadow-lg transition duration-200 hover:scale-105 hover:bg-blue-700',
        isOpen && 'rotate-45 hover:rotate-45',
      )}
    >
      <HelpCircle className="h-6 w-6" />
    </button>
  )
}
