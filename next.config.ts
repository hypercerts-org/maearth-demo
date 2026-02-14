import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow serving .html files from public/
  async headers() {
    return [
      {
        source: '/client-metadata.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ]
  },
}

export default nextConfig
