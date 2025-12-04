'use client'

export interface HelpSearchResult {
  id: string
  pregunta: string
  respuesta: string
  pasos: HelpStep[] | null
  url_modulo: string | null
  categoria: string
  relevancia: number
}

export interface HelpStep {
  paso: number
  texto: string
}

export interface HelpSuggestion {
  id: string
  pregunta: string
  categoria: string
  url_modulo: string | null
}

export interface HelpBotState {
  isOpen: boolean
  query: string
  results: HelpSearchResult[]
  suggestions: HelpSuggestion[]
  isLoading: boolean
  error: string | null
  selectedResult: HelpSearchResult | null
}

export interface HelpBotMessage {
  id: string
  type: 'user' | 'bot'
  content: string
  result?: HelpSearchResult
  timestamp: Date
}
