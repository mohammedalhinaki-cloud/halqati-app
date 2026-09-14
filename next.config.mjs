/** @type {import('next').NextConfig} */
export default {
  // Static export -> GitHub Pages (project page "halqati.app") & Netlify
  output: 'export',
  basePath: '/halqati.app',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};
