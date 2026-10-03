import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://gravity-fitness.ir';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/plans', '/gyms/'],
        disallow: [
          '/admin',
          '/admin/',
          '/reception',
          '/reception/',
          '/account',
          '/account/',
          '/api/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
