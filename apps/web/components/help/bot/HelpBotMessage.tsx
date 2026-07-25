'use client'

import { ExternalLink } from 'lucide-react'
import { HelpBotMessage as MessageType } from './types'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface HelpBotMessageProps {
  message: MessageType
}

export function HelpBotMessage({ message }: HelpBotMessageProps) {
  const isUser = message.type === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          isUser ? 'bg-blue-600 text-white' : 'bg-muted text-foreground',
        )}
      >
        <p className="m-0 whitespace-pre-wrap text-sm">{message.content}</p>

        {message.result && (
          <div className="mt-3 flex flex-col gap-2">
            {message.result.pasos && message.result.pasos.length > 0 && (
              <div className="rounded-md bg-card p-2 text-foreground/85">
                <p className="m-0 mb-1 text-xs font-semibold">
                  Pasos:
                </p>
                <ol className="m-0 list-decimal pl-4 text-xs">
                  {message.result.pasos.map((paso) => (
                    <li key={paso.paso} className="mb-1">
                      {paso.texto}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {message.result.url_modulo && (
              <Link
                href={message.result.url_modulo}
                className="flex items-center gap-1 text-xs text-primary no-underline hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" />
                Ir al módulo
              </Link>
            )}
          </div>
        )}

        <p
          className={cn('m-0 mt-1 text-[10px]', isUser ? 'text-primary dark:text-blue-200' : 'text-muted-foreground')}
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
