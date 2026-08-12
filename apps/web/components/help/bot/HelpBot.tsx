'use client'

import { useState, useCallback, useEffect } from 'react'
import { HelpBotTrigger } from './HelpBotTrigger'
import { HelpBotModal } from './HelpBotModal'
import { HelpBotMessage, HelpSearchResult, HelpSuggestion } from './types'
import { useTenant } from '@/contexts/TenantContext'
import { fetchApi } from '@/lib/api-fetch'
import { usePathname } from 'next/navigation'
import { getGuiaPorRuta } from '../module-guide'

export function HelpBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<HelpBotMessage[]>([])
  const [suggestions, setSuggestions] = useState<HelpSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)

  const { user } = useTenant()
  const userRole = (user?.roles?.[0] || (user?.is_super_admin ? 'superadmin' : null)) as string | null

  // Ficha de la pantalla en la que esta parado el usuario. Se calcula siempre,
  // pero solo se renderiza dentro del modal, que abre bajo demanda.
  const pathname = usePathname()
  const guiaModulo = getGuiaPorRuta(pathname)

  const loadSuggestions = useCallback(async () => {
    setIsSuggestionsLoading(true)
    try {
      const params = new URLSearchParams()
      if (userRole) params.append('rol', userRole)
      params.append('limite', '5')

      const response = await fetchApi(`/api/help/sugerencias?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.sugerencias || [])
      }
    } catch (error) {
      console.error('Error loading suggestions:', error)
    } finally {
      setIsSuggestionsLoading(false)
    }
  }, [userRole])

  // Cargar sugerencias al abrir
  useEffect(() => {
    if (isOpen && suggestions.length === 0) {
      loadSuggestions()
    }
  }, [isOpen, loadSuggestions, suggestions.length])

  const searchHelp = useCallback(async (searchQuery: string): Promise<HelpSearchResult | null> => {
    try {
      const params = new URLSearchParams({ q: searchQuery })
      if (userRole) params.append('rol', userRole)

      const response = await fetchApi(`/api/help/search?${params}`)
      if (response.ok) {
        const data = await response.json()
        return data.resultado || null
      }
    } catch (error) {
      console.error('Error searching help:', error)
    }
    return null
  }, [userRole])

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
  }, [query, searchHelp])

  const handleSubmitWithQuery = useCallback(async (searchQuery: string) => {
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
  }, [searchHelp])

  const handleSuggestionSelect = useCallback((pregunta: string) => {
    setQuery(pregunta)
    // Auto-submit después de seleccionar sugerencia
    setTimeout(() => {
      handleSubmitWithQuery(pregunta)
    }, 100)
  }, [handleSubmitWithQuery])

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
        guiaModulo={guiaModulo}
      />
    </>
  )
}
