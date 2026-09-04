import {
  buildArcaQrRepresentation,
  buildDianQrRepresentation,
  resolveArcaQrContent,
  resolveDianQrContent,
} from './fiscal-qr.util';

describe('QR fiscal DIAN', () => {
  const cufe = 'A'.repeat(96);
  const accepted = {
    simulated_origin: false,
    fiscal_authority_evidence: {
      contract_version: 525, authority: 'DIAN', country_code: 'CO', status: 'ACCEPTED',
      code_kind: 'CUFE', unique_code: cufe,
    },
  };

  it('construye la consulta DIAN sólo desde el CUFE terminal 525', async () => {
    const representation = await buildDianQrRepresentation(accepted);

    expect(representation).toMatchObject({
      content: `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`,
    });
    expect(representation?.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('nunca interpreta cpe.hash ni metadata.cufe como evidencia DIAN', () => {
    expect(resolveDianQrContent({
      simulated_origin: false,
      ...( { hash: cufe, metadata: { cufe } } as any),
    })).toBeNull();
  });

  it.each([
    [{}, 'legacy sin procedencia'],
    [{ ...accepted, simulated_origin: true }, 'origen simulado'],
    [{ ...accepted, fiscal_authority_evidence: { status: 'PENDING' } }, 'sin aceptación terminal'],
  ])('no inventa URL oficial para %s', async (candidate, _reason) => {
    expect(resolveDianQrContent(candidate)).toBeNull();
    await expect(buildDianQrRepresentation(candidate)).resolves.toBeNull();
  });

  it('falla cerrado si una evidencia marcada ACCEPTED es inconsistente', () => {
    expect(() => resolveDianQrContent({
      ...accepted,
      fiscal_authority_evidence: { ...accepted.fiscal_authority_evidence, unique_code: 'HASH-XML' },
    })).toThrow('evidencia fiscal 525 inválida');
  });
});

describe('QR fiscal ARCA', () => {
  const authorizedInvoice = {
    tipo_documento: '001',
    serie: '00005',
    numero: 94,
    fecha_emision: '2026-08-29',
    ruc_emisor: '30700000001',
    tipo_documento_receptor: 'CUIT',
    documento_receptor: '30712345678',
    total_venta: 12100,
    moneda: 'ARS',
    hash: '70417054367476',
    arca_condicion_iva_emisor: 'RESPONSABLE_INSCRIPTO',
    arca_condicion_iva_receptor: 'RESPONSABLE_INSCRIPTO',
    metadata: {
      fiscal_country: 'AR', arca_cae: '70417054367476', arca_cae_vencimiento: '20260910',
      arca_punto_venta: 5, arca_cbte_tipo: 1, arca_cbte_numero: 94,
    },
  };

  it('construye el enlace oficial ARCA v1 con los datos autorizados persistidos', async () => {
    const content = resolveArcaQrContent(authorizedInvoice);
    expect(content).toMatch(/^https:\/\/www\.arca\.gob\.ar\/fe\/qr\/\?p=/);
    const encoded = content!.split('?p=')[1];
    expect(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))).toEqual({
      ver: 1,
      fecha: '2026-08-29',
      cuit: 30700000001,
      ptoVta: 5,
      tipoCmp: 1,
      nroCmp: 94,
      importe: 12100,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 30712345678,
      tipoCodAut: 'E',
      codAut: 70417054367476,
    });
    expect((await buildArcaQrRepresentation(authorizedInvoice))?.dataUrl)
      .toMatch(/^data:image\/png;base64,/);
  });

  it('conserva en el QR la fecha fiscal autorizada aunque el timestamptz caiga en otro día UTC', () => {
    const authorizedPayload = {
      ver: 1,
      fecha: '2026-08-20',
      cuit: 30700000001,
      ptoVta: 5,
      tipoCmp: 1,
      nroCmp: 94,
      importe: 12100,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 30712345678,
      tipoCodAut: 'E',
      codAut: 70417054367476,
    };
    const authorizedQr = `https://www.arca.gob.ar/fe/qr/?p=${Buffer.from(
      JSON.stringify(authorizedPayload),
    ).toString('base64')}`;
    const content = resolveArcaQrContent({
      ...authorizedInvoice,
      fecha_emision: '2026-08-21T02:30:00Z',
      metadata: {
        ...authorizedInvoice.metadata,
        arca_qr_url: authorizedQr,
      },
    });
    const payload = JSON.parse(
      Buffer.from(content!.split('?p=')[1], 'base64').toString('utf8'),
    );

    expect(content).toBe(authorizedQr);
    expect(payload.fecha).toBe('2026-08-20');
  });

  it('falla cerrado sin CAE, salvo una demo marcada explícitamente', async () => {
    expect(() => resolveArcaQrContent({
      ...authorizedInvoice, hash: null, metadata: { ...authorizedInvoice.metadata, arca_cae: null },
    })).toThrow('falta CAE válido');
    await expect(buildArcaQrRepresentation(
      { ...authorizedInvoice, hash: null, metadata: {} },
      { allowMissingAuthorization: true },
    )).resolves.toBeNull();
  });

  it.each([
    ['01', 'RESPONSABLE_INSCRIPTO'],
    ['03', 'CONSUMIDOR_FINAL'],
    ['07', 'MONOTRIBUTO'],
    ['08', 'EXENTO'],
  ])('una muestra legacy %s con receptor %s nunca genera QR ARCA', (
    legacyType,
    receiverVatCondition,
  ) => {
    expect(resolveArcaQrContent({
      ...authorizedInvoice,
      tipo_documento: legacyType,
      arca_condicion_iva_receptor: receiverVatCondition,
      hash: '70417054367476',
      metadata: { ...authorizedInvoice.metadata },
    }, { allowMissingAuthorization: true })).toBeNull();
  });

  it('no acepta un hash local numérico como CAE sin evidencia fiscal 524', () => {
    expect(() => resolveArcaQrContent({ ...authorizedInvoice, metadata: {} }))
      .toThrow('evidencia fiscal 524');
  });

  it.each([
    [{ fecha_emision: '2026-02-30' }, 'fecha de emisión inválida'],
    [{ tipo_documento_receptor: 'PASAPORTE' }, 'tipo de documento del receptor inválido'],
    [{ metadata: { ...authorizedInvoice.metadata, tipoCodAut: 'A' } }, 'CAEA no está implementado'],
    [{ metadata: { ...authorizedInvoice.metadata, arca_cae_vencimiento: null } }, 'vencimiento del CAE'],
    [{ metadata: { ...authorizedInvoice.metadata, arca_cae_vencimiento: '20260230' } }, 'vencimiento del CAE'],
  ])('rechaza evidencia ARCA inválida: %s', (patch, expected) => {
    const candidate = {
      ...authorizedInvoice,
      ...patch,
      metadata: (patch as any).metadata ?? authorizedInvoice.metadata,
    };
    expect(() => resolveArcaQrContent(candidate)).toThrow(expected);
  });
});
