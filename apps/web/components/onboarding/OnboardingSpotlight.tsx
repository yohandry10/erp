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

  if (!isVisible || !rect || !rect.width || !rect.height ||
      rect.bottom <= 0 || rect.right <= 0 ||
      rect.top >= window.innerHeight || rect.left >= window.innerWidth) return null

  const spotlightStyle = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    pointerEvents: 'none' as const,
  }

  return (
    <>
      {/* Spotlight hole */}
      <div data-testid="tour-spotlight-hole"
        className="fixed z-[9999] rounded-lg border-2 border-primary transition"
        style={{ ...spotlightStyle, boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)' }}
      />

      {/* Pulse animation */}
      <div data-testid="tour-spotlight-pulse"
        className="fixed z-[9998] rounded-lg border-2 border-primary/50 animate-pulse"
        style={spotlightStyle}
      />
    </>
  )
}
