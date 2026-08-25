import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
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

@Injectable()
export class ConsolidacionReportesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private dbError(contexto: string, error: any): never {
    if (error?.code === '23505') {
      throw new ConflictException(`${contexto}: ya existe un registro con ese código.`);
    }
    throw new Error(`${contexto}: ${error?.message || 'error de base de datos'}`);
  }

  async listarGrupos(tenantId: string) {
    const { data: membresias, error: errorMembresias } = await this.client
      .from('grupos_consolidacion_miembros')
      .select('grupo_id, estado')
      .eq('tenant_id', tenantId);
    if (errorMembresias) this.dbError('Error obteniendo membresías', errorMembresias);

    // Sólo las membresías vivas: una invitación rechazada no vuelve a listar el
    // grupo. Además `obtenerGrupo` ya las rechaza, así que sin este filtro el
    // listado entero fallaría con un 403 en cuanto hubiera una rechazada.
    const grupoIds = [
      ...new Set(
        (membresias || [])
          .filter((m: any) => ['PENDIENTE', 'ACTIVO'].includes(String(m.estado || '').toUpperCase()))
          .map((m: any) => m.grupo_id),
      ),
    ];
    let query = this.client
      .from('grupos_consolidacion')
      .select('*')
      .order('nombre', { ascending: true });

    if (grupoIds.length > 0) {
      query = query.or(`tenant_id.eq.${tenantId},id.in.(${grupoIds.join(',')})`);
    } else {
      query = query.eq('tenant_id', tenantId);
    }

    const { data: grupos, error } = await query;
    if (error) this.dbError('Error obteniendo grupos de consolidación', error);

    const resultado = [];
    for (const grupo of grupos || []) {
      resultado.push(await this.obtenerGrupo(tenantId, grupo.id));
    }
    return resultado;
  }

  async obtenerGrupo(tenantId: string, grupoId: string) {
    const { data: grupo, error } = await this.client
      .from('grupos_consolidacion')
      .select('*')
      .eq('id', grupoId)
      .maybeSingle();
    if (error) this.dbError('Error obteniendo grupo de consolidación', error);
    if (!grupo) throw new NotFoundException('Grupo de consolidación no encontrado.');

    const { data: membresia } = await this.client
      .from('grupos_consolidacion_miembros')
      .select('estado')
      .eq('grupo_id', grupoId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    // Bastaba con tener cualquier fila de membresía: una empresa que rechazó la
    // invitación seguía viendo el RUC, la razón social y el nombre comercial del
    // resto del grupo, para siempre. Rechazar termina la relación. Pendiente sí
    // ve el listado, que es lo que permite decidir si aceptar.
    const perteneceAlGrupo =
      grupo.tenant_id === tenantId ||
      ['PENDIENTE', 'ACTIVO'].includes(String(membresia?.estado || '').toUpperCase());
    if (!perteneceAlGrupo) {
      throw new ForbiddenException('La empresa actual no pertenece a este grupo.');
    }

    const { data: miembros, error: errorMiembros } = await this.client
      .from('grupos_consolidacion_miembros')
      .select('*')
      .eq('grupo_id', grupoId)
      .order('es_controladora', { ascending: false });
    if (errorMiembros) this.dbError('Error obteniendo miembros del grupo', errorMiembros);

    const tenantIds = (miembros || []).map((m: any) => m.tenant_id);
    const empresasPorTenant = new Map<string, any>();
    if (tenantIds.length > 0) {
      const { data: empresas, error: errorEmpresas } = await this.client
        .from('empresa_config')
        .select('tenant_id, ruc, razon_social, nombre_comercial, moneda_defecto')
        .in('tenant_id', tenantIds);
      if (errorEmpresas) this.dbError('Error obteniendo empresas del grupo', errorEmpresas);
      for (const empresa of empresas || []) empresasPorTenant.set(empresa.tenant_id, empresa);
    }

    return {
      ...grupo,
      es_controladora: grupo.tenant_id === tenantId,
      miembros: (miembros || []).map((miembro: any) => ({
        ...miembro,
        empresa: empresasPorTenant.get(miembro.tenant_id) || null,
      })),
    };
  }

  async crearGrupo(tenantId: string, userId: string, dto: CrearGrupoConsolidacionDto) {
    const { data, error } = await this.client.rpc('crear_grupo_consolidacion_tx', {
      p_tenant_id: tenantId,
      p_codigo: dto.codigo,
      p_nombre: dto.nombre,
      p_moneda_presentacion: dto.moneda_presentacion,
      p_created_by: userId,
    });
    if (error) this.dbError('Error creando grupo de consolidación', error);
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
    const key=idempotencyKey?.trim()||`consolidation-rate:${createHash('sha256').update(JSON.stringify({tenantId,userId,grupoId,dto})).digest('hex')}`;
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
    const key=idempotencyKey?.trim()||`consolidation-map:${createHash('sha256').update(JSON.stringify({tenantId,userId,grupoId,dto})).digest('hex')}`;
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
    const debe = Number(dto.debe || 0);
    const haber = Number(dto.haber || 0);
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
    const { data, error } = await this.client
      .from('reportes_contables_configurables')
      .select('*, reportes_contables_lineas(*)')
      .eq('tenant_id', tenantId)
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) this.dbError('Error obteniendo reportes configurables', error);
    return (data || []).map((reporte: any) => ({
      ...reporte,
      lineas: [...(reporte.reportes_contables_lineas || [])].sort(
        (a: any, b: any) => a.orden - b.orden,
      ),
      reportes_contables_lineas: undefined,
    }));
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
    if (error) this.dbError('Error guardando reporte configurable', error);
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
      const { data: miembros, error } = await this.client
        .from('grupos_consolidacion_miembros')
        .select('tenant_id')
        .eq('grupo_id', grupoId)
        .eq('estado', 'ACTIVO');
      if (error) this.dbError('Error obteniendo miembros activos', error);
      tenantIds = (miembros || []).map((m: any) => m.tenant_id);
      if (!tenantIds.includes(tenantId)) tenantIds.unshift(tenantId);
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
      const { data: mapeos, error: errorMapeos } = await this.client
        .from('mapeos_cuentas_consolidacion')
        .select('miembro_tenant_id, cuenta_codigo_origen, cuenta_codigo_destino')
        .eq('grupo_id', grupo.id);
      if (errorMapeos) this.dbError('Error obteniendo mapeos de cuentas', errorMapeos);
      cantidadMapeos = (mapeos || []).length;
      movimientosReporte = ConsolidacionReportesService.aplicarMapeos(
        movimientos,
        mapeos || [],
      );
    }

    const factores = grupo
      ? await this.resolverFactores(grupo, tenantIds, lineas, fechaHasta)
      : new Map<string, FactorTasa>();

    let ajustes: any[] = [];
    if (grupo) {
      const { data, error } = await this.client
        .from('ajustes_consolidacion')
        .select('*')
        .eq('grupo_id', grupo.id)
        .lte('fecha', fechaHasta);
      if (error) this.dbError('Error obteniendo ajustes de consolidación', error);
      ajustes = data || [];
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

      let valor = 0;
      if (linea.tipo === 'FORMULA') {
        valor = (linea.formula || []).reduce(
          (sum: number, componente: any) =>
            sum + evaluar(String(componente.codigo).toUpperCase(), [...pila, codigo]) * Number(componente.coeficiente),
          0,
        );
        valor *= Number(linea.signo ?? 1);
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
              if (linea.naturaleza === 'DEBE') return sum + movimiento.debe;
              if (linea.naturaleza === 'HABER') return sum + movimiento.haber;
              return sum + movimiento.debe - movimiento.haber;
            }, 0);
          const factor = grupo
            ? factores.get(`${miembroTenantId}:${linea.tipo_tasa || 'CIERRE'}`)?.factor ?? 1
            : 1;
          detalle[miembroTenantId] = this.round2(base * factor * Number(linea.signo ?? 1));
          valor += detalle[miembroTenantId];
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
                : Number(item.debe) - Number(item.haber);
            return sum + base;
          }, 0) * Number(linea.signo ?? 1);
        if (ajuste) detalle.AJUSTES_CONSOLIDACION = this.round2(ajuste);
        valor += ajuste;
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

    return {
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

  private async obtenerReporte(tenantId: string, reporteId: string) {
    const { data, error } = await this.client
      .from('reportes_contables_configurables')
      .select('*, reportes_contables_lineas(*)')
      .eq('tenant_id', tenantId)
      .eq('id', reporteId)
      .eq('activo', true)
      .maybeSingle();
    if (error) this.dbError('Error obteniendo reporte configurable', error);
    if (!data) throw new NotFoundException('Reporte configurable no encontrado.');
    return {
      ...data,
      lineas: [...(data.reportes_contables_lineas || [])].sort((a: any, b: any) => a.orden - b.orden),
    };
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
    const { data, error } = await this.client
      .from('empresa_config')
      .select('moneda_defecto')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !data?.moneda_defecto) {
      throw new BadRequestException(`La empresa ${tenantId} no tiene moneda funcional configurada.`);
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

  private async cargarMovimientos(tenantId: string, fechaHasta: string): Promise<MovimientoCuenta[]> {
    const resultado: MovimientoCuenta[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await this.client
        .from('detalle_asientos')
        .select(`
          debe,
          haber,
          plan_cuentas!fk_detalle_asientos_cuenta_id (codigo, nombre),
          asientos_contables!fk_detalle_asientos_asiento_id (tenant_id, fecha, estado)
        `)
        .eq('asientos_contables.tenant_id', tenantId)
        // `fecha` puede llegar como timestamptz. Comparar contra YYYY-MM-DD
        // equivale a medianoche y excluye las operaciones del propio día.
        .lte('asientos_contables.fecha', `${fechaHasta}T23:59:59.999Z`)
        .eq('asientos_contables.estado', 'CONFIRMADO')
        .range(offset, offset + pageSize - 1);
      if (error) this.dbError('Error leyendo movimientos contables', error);

      for (const fila of data || []) {
        const asiento = Array.isArray((fila as any).asientos_contables)
          ? (fila as any).asientos_contables[0]
          : (fila as any).asientos_contables;
        const cuenta = Array.isArray((fila as any).plan_cuentas)
          ? (fila as any).plan_cuentas[0]
          : (fila as any).plan_cuentas;
        if (!asiento || asiento.tenant_id !== tenantId || !cuenta?.codigo) continue;
        resultado.push({
          tenant_id: tenantId,
          fecha: String(asiento.fecha).slice(0, 10),
          codigo: String(cuenta.codigo),
          nombre: String(cuenta.nombre || cuenta.codigo),
          debe: Number((fila as any).debe || 0),
          haber: Number((fila as any).haber || 0),
        });
      }
      if (!data || data.length < pageSize) break;
    }
    return resultado;
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

        const { data, error } = await this.client
          .from('tipos_cambio_consolidacion')
          .select('factor_conversion, moneda_origen, moneda_destino, fecha, tipo')
          .eq('grupo_id', grupo.id)
          .eq('miembro_tenant_id', miembroTenantId)
          .eq('tipo', tipo)
          .lte('fecha', fechaHasta)
          .order('fecha', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) this.dbError('Error obteniendo tasa de consolidación', error);
        if (!data) {
          throw new BadRequestException(
            `Falta tasa ${tipo} para ${moneda} → ${grupo.moneda_presentacion} `
            + `de la empresa ${miembroTenantId} al ${fechaHasta}.`,
          );
        }
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

  private round2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
  }
}
