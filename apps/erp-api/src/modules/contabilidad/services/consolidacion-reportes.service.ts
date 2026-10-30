import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { budgetCalendarWindow } from './budget-calendar-window';
import { fechaDeDocumentoEnPais } from '../../../shared/utils/fecha-peru.util';
import {
  CrearAjusteConsolidacionDto,
  CrearGrupoConsolidacionDto,
  GuardarReporteConfigurableDto,
  InvitarMiembroConsolidacionDto,
  LineaReporteConfigurableDto,
  RegistrarMapeoCuentaConsolidacionDto,
  RegistrarTasaConsolidacionDto,
  TipoLineaReporte,
} from '@erp-suite/dtos';
import { SupabaseService } from '../../../shared/supabase/supabase.service';

type MovimientoCuenta = {
  tenant_id: string;
  fecha: string;
  codigo: string;
  nombre: string;
  debe: number;
  haber: number;
};

type FactorTasa = {
  tenant_id: string;
  factor: number;
  moneda_origen: string;
  moneda_destino: string;
  fecha: string;
  tipo: string;
};

function validFinancialCivilDay(date: unknown): date is string {
  if (typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year,month,day]=date.split('-').map(Number),calendar=new Date(Date.UTC(year,month-1,day));
  return calendar.getUTCFullYear()===year && calendar.getUTCMonth()===month-1 && calendar.getUTCDate()===day;
}
function financialDay(date: string,country: unknown) {
  if (!validFinancialCivilDay(date)) throw new BadRequestException('La fecha financiera debe ser una fecha civil válida.');
  const [year,month]=date.split('-').map(Number);
  let zone: string;
  try {zone=budgetCalendarWindow(year,month,country).zonaHoraria;} catch {throw new ServiceUnavailableException('El calendario financiero está incompleto.');}
  const epoch=Date.parse(date+'T00:00:00Z')+86400000;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  let candidate=epoch;
  for(let attempt=0;attempt<5;attempt++) {
    const parts=Object.fromEntries(formatter.formatToParts(new Date(candidate)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const corrected=epoch-(Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-candidate);
    if(corrected===candidate)return {zone,until:new Date(candidate).toISOString()};
    candidate=corrected;
  }
  throw new ServiceUnavailableException('No se pudo resolver el límite civil financiero.');
}

@Injectable()
export class ConsolidacionReportesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private dbError(contexto: string, error: any): never {
    const message = String(error?.message || '');
    if (error?.code === '23505' || message === 'CONSOLIDATION_IDEMPOTENCY_CONFLICT') {
      throw new ConflictException('El código o la intención ya corresponde a otro registro.');
    }
    if (['CONSOLIDATION_CONTROLLER_REQUIRED', 'FINANCIAL_MASTER_ACTOR_INVALID'].includes(message)
      || (error?.code === '42501' && ['Reporte no existe o no pertenece a la empresa',
        'Grupo no existe o no pertenece a la empresa controladora'].includes(message))) {
      throw new ForbiddenException('La empresa o el usuario no puede realizar esta operación.');
    }
    if (error?.code === 'P0002' || message === 'CONSOLIDATION_ACCOUNT_NOT_FOUND') {
      throw new NotFoundException('No existe un registro disponible para esta operación.');
    }
    if (['CONSOLIDATION_REQUEST_INVALID', 'CONSOLIDATION_ACTIVE_MEMBER_REQUIRED',
      'CONSOLIDATION_ACTIVE_EXTERNAL_MEMBER_REQUIRED', 'CONSOLIDATION_RATE_NOT_REQUIRED',
      'CONSOLIDATION_ADJUSTMENT_INVALID'].includes(message)
      || ['23514', '23502', '22007', '22008', '22P02'].includes(error?.code)) {
      throw new BadRequestException('Los datos o el estado actual no permiten esta operación.');
    }
    throw new ServiceUnavailableException(contexto + ': servicio temporalmente no disponible.');
  }

  private async readCatalogRows(table: string,selection: string,filter: (query: any)=>any,scope: (row: any)=>boolean,key='id') {
    const rows: any[]=[];const ids=new Set<string>();let total: number | undefined;
    for (let offset=0;;offset+=1000) {
      const query: any=this.client.from(table).select(selection,{count:'exact'}).order(key,{ascending:true}).range(offset,offset+999);
      const {data,error,count}=(await filter(query)) || {};
      if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 || (total !== undefined && count !== total) || data.length !== Math.min(1000,Math.max(0,count-offset))) {
        throw new ServiceUnavailableException('No se pudo completar el catálogo de consolidación. Reintente la consulta.');
      }
      total=count;
      for (const row of data) {
        if (!row || typeof row[key] !== 'string' || !row[key] || ids.has(row[key]) || !scope(row)) throw new ServiceUnavailableException('El catálogo contiene datos incompletos o ajenos.');
        ids.add(row[key]);rows.push(row);
      }
      if (rows.length===total) return rows;
    }
  }

  async listarGrupos(tenantId: string) {
    const memberships=await this.readCatalogRows('grupos_consolidacion_miembros','id,grupo_id,tenant_id,estado',q=>q.eq('tenant_id',tenantId),r=>r.tenant_id===tenantId && typeof r.grupo_id==='string' && /^[0-9a-f-]{36}$/i.test(r.grupo_id) && ['PENDIENTE','ACTIVO','RECHAZADO'].includes(r.estado));
    const groupIDs=[...new Set(memberships.filter(m=>['PENDIENTE','ACTIVO'].includes(m.estado)).map(m=>m.grupo_id))];
    const groups=await this.readCatalogRows('grupos_consolidacion','*',q=>groupIDs.length ? q.or(`tenant_id.eq.${tenantId},id.in.(${groupIDs.join(',')})`) : q.eq('tenant_id',tenantId),r=>r.tenant_id===tenantId || groupIDs.includes(r.id));
    const result=[];
    for (const group of groups) result.push(await this.obtenerGrupo(tenantId,group.id));
    return result.sort((a,b)=>a.nombre.localeCompare(b.nombre)||a.id.localeCompare(b.id));
  }

  async obtenerGrupo(tenantId: string,grupoId: string) {
    const {data:group,error}=await this.client.from('grupos_consolidacion').select('*').eq('id',grupoId).maybeSingle();
    if (error) this.dbError('Error obteniendo grupo de consolidación',error);
    if (!group) throw new NotFoundException('Grupo de consolidación no encontrado.');
    if (group.id !== grupoId) throw new ServiceUnavailableException('El grupo no corresponde a la consulta.');
    const {data:membership,error:membershipError}=await this.client.from('grupos_consolidacion_miembros').select('estado').eq('grupo_id',grupoId).eq('tenant_id',tenantId).maybeSingle();
    if (membershipError) this.dbError('Error obteniendo pertenencia al grupo',membershipError);
    if (group.tenant_id !== tenantId && !['PENDIENTE','ACTIVO'].includes(membership?.estado)) throw new ForbiddenException('La empresa actual no pertenece a este grupo.');
    const members=await this.readCatalogRows('grupos_consolidacion_miembros','*',q=>q.eq('grupo_id',grupoId),r=>r.grupo_id===grupoId && typeof r.tenant_id==='string' && ['PENDIENTE','ACTIVO','RECHAZADO'].includes(r.estado));
    const tenantIDs=[...new Set(members.map(m=>m.tenant_id))];
    if (tenantIDs.length !== members.length || !tenantIDs.includes(group.tenant_id) || !tenantIDs.includes(tenantId)) throw new ServiceUnavailableException('Las membresías del grupo están incompletas.');
    const configs=await this.readCatalogRows('empresa_config','tenant_id,ruc,razon_social,nombre_comercial,moneda_defecto',q=>q.in('tenant_id',tenantIDs),r=>tenantIDs.includes(r.tenant_id),'tenant_id');
    if (configs.length !== tenantIDs.length) throw new ServiceUnavailableException('Falta configuración de una empresa del grupo.');
    const byTenant=new Map(configs.map(c=>[c.tenant_id,c]));
    return {...group,es_controladora:group.tenant_id===tenantId,miembros_total:members.length,miembros:members.map(m=>({...m,empresa:byTenant.get(m.tenant_id)}))};
  }

  async crearGrupo(tenantId: string, userId: string, dto: CrearGrupoConsolidacionDto) {
    const { data, error } = await this.client.rpc('crear_grupo_consolidacion_tx', {
      p_tenant_id: tenantId,
      p_codigo: dto.codigo,
      p_nombre: dto.nombre,
      p_moneda_presentacion: dto.moneda_presentacion,
      p_created_by: userId,
    });
    if (error) {
      if (error.code === '23505') {
        const { data: previo, error: errorLectura } = await this.client.from('grupos_consolidacion')
          .select('id,nombre,moneda_presentacion,created_by')
          .eq('tenant_id', tenantId).eq('codigo', dto.codigo.trim().toUpperCase()).maybeSingle();
        if (errorLectura) this.dbError('No se pudo recuperar el grupo confirmado', errorLectura);
        if (previo && previo.created_by === userId && previo.nombre === dto.nombre.trim()
          && previo.moneda_presentacion === dto.moneda_presentacion.trim().toUpperCase()) {
          return this.obtenerGrupo(tenantId, previo.id);
        }
      }
      this.dbError('Error creando grupo de consolidación', error);
    }
    return this.obtenerGrupo(tenantId, data?.[0]?.id);
  }

  async invitarMiembro(
    tenantId: string,
    userId: string,
    grupoId: string,
    dto: InvitarMiembroConsolidacionDto,
  ) {
    await this.exigirControladora(tenantId, grupoId);

    const { data: empresas, error: errorEmpresa } = await this.client
      .from('empresa_config')
      .select('tenant_id, ruc, razon_social, nombre_comercial')
      .eq('ruc', dto.ruc.trim())
      .limit(2);
    if (errorEmpresa) this.dbError('Error buscando la empresa invitada', errorEmpresa);
    if (!empresas || empresas.length === 0) {
      throw new NotFoundException('No existe una empresa registrada con ese RUC exacto.');
    }
    if (empresas.length > 1) {
      throw new ConflictException('El RUC identifica más de una empresa; no se envió la invitación.');
    }

    const { data, error } = await this.client.rpc('invitar_miembro_consolidacion_tx', {
      p_tenant_id: tenantId,
      p_grupo_id: grupoId,
      p_miembro_tenant_id: empresas[0].tenant_id,
      p_participacion: dto.participacion ?? 100,
      p_invitado_por: userId,
    });
    if (error) this.dbError('Error invitando empresa al grupo', error);
    return { ...data?.[0], empresa: empresas[0] };
  }

  async responderInvitacion(
    tenantId: string,
    userId: string,
    grupoId: string,
    aceptar: boolean,
  ) {
    const { data, error } = await this.client.rpc('responder_invitacion_consolidacion_tx', {
      p_tenant_id: tenantId,
      p_grupo_id: grupoId,
      p_aceptar: aceptar,
      p_user_id: userId,
    });
    if (error) this.dbError('Error respondiendo invitación', error);
    return data?.[0];
  }

  async registrarTasa(
    tenantId: string,
    userId: string,
    grupoId: string,
    dto: RegistrarTasaConsolidacionDto,
    idempotencyKey?: string,
  ) {
    const factor = dto.factor_conversion;
    if (!Number.isFinite(factor) || factor <= 0 || factor >= 10000000000
      || factor !== Number(factor.toFixed(10))) {
      throw new BadRequestException('La tasa debe ser positiva y admitir como máximo 10 decimales.');
    }
    const key=idempotencyKey?.trim()||`consolidation-rate:${randomUUID()}`;
    const {data,error}=await this.client.rpc('gestionar_consolidacion_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_grupo_id:grupoId,p_accion:'RATE',p_payload:dto,p_idempotency_key:key,
    });
    if(error)this.dbError('Error registrando tasa de consolidación',error);
    return data;
    /* Writer legacy inalcanzable: la RPC 484 es la única frontera de mutación.
    const grupo = await this.exigirControladora(tenantId, grupoId);
    await this.exigirMiembroActivo(grupoId, dto.tenant_miembro_id);

    const { data: empresa, error: errorEmpresa } = await this.client
      .from('empresa_config')
      .select('moneda_defecto')
      .eq('tenant_id', dto.tenant_miembro_id)
      .maybeSingle();
    if (errorEmpresa || !empresa) {
      throw new BadRequestException('La empresa miembro no tiene moneda funcional configurada.');
    }

    const monedaOrigen = String(empresa.moneda_defecto || '').toUpperCase();
    if (monedaOrigen === grupo.moneda_presentacion) {
      throw new BadRequestException('No se registra tasa cuando ambas monedas son iguales.');
    }

    const payload = {
      grupo_id: grupoId,
      tenant_id: tenantId,
      miembro_tenant_id: dto.tenant_miembro_id,
      fecha: dto.fecha,
      tipo: dto.tipo,
      moneda_origen: monedaOrigen,
      moneda_destino: grupo.moneda_presentacion,
      factor_conversion: dto.factor_conversion,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.client
      .from('tipos_cambio_consolidacion')
      .upsert(payload, { onConflict: 'grupo_id,miembro_tenant_id,fecha,tipo' })
      .select('*')
      .single();
    if (error) this.dbError('Error registrando tasa de consolidación', error);
    return data;
    */
  }

  async registrarMapeoCuenta(
    tenantId: string,
    userId: string,
    grupoId: string,
    dto: RegistrarMapeoCuentaConsolidacionDto,
    idempotencyKey?: string,
  ) {
    await this.exigirControladora(tenantId, grupoId);
    await this.exigirMiembroActivo(grupoId, dto.tenant_miembro_id);
    if (dto.tenant_miembro_id === tenantId) {
      throw new BadRequestException('La controladora ya usa el plan de cuentas de presentación.');
    }
    const [cuentaOrigen, cuentaDestino] = await Promise.all([
      this.buscarCuenta(dto.tenant_miembro_id, dto.cuenta_codigo_origen.trim()),
      this.buscarCuenta(tenantId, dto.cuenta_codigo_destino.trim()),
    ]);
    if (!cuentaOrigen) {
      throw new NotFoundException(`La cuenta origen ${dto.cuenta_codigo_origen.trim()} no existe en la empresa miembro.`);
    }
    if (!cuentaDestino) {
      throw new NotFoundException(`La cuenta destino ${dto.cuenta_codigo_destino.trim()} no existe en la controladora.`);
    }
    const key=idempotencyKey?.trim()||`consolidation-map:${randomUUID()}`;
    const {data,error}=await this.client.rpc('gestionar_consolidacion_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_grupo_id:grupoId,p_accion:'ACCOUNT_MAP',p_payload:dto,p_idempotency_key:key,
    });
    if(error)this.dbError('Error guardando mapeo de cuentas',error);
    return data;
    /* Writer legacy inalcanzable: la RPC 484 valida miembro y cuentas bajo lock.
    await this.exigirControladora(tenantId, grupoId);
    await this.exigirMiembroActivo(grupoId, dto.tenant_miembro_id);
    if (dto.tenant_miembro_id === tenantId) {
      throw new BadRequestException('La controladora ya usa el plan de cuentas de presentación.');
    }

    const origen = dto.cuenta_codigo_origen.trim();
    const destino = dto.cuenta_codigo_destino.trim();
    const [cuentaOrigen, cuentaDestino] = await Promise.all([
      this.buscarCuenta(dto.tenant_miembro_id, origen),
      this.buscarCuenta(tenantId, destino),
    ]);
    if (!cuentaOrigen) {
      throw new NotFoundException(`La cuenta origen ${origen} no existe en la empresa miembro.`);
    }
    if (!cuentaDestino) {
      throw new NotFoundException(`La cuenta destino ${destino} no existe en la controladora.`);
    }

    const { data, error } = await this.client
      .from('mapeos_cuentas_consolidacion')
      .upsert({
        grupo_id: grupoId,
        tenant_id: tenantId,
        miembro_tenant_id: dto.tenant_miembro_id,
        cuenta_codigo_origen: origen,
        cuenta_codigo_destino: destino,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'grupo_id,miembro_tenant_id,cuenta_codigo_origen' })
      .select('*')
      .single();
    if (error) this.dbError('Error guardando mapeo de cuentas', error);
    return data;
    */
  }

  async crearAjuste(
    tenantId: string,
    userId: string,
    grupoId: string,
    dto: CrearAjusteConsolidacionDto,
    idempotencyKey?: string,
  ) {
    const debe = Number(dto.debe ?? 0);
    const haber = Number(dto.haber ?? 0);
    if ([debe, haber].some(value => !Number.isFinite(value) || value < 0 || value !== Number(value.toFixed(2)))) {
      throw new BadRequestException('Los ajustes admiten importes positivos con un máximo de 2 decimales.');
    }
    if ((debe > 0) === (haber > 0)) {
      throw new BadRequestException('El ajuste debe tener importe en debe o en haber, pero no en ambos.');
    }
    const key=idempotencyKey?.trim()||`consolidation-adjustment:${createHash('sha256').update(JSON.stringify({tenantId,userId,grupoId,dto})).digest('hex')}`;
    const {data,error}=await this.client.rpc('gestionar_consolidacion_tx',{
      p_tenant_id:tenantId,p_actor_id:userId,p_grupo_id:grupoId,p_accion:'ADJUSTMENT',p_payload:dto,p_idempotency_key:key,
    });
    if(error)this.dbError('Error creando ajuste de consolidación',error);
    return data;
    /* Writer legacy inalcanzable: la RPC 484 valida importes y cuenta en la misma transacción.
    await this.exigirControladora(tenantId, grupoId);
    const debe = Number(dto.debe || 0);
    const haber = Number(dto.haber || 0);
    if ((debe > 0) === (haber > 0)) {
      throw new BadRequestException('El ajuste debe tener importe en debe o en haber, pero no en ambos.');
    }
    const { data, error } = await this.client
      .from('ajustes_consolidacion')
      .insert({
        grupo_id: grupoId,
        tenant_id: tenantId,
        fecha: dto.fecha,
        tipo: dto.tipo,
        cuenta_codigo: dto.cuenta_codigo.trim(),
        descripcion: dto.descripcion.trim(),
        debe,
        haber,
        referencia: dto.referencia?.trim() || null,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error) this.dbError('Error creando ajuste de consolidación', error);
    return data;
    */
  }

  async listarReportes(tenantId: string) {
    const reports=await this.readCatalogRows('reportes_contables_configurables','*',q=>q.eq('tenant_id',tenantId).eq('activo',true),r=>r.tenant_id===tenantId && r.activo===true);
    const result=[];
    for (const report of reports) {
      const lines=await this.readCatalogRows('reportes_contables_lineas','*',q=>q.eq('tenant_id',tenantId).eq('reporte_id',report.id),r=>r.tenant_id===tenantId && r.reporte_id===report.id);
      if (!lines.length) throw new ServiceUnavailableException('La definición de reporte está incompleta.');
      result.push({...report,lineas_total:lines.length,lineas:lines.sort((a,b)=>a.orden-b.orden)});
    }
    return result.sort((a,b)=>a.nombre.localeCompare(b.nombre)||a.id.localeCompare(b.id));
  }

  async guardarReporte(
    tenantId: string,
    userId: string,
    dto: GuardarReporteConfigurableDto,
  ) {
    ConsolidacionReportesService.validarDefinicion(dto.lineas);
    const lineas = dto.lineas.map((linea) => ({
      codigo: linea.codigo.trim().toUpperCase(),
      nombre: linea.nombre.trim(),
      orden: linea.orden,
      tipo: linea.tipo,
      patrones_cuenta: (linea.patrones_cuenta || []).map((p) => p.trim()),
      naturaleza: linea.naturaleza || 'SALDO',
      alcance_fecha: linea.alcance_fecha || 'PERIODO',
      tipo_tasa: linea.tipo_tasa || 'CIERRE',
      signo: linea.signo ?? 1,
      formula: (linea.formula || []).map((componente) => ({
        codigo: componente.codigo.trim().toUpperCase(),
        coeficiente: componente.coeficiente,
      })),
    }));

    const { data, error } = await this.client.rpc('guardar_reporte_configurable_tx', {
      p_tenant_id: tenantId,
      p_reporte_id: dto.id || null,
      p_codigo: dto.codigo,
      p_nombre: dto.nombre,
      p_descripcion: dto.descripcion || '',
      p_lineas: lineas,
      p_created_by: userId,
    });
    if (error) {
      // El alta usa un código único. Tras perder el ACK, sólo se recupera una
      // definición idéntica del mismo actor; nunca se sobrescribe el conflicto.
      if (error.code === '23505' && !dto.id) {
        const existentes = await this.listarReportes(tenantId);
        const previo = existentes.find((r: any) => r.codigo === dto.codigo.trim().toUpperCase());
        const definicion = (rows: any[]) => rows.map((l: any) => ({
          codigo: String(l.codigo).trim().toUpperCase(), nombre: String(l.nombre).trim(), orden: Number(l.orden),
          tipo: String(l.tipo).toUpperCase(), patrones_cuenta: (l.patrones_cuenta || []).map((p: string) => p.trim()),
          naturaleza: String(l.naturaleza || 'SALDO').toUpperCase(), alcance_fecha: String(l.alcance_fecha || 'PERIODO').toUpperCase(),
          tipo_tasa: String(l.tipo_tasa || 'CIERRE').toUpperCase(), signo: Number(l.signo ?? 1),
          formula: (l.formula || []).map((c: any) => ({ codigo: String(c.codigo).trim().toUpperCase(), coeficiente: Number(c.coeficiente) })),
        })).sort((a, b) => a.orden - b.orden);
        if (previo && previo.created_by === userId && previo.nombre === dto.nombre.trim()
          && (previo.descripcion || '') === (dto.descripcion || '').trim()
          && JSON.stringify(definicion(previo.lineas)) === JSON.stringify(definicion(lineas))) {
          return { ...previo, idempotent: true };
        }
      }
      this.dbError('Error guardando reporte configurable', error);
    }
    const reportes = await this.listarReportes(tenantId);
    return reportes.find((reporte: any) => reporte.id === data?.[0]?.id);
  }

  static validarDefinicion(lineas: LineaReporteConfigurableDto[]): void {
    const codigos = lineas.map((l) => l.codigo.trim().toUpperCase());
    if (new Set(codigos).size !== codigos.length) {
      throw new BadRequestException('Los códigos de línea no pueden repetirse.');
    }
    const ordenes = lineas.map((l) => l.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      throw new BadRequestException('El orden de las líneas no puede repetirse.');
    }

    const existentes = new Set(codigos);
    const dependencias = new Map<string, string[]>();
    lineas.forEach((linea, indice) => {
      const codigo = codigos[indice];
      if (linea.tipo === TipoLineaReporte.CUENTAS) {
        if (!linea.patrones_cuenta?.length || linea.formula?.length) {
          throw new BadRequestException(`La línea ${codigo} debe definir cuentas y no una fórmula.`);
        }
        dependencias.set(codigo, []);
        return;
      }

      if (!linea.formula?.length || linea.patrones_cuenta?.length) {
        throw new BadRequestException(`La línea ${codigo} debe definir una fórmula y no cuentas.`);
      }
      const refs = linea.formula.map((c) => c.codigo.trim().toUpperCase());
      for (const ref of refs) {
        if (!existentes.has(ref)) {
          throw new BadRequestException(`La fórmula ${codigo} referencia la línea inexistente ${ref}.`);
        }
      }
      dependencias.set(codigo, refs);
    });

    const visitando = new Set<string>();
    const visitados = new Set<string>();
    const visitar = (codigo: string) => {
      if (visitando.has(codigo)) {
        throw new BadRequestException(`La fórmula contiene una dependencia circular en ${codigo}.`);
      }
      if (visitados.has(codigo)) return;
      visitando.add(codigo);
      for (const dependencia of dependencias.get(codigo) || []) visitar(dependencia);
      visitando.delete(codigo);
      visitados.add(codigo);
    };
    for (const codigo of codigos) visitar(codigo);
  }

  async generarReporte(
    tenantId: string,
    reporteId: string,
    fechaDesde: string,
    fechaHasta: string,
    grupoId?: string,
  ) {
    financialDay(fechaDesde,'PE');financialDay(fechaHasta,'PE');
    if (fechaDesde > fechaHasta) {
      throw new BadRequestException('La fecha desde no puede ser posterior a la fecha hasta.');
    }
    const reporte = await this.obtenerReporte(tenantId, reporteId);
    const lineas = reporte.lineas as any[];
    ConsolidacionReportesService.validarDefinicion(lineas);

    let grupo: any = null;
    let tenantIds = [tenantId];
    let monedaPresentacion = await this.obtenerMonedaTenant(tenantId);
    if (grupoId) {
      grupo = await this.exigirControladora(tenantId, grupoId);
      if (!grupo || grupo.id!==grupoId || typeof grupo.moneda_presentacion!=='string' || !/^[A-Z]{3}$/.test(grupo.moneda_presentacion)) throw new ServiceUnavailableException('La moneda de presentación del grupo está incompleta.');
      const members=await this.readCatalogRows('grupos_consolidacion_miembros','id,grupo_id,tenant_id,estado',q=>q.eq('grupo_id',grupoId).eq('estado','ACTIVO'),r=>r.grupo_id===grupoId && r.estado==='ACTIVO' && typeof r.tenant_id==='string');
      tenantIds=members.map(m=>m.tenant_id);
      if (!tenantIds.includes(tenantId) || new Set(tenantIds).size!==tenantIds.length) throw new ServiceUnavailableException('La composición activa del grupo está incompleta.');
      monedaPresentacion = grupo.moneda_presentacion;
    }

    const movimientos: MovimientoCuenta[] = [];
    for (const miembroTenantId of tenantIds) {
      movimientos.push(
        ...(await this.cargarMovimientos(miembroTenantId, fechaHasta)),
      );
    }

    let movimientosReporte = movimientos;
    let cantidadMapeos = 0;
    if (grupo) {
      const mappings=await this.readCatalogRows('mapeos_cuentas_consolidacion','*',q=>q.eq('grupo_id',grupo.id),r=>r.grupo_id===grupo.id && r.tenant_id===tenantId && tenantIds.includes(r.miembro_tenant_id) && typeof r.cuenta_codigo_origen==='string' && !!r.cuenta_codigo_origen && typeof r.cuenta_codigo_destino==='string' && !!r.cuenta_codigo_destino);
      cantidadMapeos=mappings.length;
      if (new Set(mappings.map(m=>`${m.miembro_tenant_id}:${m.cuenta_codigo_origen}`)).size!==mappings.length) throw new ServiceUnavailableException('Los mapeos de cuentas son ambiguos.');
      movimientosReporte=ConsolidacionReportesService.aplicarMapeos(movimientos,mappings);
    }

    const factores = grupo
      ? await this.resolverFactores(grupo, tenantIds, lineas, fechaHasta)
      : new Map<string, FactorTasa>();

    let ajustes: any[] = [];
    if (grupo) {
      ajustes=await this.readCatalogRows('ajustes_consolidacion','*',q=>q.eq('grupo_id',grupo.id).lte('fecha',fechaHasta),r=>r.grupo_id===grupo.id && r.tenant_id===tenantId && validFinancialCivilDay(r.fecha) && r.fecha<=fechaHasta && typeof r.cuenta_codigo==='string' && !!r.cuenta_codigo && [r.debe,r.haber].every(n=>typeof n==='number' && Number.isFinite(n) && n>=0 && Number.isSafeInteger(Math.round(n*100)) && Math.abs(n-Math.round(n*100)/100)<1e-9));
    }

    const valores = new Map<string, number>();
    const desglose = new Map<string, Record<string, number>>();
    const porCodigo = new Map(lineas.map((l: any) => [String(l.codigo).toUpperCase(), l]));

    const evaluar = (codigo: string, pila: string[] = []): number => {
      if (valores.has(codigo)) return valores.get(codigo)!;
      if (pila.includes(codigo)) {
        throw new BadRequestException(`Dependencia circular al evaluar ${[...pila, codigo].join(' → ')}.`);
      }
      const linea: any = porCodigo.get(codigo);
      if (!linea) throw new BadRequestException(`Línea de reporte inexistente: ${codigo}.`);

      let valor = new Decimal(0);
      if (linea.tipo === 'FORMULA') {
        valor = (linea.formula || []).reduce(
          (sum: Decimal, componente: any) =>
            sum.plus(new Decimal(evaluar(String(componente.codigo).toUpperCase(), [...pila, codigo])).times(componente.coeficiente)),
          new Decimal(0),
        );
        valor = valor.times(linea.signo ?? 1);
      } else {
        const detalle: Record<string, number> = {};
        for (const miembroTenantId of tenantIds) {
          const base = movimientosReporte
            .filter((movimiento) =>
              movimiento.tenant_id === miembroTenantId
              && movimiento.fecha <= fechaHasta
              && (linea.alcance_fecha === 'HASTA_FECHA' || movimiento.fecha >= fechaDesde)
              && (linea.patrones_cuenta || []).some((p: string) => movimiento.codigo.startsWith(p)),
            )
            .reduce((sum, movimiento) => {
              if (linea.naturaleza === 'DEBE') return sum.plus(movimiento.debe);
              if (linea.naturaleza === 'HABER') return sum.plus(movimiento.haber);
              return sum.plus(movimiento.debe).minus(movimiento.haber);
            }, new Decimal(0));
          const factor = grupo ? factores.get(`${miembroTenantId}:${linea.tipo_tasa || 'CIERRE'}`)?.factor : 1;
          if (typeof factor!=='number' || !Number.isFinite(factor) || factor<=0) throw new ServiceUnavailableException('Falta una tasa confirmada para la línea financiera.');
          detalle[miembroTenantId] = this.round2(base.times(factor).times(linea.signo ?? 1));
          valor = valor.plus(detalle[miembroTenantId]);
        }

        const ajuste = ajustes
          .filter((item) =>
            item.fecha <= fechaHasta
            && (linea.alcance_fecha === 'HASTA_FECHA' || item.fecha >= fechaDesde)
            && (linea.patrones_cuenta || []).some((p: string) => item.cuenta_codigo.startsWith(p)),
          )
          .reduce((sum, item) => {
            const base = linea.naturaleza === 'DEBE'
              ? Number(item.debe)
              : linea.naturaleza === 'HABER'
                ? Number(item.haber)
                : new Decimal(item.debe).minus(item.haber);
            return sum.plus(base);
          }, new Decimal(0)).times(linea.signo ?? 1);
        if (!ajuste.isZero()) detalle.AJUSTES_CONSOLIDACION = this.round2(ajuste);
        valor = valor.plus(ajuste);
        desglose.set(codigo, detalle);
      }
      const redondeado = this.round2(valor);
      valores.set(codigo, redondeado);
      return redondeado;
    };

    const resultadoLineas = [...lineas]
      .sort((a, b) => a.orden - b.orden)
      .map((linea: any) => {
        const codigo = String(linea.codigo).toUpperCase();
        return {
          codigo,
          nombre: linea.nombre,
          orden: linea.orden,
          tipo: linea.tipo,
          valor: evaluar(codigo),
          desglose_empresas: desglose.get(codigo),
        };
      });

    if (resultadoLineas.some(l=>!Number.isFinite(l.valor) || !Number.isSafeInteger(Math.round(l.valor*100)))) throw new ServiceUnavailableException('El resultado financiero está fuera de rango.');
    return {
      complete: true, tenant_id: tenantId, fuentes_completas: true, lineas_total: resultadoLineas.length, empresas_ids: tenantIds,
      reporte: { id: reporte.id, codigo: reporte.codigo, nombre: reporte.nombre },
      alcance: grupo ? 'CONSOLIDADO' : 'INDIVIDUAL',
      grupo: grupo ? { id: grupo.id, codigo: grupo.codigo, nombre: grupo.nombre } : null,
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
      moneda_presentacion: monedaPresentacion,
      empresas_incluidas: tenantIds.length,
      tasas_aplicadas: [...factores.values()],
      mapeos_cuentas_aplicados: cantidadMapeos,
      lineas: resultadoLineas,
      altera_libros_legales: false,
    };
  }

  private async obtenerReporte(tenantId: string,reporteId: string) {
    const reports=await this.readCatalogRows('reportes_contables_configurables','*',q=>q.eq('tenant_id',tenantId).eq('id',reporteId).eq('activo',true),r=>r.tenant_id===tenantId && r.id===reporteId && r.activo===true);
    if (!reports.length) throw new NotFoundException('Reporte configurable no encontrado.');
    if (reports.length!==1) throw new ServiceUnavailableException('La definición financiera no es única.');
    const lines=await this.readCatalogRows('reportes_contables_lineas','*',q=>q.eq('tenant_id',tenantId).eq('reporte_id',reporteId),r=>r.tenant_id===tenantId && r.reporte_id===reporteId);
    if (!lines.length || lines.some(l=>typeof l.codigo!=='string' || !l.codigo || typeof l.nombre!=='string' || !l.nombre || !Number.isSafeInteger(l.orden) || !['CUENTAS','FORMULA'].includes(l.tipo) || !['SALDO','DEBE','HABER'].includes(l.naturaleza) || !['PERIODO','HASTA_FECHA'].includes(l.alcance_fecha) || !['CIERRE','PROMEDIO','HISTORICA'].includes(l.tipo_tasa) || typeof l.signo!=='number' || !Number.isFinite(l.signo) || !Array.isArray(l.patrones_cuenta) || !l.patrones_cuenta.every(p=>typeof p==='string' && !!p) || !Array.isArray(l.formula) || !l.formula.every(c=>c && typeof c.codigo==='string' && !!c.codigo && typeof c.coeficiente==='number' && Number.isFinite(c.coeficiente)))) throw new ServiceUnavailableException('La definición financiera está incompleta.');
    try {ConsolidacionReportesService.validarDefinicion(lines);} catch {throw new ServiceUnavailableException('La definición financiera es incoherente.');}
    return {...reports[0],lineas_total:lines.length,lineas:lines.sort((a,b)=>a.orden-b.orden)};
  }

  static aplicarMapeos(
    movimientos: MovimientoCuenta[],
    mapeos: Array<{
      miembro_tenant_id: string;
      cuenta_codigo_origen: string;
      cuenta_codigo_destino: string;
    }>,
  ): MovimientoCuenta[] {
    const mapa = new Map(
      mapeos.map((item) => [
        `${item.miembro_tenant_id}:${item.cuenta_codigo_origen}`,
        item.cuenta_codigo_destino,
      ]),
    );
    return movimientos.map((movimiento) => ({
      ...movimiento,
      codigo: mapa.get(`${movimiento.tenant_id}:${movimiento.codigo}`) || movimiento.codigo,
    }));
  }

  private async exigirControladora(tenantId: string, grupoId: string) {
    const { data, error } = await this.client
      .from('grupos_consolidacion')
      .select('*')
      .eq('id', grupoId)
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .maybeSingle();
    if (error) this.dbError('Error validando grupo de consolidación', error);
    if (!data) {
      throw new ForbiddenException('Solo la empresa controladora puede realizar esta operación.');
    }
    return data;
  }

  private async exigirMiembroActivo(grupoId: string, miembroTenantId: string) {
    const { data, error } = await this.client
      .from('grupos_consolidacion_miembros')
      .select('id')
      .eq('grupo_id', grupoId)
      .eq('tenant_id', miembroTenantId)
      .eq('estado', 'ACTIVO')
      .maybeSingle();
    if (error) this.dbError('Error validando miembro del grupo', error);
    if (!data) throw new BadRequestException('La empresa no es un miembro activo del grupo.');
  }

  private async obtenerMonedaTenant(tenantId: string): Promise<string> {
    const { data, error } = (await this.client
      .from('empresa_config')
      .select('tenant_id,moneda_defecto')
      .eq('tenant_id', tenantId)
      .maybeSingle()) || {};
    if (error || data?.tenant_id!==tenantId || typeof data?.moneda_defecto!=='string' || !/^[A-Z]{3}$/.test(data.moneda_defecto)) {
      throw new ServiceUnavailableException('La moneda funcional de la empresa está incompleta.');
    }
    return String(data.moneda_defecto).toUpperCase();
  }

  private async buscarCuenta(tenantId: string, codigo: string): Promise<any | null> {
    const { data, error } = await this.client
      .from('plan_cuentas')
      .select('id, codigo, nombre')
      .eq('tenant_id', tenantId)
      .eq('codigo', codigo)
      .maybeSingle();
    if (error) this.dbError('Error validando cuenta contable', error);
    return data || null;
  }

  private async cargarMovimientos(tenantId: string,fechaHasta: string): Promise<MovimientoCuenta[]> {
    const {data:config,error}=(await this.client.from('empresa_config').select('tenant_id,pais').eq('tenant_id',tenantId).maybeSingle()) || {};
    if (error || !config || config.tenant_id!==tenantId) throw new ServiceUnavailableException('El calendario de la empresa no está disponible.');
    const window=financialDay(fechaHasta,config.pais);
    const rows=await this.readCatalogRows('detalle_asientos',`id,tenant_id,asiento_id,cuenta_id,debe,haber,
      plan_cuentas!fk_detalle_asientos_cuenta_id!inner(id,tenant_id,codigo,nombre),
      asientos_contables!fk_detalle_asientos_asiento_id!inner(id,tenant_id,fecha,estado)`,
      q=>q.eq('asientos_contables.tenant_id',tenantId).eq('asientos_contables.estado','CONFIRMADO').lt('asientos_contables.fecha',window.until),r=>r.tenant_id===tenantId);
    const result: MovimientoCuenta[]=[];
    for (const row of rows) {
      const asiento=Array.isArray(row.asientos_contables)?(row.asientos_contables.length===1?row.asientos_contables[0]:null):row.asientos_contables;
      const cuenta=Array.isArray(row.plan_cuentas)?(row.plan_cuentas.length===1?row.plan_cuentas[0]:null):row.plan_cuentas;
      if (!asiento || asiento.id!==row.asiento_id || asiento.tenant_id!==tenantId || asiento.estado!=='CONFIRMADO' || typeof asiento.fecha!=='string' || !Number.isFinite(Date.parse(asiento.fecha)) || Date.parse(asiento.fecha)>=Date.parse(window.until) || !cuenta || cuenta.id!==row.cuenta_id || cuenta.tenant_id!==tenantId || typeof cuenta.codigo!=='string' || !cuenta.codigo || ![row.debe,row.haber].every(n=>typeof n==='number' && Number.isFinite(n) && n>=0 && Number.isSafeInteger(Math.round(n*100)) && Math.abs(n-Math.round(n*100)/100)<1e-9)) throw new ServiceUnavailableException('Una fuente contable está incompleta, es ajena o no coincide con el corte.');
      const date=fechaDeDocumentoEnPais(asiento.fecha,window.zone);
      // UTC midnight represents a stored civil date. Instants use the tenant zone.
      // The upper UTC scan can include next-day civil-midnight rows; they are explicitly outside this cutoff.
      if (!date || date>fechaHasta) continue;
      result.push({tenant_id:tenantId,fecha:date,codigo:cuenta.codigo,nombre:cuenta.nombre || cuenta.codigo,debe:row.debe,haber:row.haber});
    }
    return result;
  }

  private async resolverFactores(
    grupo: any,
    tenantIds: string[],
    lineas: any[],
    fechaHasta: string,
  ): Promise<Map<string, FactorTasa>> {
    const tipos = [...new Set(
      lineas.filter((l: any) => l.tipo === 'CUENTAS').map((l: any) => l.tipo_tasa || 'CIERRE'),
    )];
    const factores = new Map<string, FactorTasa>();
    for (const miembroTenantId of tenantIds) {
      const moneda = await this.obtenerMonedaTenant(miembroTenantId);
      for (const tipo of tipos) {
        const key = `${miembroTenantId}:${tipo}`;
        if (moneda === grupo.moneda_presentacion) {
          factores.set(key, {
            tenant_id: miembroTenantId,
            factor: 1,
            moneda_origen: moneda,
            moneda_destino: grupo.moneda_presentacion,
            fecha: fechaHasta,
            tipo: String(tipo),
          });
          continue;
        }

        const { data, error } = (await this.client
          .from('tipos_cambio_consolidacion')
          .select('id,grupo_id,miembro_tenant_id,factor_conversion,moneda_origen,moneda_destino,fecha,tipo')
          .eq('grupo_id', grupo.id)
          .eq('miembro_tenant_id', miembroTenantId)
          .eq('tipo', tipo)
          .lte('fecha', fechaHasta)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle()) || {};
        if (error) this.dbError('Error obteniendo tasa de consolidación', error);
        if (!data) {
          throw new BadRequestException(
            `Falta tasa ${tipo} para ${moneda} → ${grupo.moneda_presentacion} `
            + `de la empresa ${miembroTenantId} al ${fechaHasta}.`,
          );
        }
        if (data.grupo_id!==grupo.id || data.miembro_tenant_id!==miembroTenantId || data.moneda_origen!==moneda || data.moneda_destino!==grupo.moneda_presentacion || data.tipo!==tipo || !validFinancialCivilDay(data.fecha) || data.fecha>fechaHasta || typeof data.factor_conversion!=='number' || !Number.isFinite(data.factor_conversion) || data.factor_conversion<=0 || data.factor_conversion>=10000000000) throw new ServiceUnavailableException('La tasa de consolidación está incompleta o no corresponde al alcance.');
        factores.set(key, {
          tenant_id: miembroTenantId,
          factor: Number(data.factor_conversion),
          moneda_origen: data.moneda_origen,
          moneda_destino: data.moneda_destino,
          fecha: data.fecha,
          tipo: data.tipo,
        });
      }
    }
    return factores;
  }

  private round2(valor: Decimal.Value): number {
    return new Decimal(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }
}
