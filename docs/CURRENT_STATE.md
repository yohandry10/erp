# Estado actual del ERP

Actualizado: 2026-08-07.

Este archivo contiene únicamente el estado vigente. El historial de auditorías y
decisiones anteriores se consulta en Git. Si este resumen contradice código o
migraciones verificados, prevalece la implementación actual.

## Resumen ejecutivo

- El código core está en estado **release candidate**.
- El alcance operativo activo es Perú (`PE`, `pais_id=1`, `PEN`, SUNAT),
  Argentina (`AR`, `pais_id=5`, `ARS`, ARCA) y Colombia (`CO`, `pais_id=2`,
  `COP`, DIAN).
- DEV y PROD son proyectos físicos separados y no intercambiables.
- El cierre más reciente del backend reporta 160/160 suites y 1513/1513 pruebas.
- El cierre Web del 2026-08-07 reporta type-check limpio y build Next 120/120
  rutas; 73 rutas se verificaron en escritorio y móvil (146 casos) y el
  recorrido visible de demos nuevas PE/AR/CO no presentó errores de consola.
- Nóminas reales de prueba se calcularon y persistieron en DEV: PE
  `2613.00/339.69/2273.31`, AR `1800000/306000/1494000` y CO
  `2749095/200000/2549095` (bruto/descuentos/neto). Una mutación deliberada de
  la tasa colombiana fue detectada por las pruebas antes de restaurarla.
- Factura `01`, boleta `03`, nota de crédito `07`, nota de débito `08`, RA y RC
  cuentan con evidencia aceptada en SUNAT beta.
- Inventario opera en DEV con un único ledger físico por almacén.
- Desktop/Tauri está implementado como cliente offline-first con SQLite y outbox
  por tenant.

## Entornos

| Entorno | Proyecto Supabase      | Uso permitido                            |
| ------- | ---------------------- | ---------------------------------------- |
| DEV     | `hbueraexcbowpfnjlppi` | Desarrollo, QA, demos y datos sintéticos |
| PROD    | `wypnbcptofqdmoynlonq` | Únicamente datos reales                  |

Reglas vigentes:

- Nunca ejecutar QA, demos ni seeds sintéticos en PROD.
- PROD usa `.env.production` o secretos inyectados; nunca `.env.local`.
- Toda operación DB comienza con `scripts/db-environment-preflight.ps1`.
- Todo borrado en PROD exige autorización explícita, respaldo, transacción y
  evidencia posterior.

La migración `346__deployment_environment_boundary.sql` está aplicada en ambos
entornos. PROD fue purgada de datos demo el 2026-07-14 y quedó sin tenants ni
usuarios de prueba.

## Migraciones

- `000..346`: baseline y hardening presentes según el esquema verificado. El
  historial remoto no es comparable entre entornos porque PROD conserva
  `000..002` como baseline consolidado y DEV registra sólo el tramo reciente.
- `347..382`: sus relaciones, columnas, constraints e índices están presentes
  en PROD y DEV. No deben reaplicarse a ciegas: el contraste de catálogos del
  2026-08-07 encontró deriva previa en 13 definiciones de funciones y dos
  políticas ajenas al cierre contable, que requiere reconciliación separada.
- `383..394`: aplicadas y registradas en DEV y PROD. La promoción productiva del
  2026-08-07 tuvo preflight satisfactorio, respaldo PostgreSQL 17 verificable,
  ensayo transaccional con `ROLLBACK` y aplicación oficial sin seeds ni roles.
- Antes de aplicar migraciones, comprobar que no existan prefijos duplicados.
- Las migraciones son la fuente de verdad; los inventarios forenses son evidencia
  auxiliar y viven en `artifacts/db-forensics/`.

Cambios recientes principales:

- `347..352`: inventario single-ledger, almacén de caja POS y writers únicos.
- `353`: alineación de clientes y CxC.
- `354` y `357`: secuencia fiscal única y resincronización de contadores.
- `355`: permisos ADMIN normales separados de ADMIN demo.
- `356` y `358`: IGV según afectación tributaria en CPE, ventas y POS.
- `359..360`: tipificación e integridad de medios de pago.
- `361`: depósitos semestrales de CTS.
- `362`: segregación de aprobación de compras configurable por tenant.
- `363`: localización Argentina, catálogos ARCA/IVA, configuración WSAA/WSFE y
  demos PE/AR contextualizadas.
- `364`: normativa laboral argentina versionada, configuración RRHH por tenant,
  CUIL/CCT/categoría/modalidad/obra social/ART, moneda de planilla y readiness
  legal-operativo.
- `365`: activación integral de Colombia, parámetros RRHH 2026, configuración
  PILA/nómina electrónica, catálogos DIAN y demo de tres países.
- `366`: tipos documentales RRHH por país y reparación de cédulas colombianas
  que habían sido normalizadas como `OTRO`.
- `367`: normativa laboral colombiana 2026 versionada (jornada, recargos, UVT y
  tope IBC).
- `368`: frontera demo→real colombiana: fixtures completos en demo, limpieza
  fail-closed de credenciales sintéticas al convertir y onboarding DIAN/PILA.
- `369`: QA demo Colombia: escala monetaria COP, catálogo PUC visible y
  equivalencias internas ocultas para los generadores contables históricos.
- `370..382`: fecha local por tenant, bases fiscales por afectación, kardex,
  conversión y prueba por transferencia, RBAC canónico e inventario/producto
  atómico.
- `383..388`: ciclo de vida del asiento, multi-moneda, plantillas recurrentes,
  activos fijos, conciliación de partidas, distribución analítica y diferidos.
- `389..392`: atomicidad e idempotencia de escrituras contables, conciliación,
  distribución, devengos, depreciaciones, bajas y transiciones de borrador.
- `393..394`: consolidación multiempresa con aceptación, tasas tipificadas,
  ajustes sin alterar libros, mapeo de cuentas y reportes configurables seguros.

## Flujos cerrados técnicamente

- Auth, sesión HttpOnly, RBAC, RLS y aislamiento tenant.
- Catálogos, clientes, proveedores y configuración empresarial.
- Ventas, cotizaciones, pedidos, POS, caja y pagos.
- CPE `01/03/07/08`, RA y RC en beta.
- Argentina: CUIT, ARS, IVA `0/10,5/21/27`, Facturas A/B/C/E/M y notas
  WSFEv1, punto de venta, CAE/QR y autenticación WSAA implementados.
- Colombia: NIT con dígito de verificación, COP, IVA 19 %, factura electrónica
  DIAN y documento soporte de pago de nómina configurables. La demo comprueba
  el WSDL oficial sin transmitir; la emisión real falla cerrado mientras no
  exista transporte SOAP WS-Security/XAdES homologado con credenciales reales.
- Compras, recepción, inventario, reservas, logística y kardex.
- Finanzas, CxC, CxP, bancos y conciliación. Contabilidad cubre las siete fases
  auditadas: ciclo de vida, multi-moneda, recurrentes, activos, partidas
  abiertas, analítica/diferidos y consolidación/reportes configurables.
- RRHH con despacho normativo por país: Perú conserva AFP/ONP, EsSalud, quinta
  categoría, gratificaciones, CTS y vacaciones; Argentina usa SIPA, INSSJP,
  obra social, contribuciones patronales, ART, SAC, vacaciones LCT,
  Ganancias configurable y liquidación final argentina; Colombia usa salud,
  pensión, ARL, caja de compensación, parafiscales, auxilio de transporte,
  horas extra/recargo nocturno, prima, cesantías, intereses, vacaciones,
  liquidación final y nómina electrónica.
- Tema dark/light, shell responsive, Analytics y navegación por roles.
- Offline desktop: SQLite local, outbox durable y caché por tenant.

“Cerrado técnicamente” significa que el código y las pruebas controladas pasan; no
reemplaza homologación legal, credenciales finales, hardware físico ni smoke
productivo autorizado.

## Decisiones e invariantes vigentes

- `producto_existencias` es la fuente física de stock por almacén.
- `aplicar_movimiento_inventario_tx` es el writer canónico de movimientos.
- POS deriva `almacen_id` de la caja de la sesión.
- Series fiscales `Bxxx/Fxxx` comparten una sola secuencia por tenant; `Txxx` es
  ticket interno.
- Recepciones y reservas usan RPC transaccionales e idempotentes.
- CPE y GRE fallan cerrado ante firma, credenciales o respuesta inválidas.
- El adaptador fiscal se resuelve por país: SUNAT para PE, ARCA WSAA/WSFEv1
  para AR y DIAN para CO; el modo demo colombiano es explícitamente simulado y
  el caché de contexto web incluye `tenant_id`.
- SUNAT producción exige que el certificado contenga el RUC esperado, salvo una
  excepción explícita y documentada.
- Web usa cookie HttpOnly; no se guardan JWT ni contraseñas en Web Storage.
- Tauri protege secretos locales con DPAPI y la outbox no guarda headers
  sensibles.
- El frontend usa Tailwind 3.4, shadcn/Radix y tokens semánticos.
- ADMIN de un tenant normal recibe permisos activos completos; un demo conserva
  restricciones sensibles.

## Pendientes reales

### Antes de PROD

- Reconciliar el historial consolidado de `003..382` y la deriva previa de 13
  funciones y dos políticas antes de usar un `db push --include-all` sobre todo
  el directorio. La contabilidad `383..394` ya está promovida.
- Confirmar que no existan colisiones históricas fiscales antes de resincronizar
  series.
- Completar secretos productivos y ejecutar smoke controlado.
- Confirmar que el PFX está autorizado para el RUC productivo o reemplazarlo.
- Configurar credenciales GRE REST si el contribuyente emitirá guías.
- Para un contribuyente argentino real, cargar su certificado X.509 autorizado,
  habilitar el punto de venta en ARCA y completar homologación antes de activar
  `arca_activo` o usar producción.
- Antes de liquidar nómina argentina real, confirmar por empleador el CCT,
  categoría, modalidad registral, obra social, ART y alícuota, sindicato,
  contribución patronal y parámetros de Ganancias/LSD/F.931. La demo usa datos
  sintéticos y no transmite declaraciones.
- Para una empresa colombiana real, configurar software, PIN, certificado,
  resolución/prefijo y set de pruebas DIAN, implementar/homologar el transporte
  SOAP WS-Security/XAdES y superar el set oficial antes de transmitir. En RRHH
  se deben confirmar EPS, fondo de pensiones, ARL y clase de riesgo, caja de
  compensación, exoneraciones, retenciones y operador PILA. PILA admite portal
  de operador o API privada HTTPS del operador; no se presupone una API pública
  universal. La demo no transmite nómina electrónica ni planillas PILA.
- Validar impresora física, `.exe` Tauri y carga final.

### Producto y riesgo residual

- Decidir si `modo_venta_rapida` tendrá comportamiento real o se retirará.
- Convertir la anulación fiscal completa en una única transacción; actualmente
  encadena mutaciones con validaciones previas.
- Resolver etiquetas de formulario ambiguas restantes sin codemod automático.
- Completar PLAME/T-Registro y validación legal externa antes de declararlos
  productivos.
- GRE SOAP beta continúa rechazando con `2112`; la ruta prevista es GRE REST.
- La paridad contable con Odoo 19 no es total: quedan fuera la sincronización
  bancaria automática y sus modelos de matching, importación masiva de mapeos
  de consolidación, multilibros, eliminaciones intercompañía automáticas,
  variantes/columnas/agrupaciones avanzadas del motor de reportes y métodos de
  activo no lineales con prorrata. Son ampliaciones de producto, no condiciones
  ocultas del alcance implementado.

## Jerarquía de verdad

1. Código y migraciones actuales verificados hasta `394` en DEV.
2. Este archivo.
3. El documento de dominio correspondiente.
4. Evidencia técnica versionada en `artifacts/`.
5. Historial de Git.
