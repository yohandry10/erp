import { normalizeCertificateInput, toPostgresBytea } from './certificate.utils';

describe('certificate.utils bytea compatibility', () => {
  it('round-trips bytes with the explicit Postgres bytea representation', () => {
    const original = Buffer.from([0, 1, 2, 127, 128, 255]);

    expect(normalizeCertificateInput(toPostgresBytea(original))).toEqual(original);
  });

  it('recovers Buffer JSON persisted by legacy postgrest serialization', () => {
    const original = Buffer.from('encrypted-certificate-bytes');
    const legacyJson = Buffer.from(JSON.stringify(original));
    const legacyBytea = `\\x${legacyJson.toString('hex')}`;

    expect(normalizeCertificateInput(legacyBytea)).toEqual(original);
  });
});
