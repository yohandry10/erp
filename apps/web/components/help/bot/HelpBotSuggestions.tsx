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
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-lg bg-slate-100"
          />
        ))}
      </div>
    )
  }

  if (suggestions.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs font-medium text-slate-500">
        Preguntas frecuentes:
      </p>
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          onClick={() => onSelect(suggestion.pregunta)}
          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-blue-200 hover:bg-blue-50"
        >
          {suggestion.pregunta}
        </button>
      ))}
    </div>
  )
}
