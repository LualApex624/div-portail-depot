import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Inter, servie par Next : la police est auto-hebergee au build, il n'y a donc
// aucun appel a un domaine tiers au chargement d'une page juridique.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Portail de depot de pieces — DIV Protocol',
  description: 'Depot de pieces securise entre un avocat et son client.',
  // Une page de depot ne doit jamais se retrouver dans un index public.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={inter.className} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
