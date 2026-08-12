// Componentes Tooltips
export { HelpIcon } from './HelpIcon'
export { FieldHelp } from './FieldHelp'
export { HelpTooltipContent } from './HelpTooltip'

// Centro de ayuda contextual (botón flotante + panel navegable, sin chat)
export { CentroAyuda } from './panel'
export type { TemaAyuda } from './panel'

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
export { getGuiaPorRuta, guias, agruparGuias } from './module-guide'
export { CatalogoModulos } from './module-guide/CatalogoModulos'
export type { GuiaModulo, GrupoGuias } from './module-guide'
