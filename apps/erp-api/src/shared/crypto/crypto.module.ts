import { Module, Global } from '@nestjs/common';

/**
 * Aqui vivia un proveedor 'XML_SIGNER' construido con un certificado global
 * (PFX_PATH/PFX_PASS). Venia de cuando el sistema servia a una sola empresa.
 *
 * Hoy cada tenant firma con SU certificado: CpeCertificateService y
 * ComunicacionBajaService construyen el XmlSigner por tenant y se niegan a
 * firmar si el certificado no pertenece al RUC que emite. Nadie inyectaba el
 * proveedor global —ni una sola referencia en todo el repo— pero al arrancar
 * en produccion exigia un certificado que en un SaaS multi-tenant no existe, y
 * tumbaba la API antes de servir la primera peticion.
 *
 * El modulo se queda porque tres modulos lo importan; si algun dia vuelve a
 * tener algo que exportar, este es su sitio.
 */
@Global()
@Module({})
export class CryptoModule {}
