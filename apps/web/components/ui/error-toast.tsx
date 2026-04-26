'use client'

import React from 'react'
import { toast } from 'react-hot-toast'

interface ErrorToastProps {
  title: string
  message: string
  icon?: string
  duration?: number
}

export const showErrorToast = ({ title, message, icon = '❌', duration = 4000 }: ErrorToastProps) => {
  return toast.custom((t) => (
    <div className={`${
      t.visible ? 'animate-enter' : 'animate-exit'
    } max-w-md w-full bg-white shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center animate-pulse">
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
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-red-600 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          ✕
        </button>
      </div>
    </div>
  ), { duration })
}

export default showErrorToast 