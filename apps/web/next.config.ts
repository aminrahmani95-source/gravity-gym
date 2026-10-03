import type { NextConfig } from 'next';

const isExport = process.env.NEXT_EXPORT === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gym-app/shared-types'],
  output: isExport ? 'export' : undefined,
  basePath: isExport ? '/gravity-gym' : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  async headers() {
    if (isExport) return [];
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
