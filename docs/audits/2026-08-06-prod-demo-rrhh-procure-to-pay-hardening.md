# Demo PROD y hardening RRHH / procure-to-pay

Fecha: 2026-08-06
Estado: barrido local completo; migraciones `392` corregida y `396..403` aplicadas y validadas en PROD; pendiente promocion unica de codigo y certificacion visible del alias Vercel.

## Contrato comercial

- La prueba gratuita comercial se crea en PROD.
- La conversion conserva el mismo tenant y la misma cuenta; limpia datos demo y promueve el rol, sin migrar a otra base.
- QA sintetica y fixtures de desarrollo permanecen fuera de PROD.
- Una demo entra al dashboard con datos de muestra y no muestra wizard ni modal de configuracion fiscal.

## Correcciones verificadas

- Planilla: calculo completo y pago/outbox atomicos (`396`, `397`).
- Liquidacion: calcular no cesa; confirmar aprueba, termina contrato, inactiva y publica outbox atomicamente (`398`).
- Compras: recepcion fisica registra inventario y 20/4699; no crea CxP ni IGV. El endpoint alterno `PUT /compras/:id/recibir` queda obsoleto y el listener legacy no se registra.
- Factura proveedor: crea CxP y outbox contable en una transaccion (`401`); la UI faltante `/dashboard/finanzas/cxp/nueva` permite FACTURA/NC/ND/RH, moneda, tipo de cambio y referencia modificada.
- Pago CxP: deuda, evidencia exclusiva, banco y outbox son atomicos (`402`); efectivo usa `pagos_facturas`, banco usa `movimientos_bancarios`, sin doble contabilizacion.
- Contabilidad: cabecera y detalles del asiento se validan e insertan juntos (`400`); `399` agrega 4699 por tenant.
- Outbox contable: el worker generico y el listener contable comparten un unico catalogo de eventos; la factura proveedor ya no puede marcarse completada sin asiento.
- Demo: el plan PCGE inicial incluye `4699`, evitando que las demos creadas despues de la migracion fallen al contabilizar la factura del proveedor.
- PLE/SIRE: NC negativas, referencias fiscales, tipo de cambio obligatorio; recepciones excluidas y SIRE no finge envio SUNAT.
- CPE: el reverso operativo ocurre solo despues de NC aceptada con CDR.

## Evidencia

- Preflight PROD read-only: `environment=PROD`, `allow_demo_data=true`, demos comerciales y conversiones in-place presentes.
- Contratos SQL DEV con `BEGIN/ROLLBACK`: liquidacion; asiento cabecera+detalles; factura proveedor+outbox; pago CxP bancario idempotente y efectivo.
- API Jest: 141/141 suites, 1326/1326 tests.
- Build Web de produccion: 113 paginas generadas, TypeScript y lint sin errores.
- E2E verdes: inventario/logistica, ventas, compras, POS, RRHH, finanzas, contabilidad integral, CPE, GRE y SIRE (datos/archivos y smoke UI).
- PROD: respaldo previo `erp-prod-pre-396-403-20260806-174404.dump` (6,291,207 bytes); contratos atomicos de asiento, factura proveedor, pago CxP y liquidacion pasaron con `BEGIN/ROLLBACK`.
- PROD inventario: 6/6 checks single-ledger verdes; sin divergencia de stock ni movimientos fisicos legacy/sin costo.
- PROD preflight posterior: `environment=PROD`, project ref canonico y politica demo `true` validados.

## Pendiente antes del unico despliegue

- Desplegar el commit unico en Render/Vercel.
- Crear una demo comercial desde el alias publico (nace en PROD) y certificar dashboard, ausencia de wizard/modal, inventario/submodulos y errores visibles/API.
