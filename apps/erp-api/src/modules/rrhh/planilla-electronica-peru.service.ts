import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupabaseService } from '../../shared/supabase/supabase.service';

type Hallazgo = { codigo: string; mensaje: string; empleado_id?: string };
type ArchivoFuente = { nombre: string; tipo: string; contenido: string; sha256: string };

export interface FuentePlanillaPeru {
  empresa: any;
  planilla: any;
  detalles: any[];
  empleados: any[];
  contratos: any[];
  fichas: any[];
  conceptosDetalle: any[];
  conceptos: any[];
  cuartaCategoria?: any[];
  proveedores?: any[];
  asistencias?: any[];
}

const csv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const dinero = (value: unknown) => (Math.round(Number(value || 0) * 100) / 100).toFixed(2);
const fechaPvs = (value: unknown) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};
const lineaPvs = (campos: unknown[]) => `${campos.map((campo) => String(campo ?? '').trim()).join('|')}|`;
const archivo = (nombre: string, tipo: string, contenido: string): ArchivoFuente => ({
  nombre,
  tipo,
  contenido,
  sha256: createHash('sha256').update(contenido, 'utf8').digest('hex'),
});

function codigoDocumento(tipo: unknown): string | null {
  const normalizado = String(tipo || '').trim().toUpperCase();
  const codigos: Record<string, string> = {
    DNI: '01', CE: '04', PASAPORTE: '07', REFUGIO: '09',
    'CARNET RR.EE.': '22', CPP: '23', EXTRANJERO: '24',
  };
  return codigos[normalizado] || null;
}

function contratoVigente(contratos: any[], empleadoId: string, periodo: string) {
  const finMes = new Date(`${periodo}-01T00:00:00Z`);
  finMes.setUTCMonth(finMes.getUTCMonth() + 1);
  finMes.setUTCDate(0);
  const fin = finMes.toISOString().slice(0, 10);
  return contratos
    .filter((item) => String(item.empleado_id || item.id_empleado) === empleadoId)
    .filter((item) => !item.fecha_inicio || item.fecha_inicio <= fin)
    .filter((item) => !item.fecha_fin || item.fecha_fin >= `${periodo}-01`)
    .sort((a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || '')))[0];
}

export function construirPaquetePlanillaElectronicaPeru(fuente: FuentePlanillaPeru) {
  const bloqueos: Hallazgo[] = [];
  const advertencias: Hallazgo[] = [{
    codigo: 'VALIDACION_EXTERNA_OBLIGATORIA',
    mensaje: 'Los archivos RP_* deben validarse en PVS T-Registro. El ZIP de PVS se carga en SOL; sólo el ticket y el CIR acreditan presentación.',
  }];
  const empresa = fuente.empresa || {};
  const planilla = fuente.planilla || {};
  const ruc = String(empresa.ruc || '').trim();
  const periodo = String(planilla.periodo || '').trim();
  if (String(empresa.pais || '').toUpperCase() !== 'PE') bloqueos.push({ codigo: 'PAIS_NO_PE', mensaje: 'La empresa no está configurada como Perú.' });
  if (planilla.pais_codigo && String(planilla.pais_codigo).toUpperCase() !== 'PE') {
    bloqueos.push({ codigo: 'PLANILLA_NO_PE', mensaje: 'La planilla seleccionada no pertenece al motor normativo de Perú.' });
  }
  if (!/^\d{11}$/.test(ruc)) bloqueos.push({ codigo: 'RUC_INVALIDO', mensaje: 'Configure un RUC peruano de 11 dígitos.' });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) bloqueos.push({ codigo: 'PERIODO_INVALIDO', mensaje: 'La planilla no tiene período YYYY-MM válido.' });
  if (!['calculada', 'pagada'].includes(String(planilla.estado || '').toLowerCase())) {
    bloqueos.push({ codigo: 'PLANILLA_NO_CALCULADA', mensaje: 'Calcule la planilla antes de preparar PLAME.' });
  }
  if (!fuente.detalles.length) bloqueos.push({ codigo: 'SIN_TRABAJADORES', mensaje: 'La planilla no contiene trabajadores calculados.' });

  const empleados = new Map(fuente.empleados.map((item) => [String(item.id), item]));
  const fichas = new Map(fuente.fichas.map((item) => [String(item.empleado_id), item]));
  const conceptos = new Map(fuente.conceptos.map((item) => [String(item.id), item]));
  const proveedores = new Map((fuente.proveedores || []).map((item) => [String(item.id), item]));
  const detallesConceptos = new Map<string, any[]>();
  const asistencias = new Map<string, any[]>();
  for (const item of fuente.conceptosDetalle) {
    const key = String(item.empleado_planilla_id || item.id_empleado_planilla);
    detallesConceptos.set(key, [...(detallesConceptos.get(key) || []), item]);
  }
  for (const item of fuente.asistencias || []) {
    const key = String(item.empleado_id || item.id_empleado);
    asistencias.set(key, [...(asistencias.get(key) || []), item]);
  }

  const e04: string[] = [];
  const e05: string[] = [];
  const e11: string[] = [];
  const e17: string[] = [];
  const jornada: string[] = ['tipo_documento,numero_documento,apellidos_nombres,dias_trabajados,dias_no_laborados,horas_ordinarias,fuente_horas,horas_sobretiempo_25,horas_sobretiempo_35,faltas,tardanzas_minutos'];
  const resumen: string[] = ['tipo_documento,numero_documento,apellidos_nombres,total_ingresos,total_descuentos,total_aportes,neto_pagar'];
  const detalleConceptosCsv: string[] = ['tipo_documento,numero_documento,codigo_concepto,concepto,tipo,monto,observaciones'];
  const cuartaCategoriaCsv: string[] = ['tipo_documento,numero_documento,prestador,comprobante,fecha_emision,fecha_pago,monto_pagado,tasa_retencion,retencion,monto_neto'];
  const trabajadores: any[] = [];
  const tregistroHuellas: Record<string, string> = {};

  for (const detalle of fuente.detalles) {
    const empleadoId = String(detalle.empleado_id || detalle.id_empleado || '');
    const empleado: any = empleados.get(empleadoId);
    const ficha: any = fichas.get(empleadoId) || {};
    const contrato = contratoVigente(fuente.contratos, empleadoId, periodo);
    if (!empleado) {
      bloqueos.push({ codigo: 'EMPLEADO_NO_ENCONTRADO', mensaje: 'Un detalle de planilla no tiene empleado relacionado.', empleado_id: empleadoId });
      continue;
    }
    const td = codigoDocumento(empleado.tipo_documento);
    const documento = String(empleado.numero_documento || '').trim();
    if (!td) bloqueos.push({ codigo: 'TIPO_DOCUMENTO_NO_SUNAT', mensaje: `Tipo de documento no soportado para ${empleado.nombres || empleado.nombre}.`, empleado_id: empleadoId });
    if ((td === '01' && !/^\d{8}$/.test(documento)) || (!td || documento.length === 0 || documento.length > 15)) {
      bloqueos.push({ codigo: 'DOCUMENTO_INVALIDO', mensaje: `Documento inválido para ${empleado.nombres || empleado.nombre}.`, empleado_id: empleadoId });
    }
    if (!empleado.fecha_nacimiento) bloqueos.push({ codigo: 'FECHA_NACIMIENTO_FALTANTE', mensaje: `Falta fecha de nacimiento de ${documento}.`, empleado_id: empleadoId });
    const sexo = String(empleado.genero || '').toLowerCase() === 'masculino' ? '1' : String(empleado.genero || '').toLowerCase() === 'femenino' ? '2' : '';
    if (!sexo) bloqueos.push({ codigo: 'SEXO_SUNAT_FALTANTE', mensaje: `Falta sexo SUNAT de ${documento}.`, empleado_id: empleadoId });
    const apellidos = String(empleado.apellidos || '').trim().split(/\s+/).filter(Boolean);
    const paterno = String(ficha.apellido_paterno || apellidos.shift() || '').trim();
    const materno = String(ficha.apellido_materno || apellidos.join(' ')).trim();
    if (!paterno) bloqueos.push({ codigo: 'APELLIDO_FALTANTE', mensaje: `Falta apellido paterno de ${documento}.`, empleado_id: empleadoId });
    if (!contrato) bloqueos.push({ codigo: 'CONTRATO_FALTANTE', mensaje: `No hay contrato vigente para ${documento}.`, empleado_id: empleadoId });
    const requeridos = [
      ['situacion_educativa_codigo', 'situación educativa'], ['ocupacion_codigo', 'ocupación'],
      ['tipo_contrato_codigo', 'tipo de contrato SUNAT'], ['categoria_ocupacional_codigo', 'categoría ocupacional'],
      ['tipo_trabajador_codigo', 'tipo de trabajador'], ['regimen_salud_codigo', 'régimen de salud'],
      ['regimen_pensionario_codigo', 'régimen pensionario'],
    ];
    for (const [campo, etiqueta] of requeridos) {
      if (!String(ficha[campo] || '').trim()) bloqueos.push({ codigo: `FICHA_${campo.toUpperCase()}`, mensaje: `Falta ${etiqueta} en la ficha SUNAT de ${documento}.`, empleado_id: empleadoId });
    }
    const formatos: Array<[string, RegExp, string]> = [
      ['regimen_laboral_codigo', /^\d{2}$/, 'régimen laboral (2 dígitos)'],
      ['situacion_educativa_codigo', /^\d{2}$/, 'situación educativa (2 dígitos)'],
      ['ocupacion_codigo', /^\d{6}$/, 'ocupación (6 dígitos)'],
      ['tipo_contrato_codigo', /^\d{2}$/, 'tipo de contrato (2 dígitos)'],
      ['categoria_ocupacional_codigo', /^\d{2}$/, 'categoría ocupacional (2 dígitos)'],
      ['tipo_trabajador_codigo', /^\d{2}$/, 'tipo de trabajador (2 dígitos)'],
      ['regimen_salud_codigo', /^\d{2}$/, 'régimen de salud (2 dígitos)'],
      ['regimen_pensionario_codigo', /^\d{2}$/, 'régimen pensionario (2 dígitos)'],
      ['establecimiento_codigo', /^\d{4}$/, 'establecimiento (4 dígitos)'],
    ];
    for (const [campo, patron, etiqueta] of formatos) {
      const valor = String(ficha[campo] || (campo === 'regimen_laboral_codigo' ? '01' : campo === 'establecimiento_codigo' ? '0000' : ''));
      if (valor && !patron.test(valor)) bloqueos.push({ codigo: `FORMATO_${campo.toUpperCase()}`, mensaje: `Formato inválido de ${etiqueta} para ${documento}.`, empleado_id: empleadoId });
    }
    const paisEmisor = String(ficha.pais_emisor_documento || '604');
    const montoBase = Number(contrato?.sueldo_bruto || contrato?.salario || 0);
    const linea04 = lineaPvs([
      td, documento, paisEmisor, fechaPvs(empleado.fecha_nacimiento), paterno, materno,
      empleado.nombres || empleado.nombre, sexo,
      td === '01' ? '' : ficha.nacionalidad_codigo,
      '', '', '',
      ficha.direccion_tipo_via_codigo, ficha.direccion_nombre_via,
      ficha.direccion_numero_via, '', '', '', '', '', '', '',
      ficha.direccion_tipo_zona_codigo, ficha.direccion_nombre_zona,
      ficha.direccion_referencia, empleado.ubigeo, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    ]);
    const linea05 = lineaPvs([
      td, documento, paisEmisor, ficha.regimen_laboral_codigo || '01', ficha.situacion_educativa_codigo,
      ficha.ocupacion_codigo, ficha.discapacidad ? '1' : '0', ficha.cuspp, ficha.sctr_pension_codigo,
      ficha.tipo_contrato_codigo, ficha.jornada_atipica ? '1' : '0', ficha.jornada_maxima ? '1' : '0',
      ficha.horario_nocturno ? '1' : '0', ficha.sindicalizado ? '1' : '0',
      ficha.periodicidad_remuneracion_codigo || '1', dinero(montoBase), ficha.situacion_codigo || '1',
      ficha.quinta_exonerada ? '1' : '0', ficha.situacion_especial_codigo, ficha.tipo_pago_codigo || '1',
      ficha.categoria_ocupacional_codigo, ficha.convenio_doble_tributacion_codigo, '',
    ]);
    const inicio = fechaPvs(contrato?.fecha_inicio || empleado.fecha_ingreso);
    const lineas11 = [
      lineaPvs([td, documento, paisEmisor, '1', '1', inicio, fechaPvs(contrato?.fecha_fin), contrato?.fecha_fin ? String(contrato?.metadata?.motivo_baja_sunat || '') : '', '']),
      lineaPvs([td, documento, paisEmisor, '1', '2', inicio, '', ficha.tipo_trabajador_codigo, '']),
      lineaPvs([td, documento, paisEmisor, '1', '3', inicio, '', ficha.regimen_salud_codigo, ficha.eps_servicios_propios_codigo]),
      lineaPvs([td, documento, paisEmisor, '1', '4', inicio, '', ficha.regimen_pensionario_codigo, '']),
      ...(ficha.sctr_salud_codigo ? [lineaPvs([td, documento, paisEmisor, '1', '5', inicio, '', ficha.sctr_salud_codigo, ''])] : []),
    ];
    const linea17 = lineaPvs([td, documento, paisEmisor, ruc, ficha.establecimiento_codigo || '0000']);
    const huellaTregistro = createHash('sha256').update([linea04, linea05, ...lineas11, linea17].join('\n'), 'utf8').digest('hex');
    tregistroHuellas[empleadoId] = huellaTregistro;
    const requiereNovedadTregistro = ficha.metadata?.tregistro_ultima_huella !== huellaTregistro;
    if (requiereNovedadTregistro) {
      e04.push(linea04);
      e05.push(linea05);
      e11.push(...lineas11);
      e17.push(linea17);
    }

    const nombre = `${paterno} ${materno} ${empleado.nombres || empleado.nombre}`.trim();
    const horasManual = detalle.metadata?.plame_horas_ordinarias;
    const horasAsistencia = (asistencias.get(empleadoId) || []).reduce((total, item) => total + Number(item.horas_trabajadas || 0), 0);
    const horasExtras = Number(detalle.horas_extras_25 || 0) + Number(detalle.horas_extras_35 || 0);
    const horasOrdinarias = horasManual !== undefined && horasManual !== null
      ? Number(horasManual)
      : horasAsistencia > 0 ? Math.max(Math.round((horasAsistencia - horasExtras) * 100) / 100, 0) : null;
    const fuenteHoras = horasManual !== undefined && horasManual !== null ? 'MANUAL_CONTADOR' : horasAsistencia > 0 ? 'ASISTENCIA' : 'FALTANTE';
    if (horasOrdinarias === null || !Number.isFinite(horasOrdinarias)) {
      bloqueos.push({ codigo: 'HORAS_ORDINARIAS_FALTANTES', mensaje: `Faltan horas ordinarias verificadas para ${documento}; registre asistencia o una cifra manual.`, empleado_id: empleadoId });
    }
    const diasNoLaborados = Number(detalle.metadata?.plame_dias_no_laborados ?? Math.max(30 - Number(detalle.dias_trabajados || 0), 0));
    trabajadores.push({
      empleado_id: empleadoId,
      detalle_id: detalle.id,
      nombre,
      tipo_documento: empleado.tipo_documento,
      numero_documento: documento,
      tregistro_novedad: requiereNovedadTregistro,
      jornada: { horas_ordinarias: horasOrdinarias ?? '', dias_no_laborados: diasNoLaborados, fuente: fuenteHoras },
      ficha: {
        apellido_paterno: paterno,
        apellido_materno: materno,
        pais_emisor_documento: paisEmisor,
        regimen_laboral_codigo: ficha.regimen_laboral_codigo || '01',
        situacion_educativa_codigo: ficha.situacion_educativa_codigo || '',
        ocupacion_codigo: ficha.ocupacion_codigo || '',
        tipo_contrato_codigo: ficha.tipo_contrato_codigo || '',
        categoria_ocupacional_codigo: ficha.categoria_ocupacional_codigo || '',
        tipo_trabajador_codigo: ficha.tipo_trabajador_codigo || '',
        regimen_salud_codigo: ficha.regimen_salud_codigo || '',
        regimen_pensionario_codigo: ficha.regimen_pensionario_codigo || '',
        establecimiento_codigo: ficha.establecimiento_codigo || '0000',
        discapacidad: Boolean(ficha.discapacidad),
        jornada_atipica: Boolean(ficha.jornada_atipica),
        jornada_maxima: ficha.jornada_maxima !== false,
        horario_nocturno: Boolean(ficha.horario_nocturno),
        sindicalizado: Boolean(ficha.sindicalizado),
      },
    });
    const dias = Number(detalle.dias_trabajados || 0);
    jornada.push([td, documento, nombre, dias, diasNoLaborados, horasOrdinarias ?? '', fuenteHoras, detalle.horas_extras_25 || 0, detalle.horas_extras_35 || 0, detalle.faltas || 0, detalle.tardanzas_minutos || 0].map(csv).join(','));
    resumen.push([td, documento, nombre, dinero(detalle.total_ingresos), dinero(detalle.total_descuentos), dinero(detalle.total_aportes), dinero(detalle.neto_pagar)].map(csv).join(','));
    for (const movimiento of detallesConceptos.get(String(detalle.id)) || []) {
      const concepto: any = conceptos.get(String(movimiento.concepto_id || movimiento.id_concepto)) || {};
      detalleConceptosCsv.push([td, documento, concepto.codigo, concepto.nombre, concepto.metadata?.tipo, dinero(movimiento.monto), movimiento.observaciones].map(csv).join(','));
    }
  }

  let totalCuarta = 0;
  let retencionCuarta = 0;
  for (const item of fuente.cuartaCategoria || []) {
    const proveedor: any = proveedores.get(String(item.proveedor_id)) || {};
    const monto = Number(item.monto_pago || 0);
    const retencion = Number(item.monto_retencion || 0);
    totalCuarta += monto;
    retencionCuarta += retencion;
    cuartaCategoriaCsv.push([
      proveedor.tipo_documento || proveedor.documento_tipo,
      proveedor.numero_documento || proveedor.ruc,
      proveedor.razon_social || proveedor.nombre,
      item.numero_comprobante,
      item.fecha_emision,
      item.fecha_pago,
      dinero(monto),
      Number(item.tasa_retencion || 0).toFixed(4),
      dinero(retencion),
      dinero(item.monto_neto ?? monto - retencion),
    ].map(csv).join(','));
  }

  const bloqueosUnicos = [...new Map(bloqueos.map((item) => [`${item.codigo}:${item.empleado_id || ''}`, item])).values()];
  const archivos: ArchivoFuente[] = [
    archivo(`PLAME_RESUMEN_${ruc || 'SIN_RUC'}_${periodo.replace('-', '')}.csv`, 'PAPEL_TRABAJO', `${resumen.join('\r\n')}\r\n`),
    archivo(`PLAME_JORNADA_${ruc || 'SIN_RUC'}_${periodo.replace('-', '')}.csv`, 'PAPEL_TRABAJO', `${jornada.join('\r\n')}\r\n`),
    archivo(`PLAME_CONCEPTOS_${ruc || 'SIN_RUC'}_${periodo.replace('-', '')}.csv`, 'PAPEL_TRABAJO', `${detalleConceptosCsv.join('\r\n')}\r\n`),
    archivo(`PLAME_CUARTA_CATEGORIA_${ruc || 'SIN_RUC'}_${periodo.replace('-', '')}.csv`, 'PAPEL_TRABAJO', `${cuartaCategoriaCsv.join('\r\n')}\r\n`),
  ];
  if (bloqueosUnicos.length === 0 && e04.length > 0) {
    archivos.push(
      archivo(`RP_${ruc}.ide`, 'PVS_TREGISTRO_E04', `${e04.join('\r\n')}\r\n`),
      archivo(`RP_${ruc}.tra`, 'PVS_TREGISTRO_E05', `${e05.join('\r\n')}\r\n`),
      archivo(`RP_${ruc}.per`, 'PVS_TREGISTRO_E11', `${e11.join('\r\n')}\r\n`),
      archivo(`RP_${ruc}.est`, 'PVS_TREGISTRO_E17', `${e17.join('\r\n')}\r\n`),
    );
  }
  const readme = [
    'PLANILLA ELECTRONICA PERU - FUENTES DE TRABAJO',
    `RUC: ${ruc || 'NO CONFIGURADO'}  Periodo: ${periodo}`,
    '',
    '1. Los CSV son papeles de trabajo para revisar el PDT PLAME; no son una declaracion presentada.',
    '2. Los RP_* son fuentes conforme a estructuras 04, 05, 11 y 17. Valídelos en PVS T-Registro.',
    '3. Cargue en SOL únicamente el ZIP producido por PVS, nunca este ZIP del ERP.',
    '4. Registre por separado la constancia PLAME y, si hubo novedades T-Registro, su ticket y CIR.',
    `5. Bloqueos encontrados: ${bloqueosUnicos.length}.`,
  ].join('\r\n');
  archivos.unshift(archivo('LEEME.txt', 'INSTRUCCIONES', `${readme}\r\n`));

  return {
    periodo,
    planilla_id: planilla.id,
    fuente_corte_at: new Date().toISOString(),
    resumen: {
      ruc,
      razon_social: empresa.razon_social,
      trabajadores: fuente.detalles.length,
      total_ingresos: Number(planilla.total_ingresos || 0),
      total_descuentos: Number(planilla.total_descuentos || 0),
      total_aportes: Number(planilla.total_aportes || 0),
      total_neto: Number(planilla.total_neto || 0),
      listo_para_pvs: bloqueosUnicos.length === 0,
      tregistro_novedades: e04.length,
      tregistro_huellas: tregistroHuellas,
      prestadores_cuarta: (fuente.cuartaCategoria || []).length,
      pagos_cuarta: Math.round(totalCuarta * 100) / 100,
      retenciones_cuarta: Math.round(retencionCuarta * 100) / 100,
    },
    bloqueos: bloqueosUnicos,
    advertencias,
    trabajadores,
    archivos,
  };
}

@Injectable()
export class PlanillaElectronicaPeruService {
  constructor(private readonly supabase: SupabaseService) {}

  private async fuente(tenantId: string, planillaId: string): Promise<FuentePlanillaPeru> {
    const client = this.supabase.getClient();
    const [empresaResult, planillaResult, detallesResult] = await Promise.all([
      client.from('empresa_config').select('ruc,razon_social,pais').eq('tenant_id', tenantId).maybeSingle(),
      client.from('planillas').select('id,periodo,estado,pais_codigo,total_ingresos,total_descuentos,total_aportes,total_neto').eq('tenant_id', tenantId).eq('id', planillaId).maybeSingle(),
      client.from('empleado_planilla').select('id,empleado_id,id_empleado,dias_trabajados,horas_extras_25,horas_extras_35,faltas,tardanzas_minutos,total_ingresos,total_descuentos,total_aportes,neto_pagar,metadata').eq('tenant_id', tenantId).or(`planilla_id.eq.${planillaId},id_planilla.eq.${planillaId}`),
    ]);
    if (empresaResult.error) throw empresaResult.error;
    if (planillaResult.error) throw planillaResult.error;
    if (!planillaResult.data) throw new NotFoundException('Planilla no encontrada');
    if (detallesResult.error) throw detallesResult.error;
    const detalles = detallesResult.data || [];
    const periodo = String(planillaResult.data.periodo || '');
    const inicioPeriodo = `${periodo}-01`;
    const finPeriodoDate = new Date(`${inicioPeriodo}T00:00:00Z`);
    finPeriodoDate.setUTCMonth(finPeriodoDate.getUTCMonth() + 1);
    finPeriodoDate.setUTCDate(0);
    const { data: cuartaCategoria, error: cuartaError } = await client.from('libro_retenciones')
      .select('proveedor_id,numero_comprobante,fecha_emision,fecha_pago,monto_pago,tasa_retencion,monto_retencion,monto_neto,estado')
      .eq('tenant_id', tenantId).eq('categoria_retencion', 'CUARTA').neq('estado', 'ANULADO')
      .gte('fecha_pago', inicioPeriodo).lte('fecha_pago', finPeriodoDate.toISOString().slice(0, 10));
    if (cuartaError) throw cuartaError;
    const empleadoIds = [...new Set(detalles.map((item: any) => String(item.empleado_id || item.id_empleado)).filter(Boolean))];
    const detalleIds = detalles.map((item: any) => String(item.id));
    const proveedorIds = [...new Set((cuartaCategoria || []).map((item: any) => String(item.proveedor_id)).filter(Boolean))];
    const vacio = { data: [], error: null };
    const [empleadosResult, contratosResult, fichasResult, movimientosResult, conceptosResult, proveedoresResult, asistenciasResult] = await Promise.all([
      empleadoIds.length ? client.from('empleados').select('id,nombres,nombre,apellidos,tipo_documento,numero_documento,fecha_nacimiento,fecha_ingreso,genero,nacionalidad,telefono,email,ubigeo').eq('tenant_id', tenantId).in('id', empleadoIds) : Promise.resolve(vacio),
      empleadoIds.length ? client.from('contratos').select('empleado_id,id_empleado,fecha_inicio,fecha_fin,sueldo_bruto,salario,regimen_pensionario,metadata').eq('tenant_id', tenantId).or(`empleado_id.in.(${empleadoIds.join(',')}),id_empleado.in.(${empleadoIds.join(',')})`) : Promise.resolve(vacio),
      empleadoIds.length ? client.from('rrhh_peru_fichas_laborales').select('*').eq('tenant_id', tenantId).in('empleado_id', empleadoIds).eq('activo', true) : Promise.resolve(vacio),
      detalleIds.length ? client.from('empleado_planilla_conceptos').select('id_empleado_planilla,empleado_planilla_id,id_concepto,concepto_id,monto,observaciones').eq('tenant_id', tenantId).or(`empleado_planilla_id.in.(${detalleIds.join(',')}),id_empleado_planilla.in.(${detalleIds.join(',')})`) : Promise.resolve(vacio),
      client.from('conceptos_planilla').select('id,codigo,nombre,metadata').eq('tenant_id', tenantId).eq('activo', true),
      proveedorIds.length ? client.from('proveedores').select('id,tipo_documento,documento_tipo,numero_documento,ruc,razon_social,nombre').eq('tenant_id', tenantId).in('id', proveedorIds) : Promise.resolve(vacio),
      empleadoIds.length ? client.from('asistencia').select('empleado_id,id_empleado,fecha,horas_trabajadas').eq('tenant_id', tenantId).eq('activo', true).or(`empleado_id.in.(${empleadoIds.join(',')}),id_empleado.in.(${empleadoIds.join(',')})`).gte('fecha', inicioPeriodo).lte('fecha', finPeriodoDate.toISOString().slice(0, 10)) : Promise.resolve(vacio),
    ]);
    for (const result of [empleadosResult, contratosResult, fichasResult, movimientosResult, conceptosResult, proveedoresResult, asistenciasResult]) {
      if (result.error) throw result.error;
    }
    return {
      empresa: empresaResult.data,
      planilla: planillaResult.data,
      detalles,
      empleados: empleadosResult.data || [],
      contratos: contratosResult.data || [],
      fichas: fichasResult.data || [],
      conceptosDetalle: movimientosResult.data || [],
      conceptos: conceptosResult.data || [],
      cuartaCategoria: cuartaCategoria || [],
      proveedores: proveedoresResult.data || [],
      asistencias: asistenciasResult.data || [],
    };
  }

  async previsualizar(tenantId: string, planillaId: string) {
    return construirPaquetePlanillaElectronicaPeru(await this.fuente(tenantId, planillaId));
  }

  async guardarFicha(tenantId: string, userId: string, empleadoId: string, payload: any) {
    const campos = [
      'apellido_paterno','apellido_materno','pais_emisor_documento','nacionalidad_codigo','regimen_laboral_codigo',
      'situacion_educativa_codigo','ocupacion_codigo','discapacidad','cuspp','sctr_pension_codigo','tipo_contrato_codigo',
      'jornada_atipica','jornada_maxima','horario_nocturno','sindicalizado','periodicidad_remuneracion_codigo',
      'situacion_codigo','quinta_exonerada','situacion_especial_codigo','tipo_pago_codigo','categoria_ocupacional_codigo',
      'convenio_doble_tributacion_codigo','tipo_trabajador_codigo','regimen_salud_codigo','regimen_pensionario_codigo',
      'sctr_salud_codigo','eps_servicios_propios_codigo','establecimiento_codigo','direccion_tipo_via_codigo',
      'direccion_nombre_via','direccion_numero_via','direccion_tipo_zona_codigo','direccion_nombre_zona',
      'direccion_referencia','telefono_cldn','metadata',
    ];
    const limpio = Object.fromEntries(Object.entries(payload || {}).filter(([key]) => campos.includes(key)));
    const { data, error } = await this.supabase.getClient().from('rrhh_peru_fichas_laborales').upsert({
      ...limpio, tenant_id: tenantId, empleado_id: empleadoId, updated_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,empleado_id' }).select('*').single();
    if (error) throw error;
    return data;
  }

  async guardarJornada(tenantId: string, detalleId: string, payload: any) {
    const horas = Number(payload?.horas_ordinarias);
    const diasNoLaborados = Number(payload?.dias_no_laborados);
    if (!Number.isFinite(horas) || horas < 0 || horas > 744) {
      throw new BadRequestException('Las horas ordinarias deben estar entre 0 y 744.');
    }
    if (!Number.isInteger(diasNoLaborados) || diasNoLaborados < 0 || diasNoLaborados > 31) {
      throw new BadRequestException('Los días no laborados deben ser un entero entre 0 y 31.');
    }
    const client = this.supabase.getClient();
    const { data: actual, error: findError } = await client.from('empleado_planilla')
      .select('id,metadata').eq('tenant_id', tenantId).eq('id', detalleId).maybeSingle();
    if (findError) throw findError;
    if (!actual) throw new NotFoundException('Detalle de planilla no encontrado');
    const { data, error } = await client.from('empleado_planilla').update({
      metadata: {
        ...(actual.metadata || {}),
        plame_horas_ordinarias: Math.round(horas * 100) / 100,
        plame_dias_no_laborados: diasNoLaborados,
        plame_jornada_fuente: 'MANUAL_CONTADOR',
        plame_jornada_actualizada_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId).eq('id', detalleId).select('id,metadata').single();
    if (error) throw error;
    return data;
  }

  async guardarPaquete(tenantId: string, userId: string, planillaId: string, notas?: string) {
    const paquete = await this.previsualizar(tenantId, planillaId);
    const { data, error } = await this.supabase.getClient().rpc('guardar_rrhh_peru_presentacion_tx', {
      p_tenant_id: tenantId, p_user_id: userId, p_payload: { ...paquete, notas: notas || null },
    });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async historial(tenantId: string, limite = 36) {
    const limiteSeguro = Number.isFinite(limite) ? Math.min(Math.max(Math.trunc(limite), 1), 120) : 36;
    const { data, error } = await this.supabase.getClient().from('rrhh_peru_presentaciones_planilla')
      .select('id,planilla_id,periodo,version,vigente,estado,fuente_corte_at,resumen,bloqueos,advertencias,ticket_sunat,tregistro_cir,constancia_numero,fecha_presentacion,notas,created_at')
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limiteSeguro);
    if (error) throw error;
    return data || [];
  }

  async registrarEvidencia(tenantId: string, userId: string, id: string, payload: any) {
    const { data, error } = await this.supabase.getClient().rpc('registrar_rrhh_peru_evidencia_tx', {
      p_tenant_id: tenantId, p_user_id: userId, p_presentacion_id: id,
      p_ticket_tregistro: String(payload?.ticket_tregistro || '').trim(),
      p_cir_tregistro: String(payload?.cir_tregistro || '').trim(),
      p_constancia_plame: String(payload?.constancia_plame || '').trim(),
      p_fecha_presentacion: payload?.fecha_presentacion || null,
    });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async descargar(tenantId: string, id: string) {
    const { data, error } = await this.supabase.getClient().from('rrhh_peru_presentaciones_planilla')
      .select('periodo,version,resumen,archivos').eq('tenant_id', tenantId).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException('Paquete no encontrado');
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    for (const item of (data.archivos || []) as ArchivoFuente[]) zip.addFile(item.nombre, Buffer.from(item.contenido, 'utf8'));
    return { nombre: `PLANILLA_ELECTRONICA_${data.resumen?.ruc || 'PERU'}_${String(data.periodo).replace('-', '')}_v${data.version}.zip`, buffer: zip.toBuffer() as Buffer };
  }
}
