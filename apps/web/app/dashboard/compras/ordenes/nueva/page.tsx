'use client'

import { requestConfirmation } from '@/lib/confirm-action'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { OCWizard } from '@/components/compras/OCWizard'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ProtectedComponent } from '@/components/auth/ProtectedComponent'
import {
  confirmPurchaseOrderCreated, purchaseOrderCreateIntentKey, readPurchaseOrderCreateIntent,
  type PurchaseOrderCreateIntent, type PurchaseOrderCreatePayload, type PurchaseOrderCreateExpectation,
} from '@/lib/compras/purchase-order-create-operation'
import toast from 'react-hot-toast'

export default function NuevaOrdenCompraPage() {
  const router = useRouter()
  const { post } = useApi({ requireLive: true, throwOnError: true, showErrorToast: false, retries: 0 })
  const { session } = useAuth()
  const tenantId = session?.user?.tenant_id || ''
  const actorId = session?.user?.id || ''
  const scopeIdentity = `${tenantId}:${actorId}`
  const activeScope = useRef(scopeIdentity)
  activeScope.current = scopeIdentity
  const epoch = useRef(0)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingIntent, setPendingIntent] = useState<PurchaseOrderCreateIntent | null>(null)
  const [intentReady, setIntentReady] = useState('')
  const [recoveryError, setRecoveryError] = useState('')
  const [operationError, setOperationError] = useState('')
  const scopeReady = intentReady === scopeIdentity && !!tenantId && !!actorId
  const visibleIntent = scopeReady && pendingIntent?.tenantId === tenantId && pendingIntent?.actorId === actorId ? pendingIntent : null

  useEffect(() => {
    epoch.current++
    setIsLoading(false); setIntentReady(''); setPendingIntent(null)
    setRecoveryError(''); setOperationError('')
    if (!tenantId || !actorId) return
    try {
      const scope = { tenantId, actorId }
      setPendingIntent(readPurchaseOrderCreateIntent(localStorage.getItem(purchaseOrderCreateIntentKey(scope)),scope))
      setIntentReady(scopeIdentity)
    } catch (error: any) {
      setRecoveryError(error?.message || 'No se pudo recuperar la orden pendiente. Sus datos se conservan.')
    }
    return () => { epoch.current++ }
  }, [tenantId,actorId,scopeIdentity])

  const handleSubmit = async (data?: PurchaseOrderCreatePayload, expectation?: PurchaseOrderCreateExpectation) => {
    if (isLoading || recoveryError || intentReady !== activeScope.current) return
    const submittedScope = activeScope.current
    const submittedEpoch = ++epoch.current
    const current = () => activeScope.current === submittedScope && epoch.current === submittedEpoch
    setIsLoading(true); setOperationError('')
    try {
      const scope = { tenantId, actorId }
      const key = purchaseOrderCreateIntentKey(scope)
      const stored = readPurchaseOrderCreateIntent(localStorage.getItem(key),scope)
      if (!pendingIntent && (!data || !expectation)) throw new Error('Completa la orden antes de enviarla.')
      const candidate = pendingIntent || { version: 1 as const, ...scope, ...expectation!, createdAt: new Date().toISOString(), payload: data! }
      const serialized = JSON.stringify(candidate)
      const intent = readPurchaseOrderCreateIntent(serialized,scope)
      if (!intent) throw new Error('La orden está incompleta.')
      if (stored && JSON.stringify(stored) !== serialized) throw new Error('Hay otra orden pendiente. Sus datos se conservan.')
      // Intención durable: datos de negocio e ids de empresa y usuario, sin token ni contraseña.
      // codeql[js/clear-text-storage-of-sensitive-data]
      localStorage.setItem(key,serialized)
      if (localStorage.getItem(key) !== serialized) throw new Error('No se pudo conservar la orden antes del envío.')
      setPendingIntent(intent)
      const response = await post('/api/compras/ordenes',intent.payload)
      if (!current()) return
      confirmPurchaseOrderCreated(response,scope,intent)
      if (localStorage.getItem(key) !== serialized) throw new Error('La orden pendiente cambió. Se conserva para revisar su resultado.')
      localStorage.removeItem(key)
      if (localStorage.getItem(key) !== null) throw new Error('No se pudo retirar la orden confirmada. Sus datos se conservan para reintentar.')
      setPendingIntent(null)
      toast.success('✅ Orden de compra creada exitosamente')
      router.push('/dashboard/compras/ordenes')
    } catch (error: any) {
      if (!current()) return
      setOperationError(error?.message || 'La orden no está confirmada. Sus datos se conservan.')
      toast.error(`Error: ${error.message || 'No se pudo crear la orden de compra'}`)
    } finally {
      if (current()) setIsLoading(false)
    }
  }

  const handleCancel = async () => {
    if ((await requestConfirmation('¿Está seguro de cancelar? Se perderán los datos ingresados.'))) {
      router.push('/dashboard/compras/ordenes')
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 text-foreground md:p-6 [&_table]:w-full [&_table]:border-collapse [&_table]:rounded-xl [&_table]:bg-card [&_table]:text-card-foreground [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:text-left [&_tr:hover]:bg-accent/40">
      {/* Header */}
      <div className="relative mb-8 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-lg backdrop-blur-xl before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary md:flex-row md:items-center md:p-8">
        <div>
          <button
            onClick={() => router.push('/dashboard/compras/ordenes')} className="flex items-center gap-2 py-2 px-4 rounded-lg border bg-card cursor-pointer mb-4 text-[0.875rem] font-medium"
          >
            <ArrowLeft size={16} />
            Volver a Órdenes de Compra
          </button>
          <h1 className="m-0 text-[clamp(1.75rem,4vw,2.5rem)] font-black leading-[1.1] tracking-[-0.03em] text-foreground">Nueva Orden de Compra</h1>
          <p className="mt-2 text-base text-muted-foreground">Complete el formulario para crear una nueva orden de compra</p>
        </div>
      </div>

      {/* Wizard */}
      <div className="relative rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-md backdrop-blur-xl">
        {recoveryError && <p role="alert" data-testid="purchase-order-create-recovery-error" className="mb-4 rounded-lg border border-red-500/40 p-4 text-red-500">{recoveryError}</p>}
        {scopeReady && operationError && <p role="alert" data-testid="purchase-order-create-error" className="mb-4 rounded-lg border border-red-500/40 p-4 text-red-500">{operationError}</p>}
        {visibleIntent ? (
          <div className="space-y-4" data-testid="purchase-order-create-pending">
            <p role="status">Hay una orden pendiente de confirmación. Se conservan sus datos para reintentar el mismo registro.</p>
            <dl className="grid gap-2 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">Número de orden</dt><dd>{visibleIntent.payload.numero}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Fecha de orden</dt><dd>{visibleIntent.payload.fecha_orden}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Moneda</dt><dd>{visibleIntent.payload.moneda}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Días de crédito</dt><dd>{visibleIntent.payload.dias_credito}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Entrega esperada</dt><dd>{visibleIntent.payload.fecha_entrega_esperada || '30 días desde la orden'}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Condiciones de pago</dt><dd>{visibleIntent.payload.condiciones_pago || (visibleIntent.payload.dias_credito > 0 ? 'Crédito' : 'Contado')}</dd></div>
              {visibleIntent.payload.observaciones && <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Observaciones</dt><dd>{visibleIntent.payload.observaciones}</dd></div>}
            </dl>
            <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th></tr></thead><tbody>
              {visibleIntent.payload.detalles.map((d,index) => <tr key={index}><td>{d.descripcion}</td><td>{d.cantidad}</td><td>{d.precio_unitario}</td></tr>)}
            </tbody></table>
            <ProtectedComponent modulo="compras" accion="create" recurso="ordenes" fallback={null}>
              <button type="button" onClick={() => void handleSubmit()} disabled={isLoading || !!recoveryError || intentReady !== activeScope.current}
                className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">
                {isLoading ? 'Guardando...' : 'Reintentar orden pendiente'}
              </button>
            </ProtectedComponent>
          </div>
        ) : scopeReady ? <OCWizard
          key={scopeIdentity}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading || !!recoveryError || intentReady !== activeScope.current}
        /> : !recoveryError && <p role="status">Recuperando datos de la orden…</p>}
      </div>
    </div>
  )
}
