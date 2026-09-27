import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the workspace package from source-adjacent dist so Next can tree-shake it.
  transpilePackages: ['@acsp/shared'],
  // Minimal server bundle for the Docker image (docker/Dockerfile.web copies .next/standalone).
  output: 'standalone',
  // Monorepo: trace files from the workspace root so pnpm-hoisted deps are included.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
