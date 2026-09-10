import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für das Docker-Image: schlanker Standalone-Server unter .next/standalone
  output: "standalone",
  // Monorepo-Wurzel für das node_modules-Tracing der Standalone-Sammlung
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  experimental: {
    // Server Actions von diesem Ursprung erlauben (lokale Entwicklung)
  },
};

export default nextConfig;
