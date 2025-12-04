'use client'

import { X, Send, Loader2 } from 'lucide-react'
import { HelpBotMessage as MessageType, HelpSuggestion } from './types'
import { HelpBotMessage } from './HelpBotMessage'
import { HelpBotSuggestions } from './HelpBotSuggestions'
import { useRef, useEffect } from 'react'

interface HelpBotModalProps {
  isOpen: boolean
  onClose: () => void
  messages: MessageType[]
  suggestions: HelpSuggestion[]
  query: string
  onQueryChange: (query: string) => void
  onSubmit: () => void
  onSuggestionSelect: (pregunta: string) => void
  isLoading: boolean
  isSuggestionsLoading: boolean
}

export function HelpBotModal({
  isOpen,
  onClose,
  messages,
  suggestions,
  query,
  onQueryChange,
  onSubmit,
  onSuggestionSelect,
  isLoading,
  isSuggestionsLoading,
}: HelpBotModalProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '16px',
        zIndex: 50,
        width: '384px',
        maxWidth: 'calc(100vw - 32px)',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp 0.2s ease-out',
      }}
      role="dialog"
      aria-label="Asistente de ayuda"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          backgroundColor: '#2563eb',
          borderRadius: '12px 12px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#4ade80',
              borderRadius: '50%',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
          <h2 style={{ color: 'white', fontWeight: 600, margin: 0, fontSize: '16px' }}>
            Asistente ERP
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            color: 'rgba(255,255,255,0.8)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Cerrar"
        >
          <X style={{ width: '20px', height: '20px' }} />
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: '320px',
          minHeight: '200px',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ color: '#4b5563', fontSize: '14px', margin: 0 }}>
              ¡Hola! Soy tu asistente. ¿En qué puedo ayudarte?
            </p>
            <HelpBotSuggestions
              suggestions={suggestions}
              onSelect={onSuggestionSelect}
              isLoading={isSuggestionsLoading}
            />
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <HelpBotMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    backgroundColor: '#f1f5f9',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <Loader2
                    style={{
                      width: '16px',
                      height: '16px',
                      color: '#64748b',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '12px', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta..."
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '14px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              outline: 'none',
            }}
          />
          <button
            onClick={onSubmit}
            disabled={!query.trim() || isLoading}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: !query.trim() || isLoading ? '#94a3b8' : '#2563eb',
              color: 'white',
              border: 'none',
              cursor: !query.trim() || isLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Enviar"
          >
            <Send style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  )
}
