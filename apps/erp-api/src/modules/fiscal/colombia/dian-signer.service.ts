import { Injectable, Logger } from '@nestjs/common';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createHash, createSign, randomUUID, X509Certificate } from 'crypto';
import * as fs from 'fs';
import * as forge from 'node-forge';
import * as path from 'path';
import { SignedXml } from 'xml-crypto';

const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const SIGNED_PROPERTIES_TYPE = 'http://uri.etsi.org/01903#SignedProperties';
const MAX_AUTHORITY_CA_BUNDLE_BYTES = 1024 * 1024;
const MAX_AUTHORITY_CA_CERTIFICATES = 64;

export const DIAN_SIGNATURE_POLICY_URL =
  'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';
export const DIAN_SIGNATURE_POLICY_SHA256 = 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=';
export const DIAN_SIGNATURE_POLICY_DESCRIPTION =
  'Política de firma para facturas electrónicas de la República de Colombia.';

export interface SignatureConfig {
  certificatePath?: string;
  certificateBuffer?: Buffer;
  certificatePassword: string;
  signatureId?: string;
  signingTime?: Date;
  /**
   * Literal XAdES de DIAN. Los ejemplos RADIAN oficiales 031-034 usan
   * `supplier` incluso cuando el SenderParty del evento es el adquirente;
   * `third party` identifica una firma por mandatario.
   */
  signerRole?: 'supplier' | 'third party';
}

/**
 * Confianza externa para respuestas firmadas por DIAN.
 *
 * El bundle no se deriva del P12 del tenant: debe provisionarse por una vía
 * operativa independiente. Los pins son SHA-256 del SPKI DER, en hexadecimal
 * de 64 caracteres. Se exige exactamente una fuente de bundle.
 */
export interface DianAuthorityTrustConfig {
  caBundlePem?: string;
  caBundlePath?: string;
  allowedSpkiSha256: readonly string[];
}

interface LoadedCertificate {
  privateKey: forge.pki.rsa.PrivateKey;
  certificate: forge.pki.Certificate;
  chain: forge.pki.Certificate[];
}

interface NamespacePrefix {
  prefix: string;
  namespaceURI: string;
}

@Injectable()
export class DianSignerService {
  private readonly logger = new Logger(DianSignerService.name);

  /** Firma el documento completo con XMLDSig enveloped y XAdES-EPES 1.3.2. */
  async firmarXML(xmlContent: string, config: SignatureConfig): Promise<string> {
    try {
      const document = this.parseXml(xmlContent);
      if (document.getElementsByTagNameNS(XMLDSIG_NS, 'Signature').length > 0) {
        throw new Error('DIAN_XML_ALREADY_SIGNED');
      }
      const loaded = this.loadCertificate(config);
      const signingTime = config.signingTime ?? new Date();
      this.assertSigningCertificate(loaded.certificate, signingTime);
      const isApplicationResponse = document.documentElement.localName === 'ApplicationResponse';
      if (isApplicationResponse && config.signerRole === undefined) {
        throw new Error('DIAN_APPLICATION_RESPONSE_SIGNER_ROLE_REQUIRED');
      }
      const signerRole = config.signerRole ?? 'supplier';
      if (!['supplier', 'third party'].includes(signerRole)) {
        throw new Error('DIAN_SIGNER_ROLE_INVALID');
      }

      const signatureId = this.xmlId(config.signatureId ?? `xmldsig-${randomUUID()}`);
      const ids = {
        signatureId,
        keyInfoId: `${signatureId}-keyinfo`,
        signedPropertiesId: `${signatureId}-signedprops`,
        documentReferenceId: `${signatureId}-ref0`,
      };
      const signatureDocument = this.parseXml(this.signatureSkeleton({
        ...ids,
        signingTime,
        signerRole,
        chain: loaded.chain,
      }));
      this.ensureEmptySignatureExtension(document)
        .appendChild(signatureDocument.documentElement.cloneNode(true));

      const signature = document.getElementsByTagNameNS(XMLDSIG_NS, 'Signature')[0];
      const signedInfo = signature.getElementsByTagNameNS(XMLDSIG_NS, 'SignedInfo')[0];
      const keyInfo = signature.getElementsByTagNameNS(XMLDSIG_NS, 'KeyInfo')[0];
      const signedProperties = signature.getElementsByTagNameNS(XADES_NS, 'SignedProperties')[0];
      const canonicalizer = new SignedXml();
      const unsignedClone = document.cloneNode(true) as Document;
      const cloneSignature = unsignedClone.getElementsByTagNameNS(XMLDSIG_NS, 'Signature')[0];
      cloneSignature.parentNode?.removeChild(cloneSignature);

      this.setReferenceDigest(signature, '', this.digest(
        canonicalizer.getCanonXml([C14N], unsignedClone.documentElement),
      ));
      this.setReferenceDigest(signature, `#${ids.keyInfoId}`, this.digest(
        canonicalizer.getCanonXml([C14N], keyInfo, {
          ancestorNamespaces: this.ancestorNamespaces(keyInfo),
        }),
      ));
      this.setReferenceDigest(signature, `#${ids.signedPropertiesId}`, this.digest(
        canonicalizer.getCanonXml([C14N], signedProperties, {
          ancestorNamespaces: this.ancestorNamespaces(signedProperties),
        }),
      ));

      const canonicalSignedInfo = canonicalizer.getCanonXml([C14N], signedInfo, {
        ancestorNamespaces: this.ancestorNamespaces(signedInfo),
      });
      signature.getElementsByTagNameNS(XMLDSIG_NS, 'SignatureValue')[0].textContent =
        createSign('RSA-SHA256').update(canonicalSignedInfo, 'utf8')
          .sign(forge.pki.privateKeyToPem(loaded.privateKey), 'base64');

      const signedXml = new XMLSerializer().serializeToString(document);
      if (!(await this.verificarFirma(signedXml))) {
        throw new Error('DIAN_XADES_SELF_VERIFICATION_FAILED');
      }
      this.logger.log('XML DIAN firmado y verificado con XAdES-EPES.');
      return signedXml;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DIAN_XADES_SIGNING_FAILED';
      this.logger.error(`Firma DIAN rechazada: ${message}`);
      throw new Error(`Error en firma digital DIAN: ${message}`);
    }
  }

  /** Verifica referencias, RSA, política EPES, certificado y anti-wrapping. */
  async verificarFirma(xmlContent: string): Promise<boolean> {
    try {
      const document = this.parseXml(xmlContent);
      const signatures = document.getElementsByTagNameNS(XMLDSIG_NS, 'Signature');
      if (signatures.length !== 1) return false;
      const signature = signatures[0];
      if ((signature.parentNode as Element | null)?.localName !== 'ExtensionContent') return false;
      if (!this.validSignatureShape(document, signature) || !this.validXades(signature)) return false;

      const certificates = this.extractCertificates(signature);
      const signingTime = this.extractSigningTime(signature);
      if (!signingTime || certificates.length === 0) return false;
      if (!this.validCertificateEvidence(signature, certificates)) return false;
      if (!this.certificateValidAt(certificates[0], signingTime)) return false;
      if (!this.certificateMeetsDianRequirements(certificates[0])) return false;
      if (!this.validCertificateChain(certificates)) return false;

      const verifier = new SignedXml({ publicCert: forge.pki.certificateToPem(certificates[0]) });
      verifier.loadSignature(signature);
      return verifier.checkSignature(xmlContent);
    } catch {
      return false;
    }
  }

  /**
   * Verifica integridad XAdES y, adicionalmente, autoridad explícita.
   *
   * A diferencia de `verificarFirma`, esta operación falla cerrada si falta
   * el trust store, el certificado no encadena con él o el SPKI de la hoja no
   * está fijado. Así, la autofirma con el P12 del tenant conserva su contrato
   * de integridad sin convertir ese P12 en autoridad para respuestas DIAN.
   */
  async verificarFirmaAutoridad(
    xmlContent: string,
    trust: DianAuthorityTrustConfig,
  ): Promise<boolean> {
    try {
      if (!(await this.verificarFirma(xmlContent))) return false;
      const pins = this.authoritySpkiPins(trust.allowedSpkiSha256);
      const authorities = this.loadAuthorityCertificates(trust);
      const document = this.parseXml(xmlContent);
      const signature = document.getElementsByTagNameNS(XMLDSIG_NS, 'Signature')[0];
      if (!signature) return false;
      const chain = this.extractCertificates(signature);
      if (chain.length === 0 || !pins.has(this.spkiSha256(chain[0]))) return false;

      const caStore = forge.pki.createCaStore(authorities);
      return forge.pki.verifyCertificateChain(caStore, chain, {
        validityCheckDate: new Date(),
      });
    } catch {
      return false;
    }
  }

  async obtenerInfoCertificado(config: SignatureConfig): Promise<{
    subject: string; issuer: string; validFrom: Date; validTo: Date; serialNumber: string;
  }> {
    const { certificate } = this.loadCertificate(config);
    return {
      subject: certificate.subject.getField('CN')?.value || 'N/A',
      issuer: certificate.issuer.getField('CN')?.value || 'N/A',
      validFrom: certificate.validity.notBefore,
      validTo: certificate.validity.notAfter,
      serialNumber: certificate.serialNumber,
    };
  }

  private loadCertificate(config: SignatureConfig): LoadedCertificate {
    const buffer = config.certificateBuffer
      ?? (config.certificatePath ? fs.readFileSync(config.certificatePath) : null);
    if (!buffer) throw new Error('DIAN_P12_REQUIRED');
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(buffer.toString('binary')),
      false,
      config.certificatePassword,
    );
    const certificates = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ]?.flatMap((bag) => bag.cert ? [bag.cert] : []) ?? [];
    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ?? []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
    ];
    const privateKey = keyBags.find((bag) => bag.key)?.key as forge.pki.rsa.PrivateKey | undefined;
    if (!privateKey || certificates.length === 0) {
      throw new Error('DIAN_P12_KEY_OR_CERTIFICATE_MISSING');
    }
    const leaf = certificates.find((cert) => {
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      return publicKey.n?.compareTo(privateKey.n) === 0 && publicKey.e?.compareTo(privateKey.e) === 0;
    });
    if (!leaf) throw new Error('DIAN_P12_PRIVATE_KEY_CERTIFICATE_MISMATCH');
    return { privateKey, certificate: leaf, chain: this.orderChain(leaf, certificates) };
  }

  private orderChain(leaf: forge.pki.Certificate, certificates: forge.pki.Certificate[]): forge.pki.Certificate[] {
    const chain = [leaf];
    const remaining = certificates.filter((candidate) => candidate !== leaf);
    while (remaining.length > 0) {
      const current = chain[chain.length - 1];
      const index = remaining.findIndex(
        (candidate) => this.dn(candidate.subject.attributes) === this.dn(current.issuer.attributes),
      );
      if (index < 0) break;
      chain.push(remaining.splice(index, 1)[0]);
    }
    // Los P12 pueden traer certificados personales no relacionados. Incluirlos
    // como si fueran parte de la cadena vuelve la evidencia XAdES falsa; sólo
    // se conserva el camino enlazado emisor→raíz.
    return chain;
  }

  private assertSigningCertificate(certificate: forge.pki.Certificate, signingTime: Date): void {
    if (!this.certificateValidAt(certificate, signingTime)) {
      throw new Error('DIAN_CERTIFICATE_NOT_VALID_AT_SIGNING_TIME');
    }
    if (!this.certificateMeetsDianRequirements(certificate)) {
      throw new Error('DIAN_CERTIFICATE_KEY_USAGE_OR_ALGORITHM_INVALID');
    }
  }

  private certificateMeetsDianRequirements(certificate: forge.pki.Certificate): boolean {
    const allowedOids = new Set([
      forge.pki.oids.sha256WithRSAEncryption,
      forge.pki.oids.sha384WithRSAEncryption,
      forge.pki.oids.sha512WithRSAEncryption,
    ]);
    if (!allowedOids.has(certificate.signatureOid)) return false;
    const keyUsage = certificate.getExtension('keyUsage') as {
      critical?: boolean;
      digitalSignature?: boolean; nonRepudiation?: boolean;
    };
    return Boolean(keyUsage?.critical && (keyUsage.digitalSignature || keyUsage.nonRepudiation));
  }

  private signatureSkeleton(input: {
    signatureId: string; keyInfoId: string; signedPropertiesId: string;
    documentReferenceId: string; signingTime: Date;
    signerRole: 'supplier' | 'third party'; chain: forge.pki.Certificate[];
  }): string {
    const certificates = input.chain.map(
      (cert) => `<ds:X509Certificate>${this.certificateBase64(cert)}</ds:X509Certificate>`,
    ).join('');
    const signingCertificates = input.chain.map((cert) =>
      `<xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="${SHA256}"/>`
      + `<ds:DigestValue>${this.digest(this.certificateDer(cert))}</ds:DigestValue>`
      + `</xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${this.escapeXml(this.dn(cert.issuer.attributes))}</ds:X509IssuerName>`
      + `<ds:X509SerialNumber>${this.serialDecimal(cert.serialNumber)}</ds:X509SerialNumber>`
      + '</xades:IssuerSerial></xades:Cert>',
    ).join('');
    return `<ds:Signature xmlns:ds="${XMLDSIG_NS}" xmlns:xades="${XADES_NS}" Id="${input.signatureId}">`
      + `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${C14N}"/>`
      + `<ds:SignatureMethod Algorithm="${RSA_SHA256}"/>`
      + `<ds:Reference Id="${input.documentReferenceId}" URI=""><ds:Transforms><ds:Transform Algorithm="${ENVELOPED}"/></ds:Transforms>`
      + `<ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>PLACEHOLDER</ds:DigestValue></ds:Reference>`
      + `<ds:Reference URI="#${input.keyInfoId}"><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>PLACEHOLDER</ds:DigestValue></ds:Reference>`
      + `<ds:Reference Type="${SIGNED_PROPERTIES_TYPE}" URI="#${input.signedPropertiesId}"><ds:DigestMethod Algorithm="${SHA256}"/>`
      + '<ds:DigestValue>PLACEHOLDER</ds:DigestValue></ds:Reference></ds:SignedInfo>'
      + `<ds:SignatureValue>PLACEHOLDER</ds:SignatureValue><ds:KeyInfo Id="${input.keyInfoId}"><ds:X509Data>${certificates}</ds:X509Data></ds:KeyInfo>`
      + `<ds:Object><xades:QualifyingProperties Target="#${input.signatureId}"><xades:SignedProperties Id="${input.signedPropertiesId}">`
      + `<xades:SignedSignatureProperties><xades:SigningTime>${this.bogotaDateTime(input.signingTime)}</xades:SigningTime>`
      + `<xades:SigningCertificate>${signingCertificates}</xades:SigningCertificate>`
      + '<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId>'
      + `<xades:Identifier>${DIAN_SIGNATURE_POLICY_URL}</xades:Identifier><xades:Description>${DIAN_SIGNATURE_POLICY_DESCRIPTION}</xades:Description>`
      + `</xades:SigPolicyId><xades:SigPolicyHash><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${DIAN_SIGNATURE_POLICY_SHA256}</ds:DigestValue>`
      + `</xades:SigPolicyHash><xades:SigPolicyQualifiers><xades:SigPolicyQualifier><xades:SPURI>${DIAN_SIGNATURE_POLICY_URL}</xades:SPURI>`
      + '</xades:SigPolicyQualifier></xades:SigPolicyQualifiers></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>'
      + `<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>${input.signerRole}</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>`
      + `</xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${input.documentReferenceId}">`
      + '<xades:MimeType>text/xml</xades:MimeType></xades:DataObjectFormat></xades:SignedDataObjectProperties>'
      + '</xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>';
  }

  private parseXml(xml: string): Document {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DIAN_XML_DTD_FORBIDDEN');
    const errors: string[] = [];
    const document = new DOMParser({ errorHandler: {
      warning: () => undefined,
      error: (message) => errors.push(message),
      fatalError: (message) => errors.push(message),
    } }).parseFromString(xml, 'text/xml');
    if (errors.length || !document.documentElement || document.documentElement.localName === 'parsererror') {
      throw new Error('DIAN_XML_MALFORMED');
    }
    return document;
  }

  private ensureEmptySignatureExtension(document: Document): Element {
    const root = document.documentElement;
    const empty = Array.from(root.getElementsByTagNameNS(EXT_NS, 'ExtensionContent')).find(
      (content) => !Array.from(content.childNodes).some((node) => node.nodeType === 1),
    );
    if (empty) return empty;
    let extensions = root.getElementsByTagNameNS(EXT_NS, 'UBLExtensions')[0];
    if (!extensions) {
      extensions = document.createElementNS(EXT_NS, 'ext:UBLExtensions');
      extensions.setAttribute('xmlns:ext', EXT_NS);
      root.insertBefore(extensions, root.firstChild);
    }
    const extension = document.createElementNS(EXT_NS, 'ext:UBLExtension');
    const content = document.createElementNS(EXT_NS, 'ext:ExtensionContent');
    extension.appendChild(content);
    extensions.appendChild(extension);
    return content;
  }

  private setReferenceDigest(signature: Element, uri: string, digest: string): void {
    const reference = Array.from(signature.getElementsByTagNameNS(XMLDSIG_NS, 'Reference'))
      .find((candidate) => candidate.getAttribute('URI') === uri);
    const value = reference?.getElementsByTagNameNS(XMLDSIG_NS, 'DigestValue')[0];
    if (!value) throw new Error('DIAN_XADES_REFERENCE_MISSING');
    value.textContent = digest;
  }

  private ancestorNamespaces(node: Node): NamespacePrefix[] {
    const namespaces = new Map<string, string>();
    let current = node.parentNode as Element | null;
    while (current?.nodeType === 1) {
      for (const attribute of Array.from(current.attributes ?? [])) {
        if (attribute.name === 'xmlns' && !namespaces.has('')) namespaces.set('', attribute.value);
        else if (attribute.prefix === 'xmlns' && !namespaces.has(attribute.localName)) {
          namespaces.set(attribute.localName, attribute.value);
        }
      }
      current = current.parentNode as Element | null;
    }
    return Array.from(namespaces, ([prefix, namespaceURI]) => ({ prefix, namespaceURI }));
  }

  private validSignatureShape(document: Document, signature: Element): boolean {
    const infos = signature.getElementsByTagNameNS(XMLDSIG_NS, 'SignedInfo');
    if (infos.length !== 1) return false;
    const info = infos[0];
    const c14n = info.getElementsByTagNameNS(XMLDSIG_NS, 'CanonicalizationMethod');
    const methods = info.getElementsByTagNameNS(XMLDSIG_NS, 'SignatureMethod');
    if (c14n.length !== 1 || c14n[0].getAttribute('Algorithm') !== C14N) return false;
    if (methods.length !== 1 || methods[0].getAttribute('Algorithm') !== RSA_SHA256) return false;
    const refs = Array.from(info.getElementsByTagNameNS(XMLDSIG_NS, 'Reference'));
    if (refs.length !== 3) return false;
    const docRef = refs.find((ref) => ref.getAttribute('URI') === '');
    const propsRef = refs.find((ref) => ref.getAttribute('Type') === SIGNED_PROPERTIES_TYPE);
    const keyRef = refs.find((ref) => ref !== docRef && ref !== propsRef);
    if (!docRef || !propsRef || !keyRef) return false;
    if (!this.singleIdReference(document, keyRef.getAttribute('URI'), 'KeyInfo')) return false;
    if (!this.singleIdReference(document, propsRef.getAttribute('URI'), 'SignedProperties')) return false;
    if (refs.some((ref) => {
      const digest = ref.getElementsByTagNameNS(XMLDSIG_NS, 'DigestMethod');
      return digest.length !== 1 || digest[0].getAttribute('Algorithm') !== SHA256;
    })) return false;
    const transforms = Array.from(docRef.getElementsByTagNameNS(XMLDSIG_NS, 'Transform'));
    if (transforms.length !== 1 || transforms[0].getAttribute('Algorithm') !== ENVELOPED) return false;
    if (keyRef.getElementsByTagNameNS(XMLDSIG_NS, 'Transform').length) return false;
    if (propsRef.getElementsByTagNameNS(XMLDSIG_NS, 'Transform').length) return false;
    return this.idsUnique(document);
  }

  private singleIdReference(document: Document, uri: string, localName: string): boolean {
    if (!uri?.startsWith('#') || /['"]/.test(uri)) return false;
    const id = uri.slice(1);
    const matches = Array.from(document.getElementsByTagName('*')).filter(
      (element) => ['Id', 'ID', 'id'].some((name) => element.getAttribute(name) === id),
    );
    return matches.length === 1 && matches[0].localName === localName;
  }

  private idsUnique(document: Document): boolean {
    const ids = new Set<string>();
    for (const element of Array.from(document.getElementsByTagName('*'))) {
      for (const name of ['Id', 'ID', 'id']) {
        const id = element.getAttribute(name);
        if (id && ids.has(id)) return false;
        if (id) ids.add(id);
      }
    }
    return true;
  }

  private validXades(signature: Element): boolean {
    const signatureId = signature.getAttribute('Id');
    const qualifying = signature.getElementsByTagNameNS(XADES_NS, 'QualifyingProperties');
    const properties = signature.getElementsByTagNameNS(XADES_NS, 'SignedProperties');
    if (!signatureId || qualifying.length !== 1 || qualifying[0].getAttribute('Target') !== `#${signatureId}`) return false;
    if (properties.length !== 1 || !properties[0].getAttribute('Id')) return false;
    const identifiers = signature.getElementsByTagNameNS(XADES_NS, 'Identifier');
    const roles = signature.getElementsByTagNameNS(XADES_NS, 'ClaimedRole');
    if (identifiers.length !== 1 || identifiers[0].textContent?.trim() !== DIAN_SIGNATURE_POLICY_URL) return false;
    if (roles.length !== 1 || !['supplier', 'third party'].includes(roles[0].textContent?.trim() ?? '')) return false;
    const policy = signature.getElementsByTagNameNS(XADES_NS, 'SigPolicyHash');
    if (policy.length !== 1) return false;
    const method = policy[0].getElementsByTagNameNS(XMLDSIG_NS, 'DigestMethod');
    const value = policy[0].getElementsByTagNameNS(XMLDSIG_NS, 'DigestValue');
    return method.length === 1 && method[0].getAttribute('Algorithm') === SHA256
      && value.length === 1 && value[0].textContent?.trim() === DIAN_SIGNATURE_POLICY_SHA256;
  }

  private extractCertificates(signature: Element): forge.pki.Certificate[] {
    const keyInfos = signature.getElementsByTagNameNS(XMLDSIG_NS, 'KeyInfo');
    if (keyInfos.length !== 1) return [];
    return Array.from(keyInfos[0].getElementsByTagNameNS(XMLDSIG_NS, 'X509Certificate')).map((node) => {
      const base64 = node.textContent?.replace(/\s/g, '') ?? '';
      return forge.pki.certificateFromPem(
        `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g)?.join('\n') ?? ''}\n-----END CERTIFICATE-----`,
      );
    });
  }

  private validCertificateEvidence(signature: Element, certificates: forge.pki.Certificate[]): boolean {
    const containers = signature.getElementsByTagNameNS(XADES_NS, 'SigningCertificate');
    if (containers.length !== 1) return false;
    const nodes = Array.from(containers[0].getElementsByTagNameNS(XADES_NS, 'Cert'));
    if (nodes.length !== certificates.length) return false;
    return nodes.every((node, index) => {
      const method = node.getElementsByTagNameNS(XMLDSIG_NS, 'DigestMethod');
      const value = node.getElementsByTagNameNS(XMLDSIG_NS, 'DigestValue');
      const issuer = node.getElementsByTagNameNS(XMLDSIG_NS, 'X509IssuerName');
      const serial = node.getElementsByTagNameNS(XMLDSIG_NS, 'X509SerialNumber');
      const certificate = certificates[index];
      return method.length === 1 && method[0].getAttribute('Algorithm') === SHA256
        && value.length === 1 && value[0].textContent?.trim() === this.digest(this.certificateDer(certificate))
        && issuer.length === 1 && issuer[0].textContent === this.dn(certificate.issuer.attributes)
        && serial.length === 1 && serial[0].textContent === this.serialDecimal(certificate.serialNumber);
    });
  }

  private extractSigningTime(signature: Element): Date | null {
    const nodes = signature.getElementsByTagNameNS(XADES_NS, 'SigningTime');
    if (nodes.length !== 1) return null;
    const value = nodes[0].textContent?.trim() ?? '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private validCertificateChain(certificates: forge.pki.Certificate[]): boolean {
    try {
      for (let index = 0; index < certificates.length - 1; index += 1) {
        if (!certificates[index + 1].verify(certificates[index])) return false;
      }
      const root = certificates[certificates.length - 1];
      const selfIssued = this.dn(root.subject.attributes) === this.dn(root.issuer.attributes);
      return certificates.length === 1 || !selfIssued || root.verify(root);
    } catch {
      return false;
    }
  }

  private authoritySpkiPins(values: readonly string[]): Set<string> {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('DIAN_AUTHORITY_SPKI_REQUIRED');
    }
    const normalized = values.map((value) => String(value).trim().toLowerCase());
    if (normalized.some((value) => !/^[a-f0-9]{64}$/.test(value))) {
      throw new Error('DIAN_AUTHORITY_SPKI_INVALID');
    }
    return new Set(normalized);
  }

  private loadAuthorityCertificates(trust: DianAuthorityTrustConfig): forge.pki.Certificate[] {
    const hasInlineBundle = trust.caBundlePem !== undefined;
    const hasBundlePath = trust.caBundlePath !== undefined;
    if (hasInlineBundle === hasBundlePath) {
      throw new Error('DIAN_AUTHORITY_CA_BUNDLE_SOURCE_INVALID');
    }

    const pem = hasInlineBundle
      ? this.validateInlineAuthorityBundle(trust.caBundlePem)
      : this.readAuthorityBundleFile(trust.caBundlePath);
    const pattern = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const blocks = pem.match(pattern) ?? [];
    if (blocks.length === 0 || blocks.length > MAX_AUTHORITY_CA_CERTIFICATES) {
      throw new Error('DIAN_AUTHORITY_CA_BUNDLE_CERTIFICATES_INVALID');
    }
    if (pem.replace(pattern, '').trim().length > 0) {
      throw new Error('DIAN_AUTHORITY_CA_BUNDLE_FORMAT_INVALID');
    }

    const certificates = blocks.map((block) => forge.pki.certificateFromPem(block, true, true));
    const unique = new Map<string, forge.pki.Certificate>();
    for (const certificate of certificates) {
      unique.set(this.certificateFingerprint(certificate), certificate);
    }
    return Array.from(unique.values());
  }

  private validateInlineAuthorityBundle(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0
      || Buffer.byteLength(value, 'utf8') > MAX_AUTHORITY_CA_BUNDLE_BYTES) {
      throw new Error('DIAN_AUTHORITY_CA_BUNDLE_INLINE_INVALID');
    }
    return value;
  }

  private readAuthorityBundleFile(value: string | undefined): string {
    if (typeof value !== 'string' || value.trim().length === 0 || !path.isAbsolute(value)) {
      throw new Error('DIAN_AUTHORITY_CA_BUNDLE_PATH_INVALID');
    }
    const resolved = fs.realpathSync(value);
    const descriptor = fs.openSync(resolved, 'r');
    try {
      const metadata = fs.fstatSync(descriptor);
      if (!metadata.isFile() || metadata.size <= 0
        || metadata.size > MAX_AUTHORITY_CA_BUNDLE_BYTES) {
        throw new Error('DIAN_AUTHORITY_CA_BUNDLE_FILE_INVALID');
      }
      return fs.readFileSync(descriptor, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
  }

  private spkiSha256(certificate: forge.pki.Certificate): string {
    const x509 = new X509Certificate(forge.pki.certificateToPem(certificate));
    const spki = x509.publicKey.export({ type: 'spki', format: 'der' });
    if (!Buffer.isBuffer(spki)) throw new Error('DIAN_AUTHORITY_SPKI_EXPORT_INVALID');
    return createHash('sha256').update(spki).digest('hex');
  }

  private certificateFingerprint(certificate: forge.pki.Certificate): string {
    return createHash('sha256').update(this.certificateDer(certificate)).digest('hex');
  }

  private certificateValidAt(certificate: forge.pki.Certificate, value: Date): boolean {
    return value >= certificate.validity.notBefore && value <= certificate.validity.notAfter;
  }

  private certificateDer(certificate: forge.pki.Certificate): Buffer {
    return Buffer.from(
      forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(),
      'binary',
    );
  }

  private certificateBase64(certificate: forge.pki.Certificate): string {
    return this.certificateDer(certificate).toString('base64');
  }

  private digest(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('base64');
  }

  private dn(attributes: forge.pki.CertificateField[]): string {
    return attributes.map((attribute) => {
      const name = attribute.shortName || attribute.name || attribute.type;
      const value = String(attribute.value ?? '').replace(/\\/g, '\\\\').replace(/,/g, '\\,')
        .replace(/\+/g, '\\+').replace(/"/g, '\\"').replace(/</g, '\\<')
        .replace(/>/g, '\\>').replace(/;/g, '\\;');
      return `${name}=${value}`;
    }).join(',');
  }

  private serialDecimal(value: string): string {
    return BigInt(`0x${value || '0'}`).toString(10);
  }

  private bogotaDateTime(value: Date): string {
    if (Number.isNaN(value.getTime())) throw new Error('DIAN_SIGNING_TIME_INVALID');
    return `${new Date(value.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19)}-05:00`;
  }

  private xmlId(value: string): string {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value)) throw new Error('DIAN_SIGNATURE_ID_INVALID');
    return value;
  }

  private escapeXml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
}
