'use client'

import React from 'react'
import { toast } from 'react-hot-toast'
import confetti from 'canvas-confetti'

interface SuccessToastProps {
  title: string
  message: string
  icon?: string
  duration?: number
}

export const showSuccessToast = ({ title, message, icon = '✅', duration = 4000 }: SuccessToastProps) => {
  // Confetti explosion
  const triggerConfetti = () => {
    // Onda 1: Confetti dorado desde la izquierda
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.1, y: 0.6 },
      colors: ['#FFD700', '#FFA500', '#FF6347'],
      shapes: ['circle', 'square'],
      scalar: 1.2
    })

    // Onda 2: Confetti plateado desde la derecha
    setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.9, y: 0.6 },
        colors: ['#C0C0C0', '#87CEEB', '#98FB98'],
        shapes: ['circle', 'square'],
        scalar: 1.2
      })
    }, 200)

    // Onda 3: Estrellas desde arriba
    setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 100,
        origin: { x: 0.5, y: 0.1 },
        colors: ['#FFD700', '#FF69B4', '#00CED1'],
        shapes: ['star'],
        scalar: 1.5
      })
    }, 400)
  }

  triggerConfetti()

  return toast.custom((t) => (
    <div className={`${
      t.visible ? 'animate-enter' : 'animate-exit'
    } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-lg">{icon}</span>
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {title}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {message}
            </p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-green-600 hover:text-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          ✕
        </button>
      </div>
    </div>
  ), { duration })
}

export default showSuccessToast 