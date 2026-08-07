# Arquitectura y seguridad

## Vista general

El ERP es un monorepo TypeScript con estas unidades desplegables:

| Unidad         | Responsabilidad                                    |
| -------------- | -------------------------------------------------- |
| `apps/web`     | Next.js 15, UI web y cliente Tauri                 |
| `apps/erp-api` | API NestJS y reglas de negocio                     |
| `apps/worker`  | Jobs asíncronos, colas e integraciones             |
| `libs/*`       | DTO, criptografía y contratos compartidos          |
| `supabase`     | PostgreSQL, migraciones, RLS, RPC y almacenamiento |

Dependencias principales:

```text
Web/Tauri -> API -> Supabase/PostgreSQL
                 -> Redis/BullMQ -> Worker
API/Worker -> servicios fiscales y externos
Web/API/Worker -> libs compartidas
```

El dominio no debe depender de componentes UI ni de detalles del cliente
Supabase. Las operaciones que requieren atomicidad viven en RPC SQL o en una
transacción explícita.

## Multi-tenant y datos

- Toda entidad empresarial pertenece a un `tenant_id`, salvo catálogos globales
  explícitos.
- RLS debe permanecer habilitado y forzado en tablas expuestas.
- Los embeds y relaciones PostgREST deben conservar consistencia tenant.
- Funciones `SECURITY DEFINER` fijan `search_path`, revocan ejecución pública y
  conceden sólo los roles necesarios.
- El backend con service role siempre aplica el tenant de la sesión; nunca acepta
  un tenant arbitrario del body.

El único proyecto remoto operativo es PROD: `wypnbcptofqdmoynlonq`. El antiguo
DEV `hbueraexcbowpfnjlppi` está retirado: el esquema de entorno, las herramientas
operativas y CI lo rechazan. Las pruebas con escritura sólo pueden usar dobles o
una infraestructura local efímera sin datos de clientes.

## Autenticación y autorización

- Web mantiene sesión mediante cookie HttpOnly.
- Tauri usa Bearer local cifrado; no se persiste en claro.
- Los passwords, JWT, service-role keys y headers de autorización no entran en
  localStorage, sessionStorage, logs ni outbox.
- Los controllers aplican autenticación, tenant actual y permisos por recurso.
- La matriz exacta de permisos se deriva de decorators, guards y pruebas; no se
  mantiene una segunda tabla manual en documentación.
- Los endpoints públicos son excepciones explícitas, limitadas y protegidas con
  rate limiting cuando corresponde.

## Fiscal

- El país operativo se resuelve desde `empresa_config.pais_id`; los catálogos,
  moneda, identificación, tasa y autoridad fiscal nunca se infieren desde la
  ubicación del navegador.
- Perú soporta factura `01`, boleta `03`, nota de crédito `07` y nota de débito
  `08`, además de RA, RC, GRE y SIRE.
- La fachada CPE delega construcción UBL, firma, transporte, cancelación,
  reportes y sincronización con Documentos.
- El UBL 2.1 incluye totales legales, afectación tributaria por línea, firma y
  datos SUNAT.
- SUNAT directo usa WS-Security UsernameToken, sin HTTP Basic para hosts
  `*.sunat.gob.pe`.
- Producción valida el RUC del certificado antes de firmar o enviar.
- Argentina usa CUIT/ARS/IVA y el adaptador ARCA: firma CMS del TRA para WSAA,
  autorización secuencial y consulta por WSFEv1, CAE y QR. Los códigos WSFE de
  Facturas A/B/C/E/M y sus notas viven en catálogos por país.
- El aprovisionamiento automático de demos y QA remoto está deshabilitado. No se
  crean tenants sintéticos en PROD ni se simulan transportes fiscales allí.
- GRE puede usar Plataforma Nueva REST; un ticket de envío no equivale a CDR
  aceptado.
- Los rechazos, timeouts y estados asíncronos se registran sin declarar éxito
  prematuro.

## Inventario y transacciones

- `producto_existencias` conserva el saldo físico por almacén.
- `productos.stock_*` y proyecciones por sucursal son derivados.
- `aplicar_movimiento_inventario_tx` centraliza entradas, salidas, reservas y
  liberaciones.
- POS obtiene almacén desde la caja abierta.
- `cerrar_recepcion_tx` y `reservar_pedido_stock_tx` son primitivas canónicas.
- Idempotency keys y locks evitan duplicar ventas, recepción, reservas y jobs.

## Contabilidad

Los endpoints se distribuyen por recurso: períodos, presupuestos, centros de
costo, estados financieros, asientos, libros y eventos. Los controladores
orquestan; servicios y generadores contienen reglas. Todo asiento debe:

- pertenecer al tenant correcto;
- cuadrar debe/haber;
- enlazar su evento o referencia de negocio;
- respetar período y estado contable;
- poder auditarse desde el documento origen.

## Desktop y offline

- Tauri usa SQLite local por tenant.
- La outbox es durable, idempotente y no guarda secretos.
- Los snapshots y cachés se aíslan por tenant.
- Las escrituras offline se sincronizan con contratos explícitos.
- Los correlativos fiscales locales no sustituyen la validación del backend.
- El runtime no habilita shell arbitrario.

## Frontend

- Stack visual: Tailwind CSS 3.4 + shadcn/ui/Radix.
- `globals.css` contiene únicamente Tailwind, tokens y base.
- El tema vive en `<html>` y usa tokens semánticos.
- Dialog y AlertDialog usan primitivas accesibles, no overlays manuales.
- No se aceptan hojas de compatibilidad para clases legacy ni colores puente.
- El POS de escritorio conserva dos zonas persistentes: catálogo y venta activa.
- Menús, documento fiscal, impuesto, moneda y formato regional derivan del
  contexto del tenant; la clave de caché incluye `tenant_id` para impedir
  reutilización cruzada entre sesiones PE y AR.

## Integraciones y observabilidad

- Redis/BullMQ coordina jobs, locks y reintentos.
- Logs estructurados incluyen correlación y tenant sin exponer secretos.
- Health checks distinguen proceso vivo, disponibilidad y dependencias.
- Métricas y auditoría no deben alterar el flujo de negocio.
- Integraciones externas usan adaptadores y fallan cerrado en operaciones
  fiscales o financieras.

## Reglas para cambios arquitectónicos

1. Buscar primero el contrato existente en código y pruebas.
2. Mantener una sola fuente de verdad por concepto.
3. No introducir escrituras paralelas a un ledger o agregado.
4. No crear dependencias desde dominio hacia UI o infraestructura concreta.
5. Añadir pruebas de contrato cuando se modifiquen límites de módulos.
6. Actualizar este documento sólo si cambia un invariante estable.
