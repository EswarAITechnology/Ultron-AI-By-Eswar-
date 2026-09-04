import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  basePath: "/Ultron-AI-By-Eswar-",

  trailingSlash: true,

  images: {
    unoptimized: true,
  },
};

export default nextConfig;