import * as forge from 'node-forge';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SignedXml } from 'xml-crypto';

export interface SigningOptions {
  pfxPath?: string;
  pfxBuffer?: Buffer; // Support for certificate buffer from database
  pfxPassword?: string;
  referenceUri?: string;
  useDemoMode?: boolean; // Para testing sin certificado real
  allowDemoFallback?: boolean;
  expectedRuc?: string;
  enforceRucInCertificate?: boolean;
  allowRucMismatchWithConfirmation?: boolean;
}

/**
 * Fallo de titularidad del certificado. Es terminal por definicion: si el PFX no
 * pertenece al contribuyente que factura, no hay nada que salvar cayendo a otro
 * certificado. Se marca aparte para que ningun fallback pueda absorberla.
 */
export class CertificateOwnershipError extends Error {
  readonly esErrorDeTitularidad = true as const;
}

export class XmlSigner {
  private certificate!: forge.pki.Certificate;
  private privateKey!: forge.pki.PrivateKey;
  private demoMode: boolean = false;

  constructor(private options: SigningOptions = {}) {
    this.demoMode = options.useDemoMode || (!options.pfxPath && !options.pfxBuffer);
    this.loadCertificate();
  }

  private loadCertificate(): void {
    try {
      if (this.demoMode) {
        console.warn('🔧 MODO DEMO - Generando certificado temporal para testing');
        this.generateDemoCertificate();
      } else {
        console.log('📜 Cargando certificado real desde:', this.options.pfxPath);
        this.loadRealCertificate();
      }
    } catch (error) {
      // La titularidad no se negocia: si el certificado no es del contribuyente,
      // caer a demo convertiria el bloqueo en una firma silenciosa con otro
      // certificado, que es justo lo que el guardia venia a impedir.
      if (error instanceof CertificateOwnershipError) {
        throw error;
      }
      // El fallback a demo se pide, no se hereda. Antes bastaba con no decir
      // nada para que una clave mal tecleada o un PFX corrupto acabaran
      // firmando con un autofirmado, y el emisor creyendo que uso el suyo.
      if (this.options.allowDemoFallback !== true) {
        throw error;
      }
      console.error('❌ Error cargando certificado, usando modo demo:', error);
      this.demoMode = true;
      this.generateDemoCertificate();
    }
  }

  private loadRealCertificate(): void {
    let pfxData: Buffer;

    // Load from buffer (database) or file
    if (this.options.pfxBuffer) {
      console.log('📜 Cargando certificado desde buffer (base de datos)');
      pfxData = this.options.pfxBuffer;
    } else if (this.options.pfxPath) {
      const resolvedPath = this.resolveCertificatePath(this.options.pfxPath);

      if (!resolvedPath) {
        throw new Error(`Archivo de certificado no encontrado: ${this.options.pfxPath}`);
      }
      console.log('📜 Cargando certificado desde archivo:', resolvedPath);
      pfxData = fs.readFileSync(resolvedPath);
    } else {
      throw new Error('No se proporcionó pfxPath ni pfxBuffer');
    }

    const p12Asn1 = forge.asn1.fromDer(pfxData.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, this.options.pfxPassword || '');
    
    // Extraer certificado y clave privada
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    
    if (certBags[forge.pki.oids.certBag] && keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]) {
      this.certificate = certBags[forge.pki.oids.certBag]![0].cert!;
      this.privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]![0].key!;
      this.assertCertificateRuc();
      console.log('✅ Certificado real cargado exitosamente');
    } else {
      throw new Error('No se pudo extraer certificado o clave privada del archivo .pfx');
    }
  }

  private assertCertificateRuc(): void {
    if (!this.options.enforceRucInCertificate) {
      return;
    }

    const expectedRuc = this.options.expectedRuc?.replace(/\D/g, '');
    if (!expectedRuc) {
      throw new CertificateOwnershipError(
        'SUNAT producción requiere configurar el RUC esperado del certificado.',
      );
    }

    const certificateText = this.getCertificateIdentityText().replace(/\D/g, '');
    if (certificateText.includes(expectedRuc)) {
      return;
    }

    if (this.options.allowRucMismatchWithConfirmation) {
      console.warn(
        `⚠️ El certificado no contiene el RUC esperado ${expectedRuc}; se permite solo por confirmación explícita configurada.`,
      );
      return;
    }

    throw new CertificateOwnershipError(
      `El certificado fiscal no contiene el RUC esperado ${expectedRuc}. ` +
        'SUNAT producción para persona jurídica requiere un certificado asociado al contribuyente; ' +
        'use un PFX con el RUC de la empresa o configure una confirmación explícita documentada.',
    );
  }

  private getCertificateIdentityText(): string {
    const subject = this.certificate.subject?.attributes ?? [];
    const issuer = this.certificate.issuer?.attributes ?? [];
    const attrs = [...subject, ...issuer]
      .map((attr) => `${attr.name || attr.type || ''}=${attr.value || ''}`)
      .join(', ');

    return `${attrs}, serialNumber=${this.certificate.serialNumber || ''}`;
  }

  private resolveCertificatePath(configuredPath: string): string | null {
    if (path.isAbsolute(configuredPath) && fs.existsSync(configuredPath)) {
      return configuredPath;
    }

    const candidates = [
      path.resolve(process.cwd(), configuredPath),
      path.resolve(process.cwd(), '..', '..', configuredPath),
      path.resolve(__dirname, '..', '..', '..', configuredPath),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private generateDemoCertificate(): void {
    // Generar par de claves temporales para testing
    const keys = forge.pki.rsa.generateKeyPair(2048);
    this.privateKey = keys.privateKey;
    
    // Crear certificado auto-firmado temporal
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    
    const attrs = [{
      name: 'organizationName',
      value: 'DEMO - Sistema ERP Testing'
    }, {
      name: 'countryName',
      value: 'PE'
    }, {
      name: 'commonName',
      value: 'DEMO Certificate - Do Not Use in Production'
    }];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(this.privateKey);
    
    this.certificate = cert;
    console.log('✅ Certificado demo generado para testing');
  }

  signXml(xmlContent: string): string {
    try {
      console.log('🔐 Firmando XML con certificado...');

      const privateKeyPem = forge.pki.privateKeyToPem(this.privateKey);
      const certPem = forge.pki.certificateToPem(this.certificate);
      const xmlWithExtension = this.ensureExtensionContent(xmlContent);

      const signer = new SignedXml({
        privateKey: privateKeyPem,
        publicCert: certPem,
        signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
        canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        getKeyInfoContent: (args) => {
          const prefix = args?.prefix || 'ds';
          const certBase64 = this.getCertificateBase64();
          return `<${prefix}:X509Data><${prefix}:X509Certificate>${certBase64}</${prefix}:X509Certificate></${prefix}:X509Data>`;
        },
      });

      signer.addReference({
        xpath: '/*',
        transforms: [
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
          'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        ],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
        uri: '',
        isEmptyUri: true,
      });

      signer.computeSignature(xmlWithExtension, {
        prefix: 'ds',
        attrs: { Id: 'SignatureSP' },
        location: {
          reference: "//*[local-name(.)='ExtensionContent']",
          action: 'append',
        },
      });

      const signedXml = signer.getSignedXml();
      const signature = this.extractXmlTag(signedXml, 'SignatureValue');
      const digest = this.extractXmlTag(signedXml, 'DigestValue');

      console.log('✅ XML firmado exitosamente');
      console.log(`📊 Digest: ${digest.substring(0, 20)}...`);
      console.log(`📊 Firma: ${signature.substring(0, 20)}...`);
      
      return signedXml;
    } catch (error) {
      console.error('❌ Error firmando XML:', error);
      throw new Error(`Error signing XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private ensureExtensionContent(xmlContent: string): string {
    if (/<(?:\w+:)?ExtensionContent\b/i.test(xmlContent)) {
      return xmlContent;
    }

    const extensionXml = `
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`;

    const firstBusinessTag = xmlContent.match(/<cbc:UBLVersionID\b/i);
    if (firstBusinessTag?.index != null) {
      return `${xmlContent.slice(0, firstBusinessTag.index)}${extensionXml}\n  ${xmlContent.slice(firstBusinessTag.index)}`;
    }

    return xmlContent.replace(/(<(?:\w+:)?(?:Invoice|CreditNote|DebitNote|DespatchAdvice|SummaryDocuments|VoidedDocuments)\b[^>]*>)/i, `$1${extensionXml}`);
  }

  private getCertificateBase64(): string {
    return forge.pki.certificateToPem(this.certificate)
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\r?\n/g, '');
  }

  private extractXmlTag(xml: string, tag: string): string {
    const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'));
    return match?.[1]?.trim() || '';
  }

  private insertSignatureIntoXml(xmlContent: string, signatureData: any): string {
    // Insertar la firma digital en el XML
    const signatureXml = `
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="SignatureSP">
      <ds:SignedInfo>
        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
        <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <ds:Reference URI="">
          <ds:Transforms>
            <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
          </ds:Transforms>
          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue>${signatureData.hash}</ds:DigestValue>
        </ds:Reference>
      </ds:SignedInfo>
      <ds:SignatureValue>${signatureData.signature}</ds:SignatureValue>
      <ds:KeyInfo>
        <ds:X509Data>
          <ds:X509Certificate>${signatureData.certificate}</ds:X509Certificate>
        </ds:X509Data>
        <ds:KeyValue>
          <ds:RSAKeyValue>
            <ds:Modulus>${this.getRSAModulus()}</ds:Modulus>
            <ds:Exponent>AQAB</ds:Exponent>
          </ds:RSAKeyValue>
        </ds:KeyValue>
      </ds:KeyInfo>
      <ds:Object Id="Certificate${signatureData.serialNumber}">
        <ds:SignatureProperties>
          <ds:SignatureProperty Id="SignatureTimestamp">
            <ds:Timestamp>${signatureData.timestamp}</ds:Timestamp>
          </ds:SignatureProperty>
        </ds:SignatureProperties>
      </ds:Object>
    </ds:Signature>`;

    // Buscar donde insertar la firma (después de UBLExtensions)
    if (xmlContent.includes('</ext:UBLExtensions>')) {
      return xmlContent.replace('</ext:UBLExtensions>', `${signatureXml}</ext:UBLExtensions>`);
    } else if (xmlContent.includes('<ext:ExtensionContent></ext:ExtensionContent>')) {
      return xmlContent.replace(
        '<ext:ExtensionContent></ext:ExtensionContent>', 
        `<ext:ExtensionContent>${signatureXml}</ext:ExtensionContent>`
      );
    } else {
      // Fallback: agregar antes del elemento raíz de cierre
      const lastTagMatch = xmlContent.match(/<\/([^>]+)>\s*$/);
      if (lastTagMatch) {
        return xmlContent.replace(lastTagMatch[0], `${signatureXml}${lastTagMatch[0]}`);
      }
    }
    
    return xmlContent + signatureXml;
  }

  private getRSAModulus(): string {
    try {
      const publicKey = forge.pki.certificateFromPem(
        forge.pki.certificateToPem(this.certificate)
      ).publicKey as forge.pki.rsa.PublicKey;
      
      return forge.util.encode64(publicKey.n.toString(16));
    } catch (error) {
      console.warn('⚠️  No se pudo extraer módulo RSA, usando placeholder');
      return 'RSA_MODULUS_PLACEHOLDER';
    }
  }

  generateHash(xmlContent: string): string {
    try {
      // Generar hash SHA256 real del contenido XML
      const hash = crypto.createHash('sha256').update(xmlContent, 'utf8').digest('hex');
      
      // Para compatibilidad con SUNAT, tomar los primeros 32 caracteres
      const shortHash = hash.substring(0, 32).toUpperCase();
      
      console.log(`🔢 Hash generado: ${shortHash}`);
      return shortHash;
    } catch (error) {
      console.error('❌ Error generando hash:', error);
      // Fallback hash si hay error
      return crypto.createHash('md5').update(xmlContent + Date.now()).digest('hex').substring(0, 32).toUpperCase();
    }
  }

  validateSignature(signedXml: string): boolean {
    return this.validateSignatureStrict(signedXml);
  }

  /**
   * Verifica criptograficamente una unica firma XMLDSig contra el certificado
   * configurado en esta instancia. No existe bypass para modo demo: los tests
   * deben firmar con el certificado efimero y verificar esa firma real.
   */
  validateSignatureStrict(signedXml: string): boolean {
    try {
      const signatures = signedXml.match(
        /<(?:[\w.-]+:)?Signature\b[\s\S]*?<\/(?:[\w.-]+:)?Signature>/g,
      );
      if (!signatures || signatures.length !== 1) {
        return false;
      }

      const verifier = new SignedXml({
        publicCert: forge.pki.certificateToPem(this.certificate),
      });
      verifier.loadSignature(signatures[0]);
      const references = verifier.getReferences();
      if (references.length !== 1) {
        return false;
      }
      const referenceUri = String(references[0]?.uri ?? '');
      if (referenceUri !== '' && !referenceUri.startsWith('#')) {
        return false;
      }

      return verifier.checkSignature(signedXml);
    } catch (error) {
      console.error('❌ Firma XMLDSig inválida:', error);
      return false;
    }
  }

  /**
   * Información del certificado para logs
   */
  getCertificateInfo(): any {
    try {
      return {
        subject: this.certificate.subject?.attributes?.map(attr => `${attr.name}=${attr.value}`).join(', ') || 'N/A',
        issuer: this.certificate.issuer?.attributes?.map(attr => `${attr.name}=${attr.value}`).join(', ') || 'N/A',
        serialNumber: this.certificate.serialNumber || 'N/A',
        validFrom: this.certificate.validity?.notBefore || 'N/A',
        validTo: this.certificate.validity?.notAfter || 'N/A',
        demoMode: this.demoMode,
        expectedRuc: this.options.expectedRuc || undefined,
        rucMatches: this.options.expectedRuc
          ? this.getCertificateIdentityText().replace(/\D/g, '').includes(this.options.expectedRuc.replace(/\D/g, ''))
          : undefined,
      };
    } catch (error) {
      return { error: 'No se pudo obtener información del certificado', demoMode: this.demoMode };
    }
  }
} 
