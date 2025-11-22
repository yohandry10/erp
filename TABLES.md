Database Tables

plan_cuentas

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

tenant_id

No description

uuiduuid

codigo

No description

character varyingvarchar

nombre

No description

character varyingvarchar

tipo

No description

character varyingvarchar

subtipo

No description

character varyingvarchar

nivel

No description

integerint4

cuenta_padre_id

No description

uuiduuid

descripcion

No description

texttext

activa

No description

booleanbool

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz

naturaleza

No description

texttext

cuenta_padre

No description

character varyingvarchar

acepta_movimiento

No description

booleanbool  

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
productos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
codigo

No description

character varying	varchar		
nombre

No description

character varying	varchar		
precio

No description

numeric	numeric		
stock

No description

integer	int4		
categoria

No description

character varying	varchar		
activo

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
codigo_barras

No description

character varying	varchar		
precio_mayorista

No description

numeric	numeric		
precio_especial

No description

numeric	numeric		
stock_minimo

No description

integer	int4		
impuesto

No description

numeric	numeric		
imagen_url

No description

text	text		
code

No description

character varying	varchar		
name

No description

character varying	varchar		
price

No description

numeric	numeric		
category

No description

character varying	varchar		
active

No description

boolean	bool		
barcode

No description

character varying	varchar		
wholesale_price

No description

numeric	numeric		
special_price

No description

numeric	numeric		
min_stock

No description

integer	int4		
tax

No description

numeric	numeric		
image_url

No description

text	text		
tenant_id

No description

uuid	uuid		
descripcion

No description

text	text		
precio_venta

No description

numeric	numeric		
stock_reservado

Stock reservado por pedidos confirmados. Stock disponible = stock - stock_reservado

numeric	numeric		
precio_compra

Precio de compra del producto para cálculo de costos de inventario.

numeric	numeric		


Database Tables
clientes
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
numero_documento

No description

character varying	varchar		
razon_social

No description

character varying	varchar		
nombre_comercial

No description

character varying	varchar		
direccion

No description

text	text		
telefono

No description

character varying	varchar		
email

No description

character varying	varchar		
contacto

No description

character varying	varchar		
estado

No description

character varying	varchar		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
codigo

No description

character varying	varchar		
activo

No description

boolean	bool		
tipo

No description

character varying	varchar		
documento_tipo

No description

character varying	varchar		
limite_credito

No description

numeric	numeric		
permite_morosidad

No description

boolean	bool		
dias_morosidad

No description

integer	int4		
sujeto_retencion

No description

boolean	bool		
retencion_tasa

No description

numeric	numeric		
sujeto_percepcion

No description

boolean	bool		
percepcion_tasa

No description

numeric	numeric		
sujeto_detraccion

No description

boolean	bool		
detraccion_tasa

No description

numeric	numeric		


Database Tables
cuentas_bancarias
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
banco

No description

character varying	varchar		
numero_cuenta

No description

character varying	varchar		
tipo_cuenta

No description

character varying	varchar		
moneda

No description

character varying	varchar		
saldo_actual

No description

numeric	numeric		
saldo_contable

No description

numeric	numeric		
activa

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
tenant_id

ID del tenant para aislamiento multi-tenant

uuid	uuid		



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
 


 Database Tables
cuentas_por_pagar
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
orden_id

Orden de compra de origen (opcional)

uuid	uuid		
proveedor_id

Proveedor al que se debe

character varying	varchar		
numero_documento

No description

character varying	varchar		
fecha_emision

Fecha de emisión de la CxP

date	date		
fecha_vencimiento

Fecha de vencimiento del pago

date	date		
moneda

No description

character varying	varchar		
total

No description

numeric	numeric		
saldo

No description

numeric	numeric		
monto_pagado

No description

numeric	numeric		
estado

No description

character varying	varchar		
ultimo_pago

No description

timestamp with time zone	timestamptz		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
tenant_id

ID del tenant para aislamiento multi-tenant

uuid	uuid		
recepcion_id

Recepción de origen (opcional)

uuid	uuid		
condiciones_pago

Condiciones de pago (CONTADO, CREDITO_30, etc.)

character varying	varchar		
dias_credito

Días de crédito otorgados

integer	int4		
subtotal

No description

numeric	numeric		
igv

No description

numeric	numeric		
observaciones

No description

text	text		
created_by

No description

uuid	uuid		
anulado_at

No description

timestamp with time zone	timestamptz		
anulado_by

No description

uuid	uuid		
motivo_anulacion

No description

text	text		
 

 Database Tables
asientos_contables
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
numero_asiento

No description

character varying	varchar		
fecha

No description

date	date		
concepto

No description

text	text		
referencia

No description

character varying	varchar		
total_debe

No description

numeric	numeric		
total_haber

No description

numeric	numeric		
estado

No description

character varying	varchar		
usuario_id

No description

uuid	uuid		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
source_event_id

References the outbox_events.id that generated this accounting entry. Used for idempotency to prevent duplicate entries from the same event. NULL for manual entries.

uuid	uuid		
 Database Tables
asientos_contables_rrhh
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
planilla_id

No description

uuid	uuid		
cuenta

No description

character varying	varchar		
descripcion

No description

text	text		
debe

No description

numeric	numeric		
haber

No description

numeric	numeric		
fecha

No description

timestamp with time zone	timestamptz		
usuario_id

No description

character varying	varchar		
created_at

No description

timestamp with time zone	timestamptz		
 Database Tables
detalle_asientos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
asiento_id

No description

uuid	uuid		
cuenta_id

No description

uuid	uuid		
debe

No description

numeric	numeric		
haber

No description

numeric	numeric		
concepto

No description

text	text		
referencia

No description

character varying	varchar		
created_at

No description

timestamp with time zone	timestamptz		
centro_costo_id

References the centros_costo.id to track which cost center this accounting entry detail belongs to. Used for cost center reporting and analysis. NULL if not assigned to a specific cost center.

uuid	uuid		
 Database Tables
plantillas_asientos_detalle
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
plantilla_id

No description

uuid	uuid		
orden

No description

integer	int4		
cuenta_id

No description

uuid	uuid		
tipo_movimiento

No description

character varying	varchar		
monto_tipo

Tipo de monto: FIJO (valor fijo), VARIABLE (se proporciona al generar), FORMULA (se calcula)

character varying	varchar		
monto_valor

No description

numeric	numeric		
monto_formula

Fórmula para calcular el monto (ej: "linea_1 * 0.18")

text	text		
glosa

No description

text	text		
centro_costo_id

No description

uuid	uuid		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
 Database Tables
plantillas_asientos_historial
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
plantilla_id

No description

uuid	uuid		
asiento_contable_id

No description

uuid	uuid		
periodo_contable_id

No description

uuid	uuid		
fecha_generacion

No description

timestamp with time zone	timestamptz		
generado_por

No description

uuid	uuid		
tipo_generacion

No description

character varying	varchar		
notas

No description

text	text		
created_at

No description

timestamp with time zone	timestamptz		
   



   Database Tables
vista_kardex_valorizado
Filter columns
Name	Description	Data Type	Format	Nullable	
producto_id

No description

uuid	uuid		
codigo

No description

character varying	varchar		
nombre

No description

character varying	varchar		
categoria

No description

character varying	varchar		
precio_unitario

No description

numeric	numeric		
tipo_movimiento

No description

character varying	varchar		
motivo

No description

character varying	varchar		
cantidad

No description

numeric	numeric		
costo_unitario

No description

numeric	numeric		
valor_movimiento

No description

numeric	numeric		
created_at

No description

timestamp with time zone	timestamptz		
 

 Database Tables
vw_inventario_kardex_resumen
Filter columns
Name	Description	Data Type	Format	Nullable	
tenant_id

No description

uuid	uuid		
producto_id

No description

uuid	uuid		
producto_codigo

No description

character varying	varchar		
producto_nombre

No description

character varying	varchar		
almacen_id

No description

uuid	uuid		
almacen_nombre

No description

character varying	varchar		
total_cantidad

No description

numeric	numeric		
total_valor

No description

numeric	numeric		


Database Tables
vw_kardex_valorizado
Filter columns
Name	Description	Data Type	Format	Nullable	
recepcion_item_id

No description

uuid	uuid		
recepcion_id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
recepcion_numero

No description

character varying	varchar		
fecha_recepcion

No description

timestamp with time zone	timestamptz		
recepcion_estado

No description

USER-DEFINED	estado_recepcion		
producto_id

No description

uuid	uuid		
producto_codigo

No description

character varying	varchar		
producto_nombre

No description

character varying	varchar		
producto_sku

No description

character varying	varchar		
cantidad_recibida

No description

numeric	numeric		
costo_unitario

No description

numeric	numeric		
valor_total

No description

numeric	numeric		
almacen_id

No description

uuid	uuid		
almacen_nombre

No description

character varying	varchar		
ubicacion_id

No description

uuid	uuid		
ubicacion_codigo

No description

character varying	varchar		
lote

No description

character varying	varchar		
serie

No description

character varying	varchar		
fecha_expiracion

No description

date	date		
moneda_detalle

No description

character varying	varchar		



Database Tables
cotizaciones
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
cliente_id

No description

uuid	uuid		
fecha_cotizacion

No description

date	date		
fecha_vencimiento

No description

date	date		
vendedor

No description

character varying	varchar		
moneda

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
estado

No description

character varying	varchar		
probabilidad

No description

integer	int4		
items

No description

jsonb	jsonb		
observaciones

No description

text	text		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
fecha_aprobacion

No description

timestamp without time zone	timestamp		
fecha_conversion

No description

timestamp without time zone	timestamp		
fecha_rechazo

No description

timestamp without time zone	timestamp		
aprobado_por

No description

uuid	uuid		
convertido_por

No description

uuid	uuid		
rechazado_por

No description

uuid	uuid		
observaciones_aprobacion

No description

text	text		
motivo_rechazo

No description

text	text		
documento_generado_id

No description

uuid	uuid		
 
Database Tables
cotizacion_detalles
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
cotizacion_id

No description

uuid	uuid		
producto_id

No description

uuid	uuid		
producto_codigo

No description

character varying	varchar		
producto_nombre

No description

text	text		
descripcion

No description

text	text		
cantidad

No description

numeric	numeric		
precio_unitario

No description

numeric	numeric		
descuento_porcentaje

No description

numeric	numeric		
descuento_monto

No description

numeric	numeric		
subtotal

No description

numeric	numeric		
orden

No description

integer	int4		
created_at

No description

timestamp with time zone	timestamptz		
 

 Database Tables
proveedores
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

character varying	varchar		
nombre_comercial

No description

character varying	varchar		
direccion

No description

text	text		
telefono

No description

character varying	varchar		
email

No description

character varying	varchar		
contacto

No description

character varying	varchar		
estado

No description

character varying	varchar		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		
condiciones_pago

No description

character varying	varchar		
activo

No description

boolean	bool		
limite_credito

No description

numeric	numeric		
dias_credito

No description

integer	int4		
 