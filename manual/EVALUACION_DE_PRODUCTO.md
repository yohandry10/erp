# Evaluación de la documentación de producto

Revisión del 31 de octubre de 2026 sobre la versión `ba9493a2`. **Aún no es una documentación integral terminada.** Sirve para operar y dar soporte con los límites indicados aquí.

## Qué tenía el paquete de origen

- Describía una versión anterior a la integración: no mencionaba contratos de suministro, conformidad ni penalidades, y apenas migración.
- Dejaba cinco pantallas sin citar y Analytics sin guía.
- Mezclaba el manual con vocabulario de pruebas internas.
- Su texto era correcto en lo revisado, pero genérico: rara vez decía qué permiso, estado o botón decide.

## Qué se hizo

| Cambio | Cómo se comprobó |
|---|---|
| Capítulos 13 y 14 reescritos con permisos, estados, botones, efectos y excepciones | Contra controladores, pantallas y `docs/MODULES.md` |
| Capítulos nuevos: 43 suministro, 44 lotes, 45 migración, 46 Analytics | Contra `docs/MODULES.md`, `docs/OPERATIONS.md` y código |
| Sección de detalle en 37 capítulos: permisos, estados, botones y mensajes | Extraídos del código de cada módulo |
| Guías de suministro y migración; procesos de contrato a cobro y de migración | Contra la guía de la aplicación y los mismos documentos |
| Inventario de 129 pantallas y referencia de 806 operaciones con su permiso | Generados desde el código |
| Control automático `pnpm check-manual` | Falla ante pantallas sin capítulo y citas que no existen |

## Estado por área

| Área | Estado | Qué falta |
|---|---|---|
| A. Manual funcional | Bastante mejor | El texto heredado sigue siendo genérico en partes; ver abajo |
| B. Guías por rol | Parcial | Ninguna guía tiene capturas ni un recorrido control por control |
| C. Procesos | Parcial | Nueve recorridos; faltan variantes específicas de cada cliente |
| D. Técnica y operación | Bastante cubierta | RTO/RPO y prueba de carga no medidos; la referencia del API no incluye los cuerpos de cada operación |
| E. Certificación | Conservada | Es del paquete anterior a la integración; se guarda sin cambios |

## Hasta dónde llega la verificación

- **Permisos:** salen de los decoradores del API. Un control comprueba que los citados existan.
- **Estados y botones:** salen del código de cada pantalla por extracción, y no se comprobaron pantalla por pantalla. Una etiqueta puede depender del país o del perfil.
- **Texto heredado:** los capítulos 01–03 y 13–14 se leyeron completos. **Del resto, se añadió el detalle sin contrastar línea por línea el texto original**, que puede conservar frases como "cuando corresponda".
- **Capítulos 38, 40 y 42:** son transversales y no recibieron sección de detalle.
- **Nada de esto se probó con una sesión real en producción.**

## Reglas contrastadas contra el código

| Regla | Resultado |
|---|---|
| Sin sucursales asignadas se alcanza toda la empresa | Correcta (`sucursal-scope.service.ts`) |
| Si falla la lectura de asignaciones | Responde 503: un fallo no ensancha el alcance |
| Bloqueo de acceso: 5 intentos en 15 minutos por correo | Correcta. Si falla la consulta de intentos, responde 503 |
| Logo de hasta 2 MiB | Correcta (`company-logo.service.ts`) |
| Campo CSV de hasta 4096 caracteres | Correcta según `docs/MODULES.md` |
| Movimiento bancario activo por defecto | Correcta (migración 590) |
| No existe requisición interna de compra | Correcta: no hay pantalla |

## Hallazgos para decidir

- `rrhh.access` es un único permiso para empleados, contratos, solicitudes, asistencia y candidatos: no permite separar quién ve qué.

## Límites conocidos

- Sin capturas de pantalla ni prueba de lectura con usuarios reales.
- Sin validación legal de los contenidos fiscales y laborales.
- Otros países (ARCA, DIAN) tienen menos desarrollo que Perú.
- Las operaciones del API sin permiso declarado no se revisaron una por una; las sensibles probadas sin sesión responden 401.
