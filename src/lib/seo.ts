import type { Content } from "@/lib/content";
import { DEFAULT_LOCALE, LOCALES, localize, type Locale } from "@/lib/i18n";

// One image for both languages, with no language-dependent text (D-108). The file is produced in T6.
export const OG_IMAGE = {
  path: "/og/og-image.png",
  width: 1200,
  height: 630,
} as const;

export const FAVICON = {
  svg: "/favicon.svg",
  ico: "/favicon.ico",
  appleTouch: "/apple-touch-icon.png",
} as const;

/** Meta tag as [attribute value, content]; the attribute (`property` or `name`) is decided by the list. */
type MetaPair = [key: string, content: string];

export interface PageHead {
  title: string;
  description?: string;
  noindex: boolean;
  canonical?: string;
  alternates: { hreflang: string; href: string }[];
  openGraph: MetaPair[];
  twitter: MetaPair[];
  /** JSON-LD already serialized and safe to inline (no `<`). */
  jsonLd?: string;
}

export function localeUrl(siteUrl: string, locale: Locale): string {
  return `${siteUrl}/${locale}`;
}

/** JSON-LD Person with data that is already published on the page (D-081, R15.8). No email or phone. */
function buildJsonLd({ profile, seo }: Content, locale: Locale): string {
  const [addressLocality, addressRegion] = localize(
    profile.hiring.location,
    locale,
  )
    .split(",")
    .map((part) => part.trim());
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.identity.name,
    jobTitle: localize(profile.identity.role, locale),
    url: localeUrl(seo.siteUrl, locale),
    sameAs: [profile.socials.github.url],
    address: { "@type": "PostalAddress", addressLocality, addressRegion },
  };
  // Escaping `<` keeps the JSON from ever closing the <script> element.
  return JSON.stringify(person).replace(/</g, "\\u003c");
}

/** Head of the one-page site in each language (R10.6, R15.1-R15.4, R15.10). */
export function buildPageHead(content: Content, locale: Locale): PageHead {
  const { seo, profile, ui } = content;
  const canonical = localeUrl(seo.siteUrl, locale);
  const image = `${seo.siteUrl}${OG_IMAGE.path}`;
  const imageAlt = localize(ui.seo.ogImageAlt, locale);
  const ogTitle = localize(seo.ogTitle, locale);
  const ogDescription = localize(seo.ogDescription, locale);

  return {
    title: localize(seo.title, locale),
    description: localize(seo.description, locale),
    noindex: false,
    canonical,
    alternates: [
      ...LOCALES.map((alternate) => ({
        hreflang: alternate,
        href: localeUrl(seo.siteUrl, alternate),
      })),
      { hreflang: "x-default", href: localeUrl(seo.siteUrl, DEFAULT_LOCALE) },
    ],
    openGraph: [
      ["og:type", "website"],
      ["og:url", canonical],
      ["og:site_name", profile.identity.name],
      ["og:title", ogTitle],
      ["og:description", ogDescription],
      ["og:image", image],
      ["og:image:width", String(OG_IMAGE.width)],
      ["og:image:height", String(OG_IMAGE.height)],
      ["og:image:alt", imageAlt],
    ],
    twitter: [
      ["twitter:card", "summary_large_image"],
      ["twitter:title", ogTitle],
      ["twitter:description", ogDescription],
      ["twitter:image", image],
      ["twitter:image:alt", imageAlt],
    ],
    jsonLd: buildJsonLd(content, locale),
  };
}

/** Minimal head for the bilingual 404: not indexable, no canonical, no alternates (R15.7). */
export function buildNotFoundHead({ ui }: Content): PageHead {
  const title = `404 · ${ui.notFound.title.es} · ${ui.notFound.title.en}`;
  return { title, noindex: true, alternates: [], openGraph: [], twitter: [] };
}
