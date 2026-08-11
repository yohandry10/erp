'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useCountryContext } from '@/hooks/use-country-context';

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

const AFP_FLOW_RATES: Record<string, string> = {
  HABITAT: '0.0147',
  INTEGRA: '0.0155',
  PRIMA: '0.0160',
  PROFUTURO: '0.0169',
};

const createInitialForm = (countryCode: string) => ({
  empleado_id: '',
  tipo_contrato: 'indefinido',
  fecha_inicio: new Date().toISOString().slice(0, 10),
  fecha_fin: '',
  salario: '',
  cargo: '',
  beneficios: '',
  regimen_pensionario: countryCode === 'AR' ? 'SIN_REGIMEN' : countryCode === 'CO' ? 'PENSION_COLOMBIA' : 'AFP',
  afp_codigo: 'INTEGRA',
  tipo_comision_afp: 'FLUJO',
  tasa_comision_afp: AFP_FLOW_RATES.INTEGRA,
  tasa_seguro_afp: '0.0137',
  regimen_seguridad_social: countryCode === 'AR' ? 'SIPA' : countryCode === 'CO' ? 'PILA' : '',
  jornada_laboral: 'tiempo_completo',
  periodo_prueba_meses: countryCode === 'AR' ? '6' : countryCode === 'CO' ? '2' : '3',
  convenio_colectivo_codigo: '',
  categoria_convenio: '',
  modalidad_contratacion_codigo: '',
  obra_social_codigo: '',
  sindicato_codigo: '',
  sindicato_aporte_tasa: '0',
  art_cuit: '',
  art_tasa: '',
  ganancias_retencion_mensual: '0',
  eps_codigo: '',
  fondo_pension_codigo: '',
  arl_codigo: '',
  caja_compensacion_codigo: '',
});

export function ContractFormDialog({ isOpen, onClose, onSuccess, empleados }: ContractFormDialogProps) {
  const { get, post } = useApi();
  const { toast } = useToast();
  const country = useCountryContext();
  const isArgentina = country.paisCodigo === 'AR';
  const isColombia = country.paisCodigo === 'CO';
  const [form, setForm] = useState(() => createInitialForm('PE'));
  const [loading, setLoading] = useState(false);
  const createIntent = useRef('');

  useEffect(() => {
    if (!isOpen) return;
    createIntent.current = `rrhh-contract-create:${crypto.randomUUID()}`;
    const initial = createInitialForm(country.paisCodigo);
    setForm(initial);
    if (!isArgentina && !isColombia) return;

    void get('/rrhh/configuracion-laboral').then((response) => {
      const config = response?.data?.configuracion;
      if (!config) return;
      setForm((current) => isArgentina ? ({
          ...current,
          convenio_colectivo_codigo: config.convenio_colectivo_codigo || '',
          categoria_convenio: config.categoria_default || '',
          modalidad_contratacion_codigo: config.modalidad_contratacion_codigo_default || '201',
          obra_social_codigo: config.obra_social_codigo_default || '',
          sindicato_codigo: config.sindicato_codigo_default || '',
          sindicato_aporte_tasa: String(config.sindicato_aporte_default ?? 0),
          art_cuit: config.art_cuit || '',
          art_tasa: String(config.art_tasa ?? ''),
          periodo_prueba_meses: String(config.periodo_prueba_max_meses ?? 6),
        }) : ({
          ...current,
          eps_codigo: config.eps_default || '',
          fondo_pension_codigo: config.fondo_pension_default || '',
          arl_codigo: config.arl_default || '',
          caja_compensacion_codigo: config.caja_compensacion_default || '',
          art_tasa: String(config.arl_tasa ?? 0.00522),
        }));
    });
  }, [country.paisCodigo, get, isOpen, isArgentina, isColombia]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.empleado_id || !form.fecha_inicio || !form.salario) return;

    setLoading(true);
    try {
      const response = await post('/rrhh/contratos', {
        ...form,
        fecha_fin: form.tipo_contrato === 'indefinido' ? null : form.fecha_fin || null,
        salario: Number(form.salario),
        sueldo_bruto: Number(form.salario),
        periodo_prueba_meses: Number(form.periodo_prueba_meses) || 0,
        moneda: country.moneda || (isArgentina ? 'ARS' : isColombia ? 'COP' : 'PEN'),
        sindicato_aporte_tasa: Number(form.sindicato_aporte_tasa) || 0,
        art_tasa: Number(form.art_tasa) || 0,
        ganancias_retencion_mensual: Number(form.ganancias_retencion_mensual) || 0,
        tasa_comision_afp: Number(form.tasa_comision_afp) || 0,
        tasa_seguro_afp: Number(form.tasa_seguro_afp) || 0,
        estado: 'vigente',
        activo: true,
      }, {
        headers: { 'Idempotency-Key': createIntent.current },
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
                  {isArgentina ? (
                    <>
                      <SelectItem value="indefinido">Tiempo indeterminado</SelectItem>
                      <SelectItem value="plazo_fijo">Plazo fijo</SelectItem>
                      <SelectItem value="temporada">Temporada</SelectItem>
                      <SelectItem value="eventual">Eventual</SelectItem>
                    </>
                  ) : isColombia ? (
                    <>
                      <SelectItem value="indefinido">Término indefinido</SelectItem>
                      <SelectItem value="fijo">Término fijo</SelectItem>
                      <SelectItem value="obra_labor">Obra o labor</SelectItem>
                      <SelectItem value="prestacion_servicios">Prestación de servicios</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="indefinido">Indefinido</SelectItem>
                      <SelectItem value="temporal">Temporal</SelectItem>
                      <SelectItem value="practicas">Prácticas</SelectItem>
                      <SelectItem value="locacion_servicios">Locación de servicios</SelectItem>
                    </>
                  )}
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
              <Label htmlFor="contrato-salario" className="mb-0">
                Salario mensual ({country.moneda || 'PEN'})
              </Label>
              <Input id="contrato-salario" type="number" min="0" step="0.01" required value={form.salario} onChange={(event) => setForm((current) => ({ ...current, salario: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-beneficios" className="mb-0">Beneficios</Label>
              <Input id="contrato-beneficios" value={form.beneficios} onChange={(event) => setForm((current) => ({ ...current, beneficios: event.target.value }))} placeholder="Beneficios según ley" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="contrato-regimen" className="mb-0">
                {isArgentina ? 'Seguridad social' : isColombia ? 'Sistema pensional' : 'Régimen pensionario'}
              </Label>
              <Select value={form.regimen_pensionario} onValueChange={(value) => setForm((current) => ({ ...current, regimen_pensionario: value }))}>
                <SelectTrigger id="contrato-regimen"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isArgentina ? (
                    <SelectItem value="SIN_REGIMEN">SIPA / ARCA</SelectItem>
                  ) : isColombia ? (
                    <SelectItem value="PENSION_COLOMBIA">Pensión / PILA</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="AFP">AFP</SelectItem>
                      <SelectItem value="ONP">ONP</SelectItem>
                      <SelectItem value="SIN_REGIMEN">Sin régimen</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isArgentina
                  ? 'Aportes jubilatorios, INSSJP y obra social.'
                  : isColombia
                    ? 'Aportes a pensión, salud, ARL y parafiscales mediante PILA.'
                    : 'Define el descuento previsional en planilla.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-jornada" className="mb-0">Jornada laboral</Label>
              <Select value={form.jornada_laboral} onValueChange={(value) => setForm((current) => ({ ...current, jornada_laboral: value }))}>
                <SelectTrigger id="contrato-jornada"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tiempo_completo">
                    Tiempo completo ({isArgentina ? 'según CCT' : isColombia ? 'jornada legal vigente' : '48h'})
                  </SelectItem>
                  <SelectItem value="part_time">Part time (&lt;4h/día)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contrato-prueba" className="mb-0">Periodo de prueba (meses)</Label>
              <Input id="contrato-prueba" type="number" min="0" max="12" step="1" value={form.periodo_prueba_meses} onChange={(event) => setForm((current) => ({ ...current, periodo_prueba_meses: event.target.value }))} />
              <p className="text-xs text-muted-foreground">
                {isArgentina
                  ? 'Límite configurado por tamaño de empresa/CCT; base general 6 meses.'
                  : isColombia
                    ? 'Se aplica el límite legal vigente según el contrato.'
                  : '3 general · 6 calificados · 12 dirección.'}
              </p>
            </div>
          </div>

          {!isArgentina && !isColombia && form.regimen_pensionario === 'AFP' ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <h3 className="font-semibold">Sistema Privado de Pensiones — AFP</h3>
                <p className="text-xs text-muted-foreground">
                  Tasas SBS vigentes: aporte obligatorio 10 % y prima de seguro 1,37 %. La comisión
                  sobre flujo depende de la AFP; en comisión sobre saldo no se descuenta comisión de la remuneración.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="contrato-afp">AFP</Label>
                  <Select
                    value={form.afp_codigo}
                    onValueChange={(value) => setForm((current) => ({
                      ...current,
                      afp_codigo: value,
                      tasa_comision_afp: current.tipo_comision_afp === 'FLUJO' ? AFP_FLOW_RATES[value] : '0',
                    }))}
                  >
                    <SelectTrigger id="contrato-afp"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HABITAT">AFP Habitat</SelectItem>
                      <SelectItem value="INTEGRA">AFP Integra</SelectItem>
                      <SelectItem value="PRIMA">Prima AFP</SelectItem>
                      <SelectItem value="PROFUTURO">Profuturo AFP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-afp-comision">Esquema de comisión</Label>
                  <Select
                    value={form.tipo_comision_afp}
                    onValueChange={(value) => setForm((current) => ({
                      ...current,
                      tipo_comision_afp: value,
                      tasa_comision_afp: value === 'FLUJO' ? AFP_FLOW_RATES[current.afp_codigo] : '0',
                    }))}
                  >
                    <SelectTrigger id="contrato-afp-comision"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FLUJO">Sobre flujo</SelectItem>
                      <SelectItem value="SALDO">Sobre saldo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-afp-tasa">Comisión en planilla</Label>
                  <Input id="contrato-afp-tasa" value={`${(Number(form.tasa_comision_afp) * 100).toFixed(2)} %`} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-afp-seguro">Prima de seguro</Label>
                  <Input id="contrato-afp-seguro" value={`${(Number(form.tasa_seguro_afp) * 100).toFixed(2)} %`} disabled />
                </div>
              </div>
            </div>
          ) : null}

          {isArgentina ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <h3 className="font-semibold">Registración laboral Argentina</h3>
                <p className="text-xs text-muted-foreground">
                  Datos utilizados por ARCA, Libro de Sueldos Digital y Formulario 931.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contrato-cct">Convenio colectivo (CCT)</Label>
                  <Input id="contrato-cct" required value={form.convenio_colectivo_codigo} onChange={(event) => setForm((current) => ({ ...current, convenio_colectivo_codigo: event.target.value }))} placeholder="Ej. 130/75" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-categoria">Categoría de convenio</Label>
                  <Input id="contrato-categoria" required value={form.categoria_convenio} onChange={(event) => setForm((current) => ({ ...current, categoria_convenio: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-modalidad-arca">Modalidad de contratación ARCA</Label>
                  <Input id="contrato-modalidad-arca" value={form.modalidad_contratacion_codigo} onChange={(event) => setForm((current) => ({ ...current, modalidad_contratacion_codigo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-obra-social">Código de obra social</Label>
                  <Input id="contrato-obra-social" value={form.obra_social_codigo} onChange={(event) => setForm((current) => ({ ...current, obra_social_codigo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-art-cuit">CUIT de ART</Label>
                  <Input id="contrato-art-cuit" required value={form.art_cuit} onChange={(event) => setForm((current) => ({ ...current, art_cuit: event.target.value }))} inputMode="numeric" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-art-tasa">Alícuota ART</Label>
                  <Input id="contrato-art-tasa" required type="number" min="0.000001" max="1" step="0.000001" value={form.art_tasa} onChange={(event) => setForm((current) => ({ ...current, art_tasa: event.target.value }))} placeholder="0.03" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-sindicato">Sindicato</Label>
                  <Input id="contrato-sindicato" value={form.sindicato_codigo} onChange={(event) => setForm((current) => ({ ...current, sindicato_codigo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-sindicato-tasa">Aporte sindical</Label>
                  <Input id="contrato-sindicato-tasa" type="number" min="0" max="1" step="0.000001" value={form.sindicato_aporte_tasa} onChange={(event) => setForm((current) => ({ ...current, sindicato_aporte_tasa: event.target.value }))} />
                </div>
              </div>
            </div>
          ) : isColombia ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <h3 className="font-semibold">Seguridad social Colombia</h3>
                <p className="text-xs text-muted-foreground">
                  Datos utilizados para PILA, aportes, parafiscales y nómina electrónica.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contrato-eps-co">EPS</Label>
                  <Input id="contrato-eps-co" required value={form.eps_codigo} onChange={(event) => setForm((current) => ({ ...current, eps_codigo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-pension-co">Fondo de pensión</Label>
                  <Input id="contrato-pension-co" required value={form.fondo_pension_codigo} onChange={(event) => setForm((current) => ({ ...current, fondo_pension_codigo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-arl-co">ARL</Label>
                  <Input id="contrato-arl-co" required value={form.arl_codigo} onChange={(event) => setForm((current) => ({ ...current, arl_codigo: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contrato-arl-tasa-co">Tasa ARL</Label>
                  <Input id="contrato-arl-tasa-co" required type="number" min="0.000001" max="1" step="0.000001" value={form.art_tasa} onChange={(event) => setForm((current) => ({ ...current, art_tasa: event.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="contrato-caja-co">Caja de compensación</Label>
                  <Input id="contrato-caja-co" required value={form.caja_compensacion_codigo} onChange={(event) => setForm((current) => ({ ...current, caja_compensacion_codigo: event.target.value }))} />
                </div>
              </div>
            </div>
          ) : null}

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
