"use client";

import { useRef, useState, type FormEvent } from "react";
import { useApi } from "@/hooks/use-api";
import { useTenant } from "@/contexts/TenantContext";
import { usePermission } from "@/hooks/use-permission";
import { toast } from "@/components/ui/use-toast";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DispatchLine {
  id: string;
  descripcion: string;
  cantidad: number;
  cantidad_despachada?: number;
  despachable?: boolean;
}
interface DispatchIntent {
  idempotency_key: string;
  items_despachados: { detalle_id: string; cantidad: number }[];
}
interface ConfirmarDespachoButtonProps {
  pedidoId: string;
  pedidoNumero: string;
  detalle: DispatchLine[];
  onSuccess?: () => void | Promise<void>;
  onRejected?: () => void | Promise<void>;
}

export function ConfirmarDespachoButton({ pedidoId, pedidoNumero, detalle, onSuccess, onRejected }: ConfirmarDespachoButtonProps) {
  const { post } = useApi({ throwOnError: true, showErrorToast: false, retries: 0 });
  const { user } = useTenant();
  const { hasPermission, loading: permissionLoading } = usePermission("inventario", "despachar", "logistica");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const intentRef = useRef<DispatchIntent | null>(null);
  const lines = detalle.filter(line => line.despachable !== false && Number(line.cantidad) > Number(line.cantidad_despachada ?? 0));
  const storageKey = user?.tenant_id && user.id ? `erp.dispatch-intent.${user.tenant_id}.${user.id}.${pedidoId}` : null;
  const remaining = (line: DispatchLine) => Math.round(Number(line.cantidad) * 100) - Math.round(Number(line.cantidad_despachada ?? 0) * 100);

  const showDialog = () => {
    setError(null);
    if (!storageKey) { setError("Vuelve a iniciar sesión para despachar."); setOpen(true); return; }
    try {
      const saved: DispatchIntent | null = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved && (typeof saved.idempotency_key !== "string" || !Array.isArray(saved.items_despachados) || saved.items_despachados.length === 0
        || saved.items_despachados.some(item => typeof item.detalle_id !== "string" || !Number.isFinite(item.cantidad) || item.cantidad <= 0))) {
        throw new Error("El intento guardado está incompleto. No se enviará otro despacho.");
      }
      intentRef.current = saved;
      setPending(Boolean(saved));
      // Un ACK perdido puede haber reducido el pendiente: recuperar el payload
      // original antes de proponer otra salida, incluso después de recargar.
      setQuantities(Object.fromEntries(detalle.map(line => [line.id, String(saved
        ? saved.items_despachados.find(item => item.detalle_id === line.id)?.cantidad ?? 0
        : Math.max(remaining(line), 0) / 100)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo recuperar el intento de despacho.");
      setQuantities({});
    }
    setOpen(true);
  };

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current || !hasPermission || !storageKey) return;
    const activeScope = storageKey;
    let intent = intentRef.current;
    if (!intent) {
      const items: DispatchIntent["items_despachados"] = [];
      for (const line of lines) {
        const value = quantities[line.id] ?? "";
        if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value))) {
          setError("Indica cantidades mayores o iguales a cero, con hasta dos decimales."); return;
        }
        const cents = Math.round(Number(value) * 100);
        if (cents > remaining(line)) { setError("La cantidad no puede superar el pendiente de la línea."); return; }
        if (cents > 0) items.push({ detalle_id: line.id, cantidad: cents / 100 });
      }
      if (items.length === 0) { setError("Selecciona al menos una cantidad para despachar."); return; }
      intent = { idempotency_key: crypto.randomUUID(), items_despachados: items };
      try { sessionStorage.setItem(activeScope, JSON.stringify(intent)); }
      catch { setError("No se pudo conservar el intento. Reintenta antes de confirmar."); return; }
      intentRef.current = intent;
      setPending(true);
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const response = await post(`/inventario/logistica/${pedidoId}/confirmar-despacho`, intent);
      const result = response?.data;
      if (response?.success !== true || result?.success !== true || result.pedido_id !== pedidoId
        || result.idempotency_key !== intent.idempotency_key || !["DESPACHO_PARCIAL", "LISTO_FACTURAR"].includes(result.estado)) {
        throw new Error("No se pudo confirmar el resultado. Reintenta el mismo despacho.");
      }
      sessionStorage.removeItem(activeScope);
      intentRef.current = null;
      setPending(false);
      setOpen(false);
      toast({ title: result.idempotent ? "Despacho recuperado" : "Despacho confirmado", description: result.estado === "DESPACHO_PARCIAL"
        ? `El pedido ${pedidoNumero} conserva cantidades pendientes de despacho.`
        : `El pedido ${pedidoNumero} está listo para facturar.` });
      await onSuccess?.();
    } catch (cause) {
      const rejection = cause as { data?: { statusCode?: number; error?: string } };
      if (rejection?.data?.statusCode === 400 && rejection.data.error === "DISPATCH_NOT_APPLIED") {
        sessionStorage.removeItem(activeScope);
        intentRef.current = null;
        setPending(false);
        setOpen(false);
        toast({ variant: "destructive", title: "Despacho rechazado", description: "Las cantidades cambiaron. Revisa el pendiente actualizado antes de confirmar nuevamente." });
        await onRejected?.();
        return;
      }
      setError(cause instanceof Error ? cause.message : "No se pudo confirmar el despacho. Reintenta el mismo envío.");
    } finally { submitting.current = false; setSaving(false); }
  };

  if (permissionLoading || !hasPermission) return null;
  return <>
    <Button type="button" onClick={showDialog} variant="success" size="sm" disabled={saving}>
      <Truck className="w-4 h-4" />Confirmar Despacho
    </Button>
    <Dialog open={open} onOpenChange={next => { if (!submitting.current) setOpen(next); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Confirmar despacho</DialogTitle>
          <DialogDescription>Pedido {pedidoNumero}. Indica las unidades que salen de almacén. Usa cero para dejar una línea pendiente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={confirm} className="space-y-4" noValidate>
          {(pending ? detalle : lines).map(line => <div key={line.id} className="space-y-1 rounded-md border p-3">
            <Label htmlFor={`dispatch-quantity-${line.id}`}>{line.descripcion}</Label>
            <p className="text-sm text-muted-foreground">Pedido: {Number(line.cantidad)} · Despachado: {Number(line.cantidad_despachada ?? 0)} · Pendiente: {Math.max(remaining(line), 0) / 100}</p>
            <Input id={`dispatch-quantity-${line.id}`} aria-label={`Cantidad a despachar: ${line.descripcion}`} type="number" min="0" max={Math.max(remaining(line), 0) / 100} step="0.01" value={quantities[line.id] ?? ""} disabled={saving || pending} onChange={event => setQuantities(current => ({ ...current, [line.id]: event.target.value }))} />
          </div>)}
          <p className="text-sm text-muted-foreground">Se descontará el stock y se liberará la reserva de las unidades despachadas. El pedido quedará listo para facturar al completar todas sus líneas físicas.</p>
          {pending && <p role="status" className="text-sm">Hay un despacho pendiente de confirmación. Reintenta estas mismas cantidades para recuperar su resultado.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cerrar</Button>
            <Button type="submit" disabled={saving || !storageKey || Object.keys(quantities).length === 0}>{saving ? "Confirmando…" : pending ? "Reintentar despacho" : "Confirmar despacho"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
