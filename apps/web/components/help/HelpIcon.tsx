'use client'

import { HelpCircle } from 'lucide-react'
import { HelpTooltipContent } from './HelpTooltip'
import { getHelpItem } from './help-data'
import { HelpIconProps } from './types'
import { cn } from '@/lib/utils'

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
      className={cn('help-icon-wrapper relative inline-flex cursor-help', className)}
      aria-label={`Ayuda: ${helpItem.title}`}
    >
      <HelpCircle
        className="h-4 w-4 text-slate-400 transition hover:text-blue-500"
        aria-hidden="true"
      />
      <HelpTooltipContent content={helpItem} position={position} />
    </span>
  )
}
