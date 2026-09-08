import { detectMimeType, sanitizeFilename } from './magic-bytes';

const pdf = Buffer.from('%PDF-1.7\n...');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('Type reel des fichiers', () => {
  it('reconnait les trois formats de l allowlist', () => {
    expect(detectMimeType(pdf)).toBe('application/pdf');
    expect(detectMimeType(png)).toBe('image/png');
    expect(detectMimeType(jpeg)).toBe('image/jpeg');
  });

  it('refuse un executable renomme en PDF', () => {
    // MZ : en-tete d un binaire Windows. Content-Type declare : application/pdf.
    expect(detectMimeType(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('refuse un fichier trop court pour porter une signature', () => {
    expect(detectMimeType(Buffer.from([0xff]))).toBeNull();
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('neutralise les traversees de chemin dans le nom de fichier', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('._._etc_passwd');
    expect(sanitizeFilename('contrat\\signe.pdf')).toBe('contrat_signe.pdf');
    expect(sanitizeFilename('ligne\ninjectee.pdf')).toBe('ligne injectee.pdf');
  });

  it('borne la longueur du nom conserve', () => {
    expect(sanitizeFilename('a'.repeat(400))).toHaveLength(255);
  });
});
