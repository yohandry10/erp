'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

interface EmployeeOption {
  id: string;
  nombres?: string;
  apellidos?: string;
  numero_documento?: string;
}

interface ContractFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  empleados: EmployeeOption[];
}

const initialForm = {
  empleado_id: '',
  tipo_contrato: 'indefinido',
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: '',
  salario: '',
  cargo: '',
  beneficios: '',
};

export function ContractFormDialog({ isOpen, onClose, onSuccess, empleados }: ContractFormDialogProps) {
  const { post } = useApi();
  const { toast } = useToast();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setForm(initialForm);
  }, [isOpen]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.empleado_id || !form.fecha_inicio || !form.salario) return;

    setLoading(true);
    try {
      const response = await post('/api/rrhh/contratos', {
        ...form,
        fecha_fin: form.tipo_contrato === 'indefinido' ? null : form.fecha_fin || null,
        salario: Number(form.salario),
        sueldo_bruto: Number(form.salario),
        moneda: 'PEN',
        estado: 'activo',
        activo: true,
      });
      if (response?.success === false) throw new Error(response.message || 'No se pudo crear el contrato');
      toast({ title: 'Contrato creado', description: 'El contrato laboral se registró correctamente.' });
      onSuccess();
      onClose();
    } catch (error) {
      toast({
        title: 'No se pudo crear el contrato',
        description: error instanceof Error ? error.message : 'Revise los datos e inténtelo nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo contrato</DialogTitle>
          <DialogDescription>Registre las condiciones laborales vigentes del empleado.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="contrato-empleado" className="mb-0">Empleado</Label>
            <Select value={form.empleado_id} onValueChange={(value) => setForm((current) => ({ ...current, empleado_id: value }))}>
              <SelectTrigger id="contrato-empleado"><SelectValue placeholder="Seleccione un empleado" /></SelectTrigger>
              <SelectContent>
                {empleados.map((empleado) => (
                  <SelectItem key={empleado.id} value={empleado.id}>
                    {[empleado.nombres, empleado.apellidos].filter(Boolean).join(' ') || empleado.numero_documento || empleado.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contrato-tipo" className="mb-0">Tipo de contrato</Label>
              <Select value={form.tipo_contrato} onValueChange={(value) => setForm((current) => ({ ...current, tipo_contrato: value }))}>
                <SelectTrigger id="contrato-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indefinido">Indefinido</SelectItem>
                  <SelectItem value="temporal">Temporal</SelectItem>
                  <SelectItem value="practicas">Prácticas</SelectItem>
                  <SelectItem value="locacion_servicios">Locación de servicios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-cargo" className="mb-0">Cargo</Label>
              <Input id="contrato-cargo" value={form.cargo} onChange={(event) => setForm((current) => ({ ...current, cargo: event.target.value }))} placeholder="Ej. Analista contable" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contrato-inicio" className="mb-0">Fecha de inicio</Label>
              <Input id="contrato-inicio" type="date" required value={form.fecha_inicio} onChange={(event) => setForm((current) => ({ ...current, fecha_inicio: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-fin" className="mb-0">Fecha de fin</Label>
              <Input id="contrato-fin" type="date" disabled={form.tipo_contrato === 'indefinido'} required={form.tipo_contrato !== 'indefinido'} value={form.fecha_fin} onChange={(event) => setForm((current) => ({ ...current, fecha_fin: event.target.value }))} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contrato-salario" className="mb-0">Salario mensual (S/)</Label>
              <Input id="contrato-salario" type="number" min="0" step="0.01" required value={form.salario} onChange={(event) => setForm((current) => ({ ...current, salario: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-beneficios" className="mb-0">Beneficios</Label>
              <Input id="contrato-beneficios" value={form.beneficios} onChange={(event) => setForm((current) => ({ ...current, beneficios: event.target.value }))} placeholder="Beneficios según ley" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || empleados.length === 0}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              Crear contrato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
