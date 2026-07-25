'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Truck, FileText, Info } from 'lucide-react'

interface EmpresaConfig {
  usar_flujo_logistica: boolean
  gre_automatico_habilitado: boolean
  gre_obligatorio: boolean
}

interface SugerenciaGREModalProps {
  pedidoId: string
  facturaId: string | null
  config: EmpresaConfig
  onClose: (generated: boolean) => void
}

export default function SugerenciaGREModal({
  pedidoId,
  facturaId,
  config,
  onClose
}: SugerenciaGREModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  const handleGenerarGRE = () => {
    setOpen(false)
    // Redirect to GRE module with pre-filled data
    router.push(`/dashboard/gre/nueva?pedido_id=${pedidoId}&factura_id=${facturaId}`)
    onClose(true)
  }

  const handleOmitir = () => {
    setOpen(false)
    onClose(false)
  }

  const handleFinalizar = () => {
    setOpen(false)
    onClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleOmitir()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Guía de Remisión Electrónica
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {config.gre_obligatorio ? (
            <div className="bg-destructive/10 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-destructive mb-1">
                    GRE Obligatoria
                  </h4>
                  <p className="text-sm text-destructive">
                    Según la configuración de su empresa, es obligatorio generar una Guía de Remisión Electrónica para este pedido.
                  </p>
                </div>
              </div>
            </div>
          ) : config.gre_automatico_habilitado ? (
            <div className="bg-primary/10 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-primary mb-1">
                    Sugerencia de GRE
                  </h4>
                  <p className="text-sm text-primary">
                    El monto de este pedido supera el umbral configurado. Se recomienda generar una Guía de Remisión Electrónica.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 border border-border rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-foreground/80 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-foreground mb-1">
                    Generar GRE (Opcional)
                  </h4>
                  <p className="text-sm text-foreground/85">
                    Puede generar una Guía de Remisión Electrónica para este pedido si lo requiere.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm text-foreground/80">
            <p>La GRE incluirá:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Datos del pedido y factura</li>
              <li>Información de transporte</li>
              <li>Puntos de partida y llegada</li>
              <li>Detalles de productos</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {config.gre_automatico_habilitado ? (
            <>
              <Button
                variant="outline"
                onClick={handleOmitir}
                className="w-full sm:w-auto"
              >
                No, omitir
              </Button>
              <Button
                onClick={handleGenerarGRE}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              >
                <Truck className="w-4 h-4 mr-2" />
                Sí, generar GRE
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleFinalizar}
                className="w-full sm:w-auto"
              >
                Finalizar
              </Button>
              <Button
                onClick={handleGenerarGRE}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              >
                <Truck className="w-4 h-4 mr-2" />
                Generar GRE
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
