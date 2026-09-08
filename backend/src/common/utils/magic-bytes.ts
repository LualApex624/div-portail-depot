/**
 * Detection du type reel d'un fichier a partir de ses premiers octets.
 *
 * Pourquoi maison plutot que `file-type` : l'allowlist du portail se limite a
 * trois formats aux signatures triviales et stables. Une dependance ESM-only
 * de plus dans un backend CommonJS couterait plus cher que ces vingt lignes.
 *
 * Ce controle est le seul qui compte : le Content-Type annonce par le client
 * est declaratif, donc falsifiable (un .exe annonce en application/pdf).
 */

export type DetectedMimeType = 'application/pdf' | 'image/jpeg' | 'image/png';

interface Signature {
  mimeType: DetectedMimeType;
  bytes: number[];
}

const SIGNATURES: Signature[] = [
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export function detectMimeType(head: Buffer): DetectedMimeType | null {
  for (const signature of SIGNATURES) {
    if (head.length < signature.bytes.length) {
      continue;
    }
    if (signature.bytes.every((byte, index) => head[index] === byte)) {
      return signature.mimeType;
    }
  }
  return null;
}

/**
 * Le nom d'origine est conserve pour l'avocat mais n'entre jamais dans une
 * cle objet : on neutralise separateurs et traversees de chemin.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[/\\]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 255);
}
