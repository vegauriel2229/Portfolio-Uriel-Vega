import { readFileSync } from "node:fs";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import { parse } from "yaml";

// The site URL lives in one place: the approved SEO data of spec 001 (RNF12).
const seo = parse(
  readFileSync("./specs/001-contenido-reclutadores/data/seo.yaml", "utf-8"),
);

// https://astro.build/config
export default defineConfig({
  site: seo.siteUrl,
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  // The root (/) is redirected to /es by vercel.json, so no automatic redirect here.
  i18n: {
    locales: ["es", "en"],
    defaultLocale: "es",
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ],
    },
  },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Literata",
      cssVariable: "--font-literata",
      weights: ["400 600"],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
      fallbacks: ["Georgia", "serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Atkinson Hyperlegible",
      cssVariable: "--font-atkinson",
      weights: [400, 700],
      styles: ["normal"],
      subsets: ["latin"],
      display: "swap",
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],
  integrations: [
    sitemap({
      i18n: { defaultLocale: "es", locales: { es: "es", en: "en" } },
      filter: (page) => !page.endsWith("/404"),
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
