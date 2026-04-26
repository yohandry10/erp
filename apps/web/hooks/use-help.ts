'use client'

import { useCallback, useMemo } from 'react'
import { getHelpItem, getHelpByModule } from '@/components/help/help-data'
import type { HelpItem, HelpModule } from '@/components/help/types'

interface UseHelpReturn {
  getHelp: (key: string) => HelpItem | null
  getModuleHelp: (module: HelpModule) => HelpItem[]
  hasHelp: (key: string) => boolean
}

export function useHelp(): UseHelpReturn {
  const getHelp = useCallback((key: string): HelpItem | null => {
    return getHelpItem(key)
  }, [])

  const getModuleHelp = useCallback((module: HelpModule): HelpItem[] => {
    return getHelpByModule(module)
  }, [])

  const hasHelp = useCallback((key: string): boolean => {
    return getHelpItem(key) !== null
  }, [])

  return useMemo(() => ({
    getHelp,
    getModuleHelp,
    hasHelp,
  }), [getHelp, getModuleHelp, hasHelp])
}
