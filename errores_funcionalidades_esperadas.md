# Estado
Todos los hallazgos críticos de POS, cron y contabilidad fueron corregidos y verificados (ver `ultimos_erorres.md` y `faltantes_para_prod.md`). Smoke/E2E local: 14/14 OK.

Los puntos previos quedan como histórico; no hay pendientes nuevos en este archivo.

# Errores de lógica
- Cálculo de impuestos/totales se acepta del cliente → reglas de negocio y contabilidad pueden ser burladas.
- CPE: uso directo de longitud de documento e items sin validar → crash antes de completar flujo.
- Worker de reintento: incrementa intentos aun si el fetch de venta falla, sin backoff ni locking → fácil llegar al límite sin intentar facturar realmente.
- AccountingEntriesService: asientos usan cuentas hardcodeadas (701, 401, 201, 691) sin mapa por país/plan → contabilización incorrecta fuera de PERÚ.

# Errores de vacío (datos faltantes/casos límite)
- Servicio fiscal vacío (tax-calculation.service.ts) → carece de validación/calculo donde se esperaba.
- Falta manejo de cliente sin documento en POS → rompe generación de CPE.
- Detalles de venta opcionales no validados → ventas sin items generan errores y quedan sin rollback.
- Migration 107: sin control de tenant_id nulo → totales calculados con tasa default sin avisar.

# Análisis por capas
- Backend: permisos y guards existen, pero hay huecos de aislamiento (worker POS, servicio POS heredado), falta cifrado de credenciales sensibles y falta de transacciones en operaciones críticas.
- Frontend: POS confía en que el backend acepta sus números; no revalida totales después de envío. No hay manejo de cancelación de requests ni retries; la visualización depende de observaciones serializadas, generando UI inconsistente si el backend no guardó detalles.
- Datos: cache contable dependiente del contexto inicial, tasas de impuesto default si falta tenant, passwords en claro en DB.

# Módulos interconectados
- POS → Inventario → Contabilidad: venta dispara actualización de stock y evento contable, pero al no ser transaccional se pierden eventos cuando falla stock; EventBus no garantiza persistencia si Outbox falla (inyección opcional).
- POS → CPE: payload usa totales no recalculados; un cliente puede enviar subtotales manipulados y CPE/contabilidad los replican.
- Compras/Devoluciones (migration 107): totales dependen de función fiscal app.obtener_impuesto_principal_porcentaje, pero esa función depende de cabecera con tenant; si falta, se aplica 18% y se guarda en cabecera, desalineando con libros contables.

# Funcionalidad esperada y criterios de éxito (por módulo)
- POS: recalcular totales/impuestos server-side, validar cliente/documento/items, ejecutar flujo en transacción con rollback, actualizar caja según tipo real de pago, emitir evento contable idempotente, cifrar certificados.
- Contabilidad: mapear cuentas por país/plan por tenant, cachear por tenant de forma segura, persistir eventos en outbox antes de emitir.
- Migraciones compras: validar tenant presente, asegurar triggers de totales se ejecutan en insert/update/delete de detalles, respetar tasa configurada por país/tenant.
- Worker POS: aceptar sólo credenciales de servicio firmadas, fijar tenant por token, limitar concurrencia y reintentos exponenciales.
- Front POS: no confiar en totales del cliente, re-hidratar datos con respuesta del backend, manejar faltantes (documento, items), abortar en errores.

# Plan para resolver
1) POS backend: mover orquestación de venta a transacción o saga; recalcular totales con TaxCalculatorService, validar documento/items, bloquear si descuadre; normalizar método de pago con tabla metodos_pago; emitir evento con idempotency key; cerrar/actualizar caja con tipo real.  
2) Seguridad POS: eliminar/depurar servicio heredado de src/pos; endurecer endpoint worker con JWT de servicio, tenant fijo por token, validación de origen y rate-limit; cifrar PFX/password con KMS/Envelope y retirar storage plano.  
3) Contabilidad/eventos: inicializar cache de cuentas por tenant on-demand, mapear cuentas por país/plan; forzar persistencia en outbox y resolución determinista de cuentas dentro del evento.  
4) Migraciones compras: agregar validación de tenant_id en triggers y abortar si es nulo; añadir constraints de integridad por tenant en hijos; registrar warning/RAISE para detectar datos huérfanos.  
5) Front POS: dejar de confiar en totales del cliente; reusar respuesta del backend para hidratar estado; manejar faltantes (doc/items) y errores con retries/cancel; asegurar UI refleja sólo ventas confirmadas.  
6) Servicio fiscal: implementar tax-calculation.service.ts o retirar su inyección para evitar fallos silenciosos; unificar uso con TaxCalculatorService.  
7) CPE: validar entrada antes de construir payload (documento, items > 0); aplicar tasa recalculada; fallback robusto con registro de pendientes sin corromper transacción.
Configurar CERT_ENCRYPTION_KEY seguro en prod y documentar rotación. 
Rotar CERT_ENCRYPTION_KEY en tu gestor de secretos prod (sigue el doc).
