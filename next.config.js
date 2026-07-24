/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['puppeteer', 'amphtml-validator']
  }
};

module.exports = nextConfig;
