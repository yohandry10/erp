# Estado actual vs pendientes

## Lo ya hecho
- POS backend recalcula totales/impuestos server-side, valida items y documento, normaliza método de pago y hace rollback si falla detalle/stock/caja. Eventos/CPE usan montos recalculados.
- POS worker seguro: endpoint con JWT `pos.worker` multi-tenant y cron interno cada 5 minutos; POS heredado marcado deprecated.
- Certificados cifrados AES-256-GCM y descifrados con doble clave (`CERT_ENCRYPTION_KEY` + `CERT_ENCRYPTION_KEY_OLD` opcional) en POS, CPE y validaciones. Clave fuerte en .env.
- TaxCalculationService implementado como wrapper de `TaxCalculatorService`.
- Front POS: valida documento, reintenta una vez si falla la red, usa totales del backend para mostrar éxito.
- Contabilidad: cache de plan de cuentas ahora es lazy por tenant.
- Migración 107: triggers de totales de compras/devoluciones/cotizaciones ahora exigen `tenant_id` y lanzan excepción si falta.

## Pendientes críticos
- Endpoints con TODOs: contabilidad (cierre 59/89 formalizado en API), GRE/SIRE reportes extra, configuración/certificados (rotación documentada), pedidos CPE placeholders.
- Auditoría: cierre contable E2E en staging (cálculo y asientos 59/resultado ya probados con tenant 79b793dc-4b02-4e05-a67d-1261bac6b469).

## Opcionales / mejoras
- Script de reencriptado de certificados para rotación sin downtime.
- Log persistente para cron POS (tabla o archivo rotado) y métricas con auth.
- Auditoría de integration_logs con correlación para GRE/SIRE.

## Estado actualizado (resumen)
- [x] POS: totales server-side, validaciones cliente, idempotency_key obligatoria, locks tenant/sesión/producto, hard-stop RUC/razón social, sin doble stock (RPC).
- [x] Worker POS: JWT pos.worker multi-tenant + cron interno.
- [x] Certificados: migración 113 + script reencriptado + cifrado/descifrado doble clave.
- [x] RLS plan_cuentas y detalle_asientos (migración 114) y catálogos globales (paises, tipos_doc_fiscales, tipos_impuestos) con service_role; tablas pendientes con helper 116 aplicadas.
- [x] GRE CSV /gre/reporte + DTO filtros anio/mes + log en integration_logs (GRE_CSV).
- [x] Cashflow/ratios con endpoints y DTOs Swagger.
- [x] Metrics/health: /api/health y /metrics protegidos por token.
- [x] Front contabilidad: sin reload; páginas clave usan useApi con retry/timeout (monitoreo, periodos, nuevo, detalle, presupuestos comparación y alertas).
- [x] Compras: tests de recepciones y devoluciones verifican emisión de outbox.
- [x] Worker POS: cron POS CPE/pendientes registra integration_logs; health del worker con token; SIRE registra integration_logs.
- [x] Worker: backoff extra CPE/GRE aplicado (log cron POS por tenant ya listo).
- [x] Compras/Recepciones: tests E2E automatizados en staging (outbox→CxP/stock/contabilidad).
- [x] Auditoría: integration_logs SIRE/GRE revisados por tenant; cierre contable E2E en staging validado con tenant 79b793dc-4b02-4e05-a67d-1261bac6b469 (cálculo resultado, asiento 59 y cierre de periodo 2025-01).
Las capturas muestran:





Validar en la BD que los RPC de locks quedan con una sola firma (text) y seguir usando ::text en llamadas manuales si hace falta.

