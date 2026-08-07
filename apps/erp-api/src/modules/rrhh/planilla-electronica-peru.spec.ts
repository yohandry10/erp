import { construirPaquetePlanillaElectronicaPeru, FuentePlanillaPeru } from './planilla-electronica-peru.service';

const fuenteBase = (): FuentePlanillaPeru => ({
  empresa: { ruc: '20123456789', razon_social: 'Empresa Peru SAC', pais: 'PE' },
  planilla: { id: 'planilla-1', periodo: '2026-07', estado: 'calculada', total_ingresos: 2000, total_descuentos: 260, total_aportes: 180, total_neto: 1740 },
  detalles: [{ id: 'detalle-1', empleado_id: 'empleado-1', dias_trabajados: 30, horas_extras_25: 2, horas_extras_35: 1, faltas: 0, tardanzas_minutos: 0, total_ingresos: 2000, total_descuentos: 260, total_aportes: 180, neto_pagar: 1740 }],
  empleados: [{ id: 'empleado-1', nombres: 'JUAN CARLOS', apellidos: 'PEREZ QUISPE', tipo_documento: 'DNI', numero_documento: '12345678', fecha_nacimiento: '1990-02-03', fecha_ingreso: '2026-01-01', genero: 'masculino', ubigeo: '150101' }],
  contratos: [{ empleado_id: 'empleado-1', fecha_inicio: '2026-01-01', sueldo_bruto: 2000, metadata: {} }],
  fichas: [{ empleado_id: 'empleado-1', apellido_paterno: 'PEREZ', apellido_materno: 'QUISPE', pais_emisor_documento: '604', regimen_laboral_codigo: '01', situacion_educativa_codigo: '13', ocupacion_codigo: '251101', discapacidad: false, tipo_contrato_codigo: '01', jornada_atipica: false, jornada_maxima: true, horario_nocturno: false, sindicalizado: false, periodicidad_remuneracion_codigo: '1', situacion_codigo: '1', quinta_exonerada: false, tipo_pago_codigo: '1', categoria_ocupacional_codigo: '02', tipo_trabajador_codigo: '21', regimen_salud_codigo: '00', regimen_pensionario_codigo: '02', establecimiento_codigo: '0000' }],
  conceptosDetalle: [{ id_empleado_planilla: 'detalle-1', id_concepto: 'concepto-1', monto: 2000, observaciones: 'Sueldo' }],
  conceptos: [{ id: 'concepto-1', codigo: '001', nombre: 'Sueldo basico', metadata: { tipo: 'ingreso' } }],
  cuartaCategoria: [{ proveedor_id: 'proveedor-1', numero_comprobante: 'E001-15', fecha_emision: '2026-07-10', fecha_pago: '2026-07-15', monto_pago: 2000, tasa_retencion: 8, monto_retencion: 160, monto_neto: 1840 }],
  proveedores: [{ id: 'proveedor-1', tipo_documento: 'RUC', ruc: '10123456789', razon_social: 'CONSULTOR PERU' }],
  asistencias: [{ empleado_id: 'empleado-1', fecha: '2026-07-31', horas_trabajadas: 243 }],
});

describe('Planilla electrónica Perú', () => {
  it('genera fuentes PVS con nombres y palote final oficiales', () => {
    const paquete = construirPaquetePlanillaElectronicaPeru(fuenteBase());
    expect(paquete.bloqueos).toHaveLength(0);
    expect(paquete.resumen.listo_para_pvs).toBe(true);
    expect(paquete.archivos.map((item) => item.nombre)).toEqual(expect.arrayContaining([
      'RP_20123456789.ide', 'RP_20123456789.tra', 'RP_20123456789.per', 'RP_20123456789.est',
    ]));
    const ide = paquete.archivos.find((item) => item.nombre.endsWith('.ide'))!;
    expect(ide.contenido).toContain('01|12345678|604|03/02/1990|PEREZ|QUISPE|JUAN CARLOS|1|');
    expect(ide.contenido.trimEnd().endsWith('|')).toBe(true);
    expect(ide.contenido.trim().split('|')).toHaveLength(42);
    expect(ide.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('no genera fuentes T-Registro si faltan códigos paramétricos', () => {
    const fuente = fuenteBase();
    fuente.fichas[0].ocupacion_codigo = null;
    fuente.fichas[0].regimen_salud_codigo = null;
    const paquete = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(paquete.resumen.listo_para_pvs).toBe(false);
    expect(paquete.bloqueos.map((item) => item.codigo)).toEqual(expect.arrayContaining([
      'FICHA_OCUPACION_CODIGO', 'FICHA_REGIMEN_SALUD_CODIGO',
    ]));
    expect(paquete.archivos.some((item) => item.nombre.endsWith('.tra'))).toBe(false);
    expect(paquete.archivos.some((item) => item.tipo === 'PAPEL_TRABAJO')).toBe(true);
  });

  it('rechaza planillas no calculadas y RUC que no sea peruano de once dígitos', () => {
    const fuente = fuenteBase();
    fuente.empresa.ruc = '123';
    fuente.planilla.estado = 'borrador';
    fuente.planilla.pais_codigo = 'AR';
    const paquete = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(paquete.bloqueos.map((item) => item.codigo)).toEqual(expect.arrayContaining([
      'RUC_INVALIDO', 'PLANILLA_NO_CALCULADA', 'PLANILLA_NO_PE',
    ]));
  });

  it('acepta una planilla aprobada como fuente oficial de PLAME', () => {
    const fuente = fuenteBase();
    fuente.planilla.estado = 'aprobada';
    const paquete = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(paquete.bloqueos.map((item) => item.codigo)).not.toContain('PLANILLA_NO_CALCULADA');
    expect(paquete.resumen.listo_para_pvs).toBe(true);
  });

  it('bloquea horas inventadas y acepta jornada respaldada por asistencia', () => {
    const fuente = fuenteBase();
    fuente.asistencias = [];
    const bloqueada = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(bloqueada.bloqueos.map((item) => item.codigo)).toContain('HORAS_ORDINARIAS_FALTANTES');
    fuente.detalles[0].metadata = { plame_horas_ordinarias: 160, plame_dias_no_laborados: 10 };
    const manual = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(manual.bloqueos.map((item) => item.codigo)).not.toContain('HORAS_ORDINARIAS_FALTANTES');
    expect(manual.trabajadores[0].jornada).toEqual({ horas_ordinarias: 160, dias_no_laborados: 10, fuente: 'MANUAL_CONTADOR' });
  });

  it('genera cuatro períodos T-Registro y un quinto sólo cuando existe SCTR Salud', () => {
    const fuente = fuenteBase();
    fuente.fichas[0].sctr_salud_codigo = '1';
    const paquete = construirPaquetePlanillaElectronicaPeru(fuente);
    const per = paquete.archivos.find((item) => item.nombre.endsWith('.per'))!;
    expect(per.contenido.trim().split(/\r?\n/)).toHaveLength(5);
    expect(per.contenido).toContain('|1|5|01/01/2026||1||');
  });

  it('mantiene los CSV como papeles de trabajo y advierte que no son constancia', () => {
    const paquete = construirPaquetePlanillaElectronicaPeru(fuenteBase());
    const leeme = paquete.archivos.find((item) => item.nombre === 'LEEME.txt')!;
    expect(leeme.contenido).toContain('constancia PLAME'.normalize('NFC'));
    expect(leeme.contenido).toContain('ticket y CIR'.normalize('NFC'));
    expect(paquete.advertencias[0].codigo).toBe('VALIDACION_EXTERNA_OBLIGATORIA');
    const cuarta = paquete.archivos.find((item) => item.nombre.startsWith('PLAME_CUARTA_CATEGORIA_'))!;
    expect(cuarta.contenido).toContain('"10123456789"');
    expect(paquete.resumen.prestadores_cuarta).toBe(1);
    expect(paquete.resumen.retenciones_cuarta).toBe(160);
  });

  it('no vuelve a proponer T-Registro si la huella ya tiene CIR y reactiva la novedad al cambiar', () => {
    const fuente = fuenteBase();
    const primera = construirPaquetePlanillaElectronicaPeru(fuente);
    fuente.fichas[0].metadata = {
      tregistro_ultima_huella: primera.resumen.tregistro_huellas['empleado-1'],
      tregistro_cir: 'CIR-001',
    };
    const sinNovedad = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(sinNovedad.resumen.tregistro_novedades).toBe(0);
    expect(sinNovedad.archivos.some((item) => item.nombre.startsWith('RP_'))).toBe(false);

    fuente.fichas[0].ocupacion_codigo = '251102';
    const modificada = construirPaquetePlanillaElectronicaPeru(fuente);
    expect(modificada.resumen.tregistro_novedades).toBe(1);
    expect(modificada.archivos.some((item) => item.nombre.endsWith('.tra'))).toBe(true);
  });
});
