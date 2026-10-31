'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ClienteSelector from '@/components/ventas/ClienteSelector'
import type { Cliente } from '@/types/ventas'

export function VincularCobroCpeModal({ cpeId, receptor, documento, onClose }: {
  cpeId: string; receptor: string; documento: string; onClose: () => void;
}) {
  const { post } = useApi({ throwOnError: true, showErrorToast: false })
  const router = useRouter()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const intent = useRef(`cpe-cxc:${crypto.randomUUID()}`)
  const submit = async () => {
    if (!cliente) return
    setSaving(true); setError('')
    try {
      const response = await post(`/api/cpe/comprobantes/${cpeId}/vincular-cxc`,
        { cliente_id: cliente.id }, { headers: { 'Idempotency-Key': intent.current } })
      const id = response?.data?.cxc_id
      if (!id) throw new Error('No se pudo confirmar la cuenta por cobrar; reintente')
      router.push(`/dashboard/finanzas/cxc/?documento=${encodeURIComponent(documento)}`)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo vincular el cobro')
    } finally { setSaving(false) }
  }
  return <Dialog open onOpenChange={open => !open && !saving && onClose()}>
    <DialogContent><DialogHeader><DialogTitle>Vincular cliente para cobrar</DialogTitle></DialogHeader>
      <p>Documento del receptor: <strong>{receptor}</strong>. Selecciona el cliente con ese mismo documento.</p>
      <ClienteSelector value={cliente?.id} disabled={saving} onChange={(_, selected) => {
        setCliente(selected || null); setError(''); intent.current = `cpe-cxc:${crypto.randomUUID()}`
      }} />
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={submit} disabled={!cliente || saving}>{saving ? 'Vinculando…' : 'Vincular y abrir cobranza'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
