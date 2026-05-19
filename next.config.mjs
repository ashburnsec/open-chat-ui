import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build a self-contained Node server image (production only).
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),
};

export default withNextIntl(nextConfig);
