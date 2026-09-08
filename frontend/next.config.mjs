/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sortie autonome : l'image finale ne contient que le serveur compile et
  // les dependances reellement utilisees, pas tout node_modules.
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
