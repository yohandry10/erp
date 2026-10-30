'use client'

import {useRef, useState} from 'react'
import {Briefcase, Loader2} from 'lucide-react'
import {useApi} from '@/hooks/use-api'
import {usePermission} from '@/hooks/use-permission'
import {useToast} from '@/components/ui/use-toast'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'

export function CrearDepartamentoButton({onCreated}:{onCreated:()=>void|Promise<void>}) {
  const {post}=useApi({throwOnError:true})
  const permission=usePermission('rrhh','access','__global__')
  const {toast}=useToast()
  const [open,setOpen]=useState(false)
  const [saving,setSaving]=useState(false)
  const [form,setForm]=useState({nombre:'',codigo:'',descripcion:''})
  const intents=useRef(new Map<string,string>())
  const save=async()=>{
    if(saving||!form.nombre.trim()||!permission.hasPermission)return
    const payload={nombre:form.nombre.trim(),...(form.codigo.trim()?{codigo:form.codigo.trim()}:{}),...(form.descripcion.trim()?{descripcion:form.descripcion.trim()}:{})}
    const signature=JSON.stringify(payload)
    let key=intents.current.get(signature)
    if(!key){key=`rrhh-department:${crypto.randomUUID()}`;intents.current.set(signature,key)}
    setSaving(true)
    try {
      const response=await post('/rrhh/departamentos',payload,{headers:{'Idempotency-Key':key}})
      if(!(response?.id||response?.data?.id))throw new Error('No se confirmó el alta del departamento. Vuelva a intentar.')
      intents.current.delete(signature);setOpen(false);setForm({nombre:'',codigo:'',descripcion:''})
      toast({title:'Departamento creado'})
      await onCreated()
    } catch(error){toast({title:'No se pudo guardar el departamento',description:error instanceof Error?error.message:'Vuelva a intentar',variant:'destructive'})}
    finally{setSaving(false)}
  }
  if(!permission.hasPermission)return null
  return <>
    <Button variant="outline" className="gap-2" onClick={()=>setOpen(true)}><Briefcase className="h-4 w-4"/>Crear departamento</Button>
    <Dialog open={open} onOpenChange={next=>{if(!saving)setOpen(next)}}><DialogContent>
      <DialogHeader><DialogTitle>Crear departamento</DialogTitle><DialogDescription>Registre un área de su empresa para asignar empleados y publicar vacantes.</DialogDescription></DialogHeader>
      <form onSubmit={event=>{event.preventDefault();void save()}} className="space-y-4">
        <div className="space-y-1"><Label htmlFor="rrhh-department-name">Nombre del departamento</Label><Input id="rrhh-department-name" required maxLength={200} value={form.nombre} disabled={saving} onChange={event=>setForm(current=>({...current,nombre:event.target.value}))}/></div>
        <div className="space-y-1"><Label htmlFor="rrhh-department-code">Código (opcional)</Label><Input id="rrhh-department-code" maxLength={40} value={form.codigo} disabled={saving} onChange={event=>setForm(current=>({...current,codigo:event.target.value}))}/></div>
        <div className="space-y-1"><Label htmlFor="rrhh-department-description">Descripción (opcional)</Label><Textarea id="rrhh-department-description" maxLength={1000} value={form.descripcion} disabled={saving} onChange={event=>setForm(current=>({...current,descripcion:event.target.value}))}/></div>
        <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving||!form.nombre.trim()}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Guardar departamento</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </>
}
