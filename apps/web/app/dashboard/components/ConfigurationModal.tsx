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
      <DialogContent style={{ maxWidth: '500px' }}>
        <DialogHeader>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 1rem',
            borderRadius: '50%',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <AlertTriangle size={32} style={{ color: 'var(--warning-600)' }} />
          </div>
          <DialogTitle style={{ textAlign: 'center', fontSize: '1.5rem' }}>
            Configuración Incompleta
          </DialogTitle>
          <DialogDescription style={{ textAlign: 'center', fontSize: '1rem' }}>
            Para comenzar a emitir comprobantes electrónicos, necesitas completar la configuración inicial.
          </DialogDescription>
        </DialogHeader>

        <div style={{
          padding: '1rem',
          backgroundColor: 'rgba(251, 191, 36, 0.05)',
          borderRadius: '8px',
          border: '1px solid rgba(251, 191, 36, 0.2)',
        }}>
          <p style={{
            fontSize: '0.875rem',
            fontWeight: '600',
            color: 'var(--warning-900)',
            marginBottom: '0.5rem',
          }}>
            Elementos faltantes:
          </p>
          <ul style={{
            margin: 0,
            paddingLeft: '1.5rem',
            fontSize: '0.875rem',
            color: 'var(--warning-700)',
          }}>
            {missingItems.map((item, index) => (
              <li key={index} style={{ marginBottom: '0.25rem' }}>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter style={{ gap: '0.5rem', marginTop: '1rem' }}>
          <Button
            variant="outline"
            onClick={handleCompleteLater}
            style={{ flex: 1 }}
          >
            Completar Después
          </Button>
          <Button
            onClick={handleCompleteNow}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              justifyContent: 'center',
            }}
          >
            Completar Ahora
            <ArrowRight size={18} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
