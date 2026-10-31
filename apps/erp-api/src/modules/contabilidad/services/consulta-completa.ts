/** Las fuentes fiscales no pueden depender del límite de una página PostgREST.
 * La consulta debe tener orden estable y conservar el filtro de empresa.
 * Si falla una página, no se devuelve un reporte parcial.
 */
export async function leerConsultaCompleta(crearConsulta: () => any): Promise<{ data: any[] | null; error: any }> {
  const filas: any[] = [];
  const tamano = 1000;
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await crearConsulta().range(desde, desde + tamano - 1);
    if (error) return { data: null, error };
    const pagina = data || [];
    filas.push(...pagina);
    if (pagina.length < tamano) return { data: filas, error: null };
  }
}
