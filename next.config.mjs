/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // neo4j-driver must stay a Node-only dependency (serverless routes only)
  experimental: { serverComponentsExternalPackages: ["neo4j-driver"] },
};

export default nextConfig;
