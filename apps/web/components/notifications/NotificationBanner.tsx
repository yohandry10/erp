'use client'

import { useState } from 'react'
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface BannerNotification {
  id: string
  type: 'certificate_expiring' | 'certificate_expired' | 'configuration_incomplete' | 'validation_error'
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
  actionUrl?: string
  actionLabel?: string
  dismissible?: boolean
  persistent?: boolean
}

interface NotificationBannerProps {
  notification: BannerNotification
  onDismiss?: (id: string) => void
}

const bannerConfig = {
  info: {
    icon: Info,
    className: 'border-cyan-300/20 bg-cyan-400/10 text-primary',
    iconClassName: 'border-cyan-300/20 bg-cyan-300/10 text-primary',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-blue-300/20 bg-blue-400/10 text-primary dark:text-blue-200',
    iconClassName: 'border-blue-300/20 bg-blue-300/10 text-primary dark:text-blue-200',
  },
  error: {
    icon: AlertCircle,
    className: 'border-cyan-200/25 bg-card text-primary',
    iconClassName: 'border-cyan-200/20 bg-cyan-200/10 text-primary',
  },
}

function readDismissedBanners() {
  if (typeof window === 'undefined') return []

  try {
    const value = window.localStorage.getItem('dismissedBanners')
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

export function NotificationBanner({ notification, onDismiss }: NotificationBannerProps) {
  const router = useRouter()
  const [isDismissed, setIsDismissed] = useState(false)
  const config = bannerConfig[notification.severity] ?? bannerConfig.info
  const Icon = config.icon

  if (isDismissed) return null

  const handleDismiss = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    setIsDismissed(true)

    if (notification.persistent && typeof window !== 'undefined') {
      const dismissedBanners = readDismissedBanners()
      dismissedBanners.push({ id: notification.id, dismissedAt: new Date().toISOString() })
      window.localStorage.setItem('dismissedBanners', JSON.stringify(dismissedBanners))
    }

    window.setTimeout(() => onDismiss?.(notification.id), 100)
  }

  return (
    <div className={cn('mb-4 rounded-2xl border p-4 shadow-lg shadow-blue-950/15', config.className)}>
      <div className="flex items-start gap-4">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl border', config.iconClassName)}>
          <Icon className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-white">{notification.title}</h4>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{notification.message}</p>

          {notification.actionUrl && notification.actionLabel && (
            <Button
              type="button"
              size="sm"
              onClick={() => router.push(notification.actionUrl!)}
              className="mt-3 bg-cyan-400 text-foreground hover:bg-cyan-300"
            >
              {notification.actionLabel}
            </Button>
          )}
        </div>

        {notification.dismissible && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cerrar notificación"
            onClick={handleDismiss}
            className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-cyan-400/10 hover:text-primary"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
