estas son las tablas que hay de POS y de CAJAS Database Tables

schema

public


pos

New table
Name	Description	Rows (Estimated)	Size (Estimated)	Realtime Enabled	
	
detalle_ventas_pos

No description

0	112 kB	
11 columns

	
pos_numeracion

Correlativos POS por tenant y serie	0	16 kB	
3 columns

	
tipos_cambio

Tipos de cambio diarios USD-PEN	0	40 kB	
5 columns

	
tipos_documentos_fiscales

Tipos de documentos fiscales disponibles por país	0	96 kB	
10 columns

	
tipos_impuestos

Tipos de impuestos y tasas aplicables por país	5	88 kB	
10 columns

	
ventas_pos

No description

11	232 kB	
26 columns

	
vista_pos_productos

Vista de productos/servicios para POS con precios y stock agregados por sucursal/almacén.	-	-	
28 columns

	
vw_ventas_pos_completas

No description

-	-	
20 columns

 Database Tables

schema

public


caja

New table
Name	Description	Rows (Estimated)	Size (Estimated)	Realtime Enabled	
	
cajas

Catálogo de cajas POS por sucursal/almacén/dispositivo	0	136 kB	
13 columns

	
sesiones_caja

Sesiones de caja (apertura/cierre) con cajero y montos	20	96 kB	
20 columns

 



Database Tables
cajas
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
ubicacion

No description

character varying	varchar		
estado

No description

character varying	varchar		
monto_inicial

No description

numeric	numeric		
activa

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
monto_proyectado

No description

numeric	numeric		
categoria

No description

character varying	varchar		
tenant_id

ID del tenant para aislamiento multi-tenant

uuid	uuid		
sucursal_id

No description

uuid	uuid		
almacen_id

No description

uuid	uuid		
 



 sesiones_caja

 Database Tables
sesiones_caja
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
caja_id

No description

uuid	uuid		
fecha_apertura

No description

timestamp with time zone	timestamptz		
fecha_cierre

No description

timestamp with time zone	timestamptz		
monto_inicial

No description

numeric	numeric		
monto_esperado

No description

numeric	numeric		
estado

No description

character varying	varchar		
created_at

No description

timestamp with time zone	timestamptz		
total_ventas

No description

numeric	numeric		
total_efectivo

No description

numeric	numeric		
total_tarjeta

No description

numeric	numeric		
total_digital

No description

numeric	numeric		
cantidad_ventas

No description

integer	int4		
notas

No description

text	text		
monto_contado

No description

numeric	numeric		
diferencia

No description

numeric	numeric		
usuario_apertura

No description

character varying	varchar		
usuario_cierre

No description

character varying	varchar		
tenant_id

No description

uuid	uuid		
usuario_id

No description

uuid	uuid		
 

 vw_ventas_pos_completas Database Tables
vw_ventas_pos_completas
Filter columns
Name	Description	Data Type	Format	Nullable	
venta_id

No description

bigint	int8		
tenant_id

No description

uuid	uuid		
numero_venta

No description

text	text		
numero_ticket

No description

character varying	varchar		
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
descuentos

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
vendedor

No description

character varying	varchar		
cpe_pendiente

No description

boolean	bool		
intentos_facturacion

No description

integer	int4		
created_at

No description

timestamp with time zone	timestamptz		
num_items

No description

bigint	int8		
total_unidades

No description

numeric	numeric		
origen_detalles

No description

text	text		
 

 vista_pos_productos 

 +Database Tables
vista_pos_productos
Filter columns
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
tenant_id

No description

uuid	uuid		
codigo

No description

character varying	varchar		
codigo_barras

No description

character varying	varchar		
nombre

No description

character varying	varchar		
descripcion

No description

text	text		
categoria

No description

character varying	varchar		
subcategoria

No description

character varying	varchar		
marca

No description

character varying	varchar		
precio_venta

No description

numeric	numeric		
precio_mayorista

No description

numeric	numeric		
precio_especial

No description

numeric	numeric		
stock_actual

No description

numeric	numeric		
stock_minimo

No description

numeric	numeric		
stock_reservado

No description

numeric	numeric		
stock_disponible

No description

numeric	numeric		
impuesto

No description

numeric	numeric		
precio_compra

No description

numeric	numeric		
imagen_url

No description

text	text		
activo

No description

boolean	bool		
es_servicio

No description

boolean	bool		
controla_stock

No description

boolean	bool		
afectacion_igv

No description

character varying	varchar		
tipo_operacion

No description

character varying	varchar		
clasificador_sunat

No description

character varying	varchar		
favorito

No description

boolean	bool		
created_at

No description

timestamp with time zone	timestamptz		
updated_at

No description

timestamp with time zone	timestamptz		


ventas_pos Database Tables
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
tipos_cambio
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

No description

uuid	uuid		
fecha

No description

date	date		
compra

No description

numeric	numeric		
venta

No description

numeric	numeric		
created_at

No description

timestamp with time zone	timestamptz		



Database Tables
pos_numeracion
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
tenant_id

No description

uuid	uuid		
serie

No description

text	text		
correlativo

No description

bigint	int8		


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
 