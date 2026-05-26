'use client'

import { useEffect, useMemo, useState } from 'react'
import { NotificationBanner, BannerNotification } from './NotificationBanner'
import { useConfigurationStatus } from '@/app/dashboard/hooks/useConfigurationStatus'

export function DashboardNotificationBanners() {
  const [banners, setBanners] = useState<BannerNotification[]>([])
  const { status } = useConfigurationStatus()

  const candidateBanners = useMemo(() => {
    if (!status) return []

    const newBanners: BannerNotification[] = []
    const expiresAt = status.certificate?.expiresAt
      ? new Date(status.certificate.expiresAt)
      : null
    const daysUntilExpiration = expiresAt
      ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : undefined

    // Check for certificate expiring
    if (
      status.certificate?.exists &&
      status.certificate?.isValid &&
      daysUntilExpiration !== undefined &&
      daysUntilExpiration < 30
    ) {
      newBanners.push({
        id: 'certificate-expiring',
        type: 'certificate_expiring',
        severity: daysUntilExpiration < 7 ? 'error' : 'warning',
        title: 'Certificado Digital Próximo a Vencer',
        message: `Tu certificado digital vence en ${daysUntilExpiration} días. Renueva tu certificado para evitar interrupciones en la emisión de documentos.`,
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

    return newBanners
  }, [status])

  useEffect(() => {
    try {
      if (!candidateBanners.length) {
        setBanners([])
        return
      }

      // Filter out dismissed persistent banners
      let dismissedBanners: Array<{ id: string; dismissedAt: string }> = []
      try {
        dismissedBanners = JSON.parse(localStorage.getItem('dismissedBanners') || '[]')
      } catch {
        dismissedBanners = []
      }

      const filteredBanners = candidateBanners.filter(banner => {
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
    } catch (error) {
      console.error('Error preparing configuration banners:', error)
    }
  }, [candidateBanners])

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
