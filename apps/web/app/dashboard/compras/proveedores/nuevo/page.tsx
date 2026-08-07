'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { CreateProveedorDto } from '@/types/compras'
import { ProveedorForm } from '@/components/compras/ProveedorForm'
import { ArrowLeft, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLocalizedMoney } from '@/hooks/use-localized-money'

export default function NuevoProveedorPage() {
  const router = useRouter()
  const { post } = useApi()
  const { taxIdLabel } = useLocalizedMoney()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (data: CreateProveedorDto) => {
    setIsLoading(true)
    try {
      const response = await post('/api/compras/proveedores', data)

      if (response?.success || response?.id) {
        toast.success('✅ Proveedor creado exitosamente')
        router.push('/dashboard/compras/proveedores')
      } else {
        throw new Error(response?.message || 'Error al crear el proveedor')
      }
    } catch (error: any) {
      console.error('Error creating proveedor:', error)
      toast.error(`❌ Error: ${error.message || 'No se pudo crear el proveedor'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    router.push('/dashboard/compras/proveedores')
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/proveedores')} className="inline-flex items-center gap-2 text-muted-foreground text-[0.875rem] mb-2 border-0 cursor-pointer py-1 px-0"
          >
            <ArrowLeft size={16} />
            Volver a Proveedores
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground flex items-center gap-3">
            <Building2 size={28} />
            Nuevo Proveedor
          </h1>
          <p className="mt-2 text-base text-muted-foreground">Complete la información del nuevo proveedor</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="text-white py-4 px-6 rounded-xl mb-8 flex items-center gap-4">
        <div className="text-[2rem]">ℹ️</div>
        <div>
          <h3 className="font-semibold mb-1">Información Importante</h3>
          <p className="text-[0.875rem] opacity-[0.95]">
            Los campos marcados con <span className="text-[#fbbf24]">*</span> son obligatorios.
            Asegúrese de ingresar un {taxIdLabel} válido
            {taxIdLabel === 'NIT' ? ' con dígito de verificación' : ' de 11 dígitos'} y un email válido.
          </p>
        </div>
      </div>

      {/* Form */}
      <ProveedorForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isLoading}
        submitLabel="Crear Proveedor"
      />
    </div>
  )
}
