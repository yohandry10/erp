'use client'

import { useCallback, useEffect, useState } from 'react'
import { NotificationBanner, BannerNotification } from './NotificationBanner'
import { useApi } from '@/hooks/use-api'
import { useTenant } from '@/contexts/TenantContext'

interface ConfigurationStatus {
  isComplete: boolean
  completionPercentage: number
  missingItems: string[]
  certificate: {
    exists: boolean
    isValid: boolean
    expiresAt?: string
    daysUntilExpiration?: number
  }
  ruc: {
    isConfigured: boolean
    missingFields: string[]
  }
}

export function DashboardNotificationBanners() {
  const [banners, setBanners] = useState<BannerNotification[]>([])
  const { get } = useApi({ showErrorToast: false })
  const { isSuperAdmin, user, loading } = useTenant()

  const fetchConfigurationStatus = useCallback(async () => {
    try {
      // SUPER ADMINS DON'T NEED CONFIGURATION WIZARD - SKIP ENTIRELY
      if (isSuperAdmin === true) {
        console.log('[DashboardNotificationBanners] ✅ SUPERADMIN DETECTED - SKIPPING ALL BANNERS')
        setBanners([])
        return
      }

      console.log('[DashboardNotificationBanners] Not superadmin, fetching config status...')

      const response = await get('/api/configuration/status')
      if (response) {
        const status: ConfigurationStatus = response.data || response
        const newBanners: BannerNotification[] = []

        // Check for certificate expiring
        if (
          status.certificate?.exists &&
          status.certificate?.isValid &&
          status.certificate?.daysUntilExpiration !== undefined &&
          status.certificate.daysUntilExpiration < 30
        ) {
          newBanners.push({
            id: 'certificate-expiring',
            type: 'certificate_expiring',
            severity: status.certificate.daysUntilExpiration < 7 ? 'error' : 'warning',
            title: 'Certificado Digital Próximo a Vencer',
            message: `Tu certificado digital vence en ${status.certificate.daysUntilExpiration} días. Renueva tu certificado para evitar interrupciones en la emisión de documentos.`,
            actionUrl: '/dashboard/configuracion',
            actionLabel: 'Actualizar Certificado',
            dismissible: true,
            persistent: false,
          })
        }

        // Check for expired certificate
        if (status.certificate?.exists && !status.certificate?.isValid) {
          newBanners.push({
            id: 'certificate-expired',
            type: 'certificate_expired',
            severity: 'error',
            title: 'Certificado Digital Vencido',
            message: 'Tu certificado digital ha vencido. No podrás emitir documentos hasta que actualices tu certificado.',
            actionUrl: '/dashboard/configuracion',
            actionLabel: 'Actualizar Certificado',
            dismissible: false,
            persistent: true,
          })
        }

        // Check for incomplete configuration
        if (!status.isComplete) {
          newBanners.push({
            id: 'configuration-incomplete',
            type: 'configuration_incomplete',
            severity: 'warning',
            title: 'Configuración Incompleta',
            message: `Tu configuración está ${status.completionPercentage}% completa. Completa la configuración para usar todas las funcionalidades del sistema.`,
            actionUrl: '/dashboard/wizard',
            actionLabel: 'Completar Configuración',
            dismissible: true,
            persistent: true,
          })
        }

        // Filter out dismissed persistent banners
        const dismissedBanners = JSON.parse(
          localStorage.getItem('dismissedBanners') || '[]'
        )

        const filteredBanners = newBanners.filter(banner => {
          if (!banner.persistent || !banner.dismissible) return true

          const dismissed = dismissedBanners.find((d: any) => d.id === banner.id)
          if (!dismissed) return true

          // Re-show persistent banners after 24 hours
          const dismissedAt = new Date(dismissed.dismissedAt)
          const now = new Date()
          const hoursSinceDismissed = (now.getTime() - dismissedAt.getTime()) / (1000 * 60 * 60)

          return hoursSinceDismissed > 24
        })

        setBanners(filteredBanners)
      }
    } catch (error) {
      console.error('Error fetching configuration status:', error)
    }
  }, [get, isSuperAdmin])

  useEffect(() => {
    // Don't fetch if still loading user data
    if (loading) {
      console.log('[DashboardNotificationBanners] Still loading user data...')
      return
    }

    console.log('[DashboardNotificationBanners] Component mounted, checking user...')
    console.log('[DashboardNotificationBanners] isSuperAdmin from context:', isSuperAdmin)
    console.log('[DashboardNotificationBanners] user from context:', user)

    fetchConfigurationStatus()

    // Refresh every 5 minutes
    const interval = setInterval(fetchConfigurationStatus, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [fetchConfigurationStatus, isSuperAdmin, loading, user])

  const handleDismiss = (id: string) => {
    setBanners(prev => prev.filter(b => b.id !== id))
  }

  if (banners.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      {banners.map(banner => (
        <NotificationBanner
          key={banner.id}
          notification={banner}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  )
}
