"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermission } from '@/hooks/use-permission';
import { useApi } from '@/hooks/use-api';
import { customAuth } from '@/lib/auth-service';
import { readLivePayroll, readPayrollList, readPayrollDetail } from '@/lib/rrhh/payroll-read-contract';
import { payrollApprovalIntentKey, readPayrollApprovalIntent, createPayrollApprovalIntent, confirmPayrollApprovalReceipt, confirmApprovedPayrollPhotograph, confirmPayrollApprovalSource, type PayrollApprovalIntent } from '@/lib/rrhh/payroll-approval-operation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = { request: any; planillas: any[]; listLoading: boolean; listError: string | null; onClose: () => void; onSuccess: () => void };
export default function PlanillaAprobarModal({ request, planillas, listLoading, listError, onClose, onSuccess }: Props) {
  const { session } = useAuth();
  const { hasPermission: canApprove, loading: permissionLoading } = usePermission('rrhh','approve','planillas');
  const { post } = useApi({requireLive:true,retries:0,throwOnError:true,showErrorToast:false});
  const tenantId=session?.user?.tenant_id || '',actorId=session?.user?.id || '',scope=`${tenantId}:${actorId}`;
  const activeScope=useRef(scope);activeScope.current=scope;
  const allowed=useRef(false);allowed.current=canApprove && !permissionLoading;
  const callbacks=useRef({onClose,onSuccess});callbacks.current={onClose,onSuccess};
  const epoch=useRef(0),generation=useRef(0),writing=useRef(false),pendingBytes=useRef<string|null>(null);
  const [selected,setSelected]=useState<any>(null),[intent,setIntent]=useState<PayrollApprovalIntent|null>(null);
  const [readyScope,setReadyScope]=useState(''),[storageError,setStorageError]=useState(''),[error,setError]=useState('');
  const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[preview,setPreview]=useState<{header:any;details:any[]}|null>(null);
  const visibleIntent=intent?.tenantId===tenantId && intent.actorId===actorId ? intent : null;
  const intentRef=useRef(visibleIntent);intentRef.current=visibleIntent;
  const selectedId=selected?.tenant_id===tenantId ? selected.id : null;

  const recover=useCallback(()=>{
    setStorageError('');setReadyScope('');setIntent(null);pendingBytes.current=null;
    if (!tenantId || !actorId || !allowed.current) return;
    try {
      const raw=localStorage.getItem(payrollApprovalIntentKey({tenantId,actorId}));
      setIntent(readPayrollApprovalIntent(raw,{tenantId,actorId}));pendingBytes.current=raw;
    } catch (e:any) {setStorageError(e?.message || 'No se pudo recuperar la aprobación pendiente.');}
    setReadyScope(scope);
  },[tenantId,actorId,scope,canApprove,permissionLoading]);
  useEffect(()=>{
    epoch.current++;generation.current++;writing.current=false;setSelected(null);setPreview(null);setSaving(false);setError('');recover();
    window.addEventListener('storage',recover);window.addEventListener('focus',recover);
    return ()=>{epoch.current++;generation.current++;window.removeEventListener('storage',recover);window.removeEventListener('focus',recover);};
  },[recover]);
  useEffect(()=>{
    if (!request || readyScope!==scope || !allowed.current) return;
    const pending=intentRef.current;
    if (request.tenant_id!==tenantId || storageError || pending && pending.payroll.id!==request.id) {
      setError(storageError || 'Existe otra aprobación pendiente. Retome su planilla original.');callbacks.current.onClose();return;
    }
    setSelected(request);setPreview(null);setError('');
  },[request,readyScope,scope,tenantId,storageError]);

  const currentActor=async()=>{
    const actor=(await customAuth.getRequestSession()).session?.user;
    if (!actor || `${actor.tenant_id}:${actor.id}`!==scope || activeScope.current!==scope || !allowed.current) throw new Error('La sesión cambió. La aprobación pendiente se conserva.');
  };
  const load=useCallback(async()=>{
    if (!selectedId || readyScope!==scope || storageError || !allowed.current) return;
    const turn=++generation.current;setLoading(true);setError('');setPreview(null);
    try {
      const actor=(await customAuth.getRequestSession()).session?.user;
      if (!actor || `${actor.tenant_id}:${actor.id}`!==scope) throw new Error('La sesión cambió. Consulte nuevamente la aprobación.');
      const [headers,details]=await Promise.all([readLivePayroll('/api/rrhh/planillas',readPayrollList),readLivePayroll(`/api/rrhh/planillas/${selectedId}/detalle`,v=>readPayrollDetail(v,selected))]);
      const header=headers.find(row=>row.id===selectedId && row.tenant_id===tenantId);
      const current=(await customAuth.getRequestSession()).session?.user;
      if (!current || `${current.tenant_id}:${current.id}`!==scope || turn!==generation.current || activeScope.current!==scope || !allowed.current) return;
      if (!header || !['calculada','aprobada','pagada'].includes(header.estado)) throw new Error('La planilla actual no permite recuperar esta aprobación. Sus datos se conservan.');
      const raw=localStorage.getItem(payrollApprovalIntentKey({tenantId,actorId}));
      const existing=readPayrollApprovalIntent(raw,{tenantId,actorId});
      if (existing && existing.payroll.id!==selectedId) throw new Error('Retome la aprobación pendiente de su planilla original.');
      if (existing) confirmPayrollApprovalSource(header,details,existing,{tenantId,actorId});
      if (!existing) {
        if (header.metadata?.calculada_por===actorId) throw new Error('La persona que calculó la planilla no puede aprobarla. Debe intervenir otro aprobador.');
        createPayrollApprovalIntent({tenantId,actorId},header,details);
      }
      pendingBytes.current=raw;setIntent(existing);setPreview({header,details});
    } catch (e:any) {if (turn===generation.current && activeScope.current===scope) setError(e?.message || 'No se pudo consultar la planilla completa.');}
    finally {if (turn===generation.current) setLoading(false);}
  },[selectedId,selected,tenantId,actorId,scope,readyScope,storageError]);
  useEffect(()=>{void load();return ()=>{generation.current++;epoch.current++;};},[load]);
  const close=()=>{epoch.current++;generation.current++;setSelected(null);setPreview(null);setError('');callbacks.current.onClose();};

  const approve=async()=>{
    if (!preview || !selectedId || loading || saving || writing.current || storageError || readyScope!==scope || !allowed.current) return;
    const turn=epoch.current,submitted=scope;
    const active=()=>turn===epoch.current && submitted===activeScope.current && allowed.current;
    try {
      writing.current=true;setSaving(true);setError('');await currentActor();
      const own={tenantId,actorId},key=payrollApprovalIntentKey(own);let raw=localStorage.getItem(key);
      if (raw!==pendingBytes.current) throw new Error('La aprobación cambió en otra ventana. Consulte nuevamente antes de reintentar.');
      let candidate=readPayrollApprovalIntent(raw,own) || createPayrollApprovalIntent(own,preview.header,preview.details);
      if (candidate.payroll.id!==selectedId) throw new Error('Retome la planilla original de la aprobación pendiente.');
      if (raw===null) {
        raw=JSON.stringify(candidate);localStorage.setItem(key,raw);
        if (localStorage.getItem(key)!==raw) throw new Error('No se pudo conservar la aprobación antes de enviarla.');
      }
      pendingBytes.current=raw;setIntent(candidate);
      if (candidate.stage==='APPROVE') {
        const response=await post(`/api/rrhh/planillas/${candidate.payroll.id}/aprobar`);
        await currentActor();if (!active()) return;
        const verified=confirmPayrollApprovalReceipt(response,candidate,own),next=JSON.stringify(verified);
        if (localStorage.getItem(key)!==raw) throw new Error('La aprobación pendiente cambió. Se conserva la operación de otra ventana.');
        localStorage.setItem(key,next);
        if (localStorage.getItem(key)!==next) throw new Error('No se pudo conservar la verificación. Reintente la misma aprobación.');
        raw=next;candidate=verified;pendingBytes.current=raw;setIntent(candidate);
      }
      const [headers,details]=await Promise.all([readLivePayroll('/api/rrhh/planillas',readPayrollList),readLivePayroll(`/api/rrhh/planillas/${candidate.payroll.id}/detalle`,v=>readPayrollDetail(v,preview.header))]);
      await currentActor();if (!active()) return;
      confirmApprovedPayrollPhotograph(headers.find(row=>row.id===candidate.payroll.id),details,candidate,own);
      if (localStorage.getItem(key)!==raw) throw new Error('La aprobación cambió. No se retira la operación de otra ventana.');
      localStorage.removeItem(key);if (localStorage.getItem(key)!==null) throw new Error('No se pudo retirar la aprobación confirmada. Reintente su verificación.');
      pendingBytes.current=null;setIntent(null);alert('✅ Planilla aprobada: fotografía y evento de devengo confirmados.');callbacks.current.onSuccess();close();
    } catch (e:any) {if (active()) setError(e?.message || 'No se pudo confirmar la aprobación. El intento se conserva.');}
    finally {if (active()) {writing.current=false;setSaving(false);}}
  };
  if (!canApprove || permissionLoading || !tenantId || !actorId) return null;
  return <>
    {readyScope===scope && storageError && <div role="alert" className="mb-4 rounded-xl border border-destructive p-4"><p>{storageError}</p><Button onClick={recover}>Reintentar recuperación de aprobación</Button></div>}
    {!selectedId && visibleIntent && <div className="mb-4 rounded-xl border border-amber-500/40 p-4" role="status" data-testid="payroll-approval-pending">
      <p className="font-semibold">Aprobación pendiente · {visibleIntent.payroll.period}</p><p>{visibleIntent.payroll.currency} {visibleIntent.payroll.net.toFixed(2)} · {visibleIntent.payroll.employees.length} empleados</p>
      <p>{visibleIntent.stage==='VERIFY'?'El recibo se conserva. Falta verificar la fotografía actual; no se repetirá el envío.':'Conserve el mismo intento y reintente manualmente con conexión.'}</p>
      <Button disabled={listLoading || !!listError || saving || !planillas.some(row=>row.id===visibleIntent.payroll.id && row.tenant_id===tenantId)} onClick={()=>{setError('');setSelected(planillas.find(row=>row.id===visibleIntent.payroll.id && row.tenant_id===tenantId));}}>Retomar aprobación pendiente</Button>
    </div>}
    {!selectedId && error && <div role="alert" className="mb-4 rounded-xl border border-destructive p-4">{error}</div>}
    <Dialog open={!!selectedId} onOpenChange={open=>{if(!open && !saving)close();}}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Aprobar planilla {selected?.periodo}</DialogTitle></DialogHeader>
        {visibleIntent && <div role="status" data-testid="payroll-approval-modal-pending"><p>Aprobación pendiente · {visibleIntent.payroll.period}</p><p>{visibleIntent.stage==='VERIFY'?'Verificación pendiente; el recibo se conserva.':'Se conserva la fotografía original para reintentar.'}</p></div>}
        {error && <div role="alert" className="rounded-lg border border-destructive p-3">{error}</div>}
        {!preview ? <div>{loading?<p>Cargando planilla actual…</p>:<Button onClick={()=>void load()} disabled={saving || !!storageError}>Reintentar consulta de aprobación</Button>}</div>:<>
          <p>Una vez aprobada no se podrá modificar. Se confirmará el evento durable de devengo y se verificará la fotografía actual de la planilla.</p>
          <p>{preview.header.moneda} {Number(preview.header.total_neto).toFixed(2)} · {preview.details.length} empleados</p>
          <ul>{preview.details.map(d=><li key={d.id_empleado}>{d.empleados.nombres} {d.empleados.apellidos} · {Number(d.neto_pagar).toFixed(2)}</li>)}</ul>
          <Button variant="outline" onClick={()=>void load()} disabled={saving}>Actualizar consulta de aprobación</Button>
        </>}
        <div className="flex justify-end gap-3"><Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
          {preview && <Button onClick={()=>void approve()} disabled={saving || loading || !!storageError || readyScope!==scope}>{saving?'Procesando…':visibleIntent?.stage==='VERIFY'?'Verificar aprobación pendiente':visibleIntent?'Reintentar aprobación pendiente':'Confirmar aprobación'}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
