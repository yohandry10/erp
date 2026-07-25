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
    <Card className="h-[100%]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[0.625rem] flex items-center justify-center">
              <Settings size={20} />
            </div>
            Estado de Configuración
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        {/* Completion Percentage */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[0.875rem] font-semibold text-[var(--primary-700)]">
              Progreso de Configuración
            </span>
            <span className="text-xl font-bold">
              {completionPercentage}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-[100%] h-2 bg-[var(--primary-100)] rounded-full overflow-hidden">
            <div className="h-[100%] rounded-full transition" />
          </div>
        </div>

        {/* Status Message */}
        {isComplete ? (
          <div className="flex items-center gap-3 p-4 bg-[rgba(16,_185,_129,_0.1)] rounded-lg mb-6">
            <CheckCircle size={20} className="text-[#10b981] shrink-0" />
            <span className="text-[0.875rem] text-[var(--primary-700)] font-medium">
              Tu configuración está completa. El sistema está listo para usar.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-4 bg-[rgba(59,_130,_246,_0.1)] rounded-lg mb-6">
            <AlertCircle size={20} className="text-blue-500 shrink-0 mt-[2px]" />
            <div className="flex-[1]">
              <span className="text-[0.875rem] text-[var(--primary-700)] font-medium block mb-2">
                Configuración incompleta. Completa los siguientes elementos:
              </span>
            </div>
          </div>
        )}

        {/* Missing Items List */}
        {!isComplete && missingItems.length > 0 && (
          <div className="mb-6">
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {missingItems.map((item, index) => (
                <li key={index} className="flex items-center gap-2 text-[0.875rem] text-[var(--primary-600)]">
                  <div className="w-[6px] h-[6px] rounded-full bg-blue-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Configuration Details */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Certificate Status */}
          {certificate && (
            <div className="flex items-center justify-between p-3 bg-[var(--primary-50)] rounded-[6px]">
              <div className="flex items-center gap-2">
                <Shield size={16} />
                <span className="text-[0.875rem] text-[var(--primary-700)]">
                  Certificado Digital
                </span>
              </div>
              <span className="text-xs font-semibold">
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
            <div className="flex items-center justify-between p-3 bg-[var(--primary-50)] rounded-[6px]">
              <div className="flex items-center gap-2">
                <Building2 size={16} />
                <span className="text-[0.875rem] text-[var(--primary-700)]">
                  Configuración RUC
                </span>
              </div>
              <span className="text-xs font-semibold">
                {ruc.isConfigured ? 'Completo' : `${ruc.missingFields.length} campos faltantes`}
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        {!isComplete && (
          <Button
            onClick={handleCompleteSetup} className="w-[100%] flex items-center justify-center gap-2"
          >
            Completar Configuración
            <ArrowRight size={18} />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
