'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowRight } from 'lucide-react'

interface ConfigurationModalProps {
  isOpen: boolean
  onClose: () => void
  missingItems: string[]
}

export function ConfigurationModal({ isOpen, onClose, missingItems }: ConfigurationModalProps) {
  const router = useRouter()

  const handleCompleteNow = () => {
    router.push('/dashboard/wizard')
  }

  const handleCompleteLater = () => {
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[500px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
            <AlertTriangle className="h-8 w-8 text-blue-600" />
          </div>
          <DialogTitle className="text-center text-2xl">
            Configuración Incompleta
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Para comenzar a emitir comprobantes electrónicos, necesitas completar la configuración inicial.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="mb-2 text-sm font-semibold text-blue-950">
            Elementos faltantes:
          </p>
          <ul className="m-0 list-disc pl-6 text-sm text-blue-800">
            {missingItems.map((item, index) => (
              <li key={index} className="mb-1">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            variant="outline"
            onClick={handleCompleteLater}
            className="flex-1"
          >
            Completar Después
          </Button>
          <Button
            onClick={handleCompleteNow}
            className="flex flex-1 items-center justify-center gap-2"
          >
            Completar Ahora
            <ArrowRight className="h-[18px] w-[18px]" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
