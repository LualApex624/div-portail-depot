import { CryptoService } from './crypto.service';
import { configStub } from '../testing/test-doubles';

jest.setTimeout(30_000);

describe('Primitives cryptographiques', () => {
  const crypto = new CryptoService(configStub());

  it('genere un token de 256 bits url-safe', () => {
    const token = crypto.generateToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(crypto.generateToken()).not.toBe(token);
  });

  it('genere un PIN de 8 chiffres, zeros de tete conserves', () => {
    for (let index = 0; index < 200; index += 1) {
      expect(crypto.generatePin()).toMatch(/^\d{8}$/);
    }
  });

  it('hache les secrets a haute entropie de facon deterministe et indexable', () => {
    const token = crypto.generateToken();
    expect(crypto.hashHighEntropySecret(token)).toBe(crypto.hashHighEntropySecret(token));
    expect(crypto.hashHighEntropySecret(token)).toHaveLength(64);
  });

  it('produit des empreintes differentes avec un pepper different', () => {
    const other = new CryptoService(configStub({ SERVER_PEPPER: 'c'.repeat(64) }));
    expect(crypto.hashHighEntropySecret('meme-token')).not.toBe(
      other.hashHighEntropySecret('meme-token'),
    );
  });

  it('verifie un PIN via Argon2id et rejette le mauvais', async () => {
    const digest = await crypto.hashLowEntropySecret('48160000');
    expect(digest.startsWith('$argon2id$')).toBe(true);
    await expect(crypto.verifyLowEntropySecret(digest, '48160000')).resolves.toBe(true);
    await expect(crypto.verifyLowEntropySecret(digest, '48160001')).resolves.toBe(false);
  });

  it('sale differemment deux empreintes du meme PIN', async () => {
    const [first, second] = await Promise.all([
      crypto.hashLowEntropySecret('12345678'),
      crypto.hashLowEntropySecret('12345678'),
    ]);
    expect(first).not.toBe(second);
  });

  it('ne leve pas sur une empreinte corrompue', async () => {
    await expect(crypto.verifyLowEntropySecret('pas-une-empreinte', '12345678')).resolves.toBe(
      false,
    );
  });

  it('pseudonymise l IP sans la rendre reversible ni collisionnable', () => {
    const hashed = crypto.hashIp('203.0.113.10');
    expect(hashed).toHaveLength(32);
    expect(hashed).not.toContain('203');
    expect(crypto.hashIp('203.0.113.10')).toBe(hashed);
    expect(crypto.hashIp('203.0.113.11')).not.toBe(hashed);
  });
});
