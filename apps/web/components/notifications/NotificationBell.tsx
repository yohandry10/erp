'use client'

import { Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NotificationPanel } from './NotificationPanel'
import { useState, useCallback, useEffect } from 'react'
import { useApi } from '@/hooks/use-api'

interface NotificationBellProps {
  className?: string
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const { get } = useApi()

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await get('/api/notifications/unread')
      if (response?.success) {
        const data = response.data
        if (Array.isArray(data)) {
          setUnreadCount(data.length)
        } else if (typeof data === 'object' && data !== null && typeof data.unread_count === 'number') {
          setUnreadCount(data.unread_count)
        } else {
          setUnreadCount(0)
        }
      } else if (Array.isArray(response)) {
        setUnreadCount(response.length)
      } else {
        setUnreadCount(0)
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    }
  }, [get])

  useEffect(() => {
    fetchUnreadCount()

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000)

    return () => clearInterval(interval)
  }, [fetchUnreadCount])

  const handleNotificationRead = () => {
    // Refresh count when a notification is read
    fetchUnreadCount()
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`relative ${className}`}
        aria-label="Notificaciones"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #0ea5e9 100%)',
          border: 'none',
          borderRadius: '12px',
          padding: '0.75rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          transition: 'all 0.3s ease',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'
        }}
      >
        <Bell className="h-5 w-5" style={{ color: 'white' }} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              backgroundColor: '#ef4444',
              color: 'white',
              borderRadius: '9999px',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: '700',
              border: '2px solid white'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(8px) saturate(150%)',
              animation: 'overlayAppear 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 16px)',
              right: 0,
              width: '420px',
              maxHeight: '600px',
              zIndex: 1000,
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%)',
              backdropFilter: 'blur(40px) saturate(200%)',
              borderRadius: '20px',
              boxShadow: `
                0 0 0 1px rgba(255, 255, 255, 0.5),
                0 8px 16px -4px rgba(0, 0, 0, 0.1),
                0 20px 40px -8px rgba(0, 0, 0, 0.15),
                0 40px 80px -16px rgba(59, 130, 246, 0.2),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.8)
              `,
              overflowY: 'auto',
              animation: 'notificationSlide 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              transformOrigin: 'top right',
              willChange: 'transform, opacity',
              perspective: '1000px'
            }}
          >
            <div style={{
              animation: 'contentFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards'
            }}>
              <NotificationPanel
                onNotificationRead={handleNotificationRead}
                onClose={() => setIsOpen(false)}
              />
            </div>
          </div>

          <style jsx>{`
            @keyframes overlayAppear {
              0% {
                opacity: 0;
                backdropFilter: blur(0px) saturate(100%);
              }
              100% {
                opacity: 1;
                backdropFilter: blur(8px) saturate(150%);
              }
            }

            @keyframes notificationSlide {
              0% {
                opacity: 0;
                transform: translateY(-30px) translateX(20px) scale(0.85) rotateX(10deg) rotateZ(-2deg);
                filter: blur(10px) brightness(1.2);
              }
              40% {
                opacity: 0.6;
                transform: translateY(-8px) translateX(5px) scale(0.95) rotateX(3deg) rotateZ(-0.5deg);
                filter: blur(3px) brightness(1.05);
              }
              70% {
                opacity: 0.9;
                transform: translateY(2px) translateX(-2px) scale(1.01) rotateX(-1deg) rotateZ(0.2deg);
                filter: blur(0px) brightness(1);
              }
              100% {
                opacity: 1;
                transform: translateY(0) translateX(0) scale(1) rotateX(0deg) rotateZ(0deg);
                filter: blur(0px) brightness(1);
              }
            }

            @keyframes contentFade {
              0% {
                opacity: 0;
                transform: translateY(10px);
              }
              100% {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </>
      )}
    </div>
  )
}
