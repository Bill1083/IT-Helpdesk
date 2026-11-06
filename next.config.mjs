/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Load these from node_modules at runtime instead of bundling: a native
  // module, and the PDF renderer (its layout engine ships WebAssembly).
  serverExternalPackages: ['better-sqlite3', '@react-pdf/renderer'],
  // pdfkit (under react-pdf) loads its built-in font metrics through
  // "#standard-fonts/*" package imports, which file tracing can't follow, so
  // the standalone build would ship without them and every export would fail.
  outputFileTracingIncludes: {
    '/api/problems/[id]/report': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
  },
  // Gzip would buffer the streamed step responses; nginx compresses instead.
  compress: false,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
