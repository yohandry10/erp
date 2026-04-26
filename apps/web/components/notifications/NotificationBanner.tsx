'use client'

import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

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
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-900',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-900',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    textColor: 'text-red-900',
  },
}

export function NotificationBanner({ notification, onDismiss }: NotificationBannerProps) {
  const router = useRouter()
  const [isDismissed, setIsDismissed] = useState(false)
  const config = bannerConfig[notification.severity]
  const Icon = config.icon

  if (isDismissed) {
    return null
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    setIsDismissed(true)
    
    // If persistent, store dismissal in localStorage
    if (notification.persistent) {
      const dismissedBanners = JSON.parse(
        localStorage.getItem('dismissedBanners') || '[]'
      )
      dismissedBanners.push({
        id: notification.id,
        dismissedAt: new Date().toISOString(),
      })
      localStorage.setItem('dismissedBanners', JSON.stringify(dismissedBanners))
    }
    
    // Call onDismiss callback after state update
    setTimeout(() => {
      onDismiss?.(notification.id)
    }, 100)
  }

  const handleAction = () => {
    if (notification.actionUrl) {
      router.push(notification.actionUrl)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-4 mb-4',
        config.bgColor,
        config.borderColor
      )}
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      <div className="flex items-start gap-4">
        <div 
          className={cn('flex-shrink-0 rounded-lg p-2', config.iconColor)}
          style={{ 
            backgroundColor: notification.severity === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)'
          }}
        >
          <Icon className="h-6 w-6" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className={cn('text-base font-semibold mb-1', config.textColor)}>
            {notification.title}
          </h4>
          <p className={cn('text-sm', config.textColor, 'opacity-90')}>
            {notification.message}
          </p>
          
          {notification.actionUrl && notification.actionLabel && (
            <button
              className="btn btn-primary"
              onClick={handleAction}
              style={{ marginTop: '0.75rem' }}
            >
              {notification.actionLabel}
            </button>
          )}
        </div>
        
        {notification.dismissible && (
          <button
            onClick={handleDismiss}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              transition: 'all 0.2s',
              width: '24px',
              height: '24px',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(100, 116, 139, 0.1)'
              e.currentTarget.style.color = '#1e293b'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
