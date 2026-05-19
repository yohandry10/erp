'use client'

import { HelpTooltipContent } from './HelpTooltip'
import { getHelpItem } from './help-data'
import { FieldHelpProps } from './types'

export function FieldHelp({ helpKey, position = 'right', children }: FieldHelpProps) {
  const helpItem = getHelpItem(helpKey)

  if (!helpItem) {
    return <>{children}</>
  }

  return (
    <div className="help-icon-wrapper relative inline-block w-full">
      {children}
      <HelpTooltipContent content={helpItem} position={position} />
    </div>
  )
}
