'use client';
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = VacanteModal;
const react_1 = __importStar(require("react"));
const lucide_react_1 = require("lucide-react");
function VacanteModal({ isOpen, onClose, onSuccess, departamentos }) {
    const [formData, setFormData] = (0, react_1.useState)({
        titulo: '',
        descripcion: '',
        puesto_solicitado: '',
        departamento_id: '',
        ubicacion: '',
        tipo_contrato: 'tiempo_completo',
        salario_minimo: '',
        salario_maximo: '',
        experiencia_requerida: '',
        requisitos: '',
        beneficios: '',
        fecha_limite: '',
        estado: 'activa'
    });
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [errors, setErrors] = (0, react_1.useState)({});
    (0, react_1.useEffect)(() => {
        if (!isOpen) {
            setFormData({
                titulo: '',
                descripcion: '',
                puesto_solicitado: '',
                departamento_id: '',
                ubicacion: '',
                tipo_contrato: 'tiempo_completo',
                salario_minimo: '',
                salario_maximo: '',
                experiencia_requerida: '',
                requisitos: '',
                beneficios: '',
                fecha_limite: '',
                estado: 'activa'
            });
            setErrors({});
        }
    }, [isOpen]);
    const validateForm = () => {
        const newErrors = {};
        if (!formData.titulo.trim())
            newErrors.titulo = 'El título es requerido';
        if (!formData.puesto_solicitado.trim())
            newErrors.puesto_solicitado = 'El puesto es requerido';
        if (!formData.departamento_id)
            newErrors.departamento_id = 'El departamento es requerido';
        if (!formData.descripcion.trim())
            newErrors.descripcion = 'La descripción es requerida';
        if (!formData.fecha_limite)
            newErrors.fecha_limite = 'La fecha límite es requerida';
        if (formData.salario_minimo && formData.salario_maximo) {
            if (parseFloat(formData.salario_minimo) > parseFloat(formData.salario_maximo)) {
                newErrors.salario_maximo = 'El salario máximo debe ser mayor al mínimo';
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm())
            return;
        setLoading(true);
        try {
            const response = await fetch('/api/rrhh/vacantes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    salario_minimo: formData.salario_minimo ? parseFloat(formData.salario_minimo) : null,
                    salario_maximo: formData.salario_maximo ? parseFloat(formData.salario_maximo) : null,
                }),
            });
            if (response.ok) {
                onSuccess();
                onClose();
            }
            else {
                throw new Error('Error al crear la vacante');
            }
        }
        catch (error) {
            console.error('❌ Error:', error);
            alert('Error al crear la vacante');
        }
        finally {
            setLoading(false);
        }
    };
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Limpiar error del campo
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };
    if (!isOpen)
        return null;
    return (<div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem'
        }} onClick={onClose}>
      <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflowY: 'auto'
        }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            🏢 Nueva Vacante
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <lucide_react_1.X size={20}/>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
              🎯 Título de la Vacante *
            </label>
            <input type="text" name="titulo" value={formData.titulo} onChange={handleInputChange} style={{
            width: '100%',
            padding: '0.75rem',
            border: errors.titulo ? '2px solid #ef4444' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none'
        }} placeholder="Ej: Desarrollador Full Stack Senior"/>
            {errors.titulo && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>{errors.titulo}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                👔 Puesto Solicitado *
              </label>
              <input type="text" name="puesto_solicitado" value={formData.puesto_solicitado} onChange={handleInputChange} style={{
            width: '100%',
            padding: '0.75rem',
            border: errors.puesto_solicitado ? '2px solid #ef4444' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none'
        }} placeholder="Ej: Desarrollador"/>
              {errors.puesto_solicitado && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>{errors.puesto_solicitado}</p>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                🏢 Departamento *
              </label>
              <select name="departamento_id" value={formData.departamento_id} onChange={handleInputChange} style={{
            width: '100%',
            padding: '0.75rem',
            border: errors.departamento_id ? '2px solid #ef4444' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none'
        }}>
                <option value="">Seleccionar departamento</option>
                {departamentos.map((dept) => (<option key={dept.id} value={dept.id}>{dept.nombre}</option>))}
              </select>
              {errors.departamento_id && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>{errors.departamento_id}</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                📍 Ubicación
              </label>
              <input type="text" name="ubicacion" value={formData.ubicacion} onChange={handleInputChange} style={{ width: '100%', padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }} placeholder="Lima, Perú / Remoto"/>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                📝 Tipo de Contrato
              </label>
              <select name="tipo_contrato" value={formData.tipo_contrato} onChange={handleInputChange} style={{ width: '100%', padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }}>
                <option value="tiempo_completo">Tiempo Completo</option>
                <option value="medio_tiempo">Medio Tiempo</option>
                <option value="contrato">Por Contrato</option>
                <option value="pasantia">Pasantía</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                💰 Salario Mín (S/)
              </label>
              <input type="number" name="salario_minimo" value={formData.salario_minimo} onChange={handleInputChange} style={{ width: '100%', padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }} placeholder="3000" min="0" step="100"/>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                💰 Salario Máx (S/)
              </label>
              <input type="number" name="salario_maximo" value={formData.salario_maximo} onChange={handleInputChange} style={{
            width: '100%',
            padding: '0.75rem',
            border: errors.salario_maximo ? '2px solid #ef4444' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none'
        }} placeholder="5000" min="0" step="100"/>
              {errors.salario_maximo && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>{errors.salario_maximo}</p>}
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                📅 Fecha Límite *
              </label>
              <input type="date" name="fecha_limite" value={formData.fecha_limite} onChange={handleInputChange} style={{
            width: '100%',
            padding: '0.75rem',
            border: errors.fecha_limite ? '2px solid #ef4444' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none'
        }} min={new Date().toISOString().split('T')[0]}/>
              {errors.fecha_limite && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>{errors.fecha_limite}</p>}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
              📝 Descripción del Puesto *
            </label>
            <textarea name="descripcion" value={formData.descripcion} onChange={handleInputChange} rows={4} style={{
            width: '100%',
            padding: '0.75rem',
            border: errors.descripcion ? '2px solid #ef4444' : '1px solid #ccc',
            borderRadius: '4px',
            outline: 'none',
            resize: 'vertical'
        }} placeholder="Describe las responsabilidades y funciones del puesto..."/>
            {errors.descripcion && <p style={{ color: '#ef4444', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>{errors.descripcion}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                ✅ Requisitos
              </label>
              <textarea name="requisitos" value={formData.requisitos} onChange={handleInputChange} rows={3} style={{ width: '100%', padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none', resize: 'vertical' }} placeholder="- Título universitario&#10;- Experiencia en..."/>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                🎁 Beneficios
              </label>
              <textarea name="beneficios" value={formData.beneficios} onChange={handleInputChange} rows={3} style={{ width: '100%', padding: '0.75rem', border: '1px solid #ccc', borderRadius: '4px', outline: 'none', resize: 'vertical' }} placeholder="- Seguro médico&#10;- Bonos..."/>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button type="button" onClick={onClose} style={{
            padding: '0.75rem 1.5rem',
            border: '1px solid #ccc',
            borderRadius: '6px',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontWeight: '500'
        }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading} style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: loading ? '#9ca3af' : '#3b82f6',
            color: 'white',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
        }}>
              {loading ? '⏳ Creando...' : '📋 Crear Vacante'}
            </button>
          </div>
        </form>
      </div>
    </div>);
}
