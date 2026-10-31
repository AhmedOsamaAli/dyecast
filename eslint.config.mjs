import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These components only show local blob: URLs (the user's own photos), which next/image can't optimize.
    files: [
      "src/components/check/photo-preview.tsx",
      "src/components/profile/photo-slot.tsx",
      "src/components/ui/camera-dialog.tsx",
      "src/components/check/check-wizard.tsx",
      "src/components/choose/compare-preview.tsx",
    ],
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party bundles copied here by scripts/sync-ai-assets.mjs (git-ignored, not our code).
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
