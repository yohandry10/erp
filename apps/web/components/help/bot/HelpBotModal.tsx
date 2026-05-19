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
      className="fixed bottom-20 right-4 z-50 flex w-96 max-w-[calc(100vw-32px)] animate-in slide-in-from-bottom-2 flex-col rounded-xl bg-white shadow-2xl"
      role="dialog"
      aria-label="Asistente de ayuda"
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-xl bg-blue-600 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-200" />
          <h2 className="m-0 text-base font-semibold text-white">
            Asistente ERP
          </h2>
        </div>
        <button
          onClick={onClose}
          className="flex cursor-pointer items-center justify-center rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex max-h-80 min-h-52 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-sm text-slate-600">
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
              <div className="flex justify-start">
                <div className="rounded-lg bg-slate-100 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta..."
            disabled={isLoading}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            onClick={onSubmit}
            disabled={!query.trim() || isLoading}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
