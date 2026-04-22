// ESLint flat config (ESLint 9 style). Menggantikan `next lint` yang
// deprecated di Next.js 16. Pakai `FlatCompat` supaya preset lama
// `eslint-config-next` (extends-based) tetap bisa dipakai tanpa rewrite.
//
// Jalankan: `npm run lint` → `eslint .`
//
// Referensi migrasi resmi: https://nextjs.org/docs/app/api-reference/config/eslint

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "drizzle/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
