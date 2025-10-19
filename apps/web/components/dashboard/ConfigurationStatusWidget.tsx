'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight,
  Shield,
  Building2
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ConfigurationStatusWidgetProps {
  isComplete: boolean
  completionPercentage: number
  missingItems: string[]
  certificate?: {
    exists: boolean
    isValid: boolean
    expiresAt?: Date
    daysUntilExpiration?: number
  }
  ruc?: {
    isConfigured: boolean
    missingFields: string[]
  }
}

export function ConfigurationStatusWidget({
  isComplete,
  completionPercentage,
  missingItems,
  certificate,
  ruc,
}: ConfigurationStatusWidgetProps) {
  const router = useRouter()

  const handleCompleteSetup = () => {
    router.push('/dashboard/wizard')
  }

  // Determine status color and icon
  const getStatusColor = () => {
    if (isComplete) return '#10b981' // green
    if (completionPercentage >= 50) return '#3b82f6' // blue
    return '#ef4444' // red
  }

  const statusColor = getStatusColor()

  return (
    <Card style={{ height: '100%' }}>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: `${statusColor}20`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Settings size={20} style={{ color: statusColor }} />
            </div>
            Estado de Configuración
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        {/* Completion Percentage */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            marginBottom: '0.5rem'
          }}>
            <span style={{ 
              fontSize: '0.875rem', 
              fontWeight: '600',
              color: 'var(--primary-700)'
            }}>
              Progreso de Configuración
            </span>
            <span style={{ 
              fontSize: '1.25rem', 
              fontWeight: '700',
              color: statusColor
            }}>
              {completionPercentage}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div style={{
            width: '100%',
            height: '8px',
            backgroundColor: 'var(--primary-100)',
            borderRadius: '999px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${completionPercentage}%`,
              height: '100%',
              backgroundColor: statusColor,
              borderRadius: '999px',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {/* Status Message */}
        {isComplete ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}>
            <CheckCircle size={20} style={{ color: '#10b981', flexShrink: 0 }} />
            <span style={{ 
              fontSize: '0.875rem',
              color: 'var(--primary-700)',
              fontWeight: '500'
            }}>
              Tu configuración está completa. El sistema está listo para usar.
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '1rem',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}>
            <AlertCircle size={20} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <span style={{ 
                fontSize: '0.875rem',
                color: 'var(--primary-700)',
                fontWeight: '500',
                display: 'block',
                marginBottom: '0.5rem'
              }}>
                Configuración incompleta. Completa los siguientes elementos:
              </span>
            </div>
          </div>
        )}

        {/* Missing Items List */}
        {!isComplete && missingItems.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              {missingItems.map((item, index) => (
                <li key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'var(--primary-600)',
                }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    flexShrink: 0,
                  }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Configuration Details */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          {/* Certificate Status */}
          {certificate && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem',
              backgroundColor: 'var(--primary-50)',
              borderRadius: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={16} style={{ 
                  color: certificate.exists && certificate.isValid ? '#10b981' : '#ef4444' 
                }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                  Certificado Digital
                </span>
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '600',
                color: certificate.exists && certificate.isValid ? '#10b981' : '#ef4444',
              }}>
                {certificate.exists && certificate.isValid ? (
                  certificate.daysUntilExpiration !== undefined ? (
                    `${certificate.daysUntilExpiration} días restantes`
                  ) : (
                    'Válido'
                  )
                ) : certificate.exists ? (
                  'Vencido'
                ) : (
                  'No configurado'
                )}
              </span>
            </div>
          )}

          {/* RUC Status */}
          {ruc && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem',
              backgroundColor: 'var(--primary-50)',
              borderRadius: '6px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Building2 size={16} style={{ 
                  color: ruc.isConfigured ? '#10b981' : '#ef4444' 
                }} />
                <span style={{ fontSize: '0.875rem', color: 'var(--primary-700)' }}>
                  Configuración RUC
                </span>
              </div>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '600',
                color: ruc.isConfigured ? '#10b981' : '#ef4444',
              }}>
                {ruc.isConfigured ? 'Completo' : `${ruc.missingFields.length} campos faltantes`}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        {!isComplete && (
          <Button
            onClick={handleCompleteSetup}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            Completar Configuración
            <ArrowRight size={18} />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
