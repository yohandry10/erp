import axios from 'axios';
import { PdfFormatHelperService } from './pdf-format-helper.service';
import {
  CPE_PDF_LOGO_MAX_BYTES,
  decodeCpePdfLogoDataUrl,
  isPublicPdfLogoNetworkAddress,
  PdfGeneratorService,
  resolveAllowedCpePdfLogoUrl,
} from './pdf-generator.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';

jest.mock('axios');

const PROD_SUPABASE_URL = 'https://wypnbcptofqdmoynlonq.supabase.co';
const PUBLIC_LOGO_URL =
  `${PROD_SUPABASE_URL}/storage/v1/object/public/company-assets/tenant-1/logo.png`;
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe('PdfGeneratorService logo security', () => {
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const axiosGet = axios.get as jest.MockedFunction<typeof axios.get>;
  let service: PdfGeneratorService;
  let loadLogoBuffer: (logoUrl?: string | null) => Promise<Buffer | null>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = PROD_SUPABASE_URL;
    service = new PdfGeneratorService(
      {} as SupabaseService,
      {} as PdfFormatHelperService,
    );
    loadLogoBuffer = (logoUrl) => (
      service as unknown as {
        loadLogoBuffer(value?: string | null): Promise<Buffer | null>;
      }
    ).loadLogoBuffer(logoUrl);
  });

  afterAll(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.SUPABASE_URL;
    } else {
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it('acepta el data URL PNG usado por el cargador y valida su firma real', async () => {
    const dataUrl = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

    await expect(loadLogoBuffer(dataUrl)).resolves.toEqual(PNG_BYTES);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rechaza SVG, MIME false y data URLs mayores de 2 MiB', () => {
    expect(() => decodeCpePdfLogoDataUrl(
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    )).toThrow('Data URL de logo no permitida');
    expect(() => decodeCpePdfLogoDataUrl(
      `data:image/png;base64,${Buffer.from('no-es-png').toString('base64')}`,
    )).toThrow('no coincide');
    expect(() => decodeCpePdfLogoDataUrl(
      `data:image/png;base64,${Buffer.alloc(CPE_PDF_LOGO_MAX_BYTES + 1).toString('base64')}`,
    )).toThrow('excede el máximo');
  });

  it.each([
    '../../etc/passwd',
    'C:\\Windows\\System32\\drivers\\etc\\hosts',
    'file:///etc/passwd',
    'https://localhost/storage/v1/object/public/logos/a.png',
    'https://127.0.0.1/storage/v1/object/public/logos/a.png',
    'https://169.254.169.254/latest/meta-data/iam',
    'https://10.0.0.1/storage/v1/object/public/logos/a.png',
    'https://172.16.0.1/storage/v1/object/public/logos/a.png',
    'https://192.168.1.1/storage/v1/object/public/logos/a.png',
    'https://[::1]/storage/v1/object/public/logos/a.png',
    'https://example.com/logo.png',
    `${PROD_SUPABASE_URL}/auth/v1/settings`,
    `${PROD_SUPABASE_URL}/storage/v1/object/public/logos/%2e%2e/private/logo.png`,
  ])('rechaza rutas locales, redes privadas y destinos fuera de la allowlist: %s', async (value) => {
    await expect(loadLogoBuffer(value)).resolves.toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('sólo descarga objetos públicos del Storage configurado, sin redirects y con límites', async () => {
    axiosGet.mockResolvedValue({
      status: 200,
      data: PNG_BYTES,
      headers: {
        'content-type': 'image/png',
        'content-length': String(PNG_BYTES.length),
      },
    } as never);

    await expect(loadLogoBuffer(PUBLIC_LOGO_URL)).resolves.toEqual(PNG_BYTES);
    expect(axiosGet).toHaveBeenCalledWith(
      PUBLIC_LOGO_URL,
      expect.objectContaining({
        responseType: 'arraybuffer',
        maxRedirects: 0,
        maxContentLength: CPE_PDF_LOGO_MAX_BYTES,
        maxBodyLength: CPE_PDF_LOGO_MAX_BYTES,
        decompress: false,
        httpsAgent: expect.anything(),
      }),
    );
  });

  it('rechaza una redirección aunque el destino inicial pertenezca al Storage', async () => {
    axiosGet.mockResolvedValue({
      status: 302,
      data: PNG_BYTES,
      headers: {
        location: 'http://169.254.169.254/latest/meta-data/',
        'content-type': 'image/png',
      },
    } as never);

    await expect(loadLogoBuffer(PUBLIC_LOGO_URL)).resolves.toBeNull();
    expect(axiosGet.mock.calls[0][1]).toEqual(expect.objectContaining({ maxRedirects: 0 }));
  });

  it('rechaza MIME no permitido, bytes suplantados y payload remoto excesivo', async () => {
    axiosGet
      .mockResolvedValueOnce({
        status: 200,
        data: PNG_BYTES,
        headers: { 'content-type': 'image/svg+xml' },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: Buffer.from('html'),
        headers: { 'content-type': 'image/png' },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: PNG_BYTES,
        headers: {
          'content-type': 'image/png',
          'content-length': String(CPE_PDF_LOGO_MAX_BYTES + 1),
        },
      } as never);

    await expect(loadLogoBuffer(PUBLIC_LOGO_URL)).resolves.toBeNull();
    await expect(loadLogoBuffer(PUBLIC_LOGO_URL)).resolves.toBeNull();
    await expect(loadLogoBuffer(PUBLIC_LOGO_URL)).resolves.toBeNull();
  });

  it('clasifica como no públicas las redes internas y link-local tras DNS', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '100.64.0.1',
      '169.254.169.254',
      '172.31.255.255',
      '192.168.0.1',
      '::1',
      '::ffff:127.0.0.1',
      'fc00::1',
      'fe80::1',
    ]) {
      expect(isPublicPdfLogoNetworkAddress(address)).toBe(false);
    }
    expect(isPublicPdfLogoNetworkAddress('8.8.8.8')).toBe(true);
    expect(isPublicPdfLogoNetworkAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('no admite credenciales, fragmentos ni origen distinto en la URL de Storage', () => {
    expect(() => resolveAllowedCpePdfLogoUrl(PUBLIC_LOGO_URL, PROD_SUPABASE_URL)).not.toThrow();
    expect(() => resolveAllowedCpePdfLogoUrl(
      'https://user:pass@wypnbcptofqdmoynlonq.supabase.co/storage/v1/object/public/logos/a.png',
      PROD_SUPABASE_URL,
    )).toThrow('Storage Supabase');
    expect(() => resolveAllowedCpePdfLogoUrl(`${PUBLIC_LOGO_URL}#fragment`, PROD_SUPABASE_URL))
      .toThrow('Storage Supabase');
  });

  it('bloquea un SUPABASE_URL configurado con IP aunque el origen coincida', () => {
    expect(() => resolveAllowedCpePdfLogoUrl(
      'https://169.254.169.254/storage/v1/object/public/logos/a.png',
      'https://169.254.169.254',
    )).toThrow('no es un dominio');
  });
});
