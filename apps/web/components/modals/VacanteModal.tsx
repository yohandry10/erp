'use client';

import React, { useState, useEffect } from 'react';
import { X, Briefcase, MapPin, DollarSign, Users, Calendar, FileText } from 'lucide-react';
import { fetchApi } from '@/lib/api-fetch';

interface VacanteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  departamentos: any[];
}

export default function VacanteModal({
  isOpen,
  onClose,
  onSuccess,
  departamentos
}: VacanteModalProps) {
  const [formData, setFormData] = useState({
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

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
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
    const newErrors: {[key: string]: string} = {};

    if (!formData.titulo.trim()) newErrors.titulo = 'El título es requerido';
    if (!formData.puesto_solicitado.trim()) newErrors.puesto_solicitado = 'El puesto es requerido';
    if (!formData.departamento_id) newErrors.departamento_id = 'El departamento es requerido';
    if (!formData.descripcion.trim()) newErrors.descripcion = 'La descripción es requerida';
    if (!formData.fecha_limite) newErrors.fecha_limite = 'La fecha límite es requerida';

    if (formData.salario_minimo && formData.salario_maximo) {
      if (parseFloat(formData.salario_minimo) > parseFloat(formData.salario_maximo)) {
        newErrors.salario_maximo = 'El salario máximo debe ser mayor al mínimo';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      const response = await fetchApi('/api/rrhh/vacantes', {
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
      } else {
        throw new Error('Error al crear la vacante');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error al crear la vacante');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Limpiar error del campo
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-[rgba(0,_0,_0,_0.75)] flex items-center justify-center z-[99999] p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-3 p-8 w-[100%] max-w-[600px] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-6 font-bold m-0">
            🏢 Nueva Vacante
          </h2>
          <button onClick={onClose} className="border-0 cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-2 font-semibold">
              🎯 Título de la Vacante *
            </label>
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
              placeholder="Ej: Desarrollador Full Stack Senior"
            />
            {errors.titulo && <p className="text-red-500 text-3 mt-1 mr-0 mb-0 ml-0">{errors.titulo}</p>}
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
            <div>
              <label className="block mb-2 font-semibold">
                👔 Puesto Solicitado *
              </label>
              <input
                type="text"
                name="puesto_solicitado"
                value={formData.puesto_solicitado}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
                placeholder="Ej: Desarrollador"
              />
              {errors.puesto_solicitado && <p className="text-red-500 text-3 mt-1 mr-0 mb-0 ml-0">{errors.puesto_solicitado}</p>}
            </div>

            <div>
              <label className="block mb-2 font-semibold">
                🏢 Departamento *
              </label>
              <select
                name="departamento_id"
                value={formData.departamento_id}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
              >
                <option value="">Seleccionar departamento</option>
                {departamentos.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.nombre}</option>
                ))}
              </select>
              {errors.departamento_id && <p className="text-red-500 text-3 mt-1 mr-0 mb-0 ml-0">{errors.departamento_id}</p>}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-4 mb-4">
            <div>
              <label className="block mb-2 font-semibold">
                📍 Ubicación
              </label>
              <input
                type="text"
                name="ubicacion"
                value={formData.ubicacion}
                onChange={handleInputChange} className="w-[100%] p-3 border rounded-[4px]"
                placeholder="Lima, Perú / Remoto"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold">
                📝 Tipo de Contrato
              </label>
              <select
                name="tipo_contrato"
                value={formData.tipo_contrato}
                onChange={handleInputChange} className="w-[100%] p-3 border rounded-[4px]"
              >
                <option value="tiempo_completo">Tiempo Completo</option>
                <option value="medio_tiempo">Medio Tiempo</option>
                <option value="contrato">Por Contrato</option>
                <option value="pasantia">Pasantía</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 mb-4">
            <div>
              <label className="block mb-2 font-semibold">
                💰 Salario Mín (S/)
              </label>
              <input
                type="number"
                name="salario_minimo"
                value={formData.salario_minimo}
                onChange={handleInputChange} className="w-[100%] p-3 border rounded-[4px]"
                placeholder="3000"
                min="0"
                step="100"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold">
                💰 Salario Máx (S/)
              </label>
              <input
                type="number"
                name="salario_maximo"
                value={formData.salario_maximo}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
                placeholder="5000"
                min="0"
                step="100"
              />
              {errors.salario_maximo && <p className="text-red-500 text-3 mt-1 mr-0 mb-0 ml-0">{errors.salario_maximo}</p>}
            </div>

            <div>
              <label className="block mb-2 font-semibold">
                📅 Fecha Límite *
              </label>
              <input
                type="date"
                name="fecha_limite"
                value={formData.fecha_limite}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.fecha_limite && <p className="text-red-500 text-3 mt-1 mr-0 mb-0 ml-0">{errors.fecha_limite}</p>}
            </div>
          </div>

          <div className="mb-4">
            <label className="block mb-2 font-semibold">
              📝 Descripción del Puesto *
            </label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleInputChange}
              rows={4} className="w-[100%] p-3 rounded-[4px]"
              placeholder="Describe las responsabilidades y funciones del puesto..."
            />
            {errors.descripcion && <p className="text-red-500 text-3 mt-1 mr-0 mb-0 ml-0">{errors.descripcion}</p>}
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-4 mb-6">
            <div>
              <label className="block mb-2 font-semibold">
                ✅ Requisitos
              </label>
              <textarea
                name="requisitos"
                value={formData.requisitos}
                onChange={handleInputChange}
                rows={3} className="w-[100%] p-3 border rounded-[4px]"
                placeholder="- Título universitario&#10;- Experiencia en..."
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold">
                🎁 Beneficios
              </label>
              <textarea
                name="beneficios"
                value={formData.beneficios}
                onChange={handleInputChange}
                rows={3} className="w-[100%] p-3 border rounded-[4px]"
                placeholder="- Seguro médico&#10;- Bonos..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <button
              type="button"
              onClick={onClose} className="py-3 px-6 border rounded-[6px] bg-white cursor-pointer font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading} className="py-3 px-6 border-0 rounded-[6px] text-white font-medium flex items-center gap-2"
            >
              {loading ? '⏳ Creando...' : '📋 Crear Vacante'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
