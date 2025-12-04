Database Tables
cpe
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
tipo_documento

No description

character varying	varchar		
serie

No description

character varying	varchar		
numero

No description

integer	int4		
ruc_emisor

No description

character varying	varchar		
razon_social_emisor

No description

character varying	varchar		
tipo_documento_receptor

No description

character varying	varchar		
documento_receptor

No description

character varying	varchar		
razon_social_receptor

No description

character varying	varchar		
direccion_receptor

No description

text	text		
moneda

No description

character varying	varchar		
total_gravadas

No description

numeric	numeric		
total_igv

No description

numeric	numeric		
total_venta

No description

numeric	numeric		
estado

No description

character varying	varchar		
hash

No description

character varying	varchar		
xml_firmado

No description

text	text		
cdr_sunat

No description

text	text		
error_message

No description

text	text		
items

No description

jsonb	jsonb		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
retry_count

Número de reintentos realizados para envío a SUNAT

integer	int4		
next_retry_at

Fecha y hora del siguiente reintento programado (backoff exponencial)

timestamp with time zone	timestamptz		
idempotency_key

Identificador idempotente por tenant para evitar emisión duplicada del comprobante

character varying	varchar		
sunat_status

Estado endurecido del workflow con SUNAT: NOT_SENT, READY, SENDING, ACCEPTED, REJECTED, ERROR

character varying	varchar		
hash_firma

Hash SHA-256 de la firma digital del XML enviado a SUNAT

text	text		
event_id

Identificador del evento FacturaEmitidaEvent asociado al comprobante

uuid	uuid		
fecha_emision

Fecha de emisión declarada ante SUNAT

date	date		
fecha_vencimiento

Fecha de vencimiento para cobranza del comprobante

date	date		
documento_id

UUID del documento fiscal. Conecta el CPE con el documento en la tabla documentos

uuid	uuid		
 Database Tables
vw_cpe_documentos_auditoria
Filter columns
Name	Description	Data Type	Format	Nullable	
cpe_id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
tipo_documento

No description

character varying	varchar		
serie

No description

character varying	varchar		
numero

No description

integer	int4		
cpe_cliente

No description

character varying	varchar		
cpe_total

No description

numeric	numeric		
cpe_estado

No description

character varying	varchar		
cpe_created_at

No description

timestamp with time zone	timestamptz		
documento_existe

No description

uuid	uuid		
documento_created_at

No description

timestamp with time zone	timestamptz		
estado_integridad

No description

text	text		
Database Tables
documentos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
tipo_documento

FACTURA, BOLETA, NOTA_CREDITO, NOTA_DEBITO, GUIA_REMISION, CONTRATO

character varying	varchar		
serie

No description

character varying	varchar		
numero

No description

character varying	varchar		
fecha_emision

No description

timestamp with time zone	timestamptz		
fecha_vencimiento

No description

date	date		
emisor_ruc

No description

character varying	varchar		
emisor_razon_social

No description

text	text		
emisor_nombre_comercial

No description

text	text		
emisor_direccion

No description

text	text		
emisor_ubigeo

No description

character varying	varchar		
emisor_departamento

No description

character varying	varchar		
emisor_provincia

No description

character varying	varchar		
emisor_distrito

No description

character varying	varchar		
emisor_telefono

No description

character varying	varchar		
emisor_email

No description

character varying	varchar		
receptor_tipo_doc

No description

character varying	varchar		
receptor_numero_doc

No description

character varying	varchar		
receptor_razon_social

No description

text	text		
receptor_nombre_comercial

No description

text	text		
receptor_direccion

No description

text	text		
receptor_ubigeo

No description

character varying	varchar		
receptor_departamento

No description

character varying	varchar		
receptor_provincia

No description

character varying	varchar		
receptor_distrito

No description

character varying	varchar		
receptor_telefono

No description

character varying	varchar		
receptor_email

No description

character varying	varchar		
moneda

No description

character varying	varchar		
tipo_cambio

No description

numeric	numeric		
subtotal

No description

numeric	numeric		
descuento_global

No description

numeric	numeric		
descuento_porcentaje

No description

numeric	numeric		
impuesto_igv

No description

numeric	numeric		
impuesto_isc

No description

numeric	numeric		
impuesto_icbper

No description

numeric	numeric		
otros_impuestos

No description

numeric	numeric		
total_impuestos

No description

numeric	numeric		
total

No description

numeric	numeric		
total_letras

No description

text	text		
estado

BORRADOR, EMITIDO, ENVIADO_SUNAT, ACEPTADO, RECHAZADO, ANULADO

character varying	varchar		
estado_sunat

No description

character varying	varchar		
xml_content

No description

text	text		
codigo_hash

Hash SHA-256 para validación de integridad del documento

character varying	varchar		
firma_digital

No description

text	text		
cdr_content

Constancia de Recepción de SUNAT en formato XML

text	text		
cdr_nota

No description

text	text		
ticket_sunat

No description

character varying	varchar		
fecha_envio_sunat

No description

timestamp with time zone	timestamptz		
fecha_respuesta_sunat

No description

timestamp with time zone	timestamptz		
documento_referencia_id

No description

uuid	uuid		
documento_referencia_serie

No description

character varying	varchar		
documento_referencia_numero

No description

character varying	varchar		
documento_referencia_tipo

No description

character varying	varchar		
motivo_nota

No description

text	text		
motivo_anulacion

No description

text	text		
fecha_anulacion

No description

timestamp with time zone	timestamptz		
usuario_anulacion

No description

uuid	uuid		
condiciones_pago

No description

character varying	varchar		
forma_pago

No description

character varying	varchar		
cuenta_bancaria_destino

No description

character varying	varchar		
observaciones

No description

text	text		
nota_interna

No description

text	text		
terminos_condiciones

No description

text	text		
cliente_id

No description

uuid	uuid		
cotizacion_id

No description

uuid	uuid		
orden_compra_id

No description

uuid	uuid		
vendedor_id

No description

uuid	uuid		
cpe_id

No description

uuid	uuid		
asiento_contable_id

No description

uuid	uuid		
cuenta_cobrar_id

No description

uuid	uuid		
afecta_contabilidad

No description

boolean	bool		
pdf_url

No description

text	text		
xml_url

No description

text	text		
cdr_url

No description

text	text		
created_by

No description

uuid	uuid		
updated_by

No description

uuid	uuid		
approved_by

No description

uuid	uuid		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
pedido_id

UUID del pedido de venta origen. Permite rastrear qué pedido generó este documento

uuid	uuid		
 Database Tables
documento_detalles
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
documento_id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
orden

No description

integer	int4		
producto_id

No description

uuid	uuid		
codigo_producto

No description

character varying	varchar		
codigo_sunat

No description

character varying	varchar		
descripcion

No description

text	text		
descripcion_adicional

No description

text	text		
unidad_medida

No description

character varying	varchar		
unidad_medida_descripcion

No description

character varying	varchar		
cantidad

No description

numeric	numeric		
cantidad_devuelta

No description

numeric	numeric		
precio_unitario

No description

numeric	numeric		
precio_unitario_con_igv

No description

numeric	numeric		
descuento_unitario

No description

numeric	numeric		
descuento_porcentaje

No description

numeric	numeric		
valor_unitario

No description

numeric	numeric		
valor_venta

No description

numeric	numeric		
tipo_afectacion_igv

10=Gravado, 20=Exonerado, 30=Inafecto

character varying	varchar		
porcentaje_igv

No description

numeric	numeric		
impuesto_igv

No description

numeric	numeric		
impuesto_isc

No description

numeric	numeric		
impuesto_icbper

No description

numeric	numeric		
total_item

No description

numeric	numeric		
lote

No description

character varying	varchar		
fecha_vencimiento

No description

date	date		
numero_serie

No description

character varying	varchar		
fecha_inicio_servicio

No description

date	date		
fecha_fin_servicio

No description

date	date		
created_at

No description

timestamp with time zone	timestamptz		



*COMPROBANTE ELECTRONICO NO EXISTE. 

Database Tables
empresa_config
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
tipo_contribuyente

No description

character varying	varchar		
regimen_tributario

GENERAL, MYPE, RER, RUS

character varying	varchar		
certificado_pfx

No description

bytea	bytea		
certificado_password

No description

character varying	varchar		
certificado_vigencia

No description

date	date		
ose_url

No description

character varying	varchar		
ose_username

No description

character varying	varchar		
ose_password

No description

character varying	varchar		
ose_activo

No description

boolean	bool		
serie_factura

No description

character varying	varchar		
serie_boleta

No description

character varying	varchar		
serie_nota_credito

No description

character varying	varchar		
serie_nota_debito

No description

character varying	varchar		
serie_guia_remision

No description

character varying	varchar		
ultimo_numero_factura

No description

integer	int4		
ultimo_numero_boleta

No description

integer	int4		
ultimo_numero_nota_credito

No description

integer	int4		
ultimo_numero_nota_debito

No description

integer	int4		
ultimo_numero_guia_remision

No description

integer	int4		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
razon_social

Razón social de la empresa

character varying	varchar		
ruc

RUC de la empresa

character varying	varchar		
direccion_fiscal

Dirección fiscal de la empresa

text	text		
telefono

Teléfono de contacto de la empresa

character varying	varchar		
email

Email de contacto de la empresa

character varying	varchar		
sitio_web

Sitio web de la empresa

character varying	varchar		
representante_legal

Representante legal de la empresa

character varying	varchar		
igv_porcentaje

Porcentaje de IGV (18% en Perú)

numeric	numeric		
retencion_renta_porcentaje

Porcentaje de retención de renta aplicado

numeric	numeric		
pais_id

No description

integer	int4		
nombre_comercial

No description

character varying	varchar		
ubigeo

No description

character varying	varchar		
departamento

No description

character varying	varchar		
provincia

No description

character varying	varchar		
distrito

No description

character varying	varchar		
dni_representante

No description

character varying	varchar		
actividad_economica

No description

text	text		
percepcion_porcentaje

No description

numeric	numeric		
detraccion_porcentaje

No description

numeric	numeric		
moneda_defecto

No description

character varying	varchar		
redondeo_decimales

No description

integer	int4		
incluir_igv_en_precio

No description

boolean	bool		
envio_automatico_sunat

No description

boolean	bool		
generar_pdf_automatico

No description

boolean	bool		
enviar_email_cliente

No description

boolean	bool		
validar_ruc_sunat

No description

boolean	bool		
usar_codigos_barra

No description

boolean	bool		
formato_numeros

No description

character varying	varchar		
logo_url

URL o base64 del logo de la empresa para impresión en facturas, boletas y tickets (multi-tenant)

text	text		
logo_base64

No description

text	text		
color_primario

No description

character varying	varchar		
color_secundario

No description

character varying	varchar		
estado

Estado del tenant: ACTIVO, INACTIVO, SUSPENDIDO, PRUEBA

text	text		
fecha_inicio

Fecha de inicio del tenant

timestamp with time zone	timestamptz		
fecha_fin

Fecha de fin del tenant (si aplica)

timestamp with time zone	timestamptz		
plan

Plan de suscripción del tenant

text	text		
pais

Código de país (ISO 3166-1 alpha-2)

text	text		
configuracion_completa

Indicates if the tenant has completed all required configuration

boolean	bool		
fecha_validacion_certificado

No description

timestamp without time zone	timestamp		
certificado_expira_en

No description

date	date		
umbral_gre_automatico

Monto en soles a partir del cual se sugiere generar GRE automáticamente (default: S/ 700)

numeric	numeric		
gre_automatico_habilitado

Si true, sugiere GRE automáticamente cuando se supera el umbral

boolean	bool		
ultima_validacion

No description

timestamp without time zone	timestamp		
errores_configuracion

No description

jsonb	jsonb		
tipo_empresa

Tipo de empresa: MICRO, PEQUEÑA, MEDIANA o GRANDE. Determina configuración por defecto

character varying	varchar		
usar_flujo_logistica

Si true, usa flujo completo con preparación y despacho. Si false, flujo simplificado directo a facturación

boolean	bool		
gre_obligatorio

Si true, exige GRE para todas las ventas. Si false, es opcional

boolean	bool		
monto_maximo_sin_aprobacion

No description

numeric	numeric		
porcentaje_descuento_maximo

No description

numeric	numeric		
requiere_aprobacion_descuento

No description

boolean	bool		
aplicar_limite_credito

No description

boolean	bool		
dias_gracia_morosidad

No description

integer	int4		
dias_vencimiento_factura

No description

integer	int4		
aplicar_retencion

No description

boolean	bool		
retencion_tasa

No description

numeric	numeric		
aplicar_percepcion

No description

boolean	bool		
percepcion_tasa

No description

numeric	numeric		
aplicar_detraccion

No description

boolean	bool		
detraccion_tasa

No description

numeric	numeric		
detraccion_codigo

No description

text	text		
habilitar_rma

Si true, habilita el flujo de devoluciones (RMA) con retorno físico a inventario.

boolean	bool		
dias_maximos_rma

Cantidad máxima de días desde la venta para aceptar una solicitud RMA.

integer	int4		
rma_requiere_control_calidad

Si true, requiere control de calidad antes de reincorporar stock devuelto.

boolean	bool		
habilitar_multialmacen

Si true, habilita la gestión de múltiples almacenes por tenant.

boolean	bool		
requiere_ubicaciones_inventario

Si true, exige registrar ubicaciones/pasillos en los almacenes.

boolean	bool		
requiere_lotes_series

Si true, exige control de lotes/series y compatibilidad FEFO.

boolean	bool		
politica_rotacion_inventario

Política de rotación aplicada al despacho de inventario (FIFO o FEFO).

character varying	varchar		
habilitar_dashboards_sunat

Si true, expone dashboards multi-tenant con KPIs de cumplimiento SUNAT.

boolean	bool		
habilitar_dashboards_otif

Si true, habilita paneles OTIF (On-Time, In-Full) para monitorear entregas.

boolean	bool		
objetivo_otif

Porcentaje objetivo OTIF definido por el tenant.

numeric	numeric		
frecuencia_actualizacion_dashboards

Frecuencia (en minutos) para actualizar datasets de dashboards SUNAT/OTIF.

integer	int4		
monto_aprobacion_compras

Monto mínimo (en moneda local) que requiere aprobación para órdenes de compra. Si el total de la OC excede este monto, el estado inicial será APROBACION. Si es 0 o NULL, no se requiere aprobación.

numeric	numeric		
generar_cxp_en

No description

character varying	varchar		
pfx_encrypted

Certificado PFX cifrado con AES-256-GCM (base64)

text	text		
pfx_password_encrypted

Contraseña del PFX cifrada con AES-256-GCM (base64)

text	text		
is_demo

No description

boolean	bool		
demo_expires_at

No description

timestamp with time zone	timestamptz		
demo_created_at

No description

timestamp with time zone	timestamptz		
demo_extended

No description

boolean	bool		
demo_conversion_attempted

No description

boolean	bool		
demo_seed_version

No description

character varying	varchar		
demo_seed_completed_at

No description

timestamp with time zone	timestamptz		
Database Tables
configuracion_fiscal
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

integer	int4		
pais_id

No description

integer	int4		
impuesto_principal_nombre

Nombre del impuesto principal (IGV para Perú, IVA para Colombia)

character varying	varchar		
impuesto_principal_porcentaje

No description

numeric	numeric		
retencion_renta_porcentaje

No description

numeric	numeric		
retencion_iva_porcentaje

No description

numeric	numeric		
documento_identidad_empresa

No description

character varying	varchar		
longitud_documento_empresa

No description

integer	int4		
requiere_libro_diario

No description

boolean	bool		
requiere_libro_mayor

No description

boolean	bool		
requiere_libro_inventarios

No description

boolean	bool		
requiere_libro_compras

No description

boolean	bool		
requiere_libro_ventas

No description

boolean	bool		
requiere_kardex_valorizado

No description

boolean	bool		
requiere_libro_mayor_balances

DIAN Colombia requiere Libro Mayor y Balances consolidado

boolean	bool		
requiere_libros_societarios

DIAN Colombia requiere Libro de Actas y Registro de Socios

boolean	bool		
formato_fecha

No description

character varying	varchar		
separador_decimal

No description

character varying	varchar		
separador_miles

No description

character varying	varchar		
url_webservice_principal

No description

text	text		
url_webservice_secundario

No description

text	text		
activo

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
max_items_por_documento

Máximo de items permitidos por documento (999 SUNAT, 1000 DIAN)

integer	int4		
monto_maximo_documento

Monto máximo permitido por documento según autoridad fiscal

numeric	numeric		
Database Tables
configuracion_caja
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
monto_apertura_min

Monto mínimo permitido para apertura de caja. Montos menores requieren autorización de supervisor.

numeric	numeric		
monto_apertura_max

Monto máximo permitido para apertura de caja. Montos mayores requieren autorización de supervisor.

numeric	numeric		
retiro_max_sin_autorizacion

No description

numeric	numeric		
saldo_minimo_operativo

No description

numeric	numeric		
tolerancia_diferencia_cierre

Diferencia máxima permitida entre efectivo contado y esperado al cierre sin requerir autorización.

numeric	numeric		
retencion_auditoria_dias

Días de retención de registros de auditoría (default: 7 años)

integer	int4		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
caja_id

NULL = configuración por defecto para todas las cajas del tenant. UUID = configuración específica para una caja.

uuid	uuid		
requiere_supervisor_fuera_rango

No description

boolean	bool		
Database Tables
configuracion_retenciones
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tipo_retencion

No description

character varying	varchar		
descripcion

No description

character varying	varchar		
tasa_minima

No description

numeric	numeric		
tasa_maxima

No description

numeric	numeric		
monto_minimo

No description

numeric	numeric		
activo

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
tenant_id

ID del tenant para aislamiento multi-tenant

uuid	uuid		
Database Tables
fe_configuracion
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
ruc

No description

character varying	varchar		
razon_social

No description

text	text		
nombre_comercial

No description

text	text		
direccion_fiscal

No description

text	text		
ubigeo

No description

character varying	varchar		
departamento

No description

character varying	varchar		
provincia

No description

character varying	varchar		
distrito

No description

character varying	varchar		
urbanizacion

No description

character varying	varchar		
codigo_pais

No description

character varying	varchar		
telefono

No description

character varying	varchar		
email

No description

character varying	varchar		
web

No description

character varying	varchar		
representante_legal

No description

character varying	varchar		
dni_representante

No description

character varying	varchar		
regimen_tributario

No description

character varying	varchar		
tipo_contribuyente

No description

character varying	varchar		
certificado_digital_path

No description

text	text		
certificado_password

No description

text	text		
certificado_emisor

No description

character varying	varchar		
certificado_numero_serie

No description

character varying	varchar		
certificado_vigencia_desde

No description

date	date		
certificado_vigencia_hasta

No description

date	date		
certificado_activo

No description

boolean	bool		
ose_activo

No description

boolean	bool		
ose_proveedor

Proveedor OSE: SUNAT, PSE, NUBEFACT, etc.

character varying	varchar		
ose_url

No description

text	text		
ose_url_consulta

No description

text	text		
ose_username

No description

text	text		
ose_password

No description

text	text		
ose_token

No description

text	text		
ose_client_id

No description

text	text		
ose_client_secret

No description

text	text		
sunat_url_envio

No description

text	text		
sunat_url_consulta

No description

text	text		
sunat_modo

No description

character varying	varchar		
igv_porcentaje

No description

numeric	numeric		
percepcion_porcentaje

No description

numeric	numeric		
retencion_porcentaje

No description

numeric	numeric		
detraccion_porcentaje

No description

numeric	numeric		
logo_url

No description

text	text		
logo_base64

No description

text	text		
color_primario

No description

character varying	varchar		
color_secundario

No description

character varying	varchar		
incluir_leyenda

No description

boolean	bool		
leyenda_personalizada

No description

text	text		
pie_pagina

No description

text	text		
terminos_condiciones

No description

text	text		
envio_automatico_sunat

No description

boolean	bool		
generar_pdf_automatico

No description

boolean	bool		
enviar_email_automatico

No description

boolean	bool		
email_copia_oculta

No description

character varying	varchar		
reiniciar_numeracion_anual

No description

boolean	bool		
formato_fecha

No description

character varying	varchar		
formato_numero

No description

character varying	varchar		
configuracion_validada

No description

boolean	bool		
fecha_validacion

No description

timestamp with time zone	timestamptz		
errores_validacion

No description

jsonb	jsonb		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
 Database Tables
documento_series
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
tipo_documento

No description

character varying	varchar		
serie

No description

character varying	varchar		
correlativo_actual

No description

integer	int4		
correlativo_inicial

No description

integer	int4		
correlativo_maximo

No description

integer	int4		
prefijo

No description

character varying	varchar		
formato_numero

No description

character varying	varchar		
es_predeterminada

No description

boolean	bool		
permite_edicion

No description

boolean	bool		
requiere_autorizacion

No description

boolean	bool		
activo

No description

boolean	bool		
fecha_inicio

No description

date	date		
fecha_fin

No description

date	date		
punto_emision

No description

character varying	varchar		
sucursal_id

No description

uuid	uuid		
descripcion

No description

text	text		
created_by

No description

uuid	uuid		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		


si necesitas otra de coumentos aqui son todas Database Tables

schema

public


documento

New table
Name	Description	Rows (Estimated)	Size (Estimated)	Realtime Enabled	
	
documento_archivos

Archivos adjuntos de documentos (PDF, XML, CDR)	0	16 kB	
19 columns

	
documento_auditoria

Auditoría de todas las operaciones sobre documentos	27	32 kB	
13 columns

	
documento_detalles

Detalle de líneas/items de documentos	0	16 kB	
31 columns

	
documento_series

Series y numeración de documentos por tipo	1	80 kB	
21 columns

	
documentos

Tabla principal de gestión documental y facturación electrónica	27	192 kB	
81 columns

	
expediente_documentos

Documentos de expediente de empleados por tenant - RLS habilitado	0	24 kB	
11 columns

	
tipos_documentos_fiscales

Tipos de documentos fiscales disponibles por país	0	96 kB	
10 columns

	
v_documentos_completos

No description

-	-	
18 columns

	
v_documentos_pendientes_sunat

No description

-	-	
8 columns

	
vw_cpe_documentos_auditoria

No description  


Database Tables
gre_guias
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
numero

Número completo de la GRE (ej: T001-000001)

character varying	varchar		
serie

Serie de la GRE (ej: T001)

character varying	varchar		
correlativo

Número correlativo de la GRE

integer	int4		
destinatario

No description

character varying	varchar		
direccion_destino

No description

text	text		
fecha_traslado

No description

date	date		
modalidad

Modalidad de transporte: TRANSPORTE_PUBLICO o TRANSPORTE_PRIVADO

character varying	varchar		
motivo

Motivo del traslado: VENTA, COMPRA, etc.

character varying	varchar		
peso_total

Peso total en kilogramos

numeric	numeric		
observaciones

No description

text	text		
transportista

No description

character varying	varchar		
placa_vehiculo

No description

character varying	varchar		
licencia_conducir

No description

character varying	varchar		
estado

No description

character varying	varchar		
tenant_id

No description

uuid	uuid		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
numero_sunat

Número de comprobante asignado por SUNAT (cuando se implemente)

character varying	varchar		
hash_gre

Hash del XML firmado digitalmente

character varying	varchar		
xml_firmado

XML UBL generado y firmado (listo para SUNAT)

text	text		
cdr_sunat

Constancia de Recepción de SUNAT (cuando se active)

text	text		
error_message

Mensajes de error en validaciones

text	text		
cpe_relacionado

CPE que origina esta guía de remisión

uuid	uuid		
es_automatica

Indicates if this GRE was created automatically

boolean	bool		
venta_id

Reference to the sale that triggered automatic GRE creation

uuid	uuid		
movimiento_inventario_id

Reference to the inventory movement linked to this GRE

uuid	uuid		
motivo_creacion

No description

character varying	varchar		
retry_count

Número de reintentos realizados para envío a SUNAT

integer	int4		
next_retry_at

Fecha y hora del siguiente reintento programado (backoff exponencial)

timestamp with time zone	timestamptz		
idempotency_key

Identificador idempotente por tenant para emisión de GRE

character varying	varchar		
sunat_status

Estado endurecido de la integración SUNAT para la GRE

character varying	varchar		
event_id

Identificador del evento GREEmitida asociado

uuid	uuid		
gre_detalle NO EXISTE.  pedido_gres NO EXISTE. Database Tables
pedidos_venta
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
numero

No description

character varying	varchar		
cotizacion_id

No description

uuid	uuid		
cliente_id

No description

uuid	uuid		
fecha_pedido

No description

date	date		
estado

No description

character varying	varchar		
subtotal

No description

numeric	numeric		
igv

No description

numeric	numeric		
total

No description

numeric	numeric		
observaciones

No description

text	text		
factura_id

UUID del documento fiscal generado. Se actualiza cuando se genera la factura/boleta desde el pedido

uuid	uuid		
gre_id

No description

uuid	uuid		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
created_by

No description

uuid	uuid		
requiere_aprobacion

No description

boolean	bool		
motivo_requiere_aprobacion

No description

text	text		
aprobado_por

No description

uuid	uuid		
aprobado_en

No description

timestamp with time zone	timestamptz		
estado_credito

No description

text	text		
tracking_estado

No description

text	text		
tracking_actualizado_en

No description

timestamp with time zone	timestamptz		
tracking_notas

No description

text	text		
Database Tables
ventas
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
tipo_documento

No description

character varying	varchar		
serie

No description

character varying	varchar		
numero

No description

character varying	varchar		
fecha

No description

date	date		
fecha_vencimiento

No description

date	date		
cliente_id

No description

uuid	uuid		
cliente_razon_social

No description

text	text		
cliente_documento

No description

character varying	varchar		
cliente_direccion

No description

text	text		
cotizacion_id

No description

uuid	uuid		
vendedor_id

No description

uuid	uuid		
condiciones_pago

No description

character varying	varchar		
subtotal

No description

numeric	numeric		
descuento

No description

numeric	numeric		
igv

No description

numeric	numeric		
total

No description

numeric	numeric		
estado

No description

character varying	varchar		
estado_pago

No description

character varying	varchar		
monto_pagado

No description

numeric	numeric		
saldo_pendiente

No description

numeric	numeric		
observaciones

No description

text	text		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
 

 esto no es una tabla asi que no la veo en la bd Locks/RPC: app.acquire_job_lock/release_job_lock (si hay tablas de auditoría asociadas). 

 configuracion series no existe.

 Database Tables
paises
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

integer	int4		
codigo_iso

No description

character varying	varchar		
nombre

No description

character varying	varchar		
nombre_fiscal

No description

character varying	varchar		
moneda_codigo

No description

character varying	varchar		
moneda_simbolo

No description

character varying	varchar		
activo

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
 Database Tables
tipos_documentos_fiscales
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

integer	int4		
pais_id

No description

integer	int4		
codigo

No description

character varying	varchar		
nombre

No description

character varying	varchar		
descripcion

No description

text	text		
requiere_ruc

Indica si el documento requiere RUC/NIT del cliente

boolean	bool		
permite_exportacion

No description

boolean	bool		
activo

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
Database Tables
tipos_impuestos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

integer	int4		
pais_id

No description

integer	int4		
codigo

No description

character varying	varchar		
nombre

No description

character varying	varchar		
porcentaje

No description

numeric	numeric		
tipo_calculo

Tipo de cálculo: porcentaje o valor fijo

character varying	varchar		
aplica_a

No description

character varying	varchar		
activo

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
Database Tables
integration_logs
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
servicio

Name of the external service (SUNAT, GRE, etc.)

character varying	varchar		
operacion

Operation performed (enviar_factura, consultar_ruc, etc.)

character varying	varchar		
correlacion_id

ID of the related entity (pedido_id, factura_id, etc.)

uuid	uuid		
correlacion_tipo

Type of related entity (PEDIDO, FACTURA, etc.)

character varying	varchar		
request_summary

Summarized request data (sensitive data removed)

jsonb	jsonb		
response_summary

Summarized response data

jsonb	jsonb		
status

Status of the integration call

character varying	varchar		
status_code

No description

integer	int4		
error_message

No description

text	text		
duration_ms

Duration of the call in milliseconds

integer	int4		
timestamp

No description

timestamp with time zone	timestamptz		
metadata

No description

jsonb	jsonb		
Database Tables
outbox_events
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
event_id

No description

character varying	varchar		
correlation_id

No description

character varying	varchar		
aggregate_type

No description

character varying	varchar		
aggregate_id

No description

character varying	varchar		
event_type

No description

character varying	varchar		
event_data

No description

jsonb	jsonb		
event_version

No description

integer	int4		
created_at

No description

timestamp with time zone	timestamptz		
processed_at

No description

timestamp with time zone	timestamptz		
retry_count

No description

integer	int4		
status

No description

character varying	varchar		
error_message

No description

text	text		
tenant_id

No description

uuid	uuid		
max_retries

No description

integer	int4		
next_retry_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
Database Tables
ventas_pos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

bigint	int8		
numero_venta

No description

text	text		
fecha

No description

timestamp with time zone	timestamptz		
cliente_nombre

No description

text	text		
cliente_documento

No description

text	text		
subtotal

No description

numeric	numeric		
impuestos

No description

numeric	numeric		
total

No description

numeric	numeric		
metodo_pago

No description

text	text		
estado

No description

text	text		
caja_id

No description

text	text		
usuario_id

No description

text	text		
observaciones

No description

text	text		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
sesion_caja_id

No description

uuid	uuid		
cliente_id

No description

uuid	uuid		
descuentos

No description

numeric	numeric		
numero_ticket

No description

character varying	varchar		
vendedor

No description

character varying	varchar		
tenant_id

No description

uuid	uuid		
cpe_pendiente

Indica si la venta POS tiene facturación pendiente

boolean	bool		
intentos_facturacion

Número de intentos de facturación realizados

integer	int4		
ultimo_intento_facturacion

Fecha del último intento de facturación

timestamp with time zone	timestamptz		
error_facturacion

Mensaje de error del último intento de facturación

text	text		
cpe_data

Datos del CPE para reintentar facturación

jsonb	jsonb		
 Database Tables
detalle_ventas_pos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

bigint	int8		
venta_id

No description

bigint	int8		
codigo_producto

No description

text	text		
nombre_producto

No description

text	text		
cantidad

No description

numeric	numeric		
precio_unitario

No description

numeric	numeric		
descuento

No description

numeric	numeric		
total_parcial

No description

numeric	numeric		
created_at

No description

timestamp with time zone	timestamptz		
tenant_id

No description

uuid	uuid		
producto_id

FK al producto vendido

uuid	uuid		
 

 ventas_detalles NO EXISTE, EXISTE ES detalles_ventas_pos

 Database Tables
stock_movimientos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
producto_id

No description

uuid	uuid		
tipo_movimiento

No description

character varying	varchar		
cantidad

No description

numeric	numeric		
motivo

No description

character varying	varchar		
referencia

No description

character varying	varchar		
usuario_id

ID del usuario (VARCHAR sin foreign key)

character varying	varchar		
created_at

No description

timestamp with time zone	timestamptz		
Database Tables
movimientos_inventario
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
producto_id

No description

uuid	uuid		
tipo

No description

character varying	varchar		
cantidad

No description

numeric	numeric		
referencia_tipo

No description

character varying	varchar		
referencia_id

No description

uuid	uuid		
notas

No description

text	text		
created_at

No description

timestamp with time zone	timestamptz		
created_by

No description

uuid	uuid		
almacen_id

No description

uuid	uuid		
lote

No description

character varying	varchar		
fecha_expiracion

No description

date	date		
ubicacion_id

No description

uuid	uuid		
Database Tables
producto_existencias
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
producto_id

No description

uuid	uuid		
almacen_id

No description

uuid	uuid		
ubicacion_id

No description

uuid	uuid		
lote

No description

character varying	varchar		
fecha_expiracion

No description

date	date		
stock_actual

No description

numeric	numeric		
stock_reservado

No description

numeric	numeric		
stock_danado

No description

numeric	numeric		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
ubicacion_norm

No description

uuid	uuid		
lote_norm

No description

text	text		
Database Tables
sire_files
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
periodo

No description

character varying	varchar		
tipo

No description

character varying	varchar		
filename

No description

character varying	varchar		
file_path

No description

character varying	varchar		
file_size

No description

integer	int4		
estado

No description

character varying	varchar		
total_registros

No description

integer	int4		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
 

 sire_registros_detalles NO EXISTE. 


 Database Tables
rls_audit_log
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
timestamp

No description

timestamp with time zone	timestamptz		
user_id

No description

uuid	uuid		
user_email

No description

text	text		
user_role

No description

text	text		
attempted_tenant_id

Tenant ID que el usuario intentó acceder

uuid	uuid		
actual_tenant_id

Tenant ID real del usuario autenticado

uuid	uuid		
table_name

No description

text	text		
operation

No description

text	text		
query_text

No description

text	text		
session_id

No description

text	text		
ip_address

No description

inet	inet		
user_agent

No description

text	text		
application_name

No description

text	text		
backend_pid

No description

integer	int4		
severity

No description

text	text		
violation_type

Tipo de violación: cross_tenant, missing_tenant, invalid_tenant

text	text		
metadata

No description

jsonb	jsonb		
created_at

No description

timestamp with time zone	timestamptz		
 




 Database Tables
audit_log
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
table_name

No description

text	text		
operation

No description

text	text		
old_values

No description

jsonb	jsonb		
new_values

No description

jsonb	jsonb		
user_id

ID del usuario que realizó la acción (usuarios_sistema)

uuid	uuid		
tenant_id

No description

uuid	uuid		
timestamp

No description

timestamp with time zone	timestamptz		
ip_address

Dirección IP desde donde se realizó la acción

inet	inet		
user_agent

User agent del navegador/cliente

text	text		
resource_id

ID del recurso afectado

uuid	uuid		
action_description

Descripción legible de la acción

text	text		
record_id

ID of the record being modified

uuid	uuid		
changed_fields

Array of field names that were changed (for UPDATE)

ARRAY	_text		
metadata

Additional metadata about the operation

jsonb	jsonb		


Database Tables
auditoria
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
user_id

No description

uuid	uuid		
accion

No description

character varying	varchar		
tabla

No description

character varying	varchar		
registro_id

No description

uuid	uuid		
datos_anteriores

No description

jsonb	jsonb		
datos_nuevos

No description

jsonb	jsonb		
ip_address

No description

inet	inet		
user_agent

No description

text	text		
created_at

No description

timestamp with time zone	timestamptz		


y algunas de estas por si las necesitas Database Tables

schema

public


documento

New table
Name	Description	Rows (Estimated)	Size (Estimated)	Realtime Enabled	
	
documento_archivos

Archivos adjuntos de documentos (PDF, XML, CDR)	0	16 kB	
19 columns

	
documento_auditoria

Auditoría de todas las operaciones sobre documentos	27	32 kB	
13 columns

	
documento_detalles

Detalle de líneas/items de documentos	0	16 kB	
31 columns

	
documento_series

Series y numeración de documentos por tipo	1	80 kB	
21 columns

	
documentos

Tabla principal de gestión documental y facturación electrónica	27	192 kB	
81 columns

	
expediente_documentos

Documentos de expediente de empleados por tenant - RLS habilitado	0	24 kB	
11 columns

	
tipos_documentos_fiscales

Tipos de documentos fiscales disponibles por país	0	96 kB	
10 columns

	
v_documentos_completos

No description

-	-	
18 columns

	
v_documentos_pendientes_sunat

No description

-	-	
8 columns

	
vw_cpe_documentos_auditoria

No description

 