'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PlanillaModal;
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const use_api_1 = require("@/hooks/use-api");
const use_toast_1 = require("@/components/ui/use-toast");
const DIAS_LABORABLES_MES = 30;
const HORAS_DIA = 8;
const VALOR_HORA_NORMAL = (sueldo) => sueldo / DIAS_LABORABLES_MES / HORAS_DIA;
function PlanillaModal({ isOpen, onClose, onSuccess }) {
    console.log('🔥 PlanillaModal RENDERED - isOpen:', isOpen);
    const { get, post } = (0, use_api_1.useApi)();
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [empleados, setEmpleados] = (0, react_1.useState)([]);
    const [formData, setFormData] = (0, react_1.useState)({
        periodo: '',
        tipo: 'mensual',
        fecha_inicio: '',
        fecha_fin: '',
        fecha_pago: '',
        observaciones: '',
        estado: 'borrador'
    });
    (0, react_1.useEffect)(() => {
        console.log('🔥 useEffect triggered - isOpen:', isOpen);
        if (isOpen) {
            console.log('🔥 Modal OPENING - configurando período y cargando empleados');
            configurarPeriodoActual();
            loadEmpleados();
            document.body.style.overflow = 'hidden';
        }
        else {
            console.log('🔥 Modal CLOSING');
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);
    const configurarPeriodoActual = () => {
        const ahora = new Date();
        const periodo = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
        const fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        const fechaFin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
        const fechaPago = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 5);
        setFormData({
            periodo,
            tipo: 'mensual',
            fecha_inicio: fechaInicio.toISOString().split('T')[0],
            fecha_fin: fechaFin.toISOString().split('T')[0],
            fecha_pago: fechaPago.toISOString().split('T')[0],
            observaciones: `Planilla mensual ${periodo}`,
            estado: 'borrador'
        });
    };
    const loadEmpleados = async () => {
        console.log('🔥 loadEmpleados INICIADO');
        try {
            setLoading(true);
            console.log('🔥 Haciendo GET a /api/rrhh/empleados');
            const empleadosResponse = await get('/api/rrhh/empleados');
            console.log('🔥 Respuesta empleados:', empleadosResponse);
            if (empleadosResponse && empleadosResponse.success && empleadosResponse.data) {
                const empleadosActivos = empleadosResponse.data.filter(emp => emp.estado === 'activo');
                console.log('🔥 Empleados activos encontrados:', empleadosActivos.length);
                const empleadosConDatos = empleadosActivos.map(emp => {
                    const sueldoBase = emp.contratos?.[0]?.sueldo_bruto || 0;
                    return {
                        ...emp,
                        incluir: true,
                        dias_trabajados: DIAS_LABORABLES_MES,
                        horas_extras_25: 0,
                        horas_extras_35: 0,
                        tardanzas_minutos: 0,
                        faltas: 0,
                        sueldo_base: sueldoBase,
                        bonos_adicionales: 0,
                        // Calculados
                        sueldo_diario: sueldoBase / DIAS_LABORABLES_MES,
                        descuento_tardanzas: 0,
                        descuento_faltas: 0,
                        pago_horas_extras: 0,
                        sueldo_bruto_total: sueldoBase
                    };
                });
                console.log('🔥 Empleados procesados para planilla:', empleadosConDatos.length);
                setEmpleados(empleadosConDatos);
            }
            else {
                console.error('🔥 Error en respuesta empleados:', empleadosResponse);
                throw new Error('No se pudieron cargar empleados');
            }
        }
        catch (error) {
            console.error('🔥 ERROR CARGANDO EMPLEADOS:', error);
            (0, use_toast_1.toast)({
                title: "Error",
                description: "No se pudieron cargar los empleados",
                variant: "destructive",
            });
        }
        finally {
            setLoading(false);
        }
    };
    const calcularValoresEmpleado = (empleado) => {
        const sueldoDiario = empleado.sueldo_base / DIAS_LABORABLES_MES;
        const valorHoraNormal = empleado.sueldo_base / DIAS_LABORABLES_MES / HORAS_DIA;
        // Descuentos por tardanzas (proporcional por minuto)
        const descuentoTardanzas = (empleado.tardanzas_minutos * valorHoraNormal) / 60;
        // Descuentos por faltas (día completo)
        const descuentoFaltas = empleado.faltas * sueldoDiario;
        // Pago por horas extras
        const pagoHorasExtras25 = empleado.horas_extras_25 * valorHoraNormal * 1.25;
        const pagoHorasExtras35 = empleado.horas_extras_35 * valorHoraNormal * 1.35;
        const pagoHorasExtras = pagoHorasExtras25 + pagoHorasExtras35;
        // Sueldo bruto total
        const sueldoBrutoTotal = empleado.sueldo_base + empleado.bonos_adicionales + pagoHorasExtras - descuentoTardanzas - descuentoFaltas;
        return {
            sueldo_diario: sueldoDiario,
            descuento_tardanzas: descuentoTardanzas,
            descuento_faltas: descuentoFaltas,
            pago_horas_extras: pagoHorasExtras,
            sueldo_bruto_total: sueldoBrutoTotal
        };
    };
    const actualizarEmpleado = (empleadoId, campo, valor) => {
        setEmpleados(prevEmpleados => prevEmpleados.map(emp => {
            if (emp.id === empleadoId) {
                const empleadoActualizado = { ...emp, [campo]: valor };
                const calculados = calcularValoresEmpleado(empleadoActualizado);
                return { ...empleadoActualizado, ...calculados };
            }
            return emp;
        }));
    };
    const empleadosSeleccionados = empleados.filter(emp => emp.incluir);
    const totalPlanilla = empleadosSeleccionados.reduce((sum, emp) => sum + emp.sueldo_bruto_total, 0);
    const totalEmpleados = empleadosSeleccionados.length;
    const handleSubmit = async (e) => {
        console.log('🔥 handleSubmit EJECUTADO');
        e.preventDefault();
        setLoading(true);
        try {
            console.log('🔥 Empleados seleccionados:', empleadosSeleccionados.length);
            console.log('🔥 Form data:', formData);
            if (empleadosSeleccionados.length === 0) {
                console.error('🔥 ERROR: No hay empleados seleccionados');
                (0, use_toast_1.toast)({
                    title: "Error",
                    description: "Debe seleccionar al menos un empleado",
                    variant: "destructive",
                });
                return;
            }
            if (!formData.periodo.trim()) {
                console.error('🔥 ERROR: No hay período');
                (0, use_toast_1.toast)({
                    title: "Error",
                    description: "Ingrese el período de la planilla",
                    variant: "destructive",
                });
                return;
            }
            console.log('🔥 Creando planilla con data:', formData);
            // Crear planilla
            const createResponse = await post('/api/rrhh/planillas', formData);
            console.log('🔥 Respuesta crear planilla:', createResponse);
            if (!createResponse) {
                throw new Error('Error creando planilla');
            }
            console.log('🔥 Calculando planilla personalizada...');
            // Calcular con empleados personalizados
            const calcResponse = await post(`/api/rrhh/planillas/${createResponse.id}/calcular-personalizada`, {
                empleados: empleadosSeleccionados
            });
            console.log('🔥 Respuesta calcular:', calcResponse);
            if (calcResponse && calcResponse.success) {
                console.log('🔥 ÉXITO: Planilla creada correctamente');
                (0, use_toast_1.toast)({
                    title: "¡Éxito!",
                    description: `Planilla ${formData.periodo} creada con ${calcResponse.totalEmpleados} empleados`,
                    variant: "default",
                });
                onSuccess();
                handleClose();
            }
            else {
                throw new Error('Error calculando planilla');
            }
        }
        catch (error) {
            console.error('🔥 ERROR EN SUBMIT:', error);
            (0, use_toast_1.toast)({
                title: "Error",
                description: error.message || "Error procesando planilla",
                variant: "destructive",
            });
        }
        finally {
            setLoading(false);
        }
    };
    const handleClose = () => {
        setFormData({
            periodo: '',
            tipo: 'mensual',
            fecha_inicio: '',
            fecha_fin: '',
            fecha_pago: '',
            observaciones: '',
            estado: 'borrador'
        });
        setEmpleados([]);
        onClose();
    };
    if (!isOpen) {
        console.log('🔥 Modal NO ESTÁ ABIERTO - retornando null');
        return null;
    }
    console.log('🔥 Modal SÍ ESTÁ ABIERTO - renderizando contenido');
    const modalContent = (<div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 99999
        }}>
      <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            width: '100%',
            maxWidth: '1280px',
            maxHeight: '95vh',
            overflow: 'hidden',
            zIndex: 100000
        }}>
        
        {/* Header */}
        <div style={{
            padding: '24px',
            borderBottom: '1px solid #e5e7eb',
            background: 'linear-gradient(to right, #eff6ff, #e0e7ff)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: '#1f2937',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            margin: 0
        }}>
                💰 Nueva Planilla de Sueldos
              </h2>
              <p style={{
            fontSize: '14px',
            color: '#6b7280',
            marginTop: '4px',
            margin: 0
        }}>
                Configure el período y seleccione empleados para generar la planilla
              </p>
            </div>

            <button onClick={handleClose} style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '16px'
        }}>
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
            padding: '24px',
            overflowY: 'auto',
            maxHeight: 'calc(95vh - 140px)'
        }}>
          <form id="planilla-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Configuración de Planilla */}
            <div style={{
            backgroundColor: '#f9fafb',
            padding: '16px',
            borderRadius: '8px'
        }}>
              <h3 style={{
            fontSize: '18px',
            fontWeight: '500',
            color: '#1f2937',
            marginBottom: '16px',
            margin: 0
        }}>⚙️ Configuración</h3>
              <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
        }}>
                <div>
                  <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '4px'
        }}>Período</label>
                  <input type="text" value={formData.periodo} onChange={(e) => setFormData(prev => ({ ...prev, periodo: e.target.value }))} style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px'
        }} placeholder="2025-06" required/>
                </div>
                <div>
                  <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '4px'
        }}>Fecha Inicio</label>
                  <input type="date" value={formData.fecha_inicio} onChange={(e) => setFormData(prev => ({ ...prev, fecha_inicio: e.target.value }))} style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px'
        }} required/>
                </div>
                <div>
                  <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '4px'
        }}>Fecha Fin</label>
                  <input type="date" value={formData.fecha_fin} onChange={(e) => setFormData(prev => ({ ...prev, fecha_fin: e.target.value }))} style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px'
        }} required/>
                </div>
                <div>
                  <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '4px'
        }}>Fecha Pago</label>
                  <input type="date" value={formData.fecha_pago} onChange={(e) => setFormData(prev => ({ ...prev, fecha_pago: e.target.value }))} style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px'
        }}/>
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '4px'
        }}>Observaciones</label>
                <textarea value={formData.observaciones} onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))} style={{
            width: '100%',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            resize: 'vertical'
        }} rows={2}/>
              </div>
            </div>

            {/* Gestión de Empleados */}
            <div>
              <h3 style={{
            fontSize: '18px',
            fontWeight: '500',
            color: '#1f2937',
            marginBottom: '16px',
            margin: 0
        }}>👥 Empleados para Planilla</h3>
              
              <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden'
        }}>
                {/* Header con explicaciones claras */}
                <div style={{
            backgroundColor: '#f9fafb',
            padding: '12px 16px',
            display: 'grid',
            gridTemplateColumns: '40px 200px 120px 80px 80px 80px 80px 80px 120px',
            gap: '8px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#374151',
            borderBottom: '1px solid #e5e7eb'
        }}>
                  <div>✓</div>
                  <div>👤 EMPLEADO</div>
                  <div>💰 SUELDO BASE<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Mensual S/</span></div>
                  <div>📅 DÍAS<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Trabajados</span></div>
                  <div>⏰ HE 25%<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Primeras 2h</span></div>
                  <div>⏰ HE 35%<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Siguientes</span></div>
                  <div>⏱️ TARDANZAS<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Minutos</span></div>
                  <div>❌ FALTAS<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Días</span></div>
                  <div>💵 BONOS<br /><span style={{ fontSize: '10px', color: '#6b7280' }}>Adicionales S/</span></div>
                </div>

                {/* Filas de empleados con explicaciones */}
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {empleados.map((empleado) => {
            const valores = calcularValoresEmpleado(empleado);
            return (<div key={empleado.id} style={{
                    padding: '12px 16px',
                    display: 'grid',
                    gridTemplateColumns: '40px 200px 120px 80px 80px 80px 80px 80px 120px',
                    gap: '8px',
                    fontSize: '13px',
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: empleado.incluir ? 'white' : '#f9fafb',
                    opacity: empleado.incluir ? 1 : 0.6
                }}>
                      {/* Checkbox selección */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <input type="checkbox" checked={empleado.incluir} onChange={(e) => actualizarEmpleado(empleado.id, 'incluir', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }}/>
                      </div>
                      
                      {/* Datos del empleado */}
                      <div>
                        <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '2px' }}>
                          {empleado.nombres} {empleado.apellidos}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {empleado.puesto} • DNI: {empleado.numero_documento}
                        </div>
                      </div>
                      {/* Sueldo Base */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.sueldo_base} onChange={(e) => actualizarEmpleado(empleado.id, 'sueldo_base', parseFloat(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0" step="0.01" placeholder="0.00"/>
                        <div style={{ fontSize: '10px', color: '#059669', fontWeight: '600', marginTop: '2px' }}>
                          S/ {empleado.sueldo_base.toFixed(0)}
                        </div>
                      </div>
                      
                      {/* Días Trabajados */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.dias_trabajados} onChange={(e) => actualizarEmpleado(empleado.id, 'dias_trabajados', parseInt(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0" max="31"/>
                        <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: '600', marginTop: '2px' }}>
                          de 30 días
                        </div>
                      </div>
                      
                      {/* Horas Extras 25% */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.horas_extras_25} onChange={(e) => actualizarEmpleado(empleado.id, 'horas_extras_25', parseFloat(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0" step="0.5"/>
                        <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                          +25%
                        </div>
                      </div>
                      
                      {/* Horas Extras 35% */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.horas_extras_35} onChange={(e) => actualizarEmpleado(empleado.id, 'horas_extras_35', parseFloat(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0" step="0.5"/>
                        <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                          +35%
                        </div>
                      </div>
                      
                      {/* Tardanzas */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.tardanzas_minutos} onChange={(e) => actualizarEmpleado(empleado.id, 'tardanzas_minutos', parseInt(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0"/>
                        <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '600', marginTop: '2px' }}>
                          -S/ {(empleado.tardanzas_minutos * (empleado.sueldo_base / 30 / 8) / 60).toFixed(0)}
                        </div>
                      </div>
                      
                      {/* Faltas */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.faltas} onChange={(e) => actualizarEmpleado(empleado.id, 'faltas', parseInt(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0"/>
                        <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: '600', marginTop: '2px' }}>
                          -S/ {(empleado.faltas * (empleado.sueldo_base / 30)).toFixed(0)}
                        </div>
                      </div>
                      
                      {/* Bonos Adicionales */}
                      <div style={{ textAlign: 'center' }}>
                        <input type="number" value={empleado.bonos_adicionales} onChange={(e) => actualizarEmpleado(empleado.id, 'bonos_adicionales', parseFloat(e.target.value) || 0)} disabled={!empleado.incluir} style={{
                    width: '100%',
                    padding: '4px',
                    fontSize: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    textAlign: 'center',
                    backgroundColor: empleado.incluir ? 'white' : '#f3f4f6'
                }} min="0" step="0.01"/>
                        <div style={{ fontSize: '10px', color: '#059669', fontWeight: '600', marginTop: '2px' }}>
                          Total: S/ {valores.sueldo_bruto_total.toFixed(0)}
                        </div>
                      </div>
                    </div>);
        })}
                </div>
              </div>

              {/* Resumen Empresarial Claro */}
              <div style={{
            marginTop: '16px',
            padding: '16px',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #3b82f6'
        }}>
                <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            textAlign: 'center'
        }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1d4ed8' }}>
                      {empleadosSeleccionados.length}
                    </div>
                    <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '500' }}>
                      EMPLEADOS INCLUIDOS
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#059669' }}>
                      S/ {totalPlanilla.toFixed(0)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#047857', fontWeight: '500' }}>
                      TOTAL BRUTO PLANILLA
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7c3aed' }}>
                      S/ {empleadosSeleccionados.length > 0 ? (totalPlanilla / empleadosSeleccionados.length).toFixed(0) : '0'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6d28d9', fontWeight: '500' }}>
                      PROMEDIO POR EMPLEADO
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
                      {formData.periodo}
                    </div>
                    <div style={{ fontSize: '12px', color: '#b91c1c', fontWeight: '500' }}>
                      PERÍODO PLANILLA
                    </div>
                  </div>
                </div>
                
                {empleadosSeleccionados.length > 0 && (<div style={{
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: '#dcfce7',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#166534',
                textAlign: 'center',
                fontWeight: '500'
            }}>
                    ✅ Planilla lista para procesar con {empleadosSeleccionados.length} empleados
                    • Se calcularán automáticamente: AFP/ONP, ESSALUD, Impuesto 5ta categoría
                  </div>)}
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px'
        }}>
          <button type="button" onClick={handleClose} disabled={loading} style={{
            padding: '8px 24px',
            color: '#6b7280',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            backgroundColor: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            fontSize: '14px'
        }}>
            Cancelar
          </button>
          
          <button type="submit" form="planilla-form" disabled={loading || empleadosSeleccionados.length === 0 || !formData.periodo} style={{
            padding: '8px 32px',
            backgroundColor: loading || empleadosSeleccionados.length === 0 || !formData.periodo ? '#9ca3af' : '#2563eb',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: loading || empleadosSeleccionados.length === 0 || !formData.periodo ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '500'
        }}>
            {loading ? (<>
                <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid white',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
            }}></div>
                Procesando...
              </>) : (<>
                ✅ Crear Planilla
                <span style={{
                backgroundColor: '#1d4ed8',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px'
            }}>
                  {empleadosSeleccionados.length} empleados
                </span>
              </>)}
          </button>
        </div>
      </div>
    </div>);
    if (typeof window !== 'undefined') {
        console.log('🔥 CREANDO PORTAL EN DOCUMENT.BODY');
        console.log('🔥 document.body existe:', !!document.body);
        return (0, react_dom_1.createPortal)(modalContent, document.body);
    }
    else {
        console.log('🔥 Window undefined - no creando portal');
        return null;
    }
}
