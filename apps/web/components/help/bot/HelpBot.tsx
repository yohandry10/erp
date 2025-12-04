'use client'

import { useState, useCallback, useEffect } from 'react'
import { HelpBotTrigger } from './HelpBotTrigger'
import { HelpBotModal } from './HelpBotModal'
import { HelpBotMessage, HelpSearchResult, HelpSuggestion } from './types'
import { useTenant } from '@/contexts/TenantContext'

export function HelpBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<HelpBotMessage[]>([])
  const [suggestions, setSuggestions] = useState<HelpSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)
  
  const { user } = useTenant()
  const userRole = user?.rol || null

  // Cargar sugerencias al abrir
  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      loadSuggestions()
    }
  }, [isOpen])

  const loadSuggestions = async () => {
    setIsSuggestionsLoading(true)
    try {
      const params = new URLSearchParams()
      if (userRole) params.append('rol', userRole)
      params.append('limite', '5')

      const response = await fetch(`/api/help/sugerencias?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.sugerencias || [])
      }
    } catch (error) {
      console.error('Error loading suggestions:', error)
    } finally {
      setIsSuggestionsLoading(false)
    }
  }

  const searchHelp = async (searchQuery: string): Promise<HelpSearchResult | null> => {
    try {
      const params = new URLSearchParams({ q: searchQuery })
      if (userRole) params.append('rol', userRole)

      const response = await fetch(`/api/help/search?${params}`)
      if (response.ok) {
        const data = await response.json()
        return data.resultado || null
      }
    } catch (error) {
      console.error('Error searching help:', error)
    }
    return null
  }

  const handleSubmit = useCallback(async () => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return

    // Agregar mensaje del usuario
    const userMessage: HelpBotMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: trimmedQuery,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setQuery('')
    setIsLoading(true)

    // Buscar respuesta
    const result = await searchHelp(trimmedQuery)

    // Agregar respuesta del bot
    const botMessage: HelpBotMessage = {
      id: `bot-${Date.now()}`,
      type: 'bot',
      content: result 
        ? result.respuesta 
        : 'No encontré información sobre eso. ¿Puedes reformular tu pregunta?',
      result: result || undefined,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, botMessage])
    setIsLoading(false)
  }, [query, userRole])

  const handleSuggestionSelect = useCallback((pregunta: string) => {
    setQuery(pregunta)
    // Auto-submit después de seleccionar sugerencia
    setTimeout(() => {
      const submitEvent = new Event('submit')
      handleSubmitWithQuery(pregunta)
    }, 100)
  }, [])

  const handleSubmitWithQuery = async (searchQuery: string) => {
    // Agregar mensaje del usuario
    const userMessage: HelpBotMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: searchQuery,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setQuery('')
    setIsLoading(true)

    // Buscar respuesta
    const result = await searchHelp(searchQuery)

    // Agregar respuesta del bot
    const botMessage: HelpBotMessage = {
      id: `bot-${Date.now()}`,
      type: 'bot',
      content: result 
        ? result.respuesta 
        : 'No encontré información sobre eso. ¿Puedes reformular tu pregunta?',
      result: result || undefined,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, botMessage])
    setIsLoading(false)
  }

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return (
    <>
      <HelpBotTrigger onClick={toggleOpen} isOpen={isOpen} />
      <HelpBotModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        messages={messages}
        suggestions={suggestions}
        query={query}
        onQueryChange={setQuery}
        onSubmit={handleSubmit}
        onSuggestionSelect={handleSuggestionSelect}
        isLoading={isLoading}
        isSuggestionsLoading={isSuggestionsLoading}
      />
    </>
  )
}
