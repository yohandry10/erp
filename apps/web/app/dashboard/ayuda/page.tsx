'use client'

import { OnboardingSettings } from '@/components/onboarding'
import { HelpCircle, BookOpen, MessageCircle, Keyboard } from 'lucide-react'

export default function AyudaPage() {
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    border: '1px solid #e2e8f0',
    padding: '24px',
  }

  const sectionTitleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  }

  return (
    <div style={{ maxWidth: '896px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#111827',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: 0,
          }}
        >
          <HelpCircle style={{ width: '28px', height: '28px', color: '#2563eb' }} />
          Centro de Ayuda
        </h1>
        <p style={{ color: '#64748b', marginTop: '4px' }}>
          Aprende a usar el sistema con tours interactivos y documentación.
        </p>
      </div>

      {/* Tours de Onboarding */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          <BookOpen style={{ width: '20px', height: '20px', color: '#2563eb' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Tours Interactivos</h2>
        </div>
        <OnboardingSettings />
      </div>

      {/* Bot de Ayuda Info */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          <MessageCircle style={{ width: '20px', height: '20px', color: '#16a34a' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Asistente de Ayuda</h2>
        </div>
        <p style={{ color: '#4b5563', marginBottom: '16px' }}>
          ¿Tienes dudas? Usa el botón de ayuda en la esquina inferior derecha para hacer preguntas
          sobre cualquier función del sistema.
        </p>
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <p style={{ fontSize: '14px', color: '#1e40af', margin: 0 }}>
            <strong>💡 Tip:</strong> El asistente conoce tu rol y te dará respuestas personalizadas
            según tus permisos.
          </p>
        </div>
      </div>

      {/* Atajos de Teclado */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          <Keyboard style={{ width: '20px', height: '20px', color: '#7c3aed' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Atajos Útiles</h2>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          {[
            { label: 'Buscar producto (POS)', key: 'F2' },
            { label: 'Nueva venta', key: 'F4' },
            { label: 'Procesar pago', key: 'F12' },
            { label: 'Abrir ayuda', key: 'F1' },
          ].map((shortcut) => (
            <div
              key={shortcut.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
              }}
            >
              <span style={{ color: '#374151' }}>{shortcut.label}</span>
              <kbd
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#e2e8f0',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                }}
              >
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
