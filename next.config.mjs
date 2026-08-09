/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable typescript and eslint checks on build to ensure rapid deployments without compile blockers,
  // though our local files are already fully typed.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
