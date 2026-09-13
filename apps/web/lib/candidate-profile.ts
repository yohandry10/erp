const fields = [
  'id_vacante', 'nombres', 'apellidos', 'email', 'telefono', 'numero_documento',
  'tipo_documento', 'fecha_nacimiento', 'direccion', 'nivel_educacion',
  'experiencia_años', 'pretension_salarial', 'estado_civil', 'cv_url', 'linkedin_url',
  'portfolio_url', 'idiomas', 'habilidades_tecnicas', 'experiencia_laboral',
  'formacion_academica', 'estado_proceso', 'puntuacion_cv', 'observaciones',
  'disponibilidad_inmediata', 'modalidad_trabajo_preferida',
] as const

/** La fila API contiene tenant, relaciones y auditoría; no son campos editables. */
export function candidateFormValues(source: Record<string, any>, documentType: string) {
  const form: Record<string, any> = Object.fromEntries(fields.map(key => [key, source[key] ?? '']))
  form.id_vacante = source.id_vacante ?? source.vacante_id ?? ''
  form.tipo_documento = source.tipo_documento || documentType
  form.experiencia_años = Number(source.experiencia_anos ?? source.experiencia_años ?? 0)
  form.pretension_salarial = Number(source.pretension_salarial ?? 0)
  form.puntuacion_cv = Number(source.puntuacion_cv ?? 0)
  form.disponibilidad_inmediata = source.disponibilidad_inmediata ?? true
  for (const key of ['idiomas', 'habilidades_tecnicas', 'experiencia_laboral', 'formacion_academica']) {
    form[key] = Array.isArray(source[key]) ? source[key] : []
  }
  return form
}

export function candidatePayload(form: Record<string, any>) {
  const payload = Object.fromEntries(fields.map(key => [key, form[key]]))
  payload.experiencia_anos = payload.experiencia_años
  delete payload.experiencia_años
  return payload
}
