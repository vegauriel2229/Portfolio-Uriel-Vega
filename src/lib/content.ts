import { getCollection, getEntry, type CollectionEntry } from "astro:content";
import { assertCvFiles } from "@/lib/cv";
import { LOCALES } from "@/lib/i18n";

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
  projects: "specs/001-contenido-reclutadores/data/projects.yaml",
  currentWork: "specs/001-contenido-reclutadores/data/current-work.yaml",
  profile: "specs/001-contenido-reclutadores/data/profile.yaml",
  skillLevels: "specs/001-contenido-reclutadores/data/skill-levels.yaml",
  skills: "specs/001-contenido-reclutadores/data/skills.yaml",
  seo: "specs/001-contenido-reclutadores/data/seo.yaml",
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
    skills: skillEntries.map((entry) => entry.data),
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
  ];
  for (const [field, value, markers] of templates) {
    for (const locale of LOCALES) {
      for (const marker of markers) {
        if (!value[locale].includes(marker))
          fail("ui", `${field}.${locale}: falta el marcador ${marker}`);
      }
    }
  }

  assertCvFiles(profile.cv);
}
