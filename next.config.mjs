/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright is only used inside the Trigger.dev worker (lib/screenshot.ts is
  // dynamically imported there). Keep it out of the Next.js server bundle.
  experimental: {
    serverComponentsExternalPackages: ['playwright'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
}

export default nextConfig
