import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone Trinisette engine. It has its own toolchain (node + pg + tsx) and is
    // not part of the Next app, so it is excluded from linting here and from type
    // checking via `exclude` in tsconfig.json. Without the tsconfig entry, `next build`
    // fails on reference/src/store.ts: "Cannot find module 'pg'".
    "reference/**",
  ]),
]);

export default eslintConfig;
