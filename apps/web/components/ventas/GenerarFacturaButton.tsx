'use client'

import { useState } from 'react'
import { useApi } from '@/hooks/use-api'
import { usePermission } from '@/hooks/use-permission'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileText } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import SugerenciaGREModal from './SugerenciaGREModal'

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
  onSuccess: () => void
  config: EmpresaConfig
}

export default function GenerarFacturaButton({
  pedidoId,
  onSuccess,
  config
}: GenerarFacturaButtonProps) {
  const { post } = useApi()
  const { hasPermission, loading: permissionLoading } = usePermission('ventas', 'emitir', 'facturacion')
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showGREModal, setShowGREModal] = useState(false)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    if (permissionLoading) {
      return
    }

    if (!hasPermission) {
      // HARDENING: UI respeta permisos de facturación.
      toast({
        title: 'Permiso requerido',
        description: 'No cuenta con el permiso ventas.facturacion.emitir para generar facturas.',
        variant: 'destructive'
      })
      return
    }

    try {
      setGenerating(true)
      setShowConfirmDialog(false)
      
      const response: GenerarFacturaResponse = await post(
        `/ventas/pedidos/${pedidoId}/generar-factura`,
        {}
      )
      
      if (response?.success) {
        setFacturaId(response.factura_id || null)
        
        // Check if should suggest GRE
        if (response.sugerir_gre) {
          setShowGREModal(true)
        } else {
          toast({
            title: 'Factura generada',
            description: 'La factura ha sido generada exitosamente',
          })
          onSuccess()
        }
      } else {
        throw new Error(response?.message || 'Error al generar la factura')
      }
    } catch (error: any) {
      console.error('Error generating factura:', error)
      toast({
        title: 'Error',
        description: error.message || 'No se pudo generar la factura',
        variant: 'destructive'
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleGREModalClose = (generated: boolean) => {
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
    
    onSuccess()
  }

  return (
    <>
      <Button
        onClick={() => setShowConfirmDialog(true)}
        disabled={generating || permissionLoading || !hasPermission}
        className="bg-blue-600 hover:bg-blue-700"
        >
        <FileText className="w-4 h-4 mr-2" />
        {generating ? 'Generando...' : 'Generar Factura'}
      </Button>
      {!permissionLoading && !hasPermission && (
        <p className="mt-2 text-sm text-muted-foreground">
          {/* // HARDENING: UI respeta permisos granular de facturación. */}
          No tiene autorización para emitir facturas en este tenant.
        </p>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar Factura</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea generar la factura para este pedido?
              {!config.usar_flujo_logistica && ' Se descontará el stock en este momento.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
