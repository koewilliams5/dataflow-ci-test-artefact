import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@dataflow-ci/config",
    "@dataflow-ci/database",
    "@dataflow-ci/domain",
    "@dataflow-ci/queue",
    "@dataflow-ci/storage",
  ],
};

export default nextConfig;
