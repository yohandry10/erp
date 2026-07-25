# Auditoria SUNAT wizard/onboarding readiness

Fecha: 2026-06-17

## Conclusion

Antes de esta correccion, el wizard no estaba listo para que un primer cliente peruano configurara SUNAT directo solo con sus datos. Capturaba PFX/P12 y modo SUNAT/OSE, pero no pedia usuario/clave SOL secundaria ni credenciales GRE REST. Ademas, el backend persistia el PFX y la clave del certificado desde el wizard en claro y algunas rutas de envio seguian usando credenciales globales de `.env`.

Despues de esta correccion, el onboarding peruano queda preparado a nivel de codigo para que el cliente cargue:

- Certificado digital `.pfx`/`.p12` y clave privada.
- RUC, razon social y direccion fiscal.
- Usuario SOL secundario y clave SOL secundaria para SUNAT directo.
- Ambiente SUNAT `homologacion` o `produccion`.
- Transporte GRE `soap` o `rest`.
- `client_id` y `client_secret` de SUNAT si GRE usa Plataforma Nueva REST.
- Overrides opcionales de endpoints SUNAT; si quedan vacios, el backend usa defaults oficiales por ambiente.

## Evidencia SUNAT consultada

- SUNAT indica que SEE del contribuyente, SFS y OSE requieren certificado digital para emitir CPE.
- SUNAT publica que el certificado tributario se descarga como `certificado.p12` y se importa en el sistema de emision electronica.
- SUNAT declara que el servicio beta UBL 2.1 solo prueba estructuras XML de facturas, boletas y notas, no debe usarse para comprobantes reales.
- Manual GRE REST SUNAT: token OAuth con `client_id`, `client_secret`, `username`, `password`, scope `https://api-cpe.sunat.gob.pe`, y uso posterior con `Authorization: Bearer <token>`.

Fuentes:

- `https://cpe.sunat.gob.pe/certificado-digital`
- `https://cpe.sunat.gob.pe/noticias/servicio-beta-para-realizar-pruebas-ubl-21`
- `https://cpe.sunat.gob.pe/sites/default/files/inline-files/Manual_Servicios_GRE%20%281%29_0.pdf`
- `https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20%281%29_0.pdf`

## Cambios aplicados

- Migracion `342__sunat_tenant_onboarding_credentials.sql`: agrega configuracion SUNAT tenant-level en `empresa_config`.
- Wizard PE/SUNAT directo: agrega ambiente, usuario/clave SOL secundaria, GRE SOAP/REST, credenciales GRE REST y endpoints opcionales.
- Validacion del wizard: no permite avanzar en SUNAT directo sin SOL; no permite GRE REST sin `client_id/client_secret`.
- Backend configuration: valida requisitos SUNAT, cifra PFX, clave de certificado, clave SOL y GRE client secret, y elimina log del payload completo.
- Runtime SUNAT: `OseService` resuelve certificado/credenciales por `tenantId` y falla cerrado si falta configuracion tenant.
- CPE, RA/RC y GRE pasan `tenantId` al envio/consulta SUNAT.
- GRE consulta estado con RUC/serie/numero reales o ticket REST, no con valores hardcodeados.

## Verificacion ejecutada

- `pnpm --filter @erp-suite/erp-api run type-check`
- `pnpm --filter @erp-suite/web run type-check`
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/ose/ose.service.spec.ts --runInBand`
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/gre/gre.idempotency.spec.ts --runInBand`
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/cpe/comunicacion-baja.service.spec.ts --runInBand`
- `pnpm --filter @erp-suite/erp-api exec jest src/modules/cpe/cpe.service.spec.ts --runInBand`
- `git diff --check`

## Actualizacion PROD 2026-06-18

La migracion `342__sunat_tenant_onboarding_credentials.sql` fue aplicada y verificada tambien en PROD (`wypnbcptofqdmoynlonq`) con `psql --set=ON_ERROR_STOP=1 --single-transaction`.

Verificacion DEV y PROD:

- 15 columnas SUNAT tenant-level presentes en `public.empresa_config`.
- 3 constraints `ck_empresa_config_sunat_*_342` validadas.
- Defaults correctos: `sunat_environment='homologacion'`, `sunat_gre_transport='soap'`, `sunat_gre_rest_base_url='https://api-cpe.sunat.gob.pe/v1'`, `sunat_cert_ruc_mismatch_confirmed=false`.
- 0 filas invalidas para ambiente SUNAT, transporte GRE o motivo de mismatch RUC/certificado.
- 4 comentarios de columnas sensibles presentes.

## Limite importante

Esto no equivale a prueba productiva real. Queda listo el codigo para que el primer cliente ingrese sus propios secretos y se ejecute el flujo con su tenant. La prueba productiva real sigue requiriendo autorizacion del cliente, certificado valido del RUC emisor, usuario SOL secundario, credenciales GRE REST si emitira guias y smoke controlado con CDR/acuse real.
