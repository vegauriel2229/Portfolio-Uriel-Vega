import { readFileSync } from "node:fs";
import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { parse } from "yaml";
import { assertCvFiles } from "@/lib/cv";
import { LOCALES } from "@/lib/i18n";
import { SHOTS } from "@/lib/shots";

type Data<Name extends keyof typeof FILE_BY_COLLECTION> =
  CollectionEntry<Name>["data"];

export interface Content {
  /** Sorted by `order`; the first one is the featured project. */
  projects: Data<"projects">[];
  currentWork: Data<"currentWork">;
  profile: Data<"profile">;
  skillLevels: Record<string, Data<"skillLevels">>;
  skills: Data<"skills">[];
  seo: Data<"seo">;
  ui: Data<"ui">;
}

/** Collection -> file, so every error names the YAML file (R1.2, R11.4). */
const FILE_BY_COLLECTION = {
  projects: "src/content/data/projects.yaml",
  currentWork: "src/content/data/current-work.yaml",
  profile: "src/content/data/profile.yaml",
  skillLevels: "src/content/data/skill-levels.yaml",
  skills: "src/content/data/skills.yaml",
  seo: "src/content/data/seo.yaml",
  ui: "src/content/ui.yaml",
} as const;

const SKILL_LEVEL_IDS = ["advanced", "intermediate", "basic"];
const CURRENT_WORK_ID = "restaurant-system";
const ABOUT_PARAGRAPH_IDS = [
  "estudios",
  "busqueda",
  "proyectos",
  "hardware",
  "ia-sdd",
];
const AI_SKILL_ID = "ai-development";

/** Entries sorted like the `id` list that the YAML file has under `key` (or at the top level). */
function sortByFileOrder<T extends { id: string; data: unknown }>(
  entries: T[],
  file: string,
  key: string,
): T["data"][] {
  const parsed = parse(readFileSync(file, "utf-8")) as
    Record<string, { id: string }[]> | undefined;
  const ids = (parsed?.[key] ?? []).map((item) => item.id);
  const rank = (id: string): number => {
    const index = ids.indexOf(id);
    return index === -1 ? ids.length : index;
  };
  return [...entries]
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((entry) => entry.data);
}

function fail(
  collection: keyof typeof FILE_BY_COLLECTION,
  detail: string,
): never {
  throw new Error(`[content] ${FILE_BY_COLLECTION[collection]}: ${detail}`);
}

/** Loads every collection and fails the build if something is missing or inconsistent. */
export async function getContent(): Promise<Content> {
  const [
    projectEntries,
    currentWorkEntries,
    profileEntry,
    levelEntries,
    skillEntries,
    seoEntry,
    uiEntry,
  ] = await Promise.all([
    getCollection("projects"),
    getCollection("currentWork"),
    getEntry("profile", "profile"),
    getCollection("skillLevels"),
    getCollection("skills"),
    getEntry("seo", "seo"),
    getEntry("ui", "ui"),
  ]);

  // The file loader only logs an error (and leaves the collection empty) when a YAML is missing or malformed.
  if (projectEntries.length === 0)
    fail("projects", "no se cargó ningún proyecto");
  const currentWorkEntry = currentWorkEntries.find(
    (entry) => entry.id === CURRENT_WORK_ID,
  );
  if (!currentWorkEntry)
    fail("currentWork", `no se cargó la entrada \`${CURRENT_WORK_ID}\``);
  if (!profileEntry) fail("profile", "no se cargó la entrada `profile`");
  if (skillEntries.length === 0)
    fail("skills", "no se cargó ninguna habilidad");
  if (!seoEntry) fail("seo", "no se cargó la entrada `seo`");
  if (!uiEntry) fail("ui", "no se cargó la entrada `ui`");

  const levelIds = levelEntries.map((entry) => entry.id).sort();
  if (levelIds.join() !== [...SKILL_LEVEL_IDS].sort().join()) {
    fail(
      "skillLevels",
      `se esperaban exactamente los niveles ${SKILL_LEVEL_IDS.join(", ")}; hay: ${levelIds.join(", ") || "ninguno"}`,
    );
  }

  const content: Content = {
    projects: projectEntries
      .map((entry) => entry.data)
      .sort((a, b) => a.order - b.order),
    currentWork: currentWorkEntry.data,
    profile: profileEntry.data,
    skillLevels: Object.fromEntries(
      levelEntries.map((entry) => [entry.id, entry.data]),
    ),
    // The collection comes back in no particular order: the order of the file is the one that matters (D-164).
    skills: sortByFileOrder(skillEntries, FILE_BY_COLLECTION.skills, "skills"),
    seo: seoEntry.data,
    ui: uiEntry.data,
  };

  assertContentIntegrity(content);
  return content;
}

/** Cross-file rules that the per-file schemas cannot express (design section 4.3). */
function assertContentIntegrity(content: Content): void {
  const { projects, profile, skills, ui } = content;

  const projectIds = new Set(projects.map((project) => project.id));
  if (projectIds.size !== projects.length)
    fail("projects", "hay ids de proyecto repetidos (id)");

  const orders = new Set(projects.map((project) => project.order));
  if (orders.size !== projects.length)
    fail("projects", "hay valores repetidos en `order`");

  const featured = projects.filter((project) => project.featured);
  if (featured.length !== 1 || featured[0] !== projects[0]) {
    fail(
      "projects",
      "debe haber exactamente un proyecto con `featured: true`, el primero por `order`",
    );
  }

  const skillIds = new Set<string>();
  for (const skill of skills) {
    if (skillIds.has(skill.id))
      fail("skills", `habilidad repetida: ${skill.id} (id)`);
    skillIds.add(skill.id);
    for (const reference of skill.backedBy) {
      if (!projectIds.has(reference.id)) {
        fail(
          "skills",
          `${skill.id}.backedBy: el proyecto \`${reference.id}\` no existe en projects.yaml`,
        );
      }
    }
  }
  if (!skillIds.has(AI_SKILL_ID))
    fail(
      "skills",
      `falta la habilidad \`${AI_SKILL_ID}\` (id), que usa la línea de tiempo`,
    );

  const paragraphIds = profile.about.paragraphs.map(
    (paragraph) => paragraph.id,
  );
  if (paragraphIds.join() !== ABOUT_PARAGRAPH_IDS.join()) {
    fail(
      "profile",
      `about.paragraphs: se esperaban los ids ${ABOUT_PARAGRAPH_IDS.join(", ")} en ese orden`,
    );
  }

  const templates: [
    string,
    Record<(typeof LOCALES)[number], string>,
    string[],
  ][] = [
    ["timeline.step4.title", ui.timeline.step4.title, ["{skill}", "{level}"]],
    ["footer.rights", ui.footer.rights, ["{year}"]],
    [
      "timeline.stepStatus",
      ui.timeline.stepStatus,
      ["{n}", "{total}", "{title}"],
    ],
    ["timeline.stepCounter", ui.timeline.stepCounter, ["{n}", "{total}"]],
  ];
  for (const [field, value, markers] of templates) {
    for (const locale of LOCALES) {
      for (const marker of markers) {
        if (!value[locale].includes(marker))
          fail("ui", `${field}.${locale}: falta el marcador ${marker}`);
      }
    }
  }

  // Every project has its screenshots and their alternative texts (R22.5, R22.9). The restaurant system has none (R22.11).
  for (const project of projects) {
    if (!(project.id in SHOTS))
      fail(
        "projects",
        `${project.id} (id): no tiene capturas en src/lib/shots.ts (SHOTS)`,
      );
    if (!(project.id in ui.shots))
      fail(
        "ui",
        `shots.${project.id}: faltan los textos alternativos (desktopAlt, mobileAlt) del proyecto`,
      );
  }

  assertCvFiles(profile.cv);
}
