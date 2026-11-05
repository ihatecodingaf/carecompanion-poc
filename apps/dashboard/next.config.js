/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: { serverComponentsExternalPackages: [] },
};

module.exports = nextConfig;
