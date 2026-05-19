'use client'

interface OnboardingOverlayProps {
  isVisible: boolean
}

export function OnboardingOverlay({ isVisible }: OnboardingOverlayProps) {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[9998] bg-[rgba(0,_0,_0,_0.5)] transition"
      aria-hidden="true"
    />
  )
}
