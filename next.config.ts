import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  // tsrs is the type checker (`pnpm typecheck`, which `pnpm build` and CI run
  // first); skip Next's own `tsc` pass so the project is not checked twice.
  // Next still needs the `typescript` package to write next-env.d.ts.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
