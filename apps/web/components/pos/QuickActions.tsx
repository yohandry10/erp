'use client'

import React from 'react'

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
    <div className="stat-card p-4 flex gap-3 flex-wrap">
      <button className="btn btn-primary flex-[1_1_auto] min-w-[140px]" onClick={enviarWhatsApp}>
        📲 WhatsApp
      </button>
      <button className="btn btn-secondary flex-[1_1_auto] min-w-[140px]" onClick={enviarEmail}>
        📧 Email
      </button>
    </div>
  )
}
