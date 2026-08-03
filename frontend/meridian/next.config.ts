import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @wagmi/connectors barrel-imports the Coinbase "Base Account" connector,
  // which dynamically imports the optional @x402/* payment SDKs. We don't
  // use that connector (local Hardhat dev only) and those packages aren't
  // installed, so Turbopack fails to resolve them at build time — alias them
  // away rather than pulling in unrelated dependencies we'll never use.
  turbopack: {
    resolveAlias: {
      "@x402/core/client": "./lib/web3/empty-module.js",
      "@x402/evm": "./lib/web3/empty-module.js",
      "@x402/evm/exact/client": "./lib/web3/empty-module.js",
      "@x402/evm/upto/client": "./lib/web3/empty-module.js",
      "@x402/svm/exact/client": "./lib/web3/empty-module.js",
    },
  },
};

export default nextConfig;
