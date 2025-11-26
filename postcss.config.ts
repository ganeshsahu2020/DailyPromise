import type { ProcessOptions, AcceptedPlugin } from "postcss";

/**
 * Minimal PostCSS config in TS.
 * Works with Vite + postcss-load-config.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
} satisfies {
  plugins: Record<string, unknown> | AcceptedPlugin[];
  options?: ProcessOptions;
};