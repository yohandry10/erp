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
      <div className="fixed z-[9999] rounded-2 shadow transition"
      />

      {/* Pulse animation */}
      <div className="fixed z-[9998] rounded-2"
      />
    </>
  )
}
