import { LOCALES, type Locale, type Localized } from "@/lib/i18n";

/** Shape of `profile.cv` in profile.yaml (validated by the schema in content.config.ts). */
type CvData = Record<
  Locale,
  { file: string; downloadName: string; label: Localized; available: boolean }
>;

export interface Cv {
  /** Hashed URL under /_astro/, served by Vite without modifying the PDF (R11.5). */
  href: string;
  /** File name proposed on download (R11.2). */
  downloadName: string;
  label: string;
}

const DATA_DIR = "/specs/001-contenido-reclutadores/";
const PROFILE_FILE = "specs/001-contenido-reclutadores/data/profile.yaml";

// Vite publishes the PDFs untouched, with a content hash in the name (long cache, R18.4).
const pdfUrls = import.meta.glob<string>(
  "/specs/001-contenido-reclutadores/assets/*.pdf",
  {
    query: "?url",
    import: "default",
    eager: true,
  },
);

function pdfUrl(file: string): string | undefined {
  // `file` is relative to the data folder's parent, e.g. "assets/Uriel-Vega-CV-ES.pdf".
  return pdfUrls[`${DATA_DIR}${file}`];
}

/** Fails the build when a CV marked as available has no PDF (R11.4). */
export function assertCvFiles(cv: CvData): void {
  for (const locale of LOCALES) {
    const entry = cv[locale];
    if (entry.available && !pdfUrl(entry.file)) {
      throw new Error(
        `[content] ${PROFILE_FILE}: cv.${locale}.file: no se encontró el PDF esperado en ${DATA_DIR.slice(1)}${entry.file}`,
      );
    }
  }
}

/** The single source for every place that shows the CV download (R11.6). Null hides it (R11.3). */
export function getCv(cv: CvData, locale: Locale): Cv | null {
  const entry = cv[locale];
  const href = entry.available ? pdfUrl(entry.file) : undefined;
  if (!href) return null;
  return { href, downloadName: entry.downloadName, label: entry.label[locale] };
}
