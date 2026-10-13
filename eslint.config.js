import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import astro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/",
    ".astro/",
    "node_modules/",
    "specs/",
    "docs/",
    "plantillas/",
    ".claude/",
    // Legacy static site (removed in T8)
    "script.js",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  astro.configs.recommended,
  // Accessibility rules for .astro templates (D-113: jsx-a11y-x, the ESLint 10 compatible fork)
  astro.configs["flat/jsx-a11y-recommended"],
  {
    // Lists keep an explicit role: Safari/VoiceOver drops the list semantics when the bullets are removed (design 6.6).
    files: ["**/*.astro"],
    rules: {
      "astro/jsx-a11y/no-redundant-roles": [
        "error",
        { ul: ["list"], ol: ["list"] },
      ],
    },
  },
]);
