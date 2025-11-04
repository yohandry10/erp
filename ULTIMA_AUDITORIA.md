Resumen Ejecutivo

Los flujos anunciados como operativos en AUDITORIA_FLUJOS_CRITICOS_COMPLETA.md (lines 15-34) no se reflejan en la base real: las tablas transaccionales críticas (public.pedidos_venta, public.cuentas_por_cobrar, public.asientos_contables) están vacías mientras public.cpe acumula 31 registros, evidenciando una ruptura temprana en Ventas→CxC→Contabilidad.
El módulo POS guarda ventas (public.ventas_pos=9) pero no persiste detalles ni descuenta stock real: el servicio usa columnas inexistentes (stock_actual) y omite poblar detalle_ventas_pos, por lo que la UI nunca muestra líneas de venta y el inventario queda incoherente (apps/erp-api/src/modules/pos/pos.service.ts (lines 320-347) y apps/web/app/dashboard/pos/page.tsx (lines 320-330)).
Compras solo crea órdenes (3 OC) sin recepciones ni integración con inventario o CxP; además, los montos se calculan con un IGV fijo de 18% sin respetar configuración fiscal (apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts (lines 94-110), .../repositories/ordenes-compra.repository.ts (lines 17-36)).
La capa asíncrona/outbox está incompleta: el EventBus persiste eventos solo cuando recibe tenantId (lo omite en emitMovimientoStock), el worker lanza tareas que terminan en TODO/errores forzados (apps/worker/src/index.ts (lines 70-138)), y la tabla outbox_events permanece vacía.
Seguridad multi-tenant inconsistente: tablas críticas (public.users, public.stock_movimientos, public.audit_log_archive) tienen RLS deshabilitado o políticas permisivas, permitiendo lectura/escritura con la anonymous key, mientras los controladores asumen aislamiento por BD.
Matriz de Hallazgos

H1 | Ventas→CxC sin datos | DB metadata public.pedidos_venta/public.cuentas_por_cobrar/public.asientos_contables | Flujo | Alto | Conectar emisión de CPE con creación de documento, CxC y asiento; reejecutar migraciones 070/071 | Instrumentar pruebas E2E que verifiquen inserciones encadenadas.
H2 | CPE sin documento base | DB metadata public.cpe vs public.documentos | Flujo | Alto | Crear documentos y documento_detalles antes de insertar CPE; validar integridad en servicio CPE (apps/erp-api/src/modules/cpe/...) | Añadir constraint FK y monitor de discrepancias.
H3 | POS no registra detalle de venta | apps/erp-api/src/modules/pos/pos.service.ts (lines 292-347) &  (lines 737-748) | Lógica | Alto | Persistir líneas en detalle_ventas_pos y consumirlas en getDetallesVenta | Ajustar UI para alertar si el backend responde vacío.
H4 | POS descuenta stock con columna inexistente | apps/erp-api/src/modules/pos/pos.service.ts (lines 336-344) + supabase/migrations/002_agregar_stock_reservado.sql (lines 32-37) | Lógica | Alto | Cambiar a stock/stock_reservado; manejar error de Supabase | Añadir tests que fallen si la columna no existe.
H5 | IGV hardcodeado 18% | apps/erp-api/src/modules/compras/services/ordenes-compra.service.ts (lines 94-110) y .../repositories/ordenes-compra.repository.ts (lines 17-36) | Lógica | Medio | Leer tasa desde configuracion_fiscal o parámetro; soportar moneda | Unificar cálculo en helper con pruebas por país.
H6 | Worker sin integración real | apps/worker/src/index.ts (lines 90-138) | Flujo/Integración | Alto | Implementar OSE/SUNAT/SIRE reales o aislar colas hasta tener backends; capturar errores sin relanzar indefinidamente | Añadir health-check que detecte endpoints TODO.
H7 | RLS deshabilitado en tablas críticas | DB metadata public.users, public.stock_movimientos, public.audit_log_archive | Seguridad/RLS | Alto | Habilitar RLS con políticas tenant_id; revisar guardias superadmin | Auditar endpoints que confían en RLS.
H8 | Catálogos maestros vacíos | DB metadata (public.plan_cuentas, public.tipos_impuestos, public.paises, public.metodos_pago solo 5 registros sin tenant) | Vacío | Medio | Sembrar catálogos mínimos por tenant (wizard) | Bloquear avance del wizard si faltan semillas.
H9 | EventBus no persiste inventario | apps/erp-api/src/shared/events/event-bus.service.ts (lines 704-716) | Flujo | Medio | Pasar tenantId en emitMovimientoStock; verificar consumo por worker | Exponer métrica de backlog/outbox.
Detalle por Categoría

Errores de flujo

Ventas: el doc certifica flujo completo (AUDITORIA_FLUJOS_CRITICOS_COMPLETA.md (lines 15-34)), pero la DB muestra ausencia de pedidos, documentos y CxC; solo existen entradas en cpe, indicando generación manual o bypass. Sin movimientos_inventario ni stock_movimientos, no hay trazabilidad ni asiento automático.
Compras: ordenes_compra (3) y orden_compra_detalles (4) existen, pero recepciones, devoluciones_proveedor, pagos_facturas, cuentas_por_pagar están vacías; la lógica de recepciones (apps/erp-api/src/modules/compras/services/recepciones.service.ts) no se ejecuta y el worker no procesa eventos.
POS: flujo de caja registra sesiones (public.sesiones_caja=18) y ventas (public.ventas_pos=9), pero no propaga a inventario ni contabilidad; las ventas pendientes de facturación solo vuelven a lanzar cpeService.create sin manejar respuesta SUNAT (apps/erp-api/src/modules/pos/pos.service.ts (lines 877-976)).
RRHH/Contabilidad: todas las tablas (planillas, asientos_contables_rrhh, detalle_asientos) vacías; no hay asientos generados pese a doc que indica listeners.
Errores de lógica

Cálculos impositivos fijos (PEN, 18%) sin respetar configuracion_fiscal ni doble moneda (ordenes-compra.service.ts, compras-cxp-integration.service.ts).
POS consulta stock_actual y precio_venta inexistentes; a falta de manejo de error, Supabase devuelve error de columna y se omite el branch.
EventBus persistencia condicional: métodos como emitMovimientoStock no envían tenantId, por lo que no se genera outbox; el bus sigue siendo in-memory (apps/erp-api/src/shared/events/event-bus.service.ts (lines 704-716)).
Worker lanza errores intencionales (throw new Error('OSE integration not implemented yet') en apps/worker/src/index.ts (lines 101-133)), provocando retrys infinitos sin backoff real.
Errores de vacío

Catálogos clave sin datos: plan_cuentas, tipos_documentos_fiscales, tipos_impuestos, paises, productos, clientes, cuentas_bancarias = 0; el wizard (public.wizard_progress=2) no asegura llenado previo.
empresa_config tiene un solo registro (tenant global) aunque la arquitectura exige multi-tenant; features como POS dependen de certificados/series per-tenant (apps/erp-api/src/modules/pos/pos.service.ts (lines 753-789)).
integration_logs apenas 12 filas, incompatible con la supuesta cantidad de integraciones SUNAT/GRE; validaciones_sunat vacía impide monitoreo de certificados.
Análisis por capas

Backend: controladores usan SupabaseService confiando en RLS (p.ej. UsuariosController filtra por tenant_id, apps/erp-api/src/modules/usuarios.controller.ts (lines 24-70)), pero tablas sin RLS exponen datos. Muchos servicios devuelven success:true aunque no escriben datos reales (POS). Falta validación cruzada entre RLS y guardias; p.ej. stock_movimientos sin RLS aunque se inserta desde inventario.
Frontend: POSPage asume detalles siempre disponibles (apps/web/app/dashboard/pos/page.tsx (lines 320-335)) y muestra alertas modales en lugar de manejar estados; múltiples secciones usan alert() y prompt, inconsistentes con componentes UI. Rutas como /dashboard/compras/recepciones llaman a /api/compras/ordenes?estado=APROBADA,PARCIAL, pero el backend no soporta filtros compuestos (separación por coma), generando respuestas vacías silenciosas.
App shell Next.js depende de useApi que duplica /api si el endpoint ya lo incluye; algunos componentes mezclan fetch directo con useApi, omitiendo token/headers (apps/web/app/dashboard/compras/page.tsx (lines 150-192)).
Módulos interconectados

Ventas ↔ Inventario ↔ Contabilidad: venta POS debería disparar inventoryIntegration.realizarMovimientoStock y, vía EventBus, asientos; falla por columna inexistente y event bus sin tenantId.
Compras ↔ Recepciones ↔ CxP ↔ Contabilidad: recepciones nunca se registran (public.recepciones=0), por lo que CxP (public.cuentas_por_pagar=0) y asientos no se crean.
POS ↔ CPE: procesarVenta captura errores SUNAT pero persiste ventas_pos aun con certificado inválido, dejando cpe_pendiente en true sin retry efectivo.
Workers ↔ Outbox: OutboxService.getPendingEvents depende de la función get_pending_outbox_events (metadatos), pero no hay productor consistente; event_processing_log vacío refuerza que los workers no consumen.
Funcionalidades Esperadas vs. Implementadas

Conciliaciones bancarias: Tabla y servicio existen (apps/erp-api/src/modules/finanzas/conciliacion/conciliacion.service.ts), pero no hay registros ni UI consumiendo CSV → funcionalidad no ejercida.
Inventario Kardex valorizado: Vistas mv_balance_*, vw_inventario_* creadas, pero sin datos fuente (stock_movimientos vacío); dashboards en apps/web/app/dashboard/inventario no presentan contenido.
Guías de remisión (GRE): Tablas gre, gre_guias sin filas, aunque la UI de pedidos invoca GreModal; el flujo GRE inventariado no llega a ejecutarse.
RRHH: Tablas maestras y transaccionales vacías; la UI dashboard/rrhh muestra formularios pero no hay endpoints que creen contratos/planillas con asientos.
Seguridad/Auditoría: audit_log tiene datos, pero dashboard/audit-logs/page.tsx solo lista, no filtra por operación; rls_alert_* vistas existen pero sin entries. |||||||











*** ESTE FUE EL PROMP *** 



Quiero que actúes como un auditor técnico de un ERP multi-tenant ya construido. No quiero una respuesta de “limitaciones” ni que reduzcas el alcance: tu tarea es recorrer el monorepo completo y producir un reporte estructurado de errores, vacíos y mejoras. El repositorio contiene al menos estas partes:

apps/erp-api (backend principal, lógica de negocio, RLS, triggers, endpoints, integración SUNAT/GRE, outbox)

apps/web (frontend del ERP, vistas por módulo, POS web, flujos de ventas/compras/RRHH)

apps/worker o procesos de fondo (procesamiento de eventos, outbox pattern, reintentos SUNAT/GRE)

/docs con archivos previos de auditoría (por ejemplo: AUDITORIA_FLUJOS_CRITICOS_COMPLETA.md, ANALISIS_INTERCONEXION_MODULOS.md, etc.)

Además, ya tengo el dump de metadata de la base de datos Postgres/Supabase con TODAS las tablas, vistas, triggers y políticas RLS que te paso más abajo en este mismo prompt (es largo). Debes usarlo como verdad de cómo está la capa de datos.

Objetivo general
Necesito un análisis exhaustivo del ERP completo para identificar y documentar todos los tipos de errores presentes en la implementación actual, cubriendo:

Errores de flujo

Errores de lógica

Errores de vacío (datos faltantes / casos no contemplados)

Análisis por capas (backend / frontend)

Análisis de módulos interconectados

Documentación de funcionalidad esperada

Impacto y plan de corrección

Todo debe quedar en un reporte único estructurado.

Contexto de la base de datos (úsalo tal cual)
A continuación tienes el bloque de metadata de la BD que describe las tablas, vistas, triggers, funciones y políticas RLS. Incluye tablas críticas como: documentos, cpe, gre, ordenes_compra, pedidos_venta, ventas, ventas_pos, detalle_ventas_pos, movimientos_inventario, empleados, planillas, cobranzas, cuentas_por_cobrar, cuentas_por_pagar, empresa_config, tenants (vista), así como decenas de tablas con RLS habilitado y muchas funciones de auditoría y del patrón outbox.

🔴 Tómalo como fuente de verdad: ahí se ve que este ERP es multi-tenant, que casi todo tiene RLS, que hay triggers de auditoría, que existen vistas materializadas de contabilidad (mv_balance_general, mv_estado_resultados), que hay tablas de integración con SUNAT, y que hay un wizard_progress para onboarding del tenant.

👉 IMPORTANTE: debes leer ese bloque para:

Ver qué módulos existen realmente.

Detectar tablas que están creadas pero vacías.

Ver qué tablas tienen RLS y cuáles no.

Ver qué tablas tienen triggers de auditoría.

Ver qué tablas tienen flujos automáticos (por ejemplo, cálculo de totales al insertar detalle de OC).

Ver que hay tablas POS (ventas_pos, detalle_ventas_pos, vista_pos_productos).

Ver que hay tablas de seguridad (roles, rol_permisos, permisos, user_roles, usuarios_sistema, user_sessions).

Ver que hay tablas de logística/compras (ordenes_compra, orden_compra_detalles, recepciones, logistica_eventos, stock_movimientos).

👇 Aquí está el bloque de metadata que debes usar como insumo (parsea su contenido, no lo ignores, es parte del prompt):

«
[PEGA / LEE EL BLOQUE DE METADATA DE TABLAS, VISTAS, TRIGGERS, FUNCIONES Y POLICIES EXACTAMENTE COMO VIENE EN EL MENSAJE DEL USUARIO: incluye todas las tablas como activos_fijos, almacenes, asientos_contables, cpe, documentos, documento_detalles, documento_series, ventas, ventas_pos, pedidos_venta, pedidos_venta_detalle, ordenes_compra, orden_compra_detalles, integration_logs, validaciones_sunat, todas las tablas RRHH (empleados, asistencia, planillas, conceptos_planilla, etc.), todas las tablas de RLS (rls_alert_config, rls_alert_history, rls_audit_log), todos los triggers de auditoría y las funciones asociadas.]
»

No resumas ese bloque: úsalo como mapa de la capa de datos.

Qué debes entregar
Quiero un reporte estructurado con estas secciones, en este orden:

Resumen ejecutivo

Qué revisaste (apps, capas, BD)

Qué módulos detectaste que existen pero no están alimentados (tablas en 0 registros)

Riesgos inmediatos (por ejemplo: RLS deshabilitado en users, tablas críticas sin RLS, triggers sin RLS)

Errores de flujo
Para cada flujo de negocio que detectes a partir de la BD y del backend (ventasy facturación, compras y recepciones, POS, contabilidad, RRHH, cobranzas, cuentas por pagar, inventarios):

Mapeo detallado del flujo (ejemplo para ventas: cotizaciones → pedidos_venta → documento/factura → cpe → notificaciones/integration_logs)

Puntos de ruptura: tablas que existen pero no tienen el paso anterior cargado (por ejemplo, hay documentos pero no hay pedidos_venta; o hay ordenes_compra pero no hay recepciones)

Validación de transiciones de estado: si el código del backend espera estados y en la BD no existen columnas/valores que soporten esos estados, señálalo

Errores de lógica

Revisa las reglas de negocio implementadas en el backend (apps/erp-api): validaciones de tenant, validaciones fiscales (SUNAT), generación de series, contabilidad automática, reservas de stock, aprobaciones

Verifica cálculos y transformaciones que debes encontrar en triggers:

trigger_calcular_totales_orden_compra

trigger_calcular_totales_cotizacion_compra

trigger_calcular_totales_devolucion_proveedor
Si alguno depende de columnas que no están presentes en el frontend o no se envían en el payload, marca el error como “desajuste front–BD”.

Analiza las condiciones y tomas de decisión: por ejemplo, si en el API hay endpoints que consumen integration_logs o validaciones_sunat pero en BD no hay datos, eso es un flujo incompleto.

Errores de vacío / datos faltantes

Detección de tablas maestras que deberían tener datos iniciales por tenant y están en 0 (ej. plan_cuentas, tipos_impuestos, tipos_documentos_fiscales, metodos_pago, paises, empresa_config solo con 1 registro global)

Validación de valores nulos/no inicializados en tablas transaccionales que deberían tener tenant_id, created_at, created_by

Verificación de casos límite no contemplados: por ejemplo, si hay tablas para gre y gre_guias pero el front no expone el formulario de guía de remisión en el módulo de ventas

Análisis por capas

Backend (apps/erp-api):

Listado de APIs y endpoints que correspondan a las tablas/vistas detectadas

Validación de la lógica de negocio en el servidor: RLS en BD + validación de tenant en código + permisos por rol

Comprobación de la integridad de los datos: si hay triggers que esperan tenant_id y el endpoint no lo envía, márcalo.

Frontend (apps/web):

Verificación del manejo de estados (si hay módulo de POS pero no se consulta vista_pos_productos, si hay módulo de compras pero no se consulta vw_ordenes_compra_abiertas, etc.)

Análisis de la representación visual de datos vs. lo que hay en BD (por ejemplo, si hay tablas de auditoría y no hay pantalla de auditoría)

Validación de interacciones de usuario: rutas que no llaman al endpoint correcto, formularios que no envían todas las columnas que la BD espera, tablas que no filtran por tenant_id

Análisis de módulos interconectados

Dibuja (en texto) un diagrama de dependencias entre módulos:

Ventas ↔ Inventario ↔ Contabilidad

Compras ↔ Recepciones ↔ CxP ↔ Contabilidad

POS ↔ Inventario ↔ CPE

RRHH ↔ Contabilidad (asientos_contables_rrhh)

Verifica las interfaces de comunicación: si el backend publica en outbox_events pero no hay worker que consuma, o si hay worker pero no hay eventos pendientes

Valida la coherencia de datos compartidos: el mismo tenant_id debe aparecer en todas las tablas críticas

Documentación de funcionalidad esperada

Lista todas las características que deberían funcionar según las tablas presentes (si hay conciliaciones_bancarias, debe haber módulo de conciliación)

Especifica el comportamiento correcto por módulo (por ejemplo, para POS: apertura de caja → sesiones_caja → ventas_pos → detalle_ventas_pos → movimientos_inventario)

Define criterios de éxito por componente: qué endpoint debe devolver 200, qué vista debe listar datos, qué trigger debe actualizar totales

Matriz de hallazgos
Para cada problema encontrado, documenta:

ID o nombre del hallazgo

Ubicación exacta (archivo backend, ruta frontend, tabla o trigger)

Tipo de error (flujo, lógica, vacío, seguridad/RLS, integración)

Impacto en el sistema global (alto: rompe flujo; medio: datos inconsistentes; bajo: visibilidad/UI)

Corrección necesaria (qué hay que cambiar en código o BD)

Mejoras recomendadas (ej. exponer pantalla, llenar catálogos, habilitar RLS, agregar validación de tenant en endpoint)

Consideraciones especiales de seguridad y RLS
En la metadata se ve que hay muchas tablas con RLS habilitado y otras con RLS deshabilitado (por ejemplo, users o stock_movimientos mencionan que cualquiera con la anonymous key puede operar).

Debes señalar todas las tablas críticas que están sin RLS o con políticas demasiado abiertas.

Debes cruzar eso con el código del backend: si el backend asume que la BD ya filtra por tenant pero la tabla no tiene RLS, eso es un error de seguridad.

Cómo quiero el resultado
Devuélveme al final un reporte en texto estructurado con este orden:

Resumen ejecutivo

Tabla/Matriz de hallazgos

Detalle por categoría (flujo, lógica, vacío, capas, módulos interconectados)

Lista de funcionalidades esperadas vs. implementadas

Recomendaciones de hardening (RLS, auditoría, workers, catálogos iniciales)

No me devuelvas código de ejemplo, devuélveme el análisis del repositorio y de la metadata de la BD.

Importante
No reduzcas el alcance diciendo que “son muchos archivos”: el objetivo es precisamente cubrir backend, frontend, POS y módulos críticos.

Usa el bloque de metadata que te pasé como entrada.

Si ves referencias en /docs (AUDITORIA_FLUJOS_CRITICOS_COMPLETA.md, ANALISIS_INTERCONEXION_MODULOS.md), contrasta lo que está documentado allí con lo que está realmente implementado en código y BD y marca las divergencias. Policies
Manage Row Level Security policies for your tables
 