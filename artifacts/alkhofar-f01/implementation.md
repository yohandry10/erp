# Primera entrega de contratos de suministro para ALKHOFAR

Corte de desarrollo: 27 de octubre de 2026. Feature independiente de la matriz
de aceptación existente. La migración 570 está propuesta en esta rama; no se
ha operado PROD ni se ha publicado esta entrega.

## Alcance implementado

- Expediente de contrato: cliente, responsable, moneda, vigencia, observaciones
  y líneas de producto con cantidad, unidad y precio unitario sin impuestos.
- Alta, edición y anulación de borrador; activación que fija las líneas.
- OC recibidas del cliente asociadas a un contrato activo, con distribución de
  cantidades sin exceder lo contratado.
- Programaciones parciales por línea de OC, fecha y destino. Reprogramación
  con versión y motivo, conservación de la fecha original e historial.
- Anulación de programaciones y liberación de su cantidad programable.
- Consulta paginada, catálogos buscables y vista de saldos pendientes de
  asignación/programación; interfaz de escritorio y móvil.
- Autorización tanto en HTTP como en SQL, tablas privadas con RLS forzado,
  auditoría atómica y recuperación idempotente de escrituras concurrentes.
- Las escrituras contractuales no se encolan offline. La solicitud incierta
  conserva datos y clave para reintentar mientras la página permanece abierta.

## Verificación local

- API: 35 pruebas aprobadas entre contratos, permisos y guard de permisos;
  21 corresponden a validación HTTP y clasificación de errores de esta feature.
  La dependencia Supabase se sustituye en estas pruebas: no acredita transporte
  HTTP a PostgREST productivo.
- PostgreSQL 16 nuevo: 566 migraciones hasta 570, 79 verificadores vigentes y
  67 históricos aprobados. Se conserva el primer fallo de fixture que omitió
  `configured_at`, corregido antes del ensayo completo satisfactorio.
- Después de añadir el nombre visible del actor al historial se volvió a
  compilar esa proyección SQL y a ejecutar el verificador 570 en la misma base
  local. No cambia el writer ni el modelo persistido.
- Cuatro escenarios de concurrencia real aprobados: doble consumo de contrato,
  cuatro reintentos de una programación, edición de versión simultánea y doble
  consumo del remanente de una OC. Ver `concurrency.json` y el runner local.
- Navegador aislado: ciclo contrato → activación → OC → programación → respuesta
  perdida → recuperación con la misma clave → reprogramación; escritorio claro
  y móvil oscuro. Incluye lector sin gestión y recuperación de consulta caída.
- Compilación API y Web, comprobación de tipos, política offline y contrato de
  etiquetas/documentación aprobados. La comprobación visual no sustituye la
  aceptación del proceso del cliente.

## Límites y siguiente trabajo

Esta entrega es el núcleo de planificación de F01. No declara terminada toda
la feature ni el alcance solicitado por ALKHOFAR. No crea reservas físicas,
pedidos, despachos, documentos fiscales ni asientos.

| Entrega | Estado | Trabajo siguiente |
| --- | --- | --- |
| F01 núcleo de planificación | Implementado y validado localmente | Promoción coordinada pendiente, conforme al contrato PROD-only |
| F01 adendas y modificaciones | Implementado y validado localmente en el segundo incremento | Referencias, versiones, precios congelados y anulación de OC; ver `../alkhofar-f01-adendas/implementation.md`. Adjuntos incorporados en el tercer incremento |
| F01 ejecución mediante pedidos y adjuntos | Implementado y validado localmente | Vínculo completo protegido y expediente privado; ver `../alkhofar-f01-expediente/implementation.md`. Promoción pendiente |
| F02 lotes y reservas | Pendiente | Saldos por lote/almacén/ubicación, vencimientos y adaptación de todos los escritores |
| F03 entregas y PECOSAS | Pendiente | Cantidades recibidas/aceptadas/rechazadas, conformidades y adjuntos |
| F04 facturación y conciliación | Pendiente | Facturación parcial y saldos por contrato/OC |
| F05 alertas | Pendiente | Reglas contractuales, vencimientos de lotes y lectura por usuario |
| F06 penalidades | Pendiente | Reglas y ejemplos aprobados por el cliente antes de calcular efectos financieros |
| F07 indicadores e intercambio | Pendiente | Tableros, exportaciones y contrato de consulta Power BI |
| F08 FOX | Pendiente de muestras y acceso autorizado | Identificar versión, extracciones, históricos, claves y modalidad de convivencia |
| F09 continuidad y salida | Pendiente | Respaldo de datos y objetos, recuperación, retención y exportación integral |
| F10 implantación | Pendiente de definición con cliente | Datos, capacitación, piloto, soporte y aceptación |

Antes de promover: releer OPERATIONS, resolver el rango vigente y posibles
colisiones de prefijos, ejecutar el preflight PROD, respaldar y ensayar sobre
copia local, verificar privilegios/RLS/locks y coordinar migración antes del
runtime que exige 573 (tercer incremento). No ejecutar SQL suelto ni pruebas con escritura en PROD.
