/** @type {import('next').NextConfig} */
// NEXT_BASE lets CI publish a cache-busting twin of the whole app under a fresh
// sub-path (e.g. /halqati-app/v3) for clients pinned to poisoned caches.
const BASE = process.env.NEXT_BASE || '/halqati-app';

export default {
  // Static export -> GitHub Pages project site
  output: 'export',
  basePath: BASE,
  assetPrefix: BASE + '/',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  env: { NEXT_PUBLIC_BUILD: process.env.NEXT_PUBLIC_BUILD || 'dev' },
};
