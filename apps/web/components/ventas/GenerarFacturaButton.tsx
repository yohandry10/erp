'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { FileText, Loader2, X } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import SugerenciaGREModal from './SugerenciaGREModal'
import { useRouter } from 'next/navigation'

interface EmpresaConfig {
  usar_flujo_logistica: boolean
  gre_automatico_habilitado: boolean
  gre_obligatorio: boolean
}

interface GenerarFacturaResponse {
  success: boolean
  factura_id?: string
  sugerir_gre?: boolean
  message?: string
}

interface GenerarFacturaButtonProps {
  pedidoId: string
  onSuccess: () => Promise<void>
  config: EmpresaConfig
  onGenerated?: (result: { facturaId: string | null; sugerioGre: boolean }) => void
}

export default function GenerarFacturaButton({
  pedidoId,
  onSuccess,
  config,
  onGenerated
}: GenerarFacturaButtonProps) {
  const { post } = useApi()
  const router = useRouter()
  
  const [showGREModal, setShowGREModal] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const resolveErrorMessage = (error: unknown): string => {
    if (!error) {
      return 'No se pudo generar la factura'
    }

    if (typeof error === 'string') {
      return error
    }

    if (error instanceof Error) {
      const raw = error.message || 'No se pudo generar la factura'
      const jsonStart = raw.indexOf('{')
      if (jsonStart !== -1) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart))
          if (parsed?.message) {
            return parsed.message
          }
        } catch {
          // ignore JSON parse errors
        }
      }
      return raw
    }

    if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
      const nestedMessage = (error as Record<string, unknown>).message
      if (typeof nestedMessage === 'string') {
        return resolveErrorMessage(new Error(nestedMessage))
      }
    }

    return 'No se pudo generar la factura'
  }

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      setShowConfirmation(false)
      console.debug('[GenerarFacturaButton] Generando factura...', { pedidoId })

      const response: GenerarFacturaResponse = await post(
        `/ventas/pedidos/${pedidoId}/generar-factura`,
        {}
      )

      console.debug('[GenerarFacturaButton] Respuesta generación factura', response)

      const fueExitoso = !!response && response?.success !== false

      if (!fueExitoso) {
        throw new Error(response?.message || 'Error al generar la factura')
      }

      setFacturaId(response?.factura_id || null)
      onGenerated?.({
        facturaId: response?.factura_id || null,
        sugerioGre: !!response?.sugerir_gre,
      })
      
      // Check if should suggest GRE
      if (response?.sugerir_gre) {
        setShowGREModal(true)
      } else {
        toast({
          title: 'Factura generada',
          description: 'La factura ha sido generada exitosamente',
        })
        await onSuccess()
        router.refresh()
      }
    } catch (error: any) {
      console.error('Error generating factura:', error)
      toast({
        title: 'Error',
        description: resolveErrorMessage(error),
        variant: 'destructive'
      })
    } finally {
      setGenerating(false)
      console.debug('[GenerarFacturaButton] Estado generating=false')
    }
  }

  const handleGREModalClose = async (generated: boolean) => {
    setShowGREModal(false)
    
    if (generated) {
      toast({
        title: 'Factura y GRE generados',
        description: 'La factura y la guía de remisión han sido generadas exitosamente',
      })
    } else {
      toast({
        title: 'Factura generada',
        description: 'La factura ha sido generada exitosamente',
      })
    }
    
    await onSuccess()
    router.refresh()
  }

  const handleButtonClick = () => {
    setShowConfirmation(true)
  }

  return (
    <>
      <Button
        onClick={handleButtonClick}
        disabled={generating}
        className="bg-blue-600 hover:bg-blue-700"
        >
        <FileText className="w-4 h-4 mr-2" />
        {generating ? 'Generando...' : 'Generar Factura'}
      </Button>

      {showConfirmation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                <FileText className="w-5 h-5" />
                Confirmar factura
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowConfirmation(false)}
                disabled={generating}
                aria-label="Cerrar confirmación de factura"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              <p className="text-gray-700 mb-4">
                ¿Desea generar la factura para este pedido?
              </p>
              <div className="modal-info">
                <p>
                  {config.usar_flujo_logistica
                    ? 'Se emitirá el documento fiscal usando el despacho confirmado.'
                    : 'Se emitirá el documento fiscal y se descontará el stock inmediatamente.'}
                </p>
              </div>
              <p className="text-sm text-gray-500">
                La operación queda vinculada a CPE, cuentas por cobrar y contabilidad.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={() => setShowConfirmation(false)}
                disabled={generating}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-success"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  'Confirmar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRE Suggestion Modal */}
      {showGREModal && (
        <SugerenciaGREModal
          pedidoId={pedidoId}
          facturaId={facturaId}
          config={config}
          onClose={handleGREModalClose}
        />
      )}
    </>
  )
}
