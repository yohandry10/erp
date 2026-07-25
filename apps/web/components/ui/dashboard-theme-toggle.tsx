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
        'h-11 shrink-0 gap-2 rounded-xl border-border/80 bg-card text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{isDark ? 'Claro' : 'Oscuro'}</span>
    </Button>
  )
}
