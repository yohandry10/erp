'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWizard } from '../useWizard'
import { usePosConfig } from '@/hooks/use-pos-config'
import { useCountryContext } from '@/hooks/use-country-context'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowRight, Sparkles, RotateCw } from 'lucide-react'

export function CompletionStep() {
  const router = useRouter()
  const { state, completeWizard, resetWizardProcess } = useWizard()
  const { markWizardAsCompleted, resetConfiguration } = usePosConfig()
  const country = useCountryContext()
  const documentoFiscal = country.documentoFiscal || 'RUC'

  const [isCompleting, setIsCompleting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    try {
      setIsCompleting(true)
      setError(null)

      if (!state.hasPersistedConfiguration) {
        await completeWizard()
      }

      // Marcar el wizard como completado en localStorage
      console.log('✅ Marcando wizard como completado...')
      markWizardAsCompleted()
      console.log('✅ Wizard marcado como completado')

      // Redirect to dashboard and force reload to refresh configuration status
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 1500)
    } catch (err) {
      console.error('Error completing wizard:', err)
      setError(err instanceof Error ? err.message : 'Error al completar la configuración')
      setIsCompleting(false)
    }
  }

  const handleReset = async () => {
    const confirmed = window.confirm('¿Seguro que deseas reiniciar la configuración? Se solicitarán nuevamente todos los datos.')
    if (!confirmed) {
      return
    }

    try {
      setIsResetting(true)
      setError(null)
      await resetWizardProcess()
      resetConfiguration()
      setIsCompleting(false)
    } catch (err) {
      console.error('Error resetting wizard:', err)
      setError(err instanceof Error ? err.message : 'Error al reiniciar la configuración')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="py-4 px-0">
      <div className="text-center mb-8">
        <div className="w-[100px] h-[100px] rounded-full flex items-center justify-center shadow">
          <CheckCircle size={60} className="text-white" />
        </div>

        <h3 className="text-8 font-bold text-[var(--primary-900)] mb-3">
          ¡Configuración Completada!
        </h3>

        <p className="text-[1.125rem] text-[var(--primary-600)] max-w-[600px] my-0 mx-auto leading-7">
          Tu sistema está listo para comenzar a emitir comprobantes electrónicos
        </p>
      </div>

      <div className="grid gap-4 mt-8 mb-8">
        <div className="flex gap-4 p-5 bg-[rgba(16,_185,_129,_0.05)] rounded-3 border">
          <div className="w-12 h-12 rounded-3 bg-[var(--success-100)] flex items-center justify-center shrink-0">
            <CheckCircle size={24} className="text-[var(--success-600)]" />
          </div>
          <div>
            <h4 className="text-4 font-semibold text-[var(--primary-900)] mb-1">
              Datos Empresariales Configurados
            </h4>
            <p className="text-[0.875rem] text-[var(--primary-600)] leading-6 m-0">
              Tu {documentoFiscal}, razón social y dirección están registrados correctamente
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-5 bg-[rgba(16,_185,_129,_0.05)] rounded-3 border">
          <div className="w-12 h-12 rounded-3 bg-[var(--success-100)] flex items-center justify-center shrink-0">
            <CheckCircle size={24} className="text-[var(--success-600)]" />
          </div>
          <div>
            <h4 className="text-4 font-semibold text-[var(--primary-900)] mb-1">
              Certificado Digital Activo
            </h4>
            <p className="text-[0.875rem] text-[var(--primary-600)] leading-6 m-0">
              Tu certificado digital está cargado y listo para firmar documentos
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-5 bg-[rgba(16,_185,_129,_0.05)] rounded-3 border">
          <div className="w-12 h-12 rounded-3 bg-[var(--success-100)] flex items-center justify-center shrink-0">
            <CheckCircle size={24} className="text-[var(--success-600)]" />
          </div>
          <div>
            <h4 className="text-4 font-semibold text-[var(--primary-900)] mb-1">
              Validaciones Exitosas
            </h4>
            <p className="text-[0.875rem] text-[var(--primary-600)] leading-6 m-0">
              Toda tu configuración ha sido verificada y aprobada
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-[#fee2e2] border rounded-2 text-red-600 text-[0.875rem]">
          {error}
        </div>
      )}

        <div className="mt-8 p-6 rounded-3 border text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Sparkles size={20} className="text-[var(--primary-600)]" />
          <h4 className="text-4 font-semibold text-[var(--primary-900)] m-0">
            ¿Qué sigue?
          </h4>
        </div>
        <p className="text-[0.875rem] text-[var(--primary-600)] leading-7 mt-0 mr-0 mb-4 ml-0">
          Ahora puedes comenzar a usar el sistema para emitir facturas, boletas,
          guías de remisión y más. Explora el dashboard para conocer todas las funcionalidades.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Button
            onClick={handleComplete}
            disabled={isCompleting || isResetting}
            size="lg" className="inline-flex items-center gap-2 text-4 py-3 px-8"
          >
            {isCompleting ? (
              <>Finalizando...</>
            ) : (
              <>
                Ir al Dashboard
                <ArrowRight size={20} />
              </>
            )}
          </Button>

          <Button
            onClick={handleReset}
            disabled={isCompleting || isResetting}
            variant="outline"
            size="lg" className="inline-flex items-center gap-2 text-4 py-3 px-8"
          >
            {isResetting ? (
              <>Reiniciando...</>
            ) : (
              <>
                Reiniciar configuración
                <RotateCw size={20} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
