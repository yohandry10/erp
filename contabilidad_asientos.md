Database Tables
v_rls_status_contabilidad
Filter columns
Name	Description	Data Type	Format	Nullable	
tablename

name	name		
rls_habilitado

boolean	bool		
num_politicas

bigint	int8		
tiene_indice_tenant

bigint	int8		
tamaño_tabla

text	text		
 

Database Tables
asientos_contables
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

uuid	uuid		
numero_asiento

text	text		
fecha

date	date		
concepto

text	text		
referencia

text	text		
total_debe

numeric	numeric		
total_haber

numeric	numeric		
estado

text	text		
usuario_id

uuid	uuid		
created_at

timestamp with time zone	timestamptz		
updated_at

timestamp with time zone	timestamptz		
source_event_id

uuid	uuid		
tenant_id

uuid	uuid		


Database Tables
asientos_contables_rrhh
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

uuid	uuid		
planilla_id

uuid	uuid		
cuenta

character varying	varchar		
descripcion

text	text		
debe

numeric	numeric		
haber

numeric	numeric		
fecha

timestamp with time zone	timestamptz		
usuario_id

character varying	varchar		
created_at

timestamp with time zone	timestamptz		


Database Tables
detalle_asientos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

uuid	uuid		
asiento_id

uuid	uuid		
cuenta_id

uuid	uuid		
debe

numeric	numeric		
haber

numeric	numeric		
concepto

text	text		
referencia

text	text		
created_at

timestamp with time zone	timestamptz		
centro_costo_id

uuid	uuid		

Database Tables
plantillas_asientos
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

uuid	uuid		
tenant_id

uuid	uuid		
codigo

character varying	varchar		
nombre

character varying	varchar		
descripcion

text	text		
tipo_recurrencia

character varying	varchar		
dia_generacion

integer	int4		
tipo_documento

character varying	varchar		
glosa_plantilla

text	text		
centro_costo_id

uuid	uuid		
estado

character varying	varchar		
ultima_generacion_fecha

date	date		
ultima_generacion_periodo_id

uuid	uuid		
proxima_generacion_fecha

date	date		
notas

text	text		
created_at

timestamp with time zone	timestamptz		
updated_at

timestamp with time zone	timestamptz		
created_by

uuid	uuid		
updated_by

uuid	uuid		
Database Tables
plantillas_asientos_detalle
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

uuid	uuid		
tenant_id

uuid	uuid		
plantilla_id

uuid	uuid		
orden

integer	int4		
cuenta_id

uuid	uuid		
tipo_movimiento

character varying	varchar		
monto_tipo

character varying	varchar		
monto_valor

numeric	numeric		
monto_formula

text	text		
glosa

text	text		
centro_costo_id

uuid	uuid		
created_at

timestamp with time zone	timestamptz		
updated_at

timestamp with time zone	timestamptz		
Database Tables
plantillas_asientos_ventas
Filter columns

New column
Name	Description	Data Type	Format	Nullable	
id

uuid	uuid		
pais_id

integer	int4		
tipo_documento

character varying	varchar		
cuenta_debe_codigo

character varying	varchar		
cuenta_haber_ventas_codigo

character varying	varchar		
cuenta_haber_impuesto_codigo

character varying	varchar		
descripcion

text	text		
activo

boolean	bool		
created_at

timestamp with time zone	timestamptz		
updated_at

timestamp with time zone	timestamptz		
tenant_id

uuid	uuid		
