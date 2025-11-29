# Alcance aprobado (Perú y Colombia)

## Cash flow y ratios (mapa OIF genérico por códigos 20-70)
- **Clasificación por código raíz** (ajusta si tu plan difiere):
  - Operación: 12/13 bancos y caja, 12/41/42/43, 70 ingresos, 69/62/63/64/65 costos y gastos, 40 IGV.
  - Inversión: 33/34/35 activos fijos e intangibles.
  - Financiamiento: 45/46/47/48 préstamos/obligaciones, 50 patrimonio/kapex, dividendos.
- **Cash flow indirecto** (mensual):
  - Utilidad neta +/– variación capital de trabajo (CxC, inventarios, CxP) +/– depreciación/amortización +/– provisiones +/– otros no monetarios.
  - Variaciones de balance: ΔCuentas = saldo fin – saldo inicio (periodo).
- **Ratios** (mensual):
  - Liquidez = Activo corriente / Pasivo corriente.
  - Prueba ácida = (Activo corriente – Inventarios) / Pasivo corriente.
  - EBITDA margin = EBITDA / Ventas netas.
  - DSO = (Cuentas por cobrar / Ventas netas) * 30.
  - DPO = (Cuentas por pagar / Compras o Costo de ventas) * 30.
  - DIO = (Inventario / Costo de ventas) * 30.
  - Rotación inventario = Costo de ventas / Inventario promedio.

## Cierre contable (resultado del ejercicio)
- Al cerrar periodo: asiento automático **Dr 70x Ingresos** / **Cr 79 Resultado** y **Dr 79** / **Cr 59/89** (resultado acumulado), ajustando por país (59 en Perú, 89 equivalente si aplica en Colombia).
- Bloquear periodo: marcar `periodos.estado = 'CERRADO'`, rechazar asientos nuevos en fechas cerradas, permitir reapertura sólo rol contable.
- Redondeos: tolerancia 0.01; ajustar en cuenta de diferencias (ej. 679/779).

## Reporte GRE (SUNAT) CSV
- Columnas mínimas: `serie,numero,fecha_emision,fecha_vencimiento,ruc_cliente,tipo_doc,razon_social,base,igv,total,moneda,estado`.
- Validaciones: estado `ANULADO` si CPE anulado; incluir solo periodo solicitado; totales recalculados; moneda ISO.
- Formato: CSV UTF-8, separador coma, fechas YYYY-MM-DD, números con punto decimal.

## Rotación de certificados (dual-key, 7 días)
- Variables: `CERT_ENCRYPTION_KEY` (nueva) y `CERT_ENCRYPTION_KEY_OLD` (anterior) activas durante 7 días.
- Reencriptado completo: script de reencriptado que lea `empresa_config.pfx_encrypted` y escriba usando la clave nueva.
- Bitácora: tabla/log de rotación con `tenant_id, ejecutado_por, fecha, key_id`.
- Falla de rotación: mantener `KEY_OLD` hasta completar; alertar si algún certificado no pudo reencriptarse.


