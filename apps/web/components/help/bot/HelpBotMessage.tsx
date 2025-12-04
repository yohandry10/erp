'use client'

import { ExternalLink } from 'lucide-react'
import { HelpBotMessage as MessageType } from './types'
import Link from 'next/link'

interface HelpBotMessageProps {
  message: MessageType
}

export function HelpBotMessage({ message }: HelpBotMessageProps) {
  const isUser = message.type === 'user'

  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '85%',
          borderRadius: '8px',
          padding: '8px 12px',
          backgroundColor: isUser ? '#2563eb' : '#f1f5f9',
          color: isUser ? 'white' : '#1f2937',
        }}
      >
        <p style={{ fontSize: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>{message.content}</p>

        {message.result && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {message.result.pasos && message.result.pasos.length > 0 && (
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  padding: '8px',
                  color: '#374151',
                }}
              >
                <p style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px', margin: 0 }}>
                  Pasos:
                </p>
                <ol style={{ fontSize: '12px', margin: 0, paddingLeft: '16px' }}>
                  {message.result.pasos.map((paso) => (
                    <li key={paso.paso} style={{ marginBottom: '4px' }}>
                      {paso.texto}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {message.result.url_modulo && (
              <Link
                href={message.result.url_modulo}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  color: '#2563eb',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink style={{ width: '12px', height: '12px' }} />
                Ir al módulo
              </Link>
            )}
          </div>
        )}

        <p
          style={{
            fontSize: '10px',
            marginTop: '4px',
            margin: 0,
            color: isUser ? '#bfdbfe' : '#9ca3af',
          }}
        >
          {message.timestamp.toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  )
}
