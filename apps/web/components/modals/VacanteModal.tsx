'use client';

import React, { useState, useEffect } from 'react';
import { Briefcase, Loader2 } from 'lucide-react';
import { fetchApi } from '@/lib/api-fetch';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCountryContext } from '@/hooks/use-country-context';

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
  const country = useCountryContext();
  const currencySymbol = country.simboloMoneda || (country.paisCodigo === 'PE' ? 'S/' : '$');
  const locationPlaceholder = country.paisCodigo === 'AR'
    ? 'Buenos Aires, Argentina / Remoto'
    : country.paisCodigo === 'CO'
      ? 'Bogotá D.C., Colombia / Remoto'
      : 'Lima, Perú / Remoto';
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Briefcase className="size-5 text-primary" aria-hidden="true" /> Nueva vacante</DialogTitle>
          <DialogDescription>Defina el puesto, condiciones y fecha límite de la convocatoria.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 [&_input]:w-full [&_input]:rounded-md [&_input]:border [&_input]:border-input [&_input]:bg-background [&_input]:p-3 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-input [&_select]:bg-background [&_select]:p-3 [&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-input [&_textarea]:bg-background [&_textarea]:p-3">
          <div className="mb-4">
            <label htmlFor="vacante-modal-titulo" className="block mb-2 font-semibold">
              Título de la Vacante *
            </label>
            <input id="vacante-modal-titulo"
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
              placeholder="Ej: Desarrollador Full Stack Senior"
            />
            {errors.titulo && <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">{errors.titulo}</p>}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vacante-modal-puesto-solicitado" className="block mb-2 font-semibold">
                Puesto Solicitado *
              </label>
              <input id="vacante-modal-puesto-solicitado"
                type="text"
                name="puesto_solicitado"
                value={formData.puesto_solicitado}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
                placeholder="Ej: Desarrollador"
              />
              {errors.puesto_solicitado && <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">{errors.puesto_solicitado}</p>}
            </div>

            <div>
              <label htmlFor="vacante-modal-departamento-id" className="block mb-2 font-semibold">
                Departamento *
              </label>
              <select id="vacante-modal-departamento-id"
                name="departamento_id"
                value={formData.departamento_id}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
              >
                <option value="">Seleccionar departamento</option>
                {departamentos.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.nombre}</option>
                ))}
              </select>
              {errors.departamento_id && <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">{errors.departamento_id}</p>}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vacante-modal-ubicacion" className="block mb-2 font-semibold">
                Ubicación
              </label>
              <input id="vacante-modal-ubicacion"
                type="text"
                name="ubicacion"
                value={formData.ubicacion}
                onChange={handleInputChange} className="w-[100%] p-3 border rounded-[4px]"
                placeholder={locationPlaceholder}
              />
            </div>

            <div>
              <label htmlFor="vacante-modal-tipo-contrato" className="block mb-2 font-semibold">
                Tipo de Contrato
              </label>
              <select id="vacante-modal-tipo-contrato"
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

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="vacante-modal-salario-minimo" className="block mb-2 font-semibold">
                Salario Mín ({currencySymbol})
              </label>
              <input id="vacante-modal-salario-minimo"
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
              <label htmlFor="vacante-modal-salario-maximo" className="block mb-2 font-semibold">
                Salario Máx ({currencySymbol})
              </label>
              <input id="vacante-modal-salario-maximo"
                type="number"
                name="salario_maximo"
                value={formData.salario_maximo}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
                placeholder="5000"
                min="0"
                step="100"
              />
              {errors.salario_maximo && <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">{errors.salario_maximo}</p>}
            </div>

            <div>
              <label htmlFor="vacante-modal-fecha-limite" className="block mb-2 font-semibold">
                Fecha Límite *
              </label>
              <input id="vacante-modal-fecha-limite"
                type="date"
                name="fecha_limite"
                value={formData.fecha_limite}
                onChange={handleInputChange} className="w-[100%] p-3 rounded-[4px]"
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.fecha_limite && <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">{errors.fecha_limite}</p>}
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="vacante-modal-descripcion" className="block mb-2 font-semibold">
              Descripción del Puesto *
            </label>
            <textarea id="vacante-modal-descripcion"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleInputChange}
              rows={4} className="w-[100%] p-3 rounded-[4px]"
              placeholder="Describe las responsabilidades y funciones del puesto..."
            />
            {errors.descripcion && <p className="text-red-500 text-xs mt-1 mr-0 mb-0 ml-0">{errors.descripcion}</p>}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="vacante-modal-requisitos" className="block mb-2 font-semibold">
                Requisitos
              </label>
              <textarea id="vacante-modal-requisitos"
                name="requisitos"
                value={formData.requisitos}
                onChange={handleInputChange}
                rows={3} className="w-[100%] p-3 border rounded-[4px]"
                placeholder="- Título universitario&#10;- Experiencia en..."
              />
            </div>

            <div>
              <label htmlFor="vacante-modal-beneficios" className="block mb-2 font-semibold">
                Beneficios
              </label>
              <textarea id="vacante-modal-beneficios"
                name="beneficios"
                value={formData.beneficios}
                onChange={handleInputChange}
                rows={3} className="w-[100%] p-3 border rounded-[4px]"
                placeholder="- Seguro médico&#10;- Bonos..."
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}
              {loading ? 'Creando...' : 'Crear vacante'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
