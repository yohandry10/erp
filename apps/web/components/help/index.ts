// Componentes Tooltips
export { HelpIcon } from './HelpIcon'
export { FieldHelp } from './FieldHelp'
export { HelpTooltipContent } from './HelpTooltip'

// Componentes Bot
export { HelpBot } from './bot'

// Tipos
export type { 
  HelpItem, 
  HelpModule, 
  TooltipPosition,
  HelpIconProps,
  FieldHelpProps 
} from './types'

// Datos
export { getHelpItem, getHelpByModule } from './help-data'

// Ficha por pantalla ("¿Qué hace esta pantalla?")
export { GuiaDeModulo, getGuiaPorRuta, guias } from './module-guide'
export type { GuiaModulo } from './module-guide'
