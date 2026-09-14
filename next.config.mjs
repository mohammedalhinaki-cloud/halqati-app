/** @type {import('next').NextConfig} */
export default {
  // Static export -> trivially deployable on Netlify (publish "out")
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};
