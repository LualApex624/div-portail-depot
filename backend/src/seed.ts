/**
 * Jeu de donnees de demonstration.
 *
 * Cree deux cabinets, ce qui n'est pas cosmetique : c'est ce qui permet de
 * verifier a la main l'isolation entre avocats, et ce que testent les tests
 * d'isolation tenant.
 *
 * Le seed est idempotent : `install.sh` peut etre relance sans casser la base.
 */
import { PrismaClient } from '@prisma/client';
import { hash, Algorithm } from '@node-rs/argon2';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

const DEMO_USERS = [
  {
    email: 'demo@divprotocol.com',
    displayName: 'Maitre Demo',
    password: process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!',
  },
  {
    email: 'confrere@divprotocol.com',
    displayName: 'Maitre Confrere',
    password: process.env.SEED_DEMO_PASSWORD ?? 'DemoPass123!',
  },
];

async function main(): Promise<void> {
  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        displayName: user.displayName,
        passwordHash: await hash(user.password, ARGON2_OPTIONS),
      },
    });
    console.log(`Avocat de demonstration pret : ${user.email}`);
  }

  // Une demande seedee, exigee par l'enonce. Son token et son PIN ne sont pas
  // conserves : l'avocat de demo en cree une nouvelle depuis le dashboard.
  const demo = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_USERS[0].email },
  });

  const existing = await prisma.depositRequest.findFirst({
    where: { userId: demo.id, title: 'Dossier Martin, pieces 2026' },
  });

  if (!existing) {
    await prisma.depositRequest.create({
      data: {
        title: 'Dossier Martin, pieces 2026',
        // Empreintes factices : cette demande illustre le dashboard, elle
        // n'est pas destinee a etre ouverte.
        tokenHash: `seed-${demo.id}`,
        pinHash: await hash('00000000', ARGON2_OPTIONS),
        expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        userId: demo.id,
      },
    });
    console.log('Demande de demonstration creee : "Dossier Martin, pieces 2026"');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
