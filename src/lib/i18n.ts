export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

/** A text with its Spanish and English versions (the shape used by every data file). */
export type Localized = Record<Locale, string>;

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Resolves a value to the active language; plain strings (e.g. "Python") are the same in both. */
export function localize(value: Localized | string, locale: Locale): string {
  return typeof value === "string" ? value : value[locale];
}

/** Replaces `{name}` markers of a text template with the given values. */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (marker, key: string) => values[key] ?? marker,
  );
}
