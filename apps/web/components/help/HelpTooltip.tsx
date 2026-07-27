'use client'

import { HelpItem, TooltipPosition } from './types'
import { cn } from '@/lib/utils'

interface HelpTooltipContentProps {
  content: HelpItem
  position?: TooltipPosition
}

export function HelpTooltipContent({ content, position = 'top' }: HelpTooltipContentProps) {
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full left-1/2 mb-2 -translate-x-1/2'
      case 'bottom':
        return 'left-1/2 top-full mt-2 -translate-x-1/2'
      case 'left':
        return 'right-full top-1/2 mr-2 -translate-y-1/2'
      case 'right':
        return 'left-full top-1/2 ml-2 -translate-y-1/2'
      default:
        return 'bottom-full left-1/2 mb-2 -translate-x-1/2'
    }
  }

  return (
    <div
      role="tooltip"
      className={cn(
        'help-tooltip-content pointer-events-none invisible absolute z-50 w-64 rounded-lg bg-muted p-3 text-sm text-white opacity-0 shadow-lg transition-all duration-200',
        getPositionClasses(),
      )}
    >
      <p className="m-0 mb-1 font-semibold text-white">
        {content.title}
      </p>
      <p className="m-0 text-xs leading-5 text-muted-foreground">
        {content.description}
      </p>
      {content.tips && content.tips.length > 0 && (
        <ul className="mt-2 list-none space-y-1 pl-0">
          {content.tips.map((tip, index) => (
            <li key={index} className="flex items-start gap-1 text-xs text-muted-foreground">
              <span className="mt-0.5 text-blue-400">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
