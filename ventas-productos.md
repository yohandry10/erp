Database Tables

productos

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

codigo

No description

character varyingvarchar

nombre

No description

character varyingvarchar

precio

No description

numericnumeric

stock

No description

numericnumeric

categoria

No description

character varyingvarchar

activo

No description

booleanbool

created_at

No description

timestamp with time zonetimestamptz

codigo_barras

No description

character varyingvarchar

precio_mayorista

No description

numericnumeric

precio_especial

No description

numericnumeric

stock_minimo

No description

integerint4

impuesto

No description

numericnumeric

imagen_url

No description

texttext

code

No description

character varyingvarchar

name

No description

character varyingvarchar

price

No description

numericnumeric

category

No description

character varyingvarchar

active

No description

booleanbool

barcode

No description

character varyingvarchar

wholesale_price

No description

numericnumeric

special_price

No description

numericnumeric

min_stock

No description

integerint4

tax

No description

numericnumeric

image_url

No description

texttext

tenant_id

No description

uuiduuid

descripcion

No description

texttext

precio_venta

No description

numericnumeric

stock_reservado

Stock reservado por pedidos confirmados. Stock disponible = stock - stock_reservado

numericnumeric

precio_compra

Precio de compra del producto para cálculo de costos de inventario.

numericnumeric

es_servicio

No description

booleanbool

controla_stock

No description

booleanbool

afectacion_igv

No description

character varyingvarchar

tipo_operacion

No description

character varyingvarchar

clasificador_sunat

No description

character varyingvarchar

favorito

No description

booleanbool

requiere_lote

Si true, el producto requiere selección de lote al vender (FEFO)

booleanbool  Database Tables

ventas

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

tenant_id

No description

uuiduuid

tipo_documento

No description

character varyingvarchar

serie

No description

character varyingvarchar

numero

No description

character varyingvarchar

fecha

No description

datedate

fecha_vencimiento

No description

datedate

cliente_id

No description

uuiduuid

cliente_razon_social

No description

texttext

cliente_documento

No description

character varyingvarchar

cliente_direccion

No description

texttext

cotizacion_id

No description

uuiduuid

vendedor_id

No description

uuiduuid

condiciones_pago

No description

character varyingvarchar

subtotal

No description

numericnumeric

descuento

No description

numericnumeric

igv

No description

numericnumeric

total

No description

numericnumeric

estado

No description

character varyingvarchar

estado_pago

No description

character varyingvarchar

monto_pagado

No description

numericnumeric

saldo_pendiente

No description

numericnumeric

observaciones

No description

texttext

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz  Database Tables

ventas_pos

New column

NameDescriptionData TypeFormatNullable

id

No description

bigintint8

numero_venta

No description

texttext

fecha

No description

timestamp with time zonetimestamptz

cliente_nombre

No description

texttext

cliente_documento

No description

texttext

subtotal

No description

numericnumeric

impuestos

No description

numericnumeric

total

No description

numericnumeric

metodo_pago

No description

texttext

estado

No description

texttext

caja_id

No description

texttext

usuario_id

No description

texttext

observaciones

No description

texttext

created_at

No description

timestamp with time zonetimestamptz

updated_at

No description

timestamp with time zonetimestamptz

sesion_caja_id

No description

uuiduuid

cliente_id

No description

uuiduuid

descuentos

No description

numericnumeric

numero_ticket

No description

character varyingvarchar

vendedor

No description

character varyingvarchar

tenant_id

No description

uuiduuid

cpe_pendiente

Indica si la venta POS tiene facturación pendiente

booleanbool

intentos_facturacion

Número de intentos de facturación realizados

integerint4

ultimo_intento_facturacion

Fecha del último intento de facturación

timestamp with time zonetimestamptz

error_facturacion

Mensaje de error del último intento de facturación

texttext

cpe_data

Datos del CPE para reintentar facturación

jsonbjsonb  Database Tables

pagos_ventas

New column

NameDescriptionData TypeFormatNullable

id

No description

uuiduuid

venta_id

No description

uuiduuid

fecha_pago

No description

datedate

monto

No description

numericnumeric

metodo_pago

No description

character varyingvarchar

numero_operacion

No description

character varyingvarchar

banco

No description

character varyingvarchar

observaciones

No description

texttext

created_at

No description

timestamp with time zonetimestamptz Database Tables

detalle_ventas_pos

New column

NameDescriptionData TypeFormatNullable

id

No description

bigintint8

venta_id

No description

bigintint8

codigo_producto

No description

texttext

nombre_producto

No description

texttext

cantidad

No description

numericnumeric

precio_unitario

No description

numericnumeric

descuento

No description

numericnumeric

total_parcial

No description

numericnumeric

created_at

No description

timestamp with time zonetimestamptz

tenant_id

No description

uuiduuid

producto_id

FK al producto vendido

uuiduuid 


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
 