/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Native module: load it from node_modules at runtime instead of bundling.
  serverExternalPackages: ['better-sqlite3'],
  // Gzip would buffer the streamed step responses; nginx compresses instead.
  compress: false,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
