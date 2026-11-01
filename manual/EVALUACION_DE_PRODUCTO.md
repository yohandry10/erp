# Evaluación de la documentación de producto

Revisión del 31 de octubre de 2026 sobre la versión `ba9493a2`. **No es todavía una documentación integral terminada.** Sirve para operar y dar soporte con los límites indicados aquí.

## Qué tenía el paquete de origen

- Describía una versión anterior a la integración: no mencionaba contratos de suministro, conformidad ni penalidades, y apenas migración.
- Dejaba cinco pantallas sin citar y Analytics sin guía.
- Mezclaba el manual con vocabulario de pruebas internas en su portada, su glosario y sus avisos.
- Su texto es correcto en lo revisado, pero a menudo genérico. Son frecuentes "cuando corresponda", "aplicable" y "elegible", que no dicen qué estado, botón o permiso decide.
- Un manual de unas 27.000 palabras en 42 capítulos da unas 640 palabras por capítulo: alcanza como guía, no como referencia exhaustiva.

## Qué se hizo en esta revisión

| Cambio | Cómo se comprobó |
|---|---|
| Capítulos 13 y 14 de compras reescritos con permisos, estados, botones, efectos y excepciones | Contra controladores, pantallas y `docs/MODULES.md` |
| Capítulos nuevos: 43 suministro, 44 lotes, 45 migración, 46 Analytics | Contra `docs/MODULES.md`, `docs/OPERATIONS.md` y código |
| Guías de responsable de suministro y de migración; procesos de contrato a cobro y de migración | Contra la guía de la aplicación y los mismos documentos |
| Inventario de 129 pantallas y referencia de 806 operaciones con su permiso | Generados desde el código |
| Control automático `pnpm check-manual` | Falla ante pantallas sin capítulo y citas que no existen |

## Estado por área

| Área | Estado | Qué falta |
|---|---|---|
| A. Manual funcional | Parcial | Llevar los otros 40 capítulos al nivel de detalle de 13, 14 y 43–45 |
| B. Guías por rol | Parcial | Capturas y recorrido de cada pantalla: ninguna guía tiene capturas |
| C. Procesos | Parcial | Nueve recorridos; faltan variantes como importación de bienes y producción por contrato, si aplican |
| D. Técnica y operación | Bastante cubierta | RTO/RPO y prueba de carga no medidos; la referencia del API no incluye los cuerpos de cada operación |
| E. Certificación | Conservada | Es del paquete anterior a la integración; se guarda como evidencia, sin cambios |

## Reglas contrastadas contra el código

| Regla | Resultado |
|---|---|
| Sin sucursales asignadas se alcanza toda la empresa | Correcta (`sucursal-scope.service.ts`) |
| Si falla la lectura de asignaciones | El manual no lo decía: continúa con **alcance total** y registra el error. Decisión de diseño a revisar; documentada en la guía técnica |
| Logo de hasta 2 MiB | Correcta (`company-logo.service.ts`) |
| Campo CSV de hasta 4096 caracteres | Correcta según `docs/MODULES.md` |
| Movimiento bancario activo por defecto | Correcta (migración 590) |
| No existe requisición interna de compra | Correcta: no hay pantalla |

**Sin contrastar línea por línea:** los capítulos 01–12 y 15–42 y las demás omisiones de `REVISION_DE_OMISIONES.md`. Tampoco se verificaron en pantalla ni con sesión los capítulos nuevos: se apoyan en documentos y código.

## Límites conocidos

- Sin capturas de pantalla ni prueba de lectura con usuarios reales.
- Sin validación legal de los contenidos fiscales y laborales.
- Otros países (ARCA, DIAN) tienen menos desarrollo que Perú.
- Las operaciones del API sin permiso declarado no se revisaron una por una; las sensibles probadas sin sesión responden 401.
