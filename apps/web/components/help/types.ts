'use client'

export interface HelpItem {
  key: string
  title: string
  description: string
  tips?: string[]
  link?: string
}

export type HelpModule = 
  | 'pos' 
  | 'ventas' 
  | 'inventario' 
  | 'finanzas' 
  | 'compras' 
  | 'configuracion'
  | 'contabilidad'
  | 'rrhh'

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export interface HelpIconProps {
  helpKey: string
  position?: TooltipPosition
  className?: string
}

export interface FieldHelpProps {
  helpKey: string
  position?: TooltipPosition
  children: React.ReactNode
}

export interface HelpTooltipProps {
  content: HelpItem | null
  position?: TooltipPosition
  visible: boolean
  targetRect?: DOMRect | null
}
