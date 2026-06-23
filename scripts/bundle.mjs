// Production bundler for the api / worker services.
//
// Why not plain `tsc`: the workspace packages (@outreach/*) export TypeScript
// SOURCE (package main = src/index.ts), so a tsc build leaves `require("@outreach/
// shared")` pointing at a .ts file node can't load. esbuild inlines those
// workspace packages into a single CJS bundle while keeping real npm dependencies
// external (resolved from node_modules at runtime — Prisma engine, nodemailer,
// pg-boss, the Anthropic SDK, etc. are not bundled).
//
// Usage: node scripts/bundle.mjs <entry> <outfile>
import { build } from 'esbuild';

const [entry, outfile] = process.argv.slice(2);
if (!entry || !outfile) {
  console.error('usage: node scripts/bundle.mjs <entry> <outfile>');
  process.exit(1);
}

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externalize-npm-keep-workspace',
      setup(b) {
        // Any bare import (not relative/absolute): bundle our own @outreach/*
        // workspace packages, keep everything else (npm + node builtins) external.
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@outreach/')) return null; // bundle workspace src
          return { path: args.path, external: true }; // npm / node builtin → external
        });
      },
    },
  ],
});

console.log(`bundled ${entry} -> ${outfile}`);
