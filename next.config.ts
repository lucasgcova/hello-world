import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Server Action body limit generous for AI payloads / pasted content.
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
