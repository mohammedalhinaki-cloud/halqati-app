/** @type {import('next').NextConfig} */
export default {
  // Static export -> GitHub Pages project site (sub-path /halqati.app/)
  output: 'export',
  basePath: '/halqati.app',
  assetPrefix: '/halqati.app/',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  env: {}, // no runtime services — data is localStorage only
};
