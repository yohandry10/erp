'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { usePermission } from '@/hooks/use-permission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CashDialogFrame } from './CashDialogFrame';

type Caja = {
    id: string;
    nombre: string;
    codigo?: string | null;
    descripcion?: string | null;
    estado: string;
    sucursal_id?: string | null;
    almacen_id?: string | null;
};
type Sucursal = { id: string; nombre: string; codigo_establecimiento: string; activo: boolean };
type Almacen = { id: string; nombre: string; codigo: string; activo?: boolean; sucursal_id?: string | null };
type Form = { nombre: string; descripcion: string; sucursal_id: string; almacen_id: string; estado: string };

const ERRORES: Record<string, string> = {
    CASH_WAREHOUSE_NOT_ACTIVE_IN_TENANT: 'El almacén elegido no está activo.',
    CASH_BRANCH_NOT_ACTIVE_IN_TENANT: 'El establecimiento elegido no está activo.',
    CASH_MASTER_OPEN_SESSION_BLOCKS_CRITICAL_CHANGE: 'La caja tiene una sesión abierta: ciérrela antes de cambiar su almacén o desactivarla.',
    CASH_WAREHOUSE_BRANCH_MISMATCH: 'El almacén debe pertenecer al mismo establecimiento que la caja.',
};
const mensaje = (error: unknown, fallback: string) => {
    const texto = error instanceof Error ? error.message : '';
    const codigo = Object.keys(ERRORES).find(clave => texto.includes(clave));
    return codigo ? ERRORES[codigo] : texto || fallback;
};

export function CashRegistersManager({ onChanged }: { onChanged: () => void }) {
    const { get, post, put } = useApi({ throwOnError: true, showErrorToast: false });
    const { hasPermission: canCreate } = usePermission('cajas', 'crear', '');
    const { hasPermission: canEdit } = usePermission('cajas', 'editar', '');
    const { hasPermission: canReadBranches } = usePermission('configuracion', 'ver', 'sucursales');
    const { hasPermission: canReadWarehouses } = usePermission('inventario', 'read', 'almacenes');
    const [cajas, setCajas] = useState<Caja[]>([]);
    const [sucursales, setSucursales] = useState<Sucursal[]>([]);
    const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
    const [editor, setEditor] = useState<{ id?: string; data: Form } | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intents = useRef(new Map<string, string>());
    const intentFor = (signature: string) => {
        if (!intents.current.has(signature)) intents.current.set(signature, `caja:${crypto.randomUUID()}`);
        return intents.current.get(signature)!;
    };

    const cargar = useCallback(async () => {
        // Cada lista depende de un permiso distinto: una lectura denegada no
        // debe ocultar las demás.
        const [rCajas, rSucursales, rAlmacenes] = await Promise.allSettled([
            get('/cajas'),
            canReadBranches ? get('/sucursales') : Promise.resolve({ data: [] }),
            canReadWarehouses ? get('/inventario/almacenes') : Promise.resolve({ data: [] }),
        ]);
        const datos = (r: PromiseSettledResult<any>) =>
            r.status === 'fulfilled' && Array.isArray(r.value?.data) ? r.value.data : [];
        if (rCajas.status === 'rejected') setError('No se pudieron cargar las cajas registradas.');
        setCajas(datos(rCajas));
        setSucursales(datos(rSucursales).filter((s: Sucursal) => s.activo));
        setAlmacenes(datos(rAlmacenes).filter((a: Almacen) => a.activo !== false));
    }, [get, canReadBranches, canReadWarehouses]);

    useEffect(() => { void cargar(); }, [cargar]);

    const nombreSucursal = (id?: string | null) => {
        const s = sucursales.find(x => x.id === id);
        return s ? `${s.codigo_establecimiento} · ${s.nombre}` : '—';
    };
    const nombreAlmacen = (id?: string | null) => almacenes.find(x => x.id === id)?.nombre ?? '—';
    // Un almacén sin establecimiento conocido sigue siendo elegible (datos previos a la 503).
    const almacenesDe = (sucursalId: string) => almacenes.filter(a => !a.sucursal_id || !sucursalId || a.sucursal_id === sucursalId);

    const abrirNueva = () => {
        const principal = sucursales[0]?.id ?? '';
        setError(null);
        setEditor({ data: { nombre: '', descripcion: '', sucursal_id: principal, almacen_id: almacenesDe(principal)[0]?.id ?? '', estado: 'ACTIVO' } });
    };

    const guardar = async () => {
        if (!editor || !editor.data.nombre.trim() || !editor.data.almacen_id) return;
        setSaving(true);
        setError(null);
        const payload: Record<string, string> = {
            nombre: editor.data.nombre.trim(),
            almacen_id: editor.data.almacen_id,
        };
        if (editor.data.descripcion.trim()) payload.descripcion = editor.data.descripcion.trim();
        if (editor.data.sucursal_id) payload.sucursal_id = editor.data.sucursal_id;
        if (editor.id) payload.estado = editor.data.estado;
        const signature = JSON.stringify({ id: editor.id ?? null, payload });
        try {
            const options = { headers: { 'idempotency-key': intentFor(signature) } };
            if (editor.id) await put(`/cajas/${editor.id}`, payload, options);
            else await post('/cajas', payload, options);
            intents.current.delete(signature);
            setEditor(null);
            await cargar();
            onChanged();
        } catch (err) {
            setError(mensaje(err, 'No se pudo guardar la caja.'));
        } finally {
            setSaving(false);
        }
    };

    const set = (campo: keyof Form, valor: string) => setEditor(prev => {
        if (!prev) return prev;
        const data = { ...prev.data, [campo]: valor };
        if (campo === 'sucursal_id' && !almacenesDe(valor).some(a => a.id === data.almacen_id)) {
            data.almacen_id = almacenesDe(valor)[0]?.id ?? '';
        }
        return { ...prev, data };
    });

    if (!canCreate && !canEdit) return null;

    return (
        <section className="rounded-xl border p-5 shadow" aria-labelledby="cajas-registradas">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 id="cajas-registradas" className="text-lg font-bold">Cajas registradas</h2>
                    <p className="text-sm text-muted-foreground">Cada caja pertenece a un establecimiento y descuenta stock de su almacén.</p>
                </div>
                {canCreate && (
                    <Button type="button" onClick={abrirNueva} disabled={almacenes.length === 0}>
                        <Plus className="mr-2 size-4" aria-hidden="true" /> Nueva caja
                    </Button>
                )}
            </div>
            {canCreate && almacenes.length === 0 && (
                <p className="mb-3 text-sm text-muted-foreground">Primero registre un almacén en Inventario → Almacenes.</p>
            )}
            {error && !editor && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
            {cajas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay cajas registradas.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted-foreground">
                                <th className="py-2 pr-3">Caja</th><th className="py-2 pr-3">Establecimiento</th>
                                <th className="py-2 pr-3">Almacén</th><th className="py-2 pr-3">Estado</th><th className="py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {cajas.map(caja => (
                                <tr key={caja.id} className="border-t">
                                    <td className="py-2 pr-3 font-semibold">{caja.nombre}{caja.codigo ? <span className="ml-2 text-xs text-muted-foreground">{caja.codigo}</span> : null}</td>
                                    <td className="py-2 pr-3">{nombreSucursal(caja.sucursal_id)}</td>
                                    <td className="py-2 pr-3">{nombreAlmacen(caja.almacen_id)}</td>
                                    <td className="py-2 pr-3">{caja.estado}</td>
                                    <td className="py-2 text-right">
                                        {canEdit && (
                                            <Button type="button" variant="outline" size="sm" aria-label={`Editar caja ${caja.nombre}`}
                                                onClick={() => { setError(null); setEditor({ id: caja.id, data: { nombre: caja.nombre, descripcion: caja.descripcion ?? '', sucursal_id: caja.sucursal_id ?? '', almacen_id: caja.almacen_id ?? '', estado: String(caja.estado || 'ACTIVO').toUpperCase() } }); }}>
                                                <Pencil className="mr-1 size-3.5" aria-hidden="true" /> Editar
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CashDialogFrame
                isOpen={editor !== null}
                onClose={() => setEditor(null)}
                preventClose={saving}
                title={editor?.id ? 'Editar caja' : 'Nueva caja'}
                description="Defina dónde opera la caja y de qué almacén descuenta lo vendido."
            >
                {editor && (
                    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void guardar(); }}>
                        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                        <label className="block text-sm font-semibold">Nombre *
                            <Input className="mt-1" value={editor.data.nombre} maxLength={120} required onChange={e => set('nombre', e.target.value)} />
                        </label>
                        <label className="block text-sm font-semibold">Establecimiento
                            <select aria-label="Establecimiento" className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={editor.data.sucursal_id} onChange={e => set('sucursal_id', e.target.value)}>
                                {sucursales.map(s => <option key={s.id} value={s.id}>{s.codigo_establecimiento} · {s.nombre}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold">Almacén *
                            <select aria-label="Almacén *" className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={editor.data.almacen_id} required onChange={e => set('almacen_id', e.target.value)}>
                                <option value="" disabled>Seleccione un almacén</option>
                                {almacenesDe(editor.data.sucursal_id).map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-semibold">Descripción
                            <Input className="mt-1" value={editor.data.descripcion} maxLength={300} onChange={e => set('descripcion', e.target.value)} />
                        </label>
                        {editor.id && (
                            <label className="block text-sm font-semibold">Estado
                                <select className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={editor.data.estado} onChange={e => set('estado', e.target.value)}>
                                    <option value="ACTIVO">Activa</option>
                                    <option value="INACTIVO">Inactiva</option>
                                </select>
                            </label>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={saving}>Cancelar</Button>
                            <Button type="submit" disabled={saving || !editor.data.nombre.trim() || !editor.data.almacen_id}>{saving ? 'Guardando…' : 'Guardar caja'}</Button>
                        </div>
                    </form>
                )}
            </CashDialogFrame>
        </section>
    );
}
