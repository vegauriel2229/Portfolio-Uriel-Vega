import { defineCollection, reference } from "astro:content";
import { file } from "astro/loaders";
import { z } from "astro/zod";
import { parse } from "yaml";

// Data files live in the site (src/content/data/, D-135f); the texts are edited there.
// Keep this table in sync with FILE_BY_COLLECTION in src/lib/content.ts (used for error messages).
const DATA_DIR = "src/content/data";

// --- Reusable schemas. Every object is strict: unknown keys fail the build (R1.2). ---

const text = z.string().trim().min(1);
const httpsUrl = z.url({ protocol: /^https$/ });

const localized = z.strictObject({ es: text, en: text });
const localizedOrPlain = z.union([text, localized]);

const link = z.strictObject({
  id: text,
  type: z.enum(["website", "repository"]),
  url: httpsUrl,
  label: localized,
  publishable: z.boolean(),
});

const cvEntry = z.strictObject({
  file: text,
  downloadName: z.string().regex(/^Uriel-Vega-CV-(ES|EN)\.pdf$/),
  label: localized,
  available: z.boolean(),
});

// --- Content data (src/content/data/) ---

const projects = defineCollection({
  loader: file(`${DATA_DIR}/projects.yaml`, {
    parser: (raw) => parse(raw).projects,
  }),
  schema: z.strictObject({
    id: text,
    order: z.number().int().min(1),
    featured: z.boolean(),
    name: text,
    summary: localized,
    status: localized,
    technologies: z.array(text).min(1),
    links: z.array(link),
  }),
});

// A single object (the restaurant system). It has no technologies, partner or client fields (R5.4):
// the strict schema rejects them if they ever appear.
const currentWork = defineCollection({
  loader: file(`${DATA_DIR}/current-work.yaml`, {
    parser: (raw) => [parse(raw)],
  }),
  schema: z.strictObject({
    id: text,
    title: localized,
    description: localized,
    status: localized,
    progress: localized,
    links: z.array(link),
  }),
});

const profile = defineCollection({
  loader: file(`${DATA_DIR}/profile.yaml`, {
    parser: (raw) => ({ profile: parse(raw) }),
  }),
  schema: z.strictObject({
    identity: z.strictObject({ name: text, role: localized }),
    hero: z.strictObject({ greeting: localized, ctaLabel: localized }),
    about: z.strictObject({
      paragraphs: z
        .array(z.strictObject({ id: text, es: text, en: text }))
        .length(5),
      sddExplanation: localized,
    }),
    hiring: z.strictObject({
      location: localized,
      workMode: localized,
      seeking: localized,
      availability: localized,
      education: localized,
      english: localized,
    }),
    contact: z
      .strictObject({
        email: z.email(),
        emailUrl: text,
        phone: z.string().regex(/^\d+$/),
        whatsappUrl: z.string().regex(/^https:\/\/wa\.me\/\d+$/),
        labels: z.strictObject({
          email: localized,
          whatsapp: localized,
          phone: localized,
        }),
      })
      .refine((contact) => contact.emailUrl === `mailto:${contact.email}`, {
        path: ["emailUrl"],
        message: "must be 'mailto:' followed by the email",
      }),
    socials: z.strictObject({
      github: z.strictObject({ url: httpsUrl, label: localized }),
    }),
    cv: z.strictObject({ es: cvEntry, en: cvEntry }),
  }),
});

// A map: the key is the id (advanced, intermediate, basic).
const skillLevels = defineCollection({
  loader: file(`${DATA_DIR}/skill-levels.yaml`),
  schema: z.strictObject({ label: localized, definition: localized }),
});

const skills = defineCollection({
  loader: file(`${DATA_DIR}/skills.yaml`, {
    parser: (raw) => parse(raw).skills,
  }),
  schema: z.strictObject({
    id: text,
    name: localizedOrPlain,
    level: z.enum(["advanced", "intermediate", "basic"]),
    backedBy: z.array(reference("projects")),
  }),
});

const seo = defineCollection({
  loader: file(`${DATA_DIR}/seo.yaml`, {
    parser: (raw) => ({ seo: parse(raw) }),
  }),
  schema: z.strictObject({
    siteUrl: httpsUrl.refine((url) => !url.endsWith("/"), {
      message: "must not end with a slash",
    }),
    title: z.strictObject({ es: text.max(60), en: text.max(60) }),
    description: z.strictObject({ es: text.max(155), en: text.max(155) }),
    ogTitle: localized,
    ogDescription: localized,
  }),
});

// --- Interface texts (R1.4): src/content/ui.yaml, keys of design sections 6.11 and 6.13 ---

const uiSchema = z.strictObject({
  skipLink: localized,
  home: z.strictObject({ logoLabel: localized }),
  nav: z.strictObject({ label: localized, menu: localized }),
  lang: z.strictObject({
    label: localized,
    es: z.strictObject({ name: localized }),
    en: z.strictObject({ name: localized }),
  }),
  sections: z.strictObject({
    projects: localized,
    currentWork: localized,
    about: localized,
    skills: localized,
    contact: localized,
  }),
  hiring: z.strictObject({
    heading: localized,
    location: localized,
    workMode: localized,
    seeking: localized,
    availability: localized,
    education: localized,
    english: localized,
  }),
  fields: z.strictObject({
    status: localized,
    technologies: localized,
    progress: localized,
  }),
  external: z.strictObject({ newTab: localized }),
  timeline: z.strictObject({
    title: localized,
    step1: z.strictObject({ title: localized }),
    step2: z.strictObject({ title: localized }),
    step3: z.strictObject({ title: localized }),
    step4: z.strictObject({ title: localized }),
    roles: z.strictObject({
      director: localized,
      analyst: localized,
      architect: localized,
      designer: localized,
      frontend: localized,
      backend: localized,
      qa: localized,
      security: localized,
      devops: localized,
    }),
    rolesLabel: localized,
    stepStatus: localized,
    litStatus: localized,
    stepCounter: localized,
    scrollHint: localized,
  }),
  skills: z.strictObject({
    levelPrefix: localized,
    backedBy: localized,
    legend: localized,
  }),
  // Alternative texts of the project screenshots, keyed by project id (R22.5). The guard in lib/content.ts
  // checks that every project has its entry.
  shots: z.record(
    text,
    z.strictObject({ desktopAlt: localized, mobileAlt: localized }),
  ),
  mascot: z.strictObject({ hide: localized, show: localized }),
  whatsapp: z.strictObject({ floatLabel: localized }),
  footer: z.strictObject({ rights: localized }),
  notFound: z.strictObject({
    title: localized,
    body: localized,
    back: localized,
  }),
  seo: z.strictObject({ ogImageAlt: localized }),
});

const ui = defineCollection({
  loader: file("src/content/ui.yaml", {
    parser: (raw) => ({ ui: parse(raw) }),
  }),
  schema: uiSchema,
});

export const collections = {
  projects,
  currentWork,
  profile,
  skillLevels,
  skills,
  seo,
  ui,
};
