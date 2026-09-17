import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/.venv/**",
      "**/__pycache__/**",
      "**/*.egg-info/**"
    ]
  },
  js.configs.recommended,
  {
    // `.mjs` in this repository is always a Node script — a build step, a gate, a drive. Without
    // this, `process` and `console` are undefined globals and `no-undef` fires on correct code.
    // Added in EPIC-052, when `packages/sdk-ts/build.mjs` became the first `.mjs` inside a package
    // that `turbo run lint` reaches; `scripts/*.mjs` sit outside every package and are not linted.
    files: ["**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  prettierConfig
];
