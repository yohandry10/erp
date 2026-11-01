# Catálogo de defectos de la versión 590

Severidad: **A** puede dar datos o dinero incorrectos, o exponer información; **M** impide o
confunde una operación con salida; **B** molestia o riesgo acotado. La severidad la propuso
quien integró; el responsable del producto puede cambiarla.

## Abiertos

| ID | Sev. | Qué pasa | Por qué sigue abierto | Dónde se decide |
| --- | --- | --- | --- | --- |
| A-03 | M | `rrhh.access` es un único permiso amplio | Dividirlo cambia roles existentes | Permisos |
| A-05 | M | La cola de eventos de PROD tiene 7 en `cola_muerta`, anteriores a esta versión | Sin investigar | Operación |
| A-07 | M | Sin correo productivo no se recupera una contraseña olvidada | Falta configurar correo real | Usuarios |
| A-08 | B | Reprogramar una entrega sin `destino` por la RPC directa da el error crudo de NOT NULL; la API lo exige | Sólo por llamada directa | Suministro |
| A-09 | B | GRE SOAP beta rechaza con `2112`; la ruta prevista es GRE REST | Depende de SUNAT | GRE |
| A-10 | M | La CI integral falla si corre en las primeras 5 horas UTC de cada mes: los datos de prueba toman el mes UTC y el negocio la fecha de Lima. Afecta sólo a pruebas; 8 scripts de `scripts/ci` usan fechas así | Reintentar después de las 00:05 de Lima funciona | CI |
| A-11 | B | El nombre de un cliente sigue en la historia de Git: un mensaje de commit y un manifiesto de respaldo antiguo | Reescribir la historia de `main` es destructivo; no se hizo | Responsable del repositorio |
| A-12 | M | La mayoría de los 988 requisitos no tiene regresión identificable por nombre (ver `EXPEDIENTE.md`) | Trabajo de varias semanas; conviene por módulos de más riesgo | Calidad |

## Corregidos en esta versión

| ID | Sev. | Qué pasaba | Corrección | Comprobación |
| --- | --- | --- | --- | --- |
| C-01 | A | Los movimientos bancarios nacían inactivos y no entraban en saldos ni conciliación (17 requisitos afectados) | Migración 590 sobre el valor por defecto, sólo hacia adelante | Regresión de nueve escritores; 0 inactivos en CI |
| C-02 | A | La fecha civil de CxC y CxP podía caer en otro día según el huso | Migración 587 | CI integral |
| C-03 | A | Una recepción con costo cero explícito se valoraba mal | Migración 589; en PROD, 242 productos toman el costo promedio del kardex | Ensayo sobre respaldo real |
| C-04 | M | La búsqueda de asientos sólo veía los primeros 50 | Carga completa del catálogo y rechazo de lecturas incompletas | Evidencia nativa del candidato |
| C-05 | M | Una acción de escritura se mostraba a quien sólo podía leer productos, y fallaba con 403 | Permiso comprobado antes de mostrarla | Criterio reemplazado, documentado en la matriz |
| C-06 | M | Sin permiso, Notificaciones decía "error de conexión" | Mensaje y contrato de permiso corregidos | Criterio reemplazado, documentado en la matriz |
| C-07 | M | 585, 586 y 588 no cumplían sus verificadores con los privilegios por defecto de Supabase | Corregidas antes de aplicar; el ensayo ahora los emula | Ensayo de promoción |
| C-08 | B | El interruptor "Venta rápida" del POS no hacía nada | Retirado de la interfaz | Pruebas de POS |
| C-09 | B | Rutas locales con el nombre de un cliente en el PDF del manual y en un manifiesto | Limpiadas; `check-manual` lo vigila en el PDF | Búsqueda sin coincidencias en la rama |
| C-10 | B | La prueba del dashboard dependía del mes UTC | Calcula el mes en hora de Lima | Con `TZ=UTC` y `America/Lima` |
| C-11 | B | La prueba de compra daba 5 s a una pantalla que seguía cargando, y falló una vez en CI | Plazo de 20 s, igual al resto de la prueba | CI del PR 150 |

## Corregidos después de 590, pendientes de promover (591–593)

| ID | Sev. | Qué pasaba | Corrección |
| --- | --- | --- | --- |
| A-01 | A | El alcance por sucursal pasaba a total si fallaba su lectura | Responde 503 |
| A-02 | A | El límite de login no se aplicaba si fallaba su consulta | Responde 503 |
| A-04 | B | 143 tablas conservaban escritura para `anon` | Migración 591, también para tablas futuras |
| A-06 | M | Marcar un aviso compartido lo apagaba para todos, y por eso exigía permiso | Migración 592: lectura por usuario |
| A-07 | M | No había "cambiar mi contraseña" | Migración 593 y opción en el menú lateral |

## Corregidos con reserva

- **42 movimientos bancarios inactivos** en la historia sintética local. La 590 corrige las
  inserciones futuras; no reactiva los históricos. Si aparecieran en datos reales, sanearlos
  exige diagnóstico y respaldo propios. En PROD no se comprobó que existan.
- **Criterios originales que resultaron no ser válidos.** En 5 requisitos el criterio cambió
  porque el original reproducía un defecto o un dato de prueba: diseñador de consolidación,
  caché de clientes nativa, cola pendiente nativa, recuperación de notificaciones y guarda de
  productos. Cada reemplazo está en `resolvedOriginalDefectCriteria` de la matriz. Son la parte
  que conviene revisar si se audita la aceptación.
- **3 adaptaciones de datos**: identificadores nuevos o una población distinta en pruebas nativas
  (`fixtureAdaptations`). No cambian la expectativa.

## Fuera de alcance

No son defectos. La paridad con funciones automáticas de otros ERP (emparejamiento bancario,
eliminaciones intercompañía automáticas, multilibros) entra sólo como alta de producto.
