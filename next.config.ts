import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true" || process.env.CI === "true";

const nextConfig: NextConfig = {
  output: "export",

  basePath: isGithubPages ? "/Ultron-AI-By-Eswar-" : "",

  trailingSlash: true,

  images: {
    unoptimized: true,
  },
};

export default nextConfig;