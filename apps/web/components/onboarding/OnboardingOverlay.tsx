'use client'

interface OnboardingOverlayProps {
  isVisible: boolean
}

export function OnboardingOverlay({ isVisible }: OnboardingOverlayProps) {
  if (!isVisible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        transition: 'opacity 0.3s ease',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      aria-hidden="true"
    />
  )
}
