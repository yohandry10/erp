# Módulos y flujos funcionales

Este documento describe responsabilidades y límites. Los DTO, endpoints y tablas
exactos se consultan en código, OpenAPI y migraciones.

## Ventas

Flujo principal:

```text
Cotización -> Pedido -> Reserva -> Despacho -> Documento/CPE -> Cobro -> Asiento
```

- Cotizaciones y pedidos calculan IGV según la afectación real del producto.
- La reserva de stock es transaccional e idempotente.
- Facturación genera documento, CPE, cuenta por cobrar cuando corresponde y
  trazabilidad contable.
- Notas de crédito y anulaciones restauran stock y registran reversos.
- RMA gestiona solicitud, ítems, eventos y devolución.

Código principal: `apps/erp-api/src/modules/ventas`,
`apps/erp-api/src/modules/documentos`, `apps/erp-api/src/modules/cpe`.

## POS y cajas

```text
Apertura -> Venta -> Pago -> Ticket/CPE -> Movimiento de caja -> Cierre
```

- La caja abierta determina sucursal y almacén.
- El ticket `Txxx` es interno; el comprobante fiscal usa serie `Bxxx/Fxxx`.
- Pagos mixtos sólo afectan la gaveta por la porción en efectivo.
- El cierre diferencia arqueo real de cierre administrativo.
- Consultar una sesión nunca debe cerrarla como efecto lateral.
- Reintentar una venta reutiliza identidad y correlativo reservados.

Código principal: `apps/erp-api/src/modules/pos`,
`apps/erp-api/src/modules/cajas`, `apps/web/app/dashboard/pos`.

## Fiscal: CPE, GRE y SIRE

- CPE construye UBL, firma, envía, consulta, almacena CDR y produce
  representación impresa.
- Factura, boleta, notas, RA y RC tienen soporte beta verificado.
- GRE usa transporte configurable y conserva estados asíncronos.
- SIRE genera una vista local de comparación por período para RVIE y RCE. La
  aceptación de la propuesta oficial usa la API SUNAT exclusivamente desde el
  backend, exige `sire_activo`, credenciales SOL/API y la referencia física de
  PROD; DEV y empresas demo fallan cerrado aunque contengan credenciales.
- Recibir `numTicket` deja el reporte en `PENDIENTE`; no se informa como
  aceptado hasta que la consulta oficial devuelve el código `06` (`Terminado`).
  Cada aceptación y consulta queda en `sire_operaciones` sin tokens ni secretos.
  La generación final del registro continúa en SUNAT Operaciones en Línea.
- Todo flujo fiscal falla cerrado ante credenciales, certificado, firma o
  respuesta inválidos.

Código principal: `apps/erp-api/src/modules/cpe`,
`apps/erp-api/src/modules/gre`, `apps/erp-api/src/modules/sire`,
`apps/erp-api/src/modules/ose`.

## Compras

```text
Cotización -> Aprobación -> Orden de compra -> Recepción -> CxP -> Pago
```

- Órdenes y recepciones conservan cantidades pedidas, recibidas y pendientes.
- Cerrar una recepción actualiza inventario y CxP en una operación
  transaccional.
- Devoluciones al proveedor revierten existencia y obligación según estado.
- Aprobaciones respetan tenant, rol, monto y estado.

Código principal: `apps/erp-api/src/modules/compras`.

## Inventario y logística

- El saldo físico vive en `producto_existencias`.
- Los movimientos conservan almacén, producto, cantidad, costo, referencia e
  idempotencia.
- Reservar no descuenta físico; despachar/facturar aplica el movimiento
  autoritativo.
- Ajustes, transferencias, recepciones y POS usan el mismo writer.
- Picking, packing, despacho, backorders y GRE mantienen referencia al pedido.
- Stock inicial exige `almacen_id` válido.

Código principal: `apps/erp-api/src/modules/inventario`,
`apps/erp-api/src/modules/logistica`.

## Finanzas y tesorería

- CxC y CxP gestionan saldo, vencimiento, pagos y estados.
- El rol CONTADOR puede consultar proveedores para filtrar CxP, pero no recibe
  por ello permisos de alta, edición, recepción ni pago. Las listas CxC/CxP
  exportan CSV real y neutralizan fórmulas de hoja de cálculo.
- Tesorería cubre cajas, bancos, movimientos y conciliaciones.
- Cobranzas y pagos por lote requieren referencias idempotentes.
- Retenciones y detracciones respetan configuración fiscal del tenant.
- Los dashboards financieros consumen agregados; no reconstruyen reglas
  contables en frontend.
- La ruta raíz de Finanzas funciona como centro operativo y enlaza CxC, CxP,
  bancos, tesorería, conciliación y reportes; no debe renderizar una superficie
  vacía ni depender de una redirección cliente.

Código principal: `apps/erp-api/src/modules/finanzas`,
`apps/erp-api/src/modules/cajas`.

## Contabilidad

- Plan de cuentas, períodos, centros de costo y presupuestos son catálogos
  tenant-scoped.
- Si una operación alcanza un mes todavía no configurado, el backend crea de
  forma idempotente el período `ABIERTO`; nunca permite el movimiento bajo un
  estado abierto meramente implícito e invisible para el contador.
- Asientos se originan en eventos de ventas, compras, POS, caja, RRHH y activos.
- Debe/haber debe cuadrar y el período debe permitir la operación.
- Libros, estados financieros y materialized views son proyecciones.
- El Balance de Comprobación y el Balance General son estados a fecha de cierre:
  conservan el último saldo de cuentas sin movimiento en el mes y respetan la
  naturaleza deudora o acreedora. La pantalla de estados incluye comprobación,
  resultados, situación financiera, flujo de efectivo indirecto e indicadores;
  estos dos últimos explicitan sus supuestos y no se presentan como EBITDA
  auditado ni como sustituto de conciliación bancaria.
- La descarga PLE de Diario y Mayor filtra exclusivamente asientos
  `CONFIRMADO`. El Balance de Comprobación electrónico es el formato SUNAT 3.17
  (`031700`), con período `AAAAMMDD` al cierre y 19 campos posicionales; el
  formato 3.1 pertenece al Estado de Situación Financiera y no se usa para este
  reporte. Los TXT son insumos para PVS: el ERP no los presenta ni sustituye la
  validación oficial.
- En el Registro de Compras 8.1, las notas de crédito invierten base, IGV y
  total, conservan la referencia SUNAT del comprobante modificado y una compra
  en moneda extranjera se rechaza si no tiene tipo de cambio de origen; nunca se
  inventa 1.000 para USD u otra divisa.
- El asiento manual nace en `BORRADOR` o `CONFIRMADO`; un confirmado es
  inmutable y se corrige mediante un contra-asiento enlazado, nunca reescribiendo
  silenciosamente el original.
- Cabecera y detalle de asientos, confirmación, reversión, conciliación,
  distribución analítica, devengos, depreciaciones y bajas usan operaciones
  atómicas; sus barreras de idempotencia también viven en la base.
- Multi-moneda conserva importe de origen y cotización, revalúa saldos abiertos
  y reconoce diferencias realizadas en pagos sin duplicar el asiento.
- Plantillas recurrentes generan una sola instancia por período. Activos fijos
  conservan cronograma, depreciación, valor residual y baja. Las partidas de
  terceros pueden conciliarse total o parcialmente y deshacerse sin alterar el
  asiento.
- La distribución analítica reparte una línea por varios ejes independientes.
  Ingresos y gastos diferidos se reconocen por período y la última cuota absorbe
  residuos de redondeo.
- El detalle del asiento permite registrar y mantener esa distribución
  analítica por línea. El registro de consignaciones calcula el total en el
  servidor, toma el tenant del contexto autenticado y limita sus cambios a
  estados válidos; el cliente no puede imponer tenant, total ni estado inicial.
- Consolidación agrupa empresas legalmente separadas solo después de que cada
  miembro acepta la invitación. Homologa códigos de cuenta, exige tasas de
  cierre/promedio/históricas cuando cambia la moneda y aplica eliminaciones o
  reclasificaciones en una capa de reporte que no toca los libros legales.
- Los reportes configurables admiten líneas por prefijos de cuentas y fórmulas
  entre líneas, con alcance de período o acumulado. Las fórmulas son estructuras
  validadas con detección de ciclos; nunca SQL suministrado por el usuario.
- `Contabilidad > Impuestos Perú` prepara el borrador mensual de IGV y renta
  para NRUS, RER, RMT y Régimen General. Ventas salen de CPE, compras de CxP y
  los créditos manuales quedan en una versión con corte y conteos de origen.
- El cálculo aplica IGV, saldos, retenciones y percepciones; NRUS categoriza las
  cuotas S/ 20 y S/ 50, RER calcula 1,5 %, RMT usa 1 % hasta 300 UIT y luego el
  mayor entre coeficiente y 1,5 %, y General usa el mayor entre coeficiente y
  1,5 %. El parámetro 2026 usa UIT S/ 5.500.
- Este espacio no presenta FV 621 ni FV 1611. El contador contrasta contra
  RVIE/RCE, presenta en SUNAT y registra la constancia externa; cada corrección
  crea otra versión y conserva el historial.
- `Contabilidad > Renta anual e ITAN` toma el resultado y los activos del cierre
  contable y prepara la conciliación del FV 710 para Régimen General/RMT. General
  aplica 29,5 %; RMT aplica 10 % hasta 15 UIT y 29,5 % al exceso. Selecciona el
  formulario Completo al superar 1.700 UIT y calcula ITAN al 0,4 % sobre el
  exceso de activos netos ajustados sobre S/ 1.000.000.
- Adiciones, deducciones, pérdidas, créditos y exclusiones ITAN son entradas
  explícitas con papel de trabajo. Un ejercicio abierto o balance descuadrado
  bloquea registrar la constancia. El ERP no presenta FV 710 ni ITAN.

Código principal: `apps/erp-api/src/modules/contabilidad`.

## Recursos humanos

- Empleados, contratos, asistencia, vacaciones y conceptos alimentan planillas.
- El país del tenant selecciona el motor normativo; no se mezclan reglas entre
  Perú, Argentina y Colombia.
- Perú calcula AFP/ONP, EsSalud, quinta categoría, gratificaciones, CTS,
  vacaciones y liquidación peruana con sus topes y libros idempotentes.
- La configuración laboral Perú expone la normativa efectiva del período
  (UIT, RMV, asignación familiar, AFP/ONP, EsSalud, horas y sobretasas). Los
  contratos AFP conservan administradora, esquema de comisión y tasas
  individuales; la planilla usa esos valores y recurre a la normativa vigente
  sólo como respaldo.
- Argentina valida CUIL y configuración contractual (CCT, categoría, modalidad,
  obra social, sindicato y ART); calcula SIPA, INSSJP, obra social,
  contribuciones patronales, ART, horas extra 50/100, SAC, vacaciones con
  divisor 25 y liquidación final bajo parámetros argentinos versionados.
- Ganancias argentina no se inventa en la interfaz: se recibe como retención
  parametrizada/SiRADIG. LSD y F.931 forman parte del readiness del tenant.
- `RRHH > PLAME / T-Registro` valida cada planilla peruana calculada contra RUC,
  identidad, contrato y códigos paramétricos de la ficha SUNAT. Si falta un dato
  obligatorio muestra un bloqueo y no genera archivos que aparenten estar
  listos para PVS.
- Una versión sin bloqueos contiene papeles de trabajo PLAME y fuentes
  `RP_<RUC>.ide`, `.tra`, `.per` y `.est` para las estructuras 04, 05, 11 y 17,
  con delimitador final y huella SHA-256. El ZIP del ERP no es el ZIP de carga:
  PVS valida las fuentes y produce el ZIP que el usuario carga en SOL.
- Los papeles de trabajo incluyen quinta categoría y recibos por honorarios de
  cuarta categoría. La jornada ordinaria procede de asistencia real o de una
  corrección manual explícita y auditable; si falta, el paquete queda bloqueado.
- Cada trabajador conserva la huella de la última fuente asociada a un CIR. Si
  no cambió, no se repite como alta/modificación; si cambia la identidad, ficha
  o contrato, reaparece automáticamente como novedad pendiente de PVS.
- La constancia PLAME y el ticket/CIR de T-Registro son evidencias distintas. El
  estado sólo pasa a presentado con constancia PLAME real y, si existen
  novedades registrales, con ticket y CIR reales de T-Registro. Las
  rectificatorias preservan versiones y no reescriben evidencia histórica.
- Colombia valida CC/TI/NIT y la configuración de EPS, pensión, ARL, clase de
  riesgo, caja de compensación y exoneraciones; calcula salud y pensión del
  trabajador, aportes patronales, parafiscales, auxilio de transporte,
  horas extra/recargo nocturno, prima, cesantías e intereses, vacaciones y
  liquidación final con parámetros versionados por vigencia. Para la vigencia
  2026 aplica SMMLV 1.750.905, auxilio 249.095, UVT 52.374, tope IBC 25 SMMLV,
  jornada máxima de 42 horas/divisor mensual 210 desde julio, jornada nocturna
  desde las 19:00 y recargo dominical/festivo de 90 % desde julio.
- PLAME/T-Registro (PE) requiere ejecutar PVS/SOL con datos reales; la
  Simplificación Registral/LSD/F.931 (AR) y PILA/nómina electrónica (CO) reales
  requieren credenciales, datos patronales y validación legal-operativa externa.
- Colombia expone configuración y prueba de integración PILA por tenant. En
  demo la prueba es local y marcada como simulada; en una cuenta real se elige
  portal del operador o API privada HTTPS, se cifran token y PIN, y se bloquean
  destinos locales/privados para evitar SSRF. No se simula una API PILA pública.

Código principal: `apps/erp-api/src/modules/rrhh`.

## Administración, auth y configuración

- Tenants, usuarios, roles y permisos determinan acceso.
- Países operativos: Perú, Argentina y Colombia. El selector inicial y la demo
  crean el tenant con su país, moneda, impuesto, autoridad fiscal, documentos y
  opciones de módulos; el contexto se vuelve a resolver desde el tenant.
- La configuración fiscal SUNAT/OSE (PE), ARCA WSAA/WSFE (AR) o DIAN (CO) es
  por tenant y cifra secretos; GRE y SIRE sólo están disponibles para Perú.
  SIRE comparte las credenciales API SUNAT cifradas con GRE REST, pero su
  activación y su frontera de ejecución son independientes.
- La demo Perú se crea en PEN, con IGV, RUC/DNI, series F001/B001/T001,
  SUNAT/OSE simulado, GRE/SIRE y flujo logístico habilitado. El PCGE inicial se
  inserta por código sin duplicar cuentas ya existentes.
- La conversión de demo a cuenta real exige que el cliente defina y confirme
  un correo de acceso y una contraseña permanente antes de elegir si conserva
  o reinicia sus datos. La activación sustituye atómicamente las credenciales
  temporales; sólo persiste el hash de la contraseña y el login posterior usa
  esas mismas credenciales. El asistente fiscal se ejecuta después de autenticar
  y no crea una identidad paralela. La ruta de conversión exige sesión válida,
  falla cerrada si no puede comprobar el tenant y devuelve al dashboard a una
  cuenta que ya fue convertida, evitando ofrecer una segunda conversión.
- La demo Colombia crea datos sintéticos en COP, NIT/CC y configuración DIAN,
  PILA y nómina electrónica simuladas, incluido un contrato colombiano con
  salario válido para ejercitar el cálculo completo. La transmisión real
  permanece bloqueada hasta completar credenciales, certificado, resolución y
  homologación.
- La prueba DIAN consulta únicamente el WSDL oficial y registra si el transporte
  es accesible, si detectó el servicio y si hubo transmisión (siempre `false` en
  demo). Al convertir una demo colombiana, una RPC de servicio elimina todos los
  secretos y afiliaciones sintéticos antes de marcarla como real. El envío de
  documentos permanece fail-closed hasta disponer de SOAP WS-Security/XAdES
  homologado; nunca se interpreta una respuesta JSON ficticia como aceptación.
- ADMIN normal y ADMIN demo tienen contratos de permisos distintos.
- Las pruebas gratuitas viven en PROD con política explícita y datos aislados;
  no habilitan transmisiones fiscales reales. DEV está retirado y bloqueado.

Código principal: `apps/erp-api/src/modules/auth`,
`apps/erp-api/src/modules/tenants`, `apps/erp-api/src/modules/configuracion`.

## Analytics, reportes y auditoría

- Analytics consume métricas tenant-scoped.
- Reportes exportan sin duplicar reglas de negocio.
- Auditoría registra actor, tenant, acción, entidad, resultado y correlación.
- Métricas, logs y notificaciones no contienen secretos.

## Reglas transversales

- Dinero usa precisión decimal y redondeo explícito.
- Fechas de negocio no se interpretan como UTC si representan día local.
- Estados se normalizan y validan en los límites.
- Toda escritura sensible requiere tenant, autorización e idempotencia.
- Un cambio de flujo debe actualizar pruebas y este documento si altera el
  contrato funcional.
