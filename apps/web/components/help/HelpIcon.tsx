'use client'

import { HelpCircle } from 'lucide-react'
import { HelpTooltipContent } from './HelpTooltip'
import { getHelpItem } from './help-data'
import { HelpIconProps } from './types'

export function HelpIcon({ helpKey, position = 'top', className }: HelpIconProps) {
  const helpItem = getHelpItem(helpKey)

  if (!helpItem) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[HelpIcon] No help found for key: ${helpKey}`)
    }
    return null
  }

  return (
    <span
      className="help-icon-wrapper"
      style={{
        position: 'relative',
        display: 'inline-flex',
        cursor: 'help',
      }}
      aria-label={`Ayuda: ${helpItem.title}`}
    >
      <HelpCircle
        style={{
          width: '16px',
          height: '16px',
          color: '#94a3b8',
          transition: 'color 0.2s',
        }}
        aria-hidden="true"
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.color = '#3b82f6'
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.color = '#94a3b8'
        }}
      />
      <HelpTooltipContent content={helpItem} position={position} />
    </span>
  )
}
