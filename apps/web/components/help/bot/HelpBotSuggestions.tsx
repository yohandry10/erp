'use client'

import { HelpSuggestion } from './types'

interface HelpBotSuggestionsProps {
  suggestions: HelpSuggestion[]
  onSelect: (pregunta: string) => void
  isLoading: boolean
}

export function HelpBotSuggestions({ suggestions, onSelect, isLoading }: HelpBotSuggestionsProps) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: '40px',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (suggestions.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, margin: 0 }}>
        Preguntas frecuentes:
      </p>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          onClick={() => onSelect(suggestion.pregunta)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff'
            ;(e.currentTarget as HTMLElement).style.borderColor = '#bfdbfe'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'
            ;(e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'
          }}
        >
          {suggestion.pregunta}
        </button>
      ))}
    </div>
  )
}
