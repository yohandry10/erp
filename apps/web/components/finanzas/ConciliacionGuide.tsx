'use client'

import { Info, Upload, RefreshCw, Eye, AlertCircle, FileCheck } from 'lucide-react'

export default function ConciliacionGuide() {
  return (
    <div className="rounded-2 p-8 text-white mb-8">
      <div className="flex items-center gap-3 mb-6">
        <Info size={24} />
        <h3 className="text-5 font-semibold m-0">
          Guía Rápida: Proceso de Conciliación
        </h3>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
        <div className="bg-[rgba(255,_255,_255,_0.1)] rounded-2 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Upload size={20} />
            <span className="font-semibold">1. Importar</span>
          </div>
          <p className="text-[0.875rem] m-0 opacity-[0.9]">
            Sube el extracto bancario en formato CSV
          </p>
        </div>

        <div className="bg-[rgba(255,_255,_255,_0.1)] rounded-2 p-4">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw size={20} />
            <span className="font-semibold">2. Auto-Match</span>
          </div>
          <p className="text-[0.875rem] m-0 opacity-[0.9]">
            El sistema concilia automáticamente
          </p>
        </div>

        <div className="bg-[rgba(255,_255,_255,_0.1)] rounded-2 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye size={20} />
            <span className="font-semibold">3. Ajustar</span>
          </div>
          <p className="text-[0.875rem] m-0 opacity-[0.9]">
            Revisa y ajusta manualmente
          </p>
        </div>

        <div className="bg-[rgba(255,_255,_255,_0.1)] rounded-2 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={20} />
            <span className="font-semibold">4. Revisar</span>
          </div>
          <p className="text-[0.875rem] m-0 opacity-[0.9]">
            Verifica saldos y diferencias
          </p>
        </div>

        <div className="bg-[rgba(255,_255,_255,_0.1)] rounded-2 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileCheck size={20} />
            <span className="font-semibold">5. Cerrar</span>
          </div>
          <p className="text-[0.875rem] m-0 opacity-[0.9]">
            Finaliza la conciliación
          </p>
        </div>
      </div>

      <div className="mt-6 p-4 bg-[rgba(255,_255,_255,_0.15)] rounded-2 text-[0.875rem]">
        <strong>💡 Consejo:</strong> Usa el modo Wizard para una experiencia guiada paso a paso, 
        o la vista detallada para control total del proceso.
      </div>
    </div>
  )
}
