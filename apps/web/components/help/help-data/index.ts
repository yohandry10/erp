import { HelpItem } from '../types'
import { posHelp } from './pos'
import { ventasHelp } from './ventas'
import { inventarioHelp } from './inventario'
import { finanzasHelp } from './finanzas'
import { configuracionHelp } from './configuracion'

const allHelp: Record<string, HelpItem> = {
  ...posHelp,
  ...ventasHelp,
  ...inventarioHelp,
  ...finanzasHelp,
  ...configuracionHelp,
}

export function getHelpItem(key: string): HelpItem | null {
  return allHelp[key] || null
}

export function getHelpByModule(module: string): HelpItem[] {
  return Object.values(allHelp).filter(item => item.key.startsWith(`${module}.`))
}

export { posHelp, ventasHelp, inventarioHelp, finanzasHelp, configuracionHelp }
