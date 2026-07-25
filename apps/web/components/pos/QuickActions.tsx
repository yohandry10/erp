'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type Props = {
  mensaje: string
  emailDestino?: string
}

export const QuickActions: React.FC<Props> = ({ mensaje, emailDestino }) => {
  const enviarWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  const enviarEmail = () => {
    const mailto = `mailto:${emailDestino || ''}?subject=${encodeURIComponent(
      'Detalle de tu compra'
    )}&body=${encodeURIComponent(mensaje)}`
    window.location.href = mailto
  }

  return (
    <Card className="border-border bg-card text-card-foreground">
      <CardContent className="flex flex-wrap gap-3 p-4">
      <Button className="min-w-[140px] flex-[1_1_auto]" onClick={enviarWhatsApp}>
        📲 WhatsApp
      </Button>
      <Button variant="secondary" className="min-w-[140px] flex-[1_1_auto]" onClick={enviarEmail}>
        📧 Email
      </Button>
      </CardContent>
    </Card>
  )
}
