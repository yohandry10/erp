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
    <div className="stat-card" style={{ padding: '1rem', display: 'flex', gap: '0.75rem' }}>
      <button className="btn btn-primary" onClick={enviarWhatsApp}>
        📲 Enviar WhatsApp
      </button>
      <button className="btn btn-secondary" onClick={enviarEmail}>
        📧 Enviar Email
      </button>
    </div>
  )
}
