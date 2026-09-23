import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["artworks/first-thousand/src/**/*.js"],
    languageOptions: {
      globals: Object.fromEntries([
        "window", "document", "matchMedia", "requestAnimationFrame", "cancelAnimationFrame",
        "devicePixelRatio", "innerWidth", "innerHeight", "performance", "history", "location",
        "crypto", "Image", "Worker", "URL", "Blob", "fetch", "AbortSignal", "AbortController",
        "navigator", "self", "postMessage",
      ].map(name => [name, "readonly"])),
    },
    rules: { "no-undef": "error", "@typescript-eslint/no-unused-vars": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone artwork source has its own compiler and test boundary.
    "artworks/gargantua/**",
    "artworks/first-thousand/public/**",
    "artworks/first-thousand/tools/**",
    "artworks/first-thousand/tests/**",
    // Versioned production output from standalone visual projects.
    "public/visuals/**",
  ]),
]);

export default eslintConfig;
