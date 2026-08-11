'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/use-api';

type Cuenta = {
  id: string;
  nombre: string;
  banco: string;
  numero_cuenta: string;
  moneda: string;
  activa: boolean;
  cuenta_contable_id?: string;
};

export function TransferenciaBancariaModal({
  open,
  origen,
  onClose,
  onSuccess,
}: {
  open: boolean;
  origen: Cuenta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { get, post } = useApi({ throwOnError: true, showErrorToast: false });
  const [destinos, setDestinos] = useState<Cuenta[]>([]);
  const [destinoId, setDestinoId] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState('Transferencia entre cuentas');
  const [referencia, setReferencia] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [intentKey, setIntentKey] = useState(() => `bank-transfer:${crypto.randomUUID()}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    get('/api/finanzas/bancos/cuentas')
      .then((response) => {
        const rows = (Array.isArray(response?.data) ? response.data : []).filter((row: Cuenta) =>
          row.id !== origen.id &&
          row.activa !== false &&
          row.moneda === origen.moneda &&
          Boolean(row.cuenta_contable_id),
        );
        setDestinos(rows);
        setDestinoId((current) => rows.some((row: Cuenta) => row.id === current)
          ? current
          : rows[0]?.id || '');
      })
      .catch(() => {
        setDestinos([]);
        setDestinoId('');
      });
  }, [get, open, origen.id, origen.moneda]);

  const changeIntent = useCallback(() => {
    setIntentKey(`bank-transfer:${crypto.randomUUID()}`);
    setError('');
  }, []);

  const submit = async () => {
    const amount = Number(monto);
    if (!destinoId || !Number.isFinite(amount) || amount <= 0 || !descripcion.trim()) {
      setError('Complete cuenta destino, monto y descripción');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await post('/api/finanzas/bancos/transferencias', {
        cuenta_origen_id: origen.id,
        cuenta_destino_id: destinoId,
        monto: amount,
        moneda: origen.moneda,
        ...(tipoCambio ? { tipo_cambio: Number(tipoCambio) } : {}),
        fecha,
        descripcion: descripcion.trim(),
        referencia: referencia.trim() || undefined,
        idempotency_key: intentKey,
      });
      setIntentKey(`bank-transfer:${crypto.randomUUID()}`);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la transferencia');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transferir entre cuentas</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <p className="text-sm text-muted-foreground">
            Origen: {origen.banco} · {origen.numero_cuenta} ({origen.moneda})
          </p>
          <div>
            <Label htmlFor="bank-transfer-destination">Cuenta destino</Label>
            <select
              id="bank-transfer-destination"
              value={destinoId}
              onChange={(event) => { setDestinoId(event.target.value); changeIntent(); }}
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              <option value="">Seleccione</option>
              {destinos.map((row) => (
                <option key={row.id} value={row.id}>{row.banco} · {row.numero_cuenta} · {row.nombre}</option>
              ))}
            </select>
            {!destinos.length && <p className="mt-1 text-xs text-destructive">No hay otra cuenta activa, mapeada y en la misma moneda.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="bank-transfer-amount">Monto</Label><input id="bank-transfer-amount" type="number" min="0.01" step="0.01" value={monto} onChange={(event) => { setMonto(event.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
            <div><Label htmlFor="bank-transfer-date">Fecha</Label><input id="bank-transfer-date" type="date" value={fecha} onChange={(event) => { setFecha(event.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          </div>
          <div><Label htmlFor="bank-transfer-rate">Tipo de cambio a moneda local (sólo moneda extranjera)</Label><input id="bank-transfer-rate" type="number" min="0.000001" step="0.000001" value={tipoCambio} onChange={(event) => { setTipoCambio(event.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          <div><Label htmlFor="bank-transfer-description">Descripción</Label><input id="bank-transfer-description" value={descripcion} onChange={(event) => { setDescripcion(event.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          <div><Label htmlFor="bank-transfer-reference">Referencia</Label><input id="bank-transfer-reference" value={referencia} onChange={(event) => { setReferencia(event.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting || !destinoId}>{submitting ? 'Transfiriendo…' : 'Transferir'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
