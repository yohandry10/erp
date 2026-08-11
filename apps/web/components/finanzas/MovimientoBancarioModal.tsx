'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/use-api';

type Cuenta = { id: string; moneda: string; cuenta_contable_id?: string };

export function MovimientoBancarioModal({
  open,
  cuenta,
  conciliacionId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  cuenta: Cuenta;
  conciliacionId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { get, post } = useApi({ throwOnError: true, showErrorToast: false });
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [tipo, setTipo] = useState<'ABONO' | 'CARGO'>('CARGO');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [categoria, setCategoria] = useState(conciliacionId ? 'AJUSTE_CONCILIACION' : 'OTRO_EGRESO');
  const [contracuenta, setContracuenta] = useState('');
  const [tipoCambio, setTipoCambio] = useState('');
  const [intentKey, setIntentKey] = useState(() => `bank-movement:${crypto.randomUUID()}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    get('/api/contabilidad/plan-cuentas').then((response) => {
      const rows = (Array.isArray(response?.data) ? response.data : []).filter((row: any) =>
        Boolean(row.acepta_movimiento) &&
        String(row.estado || 'ACTIVO').toUpperCase() === 'ACTIVO' &&
        row.id !== cuenta.cuenta_contable_id,
      );
      setCuentas(rows);
      setContracuenta((current) => current || rows[0]?.id || '');
    }).catch(() => setCuentas([]));
  }, [cuenta.cuenta_contable_id, get, open]);

  const changeIntent = useCallback(() => {
    setIntentKey(`bank-movement:${crypto.randomUUID()}`);
    setError('');
  }, []);

  const submit = async () => {
    const amount = Number(monto);
    if (!Number.isFinite(amount) || amount <= 0 || !contracuenta || !descripcion.trim()) {
      setError('Complete monto, descripción y contracuenta');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await post('/api/finanzas/bancos/movimientos', {
        cuenta_bancaria_id: cuenta.id,
        cuenta_contrapartida_id: contracuenta,
        tipo,
        monto: amount,
        moneda: cuenta.moneda,
        ...(tipoCambio ? { tipo_cambio: Number(tipoCambio) } : {}),
        fecha,
        descripcion: descripcion.trim(),
        referencia: referencia.trim() || undefined,
        metodo_pago: 'OTRO',
        categoria: conciliacionId ? 'AJUSTE_CONCILIACION' : categoria,
        conciliacion_id: conciliacionId,
        idempotency_key: intentKey,
      });
      setIntentKey(`bank-movement:${crypto.randomUUID()}`);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar el movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{conciliacionId ? 'Registrar ajuste de conciliación' : 'Nuevo movimiento bancario'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {error && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="bank-type">Tipo</Label><select id="bank-type" value={tipo} onChange={(e) => { setTipo(e.target.value as 'ABONO' | 'CARGO'); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3"><option value="CARGO">Cargo</option><option value="ABONO">Abono</option></select></div>
            <div><Label htmlFor="bank-amount">Monto</Label><input id="bank-amount" type="number" min="0.01" step="0.01" value={monto} onChange={(e) => { setMonto(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          </div>
          <div><Label htmlFor="bank-date">Fecha</Label><input id="bank-date" type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          {!conciliacionId && <div><Label htmlFor="bank-category">Categoría</Label><select id="bank-category" value={categoria} onChange={(e) => { setCategoria(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3"><option value="OTRO_EGRESO">Otro egreso</option><option value="OTRO_INGRESO">Otro ingreso</option><option value="COMISION_BANCARIA">Comisión bancaria</option><option value="INTERES_BANCARIO">Interés bancario</option><option value="IMPUESTO_BANCARIO">Impuesto bancario</option><option value="APORTE_CAPITAL">Aporte de capital</option><option value="PRESTAMO">Préstamo</option></select></div>}
          <div><Label htmlFor="bank-counter">Contracuenta</Label><select id="bank-counter" value={contracuenta} onChange={(e) => { setContracuenta(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3"><option value="">Seleccione</option>{cuentas.map((row) => <option key={row.id} value={row.id}>{row.codigo} - {row.nombre}</option>)}</select></div>
          <div><Label htmlFor="bank-rate">Tipo de cambio a moneda local (sólo moneda extranjera)</Label><input id="bank-rate" type="number" min="0.000001" step="0.000001" value={tipoCambio} onChange={(e) => { setTipoCambio(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          <div><Label htmlFor="bank-description">Descripción</Label><input id="bank-description" value={descripcion} onChange={(e) => { setDescripcion(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
          <div><Label htmlFor="bank-reference">Referencia</Label><input id="bank-reference" value={referencia} onChange={(e) => { setReferencia(e.target.value); changeIntent(); }} className="h-10 w-full rounded-md border bg-background px-3" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} disabled={submitting}>Cancelar</Button><Button onClick={submit} disabled={submitting}>{submitting ? 'Registrando…' : 'Registrar'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
