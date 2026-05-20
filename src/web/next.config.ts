import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@related/shared"],
  // Pin the workspace root so Next doesn't pick up stray lockfiles
  // higher up the filesystem when the repo is cloned under a path
  // that contains other Node projects.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default config;
