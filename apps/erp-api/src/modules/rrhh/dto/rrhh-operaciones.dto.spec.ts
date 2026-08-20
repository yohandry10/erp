import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CrearCandidatoDto,
  CrearContratoDto,
  CrearVacanteDto,
} from './rrhh-operaciones.dto';

/**
 * Tipar estos bodies destapó tres cosas que la pantalla envía y el writer
 * descartaba en silencio, y que sin declarar habrían pasado a devolver 400:
 *
 * - `experiencia_años` con eñe, cuando la columna es `experiencia_anos`.
 * - `estado_civil`, que no es columna de candidatos.
 * - Cuatro campos que viajan como arreglos porque en la base son `jsonb`.
 *
 * Estas pruebas fijan ese comportamiento para que un futuro "limpiemos el DTO"
 * no rompa el alta de candidatos.
 */
const OPCIONES = { whitelist: true, forbidNonWhitelisted: true };

function validar(cls: any, payload: Record<string, unknown>) {
  return validateSync(plainToInstance(cls, payload), OPCIONES);
}

describe('DTOs de operaciones de RRHH', () => {
  describe('candidato', () => {
    // Copia de lo que CandidatoModal envía.
    const candidatoDeLaPantalla = {
      id_vacante: '',
      nombres: 'Ana',
      apellidos: 'Torres',
      email: 'ana@correo.com',
      telefono: '999888777',
      numero_documento: '45678912',
      tipo_documento: 'DNI',
      fecha_nacimiento: '1990-04-12',
      direccion: 'Av. Siempre Viva 123',
      nivel_educacion: 'universitario',
      experiencia_años: 3,
      pretension_salarial: 3500,
      estado_civil: 'soltero',
      cv_url: '',
      linkedin_url: '',
      portfolio_url: '',
      idiomas: ['español'],
      habilidades_tecnicas: [],
      experiencia_laboral: [],
      formacion_academica: [],
      estado_proceso: 'postulante',
      puntuacion_cv: 40,
      observaciones: '',
      disponibilidad_inmediata: true,
      modalidad_trabajo_preferida: 'presencial',
    };

    it('acepta el formulario completo tal y como llega hoy', () => {
      expect(validar(CrearCandidatoDto, candidatoDeLaPantalla)).toHaveLength(0);
    });

    it('acepta la vacante sin elegir, que el formulario expresa como cadena vacía', () => {
      // Los writers hacen NULLIF(valor,'')::uuid: la cadena vacía es "sin valor".
      expect(candidatoDeLaPantalla.id_vacante).toBe('');
      expect(validar(CrearCandidatoDto, candidatoDeLaPantalla)).toHaveLength(0);
    });

    it('rechaza una vacante que no es un UUID', () => {
      const errores = validar(CrearCandidatoDto, {
        ...candidatoDeLaPantalla,
        id_vacante: 'la-primera',
      });
      expect(errores.map((e) => e.property)).toContain('id_vacante');
    });

    it('exige nombres y apellidos', () => {
      const { nombres, apellidos, ...sinNombre } = candidatoDeLaPantalla;
      expect(nombres && apellidos).toBeTruthy();
      expect(validar(CrearCandidatoDto, sinNombre).map((e) => e.property)).toContain('nombres');
    });
  });

  describe('vacante', () => {
    const vacanteDeLaPantalla = {
      titulo: 'Analista contable',
      descripcion: 'Cierre mensual',
      salario_min: 2500,
      salario_max: 3500,
      puesto_solicitado: 'Analista',
      departamento_id: '',
      estado: 'activa',
      fecha_publicacion: '2026-08-20',
      fecha_cierre: '2026-09-19',
    };

    it('acepta el formulario completo tal y como llega hoy', () => {
      expect(validar(CrearVacanteDto, vacanteDeLaPantalla)).toHaveLength(0);
    });

    it('exige título y puesto solicitado, que son lo que valida el writer', () => {
      const propiedades = validar(CrearVacanteDto, { descripcion: 'x' }).map((e) => e.property);
      expect(propiedades).toContain('titulo');
      expect(propiedades).toContain('puesto_solicitado');
    });
  });

  describe('contrato', () => {
    // Copia de lo que ContractFormDialog envía para Perú.
    const contratoDeLaPantalla = {
      empleado_id: '52350b0c-0014-4ad1-9a1b-c1c7a754fe5b',
      tipo_contrato: 'indefinido',
      fecha_inicio: '2026-08-20',
      fecha_fin: null,
      salario: 3000,
      sueldo_bruto: 3000,
      cargo: 'Analista',
      beneficios: '',
      regimen_pensionario: 'AFP',
      afp_codigo: 'INTEGRA',
      tipo_comision_afp: 'FLUJO',
      tasa_comision_afp: 0.0155,
      tasa_seguro_afp: 0.0137,
      regimen_seguridad_social: '',
      jornada_laboral: 'tiempo_completo',
      periodo_prueba_meses: 3,
      convenio_colectivo_codigo: '',
      categoria_convenio: '',
      modalidad_contratacion_codigo: '',
      obra_social_codigo: '',
      sindicato_codigo: '',
      sindicato_aporte_tasa: 0,
      art_cuit: '',
      art_tasa: 0,
      ganancias_retencion_mensual: 0,
      eps_codigo: '',
      fondo_pension_codigo: '',
      arl_codigo: '',
      caja_compensacion_codigo: '',
      moneda: 'PEN',
      estado: 'vigente',
      activo: true,
    };

    it('acepta el formulario completo tal y como llega hoy', () => {
      expect(validar(CrearContratoDto, contratoDeLaPantalla)).toHaveLength(0);
    });

    it('acepta las tasas AFP, que el servicio necesita a nivel raíz', () => {
      // Van al metadata del contrato; si el DTO las descartara, el motor de
      // planilla volvería a usar tasas que no son las del afiliado.
      expect(
        validar(CrearContratoDto, { ...contratoDeLaPantalla, tasa_comision_afp: 0.0169 }),
      ).toHaveLength(0);
    });

    it('rechaza una tasa negativa', () => {
      const errores = validar(CrearContratoDto, { ...contratoDeLaPantalla, art_tasa: -1 });
      expect(errores.map((e) => e.property)).toContain('art_tasa');
    });
  });
});
