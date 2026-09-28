import type { NextConfig } from 'next';

const config: NextConfig = {
  // Le paquet cœur et l'ORM sont exécutés côté serveur uniquement.
  serverExternalPackages: ['@mastra/core', '@mastra/pg', '@mastra/vercel', 'postgres', '@octokit/rest'],
  transpilePackages: ['@masterai/core', '@masterai/db'],
  experimental: { externalDir: true },
};

export default config;
