'use client'

import { useEffect, useState } from 'react'

interface OnboardingSpotlightProps {
  selector: string
  isVisible: boolean
  padding?: number
}

export function OnboardingSpotlight({
  selector,
  isVisible,
  padding = 8,
}: OnboardingSpotlightProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!isVisible || !selector) {
      setRect(null)
      return
    }

    const updateRect = () => {
      const element = document.querySelector(selector)
      if (element) {
        setRect(element.getBoundingClientRect())
      } else {
        setRect(null)
      }
    }

    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [selector, isVisible])

  if (!isVisible || !rect) return null

  return (
    <>
      {/* Spotlight hole */}
      <div
        style={{
          position: 'fixed',
          zIndex: 9999,
          pointerEvents: 'none',
          borderRadius: '8px',
          top: rect.top - padding,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 0 4px rgba(59, 130, 246, 0.75)',
          transition: 'all 0.3s ease-out',
        }}
      />

      {/* Pulse animation */}
      <div
        style={{
          position: 'fixed',
          zIndex: 9998,
          pointerEvents: 'none',
          borderRadius: '8px',
          border: '2px solid #60a5fa',
          top: rect.top - padding - 4,
          left: rect.left - padding - 4,
          width: rect.width + padding * 2 + 8,
          height: rect.height + padding * 2 + 8,
          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }}
      />

      <style jsx global>{`
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
    </>
  )
}
