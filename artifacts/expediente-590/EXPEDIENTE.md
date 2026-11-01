# Expediente de la versión 590

Qué se probó, sobre qué versión, con qué resultado y qué queda sin acreditar. Es el documento
que responde "¿esto se probó?" sin tener que abrir la evidencia cruda.

## Decisión

| Pregunta | Respuesta |
| --- | --- |
| ¿Está técnicamente en producción? | Sí. Base en 590; API y web en `ba9493a2`, verificados en lectura. |
| ¿Se puede entregar a un cliente real? | **No todavía.** Falta lo que lista "Sin acreditar". |
| Firma de aceptación del producto | Pendiente: _responsable_ ____________ _fecha_ ________ |

## Versiones: qué se probó sobre qué

Hay dos versiones y no son la misma. Confundirlas es el error más fácil de cometer aquí.

| | Candidato de pruebas | Versión en producción |
| --- | --- | --- |
| Commit | `b54f16be` (paquete congelado de 3.305 archivos) | `ba9493a2` |
| Migraciones | hasta 577, con su numeración propia | hasta 590 |
| Prueba de aceptación | 988 requisitos, 19.598 criterios | no se repitió |
| Prueba automática | la de su momento | CI completa, ensayo y verificación |

Equivalencia de migraciones. Las 570–577 del candidato son otras que las 570–577 de
suministro de `main`; al integrarlas pasaron a:

| Candidato | Producción | Contenido |
| --- | --- | --- |
| 570 | 583 | Estructura de establecimientos y operaciones |
| 571 | 584 | Edición de clientes |
| 572 | 585 | Estimaciones de activos fijos |
| 573 | 586 | Lectura auxiliar de RRHH |
| 574 | 587 | Fecha civil de CxC y CxP |
| 575 | 588 | Panel de seguridad |
| 576 | 589 | Recepción a costo cero |
| 577 | 590 | Movimiento bancario activo por defecto |

Los nombres internos con sufijo `_570` o `_572` y el `schemaVersion` 570 de los eventos se
conservan: son nombres, no posición. Las 585, 586 y 588 se ajustaron al integrar, de modo
que el texto aplicado en PROD no es byte a byte el del candidato. El orden de esta tabla se
reconstruyó por el orden de los archivos: la fuente de cada contenido es el propio archivo en
`supabase/migrations/`.

## Prueba de aceptación (988 requisitos)

Matriz: SHA-256 `5bb364da313486eb48d3ea77e47d54816b62998c70211546ef1396b22209caa5`.
Controles de cierre: 62 de 62. Decisión del certificado: `GO_PROD` limitado a "preparación
técnica del candidato local", que no autoriza por sí misma ningún despliegue.

| Estado de la evidencia | Requisitos | Qué significa |
| --- | ---:| --- |
| `APPROVED_R2_PRESERVED` | 432 | Aprobado en la 2.ª ronda y conservado, sin repetir |
| `APPROVED_SCOPED_COMPLETION` | 372 | Cerrado en un bloque dirigido |
| `APPROVED_R2_AND_R3` | 140 | Aprobado en 2.ª y 3.ª ronda |
| `APPROVED_R2_PLUS_SCOPED_COMPLETION` | 31 | 2.ª ronda más un bloque dirigido |
| `APPROVED_R3` | 13 | Aprobado en 3.ª ronda |
| **Total** | **988** | |

Sólo 153 requisitos (140 + 13) se ejecutaron de nuevo en la última ronda completa. El resto es
evidencia conservada: es legítima, porque un cambio de versión no invalida por sí solo una
aprobación, pero **no es una repetición de los 988 sobre el commit final**.

Requisitos por módulo: contabilidad 296, finanzas 146, RRHH 138, inventario 81, compras 71,
ventas 46, CPE 41, administración 28, configuración 25, offline 25, GRE 23, cajas 16, POS 12,
usuarios 10, SIRE 9, documentos 8, ayuda 7, asistente 3, auditoría 2, fiscal 1.

## Prueba sobre la versión integrada

- Cadena PostgreSQL 16 desde cero hasta 590: 99 verificadores y 67 históricos.
- Corrida integral en CI: fases HTTP, 71 pruebas de navegador, asistente fiscal, 106 módulos y
  22 rutas con registros sin errores, invariantes financieros y restauración de 298 tablas.
- Ensayo de promoción sobre el respaldo real de PROD (esquema 569): 21 de 21 verificadores,
  sin perder tablas ni columnas (`artifacts/promocion-ensayo-570-590-20261031095727/informe.json`).
- Promoción a PROD: una sola transacción de 121,6 s, sin cambios que el ensayo no hubiera
  mostrado (`artifacts/promocion-prod-570-590-20261031100508614.json`).
- Verificación en PROD, sólo lectura: commit, esquema, Redis, login 200 y CORS 204
  (`artifacts/peru-production-verification-590-20261031.json`). **No recorre flujos con sesión.**

## Trazabilidad

| Archivo | Contenido |
| --- | --- |
| `TRAZABILIDAD.csv` | Por requisito: módulo, capítulos del manual, código, estado y evidencias |
| `CRITERIOS.csv` | Los 19.598 criterios con su paso, su evidencia y su prueba en el repositorio |
| `HUELLAS_EVIDENCIA.csv` | SHA-256 de los 2.626 archivos de evidencia que cita la matriz (todos encontrados, 42,6 MB) |
| `trazabilidad-resumen.json` | Cifras del generador |

Se regenera con `scripts/cierre/generar-trazabilidad.mjs`. Lo que no da:

- **El código es por módulo**, no por función: indica dónde mirar, no qué línea cumple el requisito.
- **El capítulo es por módulo**: `administracion` y `fiscal` no tienen pantalla propia y quedan sin capítulo.
- **La regla de negocio no tiene columna propia.** La matriz describe la operación; la regla
  vive en el capítulo y en `docs/MODULES.md`.
- **Regresión automática.** Sólo 22 de los 988 requisitos (29 pasos) tienen un paso cuyo nombre
  aparece en una prueba del repositorio. Es un piso, porque la CI cubre más con otros nombres,
  pero **no hay manera de afirmar hoy qué requisitos protege la CI**. Es la mayor debilidad
  del cierre: la mayoría de los 988 se aprobaron una vez y nada los vuelve a comprobar por nombre.

## Sin acreditar

Nada de esto se ha probado de verdad, y no debe presentarse como probado:

| Tema | Falta |
| --- | --- |
| SUNAT, SOL, SIRE | Aceptación real con credenciales de un contribuyente |
| Migración | Extracto real de un cliente; todo se probó con sintéticos |
| Instalador Windows | Firma y distribución; el binario probado no está firmado |
| Recuperación | RTO de PROD medido; respaldo programado de Storage (hoy sin objetos) |
| Correo | Envío real con el correo productivo |
| Power BI | Actualización programada real en el servicio |
| Piloto | Usuarios reales y aceptación firmada |
| Carga | La prueba final no garantiza SLA bajo carga |

Defectos y hallazgos abiertos: `DEFECTOS.md`.

## Custodia de la evidencia

La evidencia cruda no está en Git. `scripts/cierre/empaquetar-evidencia.mjs` genera el paquete y
su huella. Esta sección se completa cuando el paquete esté copiado y verificado:

| Copia | Lugar | SHA-256 | Verificada el |
| --- | --- | --- | --- |
| 1 | _pendiente_ | | |
| 2 | _pendiente_ | | |

La copia local no se borra hasta que las dos filas estén llenas.

## Estado anterior

`ESTADO_HASTA_590.md` conserva íntegro el `docs/CURRENT_STATE.md` de más de 3.000 líneas: su
cronología de cortes, auditorías y migraciones. Las decisiones técnicas pasaron a
`docs/ARCHITECTURE.md`.
