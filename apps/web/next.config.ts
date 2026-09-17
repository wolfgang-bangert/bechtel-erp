import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für das Docker-Image: schlanker Standalone-Server unter .next/standalone
  output: "standalone",
  // Monorepo-Wurzel für das node_modules-Tracing der Standalone-Sammlung
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  // Workspace-Paket mit rohem TS-Quellcode (packages/shared) mitkompilieren
  transpilePackages: ["@werk/shared"],
  experimental: {
    serverActions: {
      // Next.js-Default ist 1 MB - zu wenig für PDF-Uploads (Druckdaten,
      // Arbeitsvorgang-Anhänge, PDF-Kombinieren-Werkzeug).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
