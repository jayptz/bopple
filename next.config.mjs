/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright is only used inside the Trigger.dev worker (dynamic import).
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
