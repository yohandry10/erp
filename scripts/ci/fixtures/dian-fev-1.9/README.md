# Contrato oficial DIAN FEV 1.9

Estos archivos son el subconjunto mínimo de la **Caja de herramientas
FE_V19_(v2026)** publicado por DIAN que necesita el gate de CI:

- los cinco XSD principales de UBL 2.1 y todos sus `import`/`include` locales;
- `DIAN-UBL21-model-compiled.xsl`, el Schematron compilado distribuido en la
  misma caja.
- una instantánea del `singleWsdl` del servicio oficial de producción, usada
  sólo para fijar sin red el contrato `GetStatusEvent`.

Origen: [Documentación técnica del Sistema de Facturación
Electrónica](https://www.dian.gov.co/impuestos/factura-electronica/documentacion/Paginas/documentacion-tecnica.aspx),
archivo `Caja de herramientas FE_V19_(v2026)` consultado el 2026-08-29.
El ZIP de origen tenía SHA-256
`94b332571c3088c7f44c2dda49f57ff7978d6b3b14c50dd4d8a8a0f0491216fc`.
El WSDL se obtuvo el 2026-08-29 desde
`https://vpfe.dian.gov.co/WcfDianCustomerServices.svc?singleWsdl` y tiene
SHA-256 `f92a7e6ec77b21ad6a91cf38ceb54fed22ec754140b417506dfb53d6da0a53f4`.

`manifest.json` fija el SHA-256 de cada archivo versionado. El gate comprueba
el manifiesto antes de validar un XML, para que sustituir silenciosamente una
regla oficial no pueda dejar CI en verde.

Nota de versión: el XSL compilado permite `CustomizationID` 01–12 y por ello
marca como fatal 20/30 en notas, mientras las listas 2026 de la misma caja ya
contienen esos códigos. Además aplica esa misma lista a `ApplicationResponse` y
rechaza `1`, aunque los cinco ejemplos RADIAN oficiales de la caja usan `1`.
También conserva reglas de perfil que exigen el `ProfileID` corto `DIAN 2.1`,
mientras el Anexo FEV 1.9 exige los perfiles descriptivos de factura, notas y
`DIAN 2.1: ApplicationResponse de Factura Electrónica de Venta` para eventos.
La regla `AAH03` tampoco incluye 034, aunque la misma caja contiene el ejemplo
oficial `034 - Aceptacion_Tacita_FEV.xml` con ese `ResponseCode`.

El gate genera desde el código real factura, nota crédito, nota débito, los
cinco eventos RADIAN 030–034 y el documento adjunto. Registra y tolera
únicamente el conjunto completo y exacto de mensajes documentados del XSL
desfasado para los perfiles descriptivos, `CAD02` 20, `DAD02` 30, `AAD02` 1 y
`AAH03` solamente para 034; no reescribe los documentos. El gate comprueba
antes los literales normativos y ejecuta controles negativos, por lo que una
excepción del XSL no puede ocultar un perfil, operación o evento incorrecto.
Todo otro fatal del Schematron hace fallar CI. `AttachedDocument`
se valida con su XSD oficial; el XSL distribuido no declara su espacio de
nombres como documento raíz.
