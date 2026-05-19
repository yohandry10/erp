'use client'

import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type DashboardThemeToggleProps = {
  theme: 'dark' | 'light'
  onToggle: () => void
  className?: string
}

export function DashboardThemeToggle({ theme, onToggle, className }: DashboardThemeToggleProps) {
  const isDark = theme === 'dark'

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onToggle}
      className={cn(
        'fixed right-5 top-5 z-50 gap-2 border-cyan-400/25 bg-slate-950/85 text-cyan-50 shadow-xl shadow-blue-950/25 backdrop-blur hover:bg-slate-900 hover:text-white',
        !isDark && 'border-blue-200 bg-white/90 text-blue-800 shadow-slate-300/40 hover:bg-slate-50 hover:text-blue-950',
        className,
      )}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {isDark ? 'Light' : 'Dark'}
    </Button>
  )
}
