// Checks that the content copied into the site (src/content/) is identical to the
// approved source kept locally in specs/001-contenido-reclutadores/ (R1.7, R1.8).
//
// It does not take part in the build: on Vercel and in any clone of the public repository
// the source folder does not exist, and the script exits with code 0 (nothing to compare).
//
// Usage: npm run check:content
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "specs", "001-contenido-reclutadores");

const FILES = [
  { source: "data/current-work.yaml", copy: "data/current-work.yaml" },
  { source: "data/profile.yaml", copy: "data/profile.yaml" },
  { source: "data/projects.yaml", copy: "data/projects.yaml" },
  { source: "data/seo.yaml", copy: "data/seo.yaml" },
  { source: "data/skill-levels.yaml", copy: "data/skill-levels.yaml" },
  { source: "data/skills.yaml", copy: "data/skills.yaml" },
  {
    source: "assets/Uriel-Vega-CV-EN.pdf",
    copy: "assets/Uriel-Vega-CV-EN.pdf",
  },
  {
    source: "assets/Uriel-Vega-CV-ES.pdf",
    copy: "assets/Uriel-Vega-CV-ES.pdf",
  },
];

if (!existsSync(SOURCE_DIR)) {
  console.log(
    "check:content: specs/001 no está en esta máquina; no hay nada que comparar",
  );
  process.exit(0);
}

const sha256 = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

/** Flattens a parsed YAML into { "about.paragraphs[2].en": value } so differences read key by key. */
function flatten(value, path = "", out = {}) {
  if (Array.isArray(value)) {
    if (value.length === 0) out[path] = "[]";
    value.forEach((item, index) => flatten(item, `${path}[${index}]`, out));
  } else if (value !== null && typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) out[path] = "{}";
    for (const key of keys)
      flatten(value[key], path ? `${path}.${key}` : key, out);
  } else {
    out[path] = JSON.stringify(value);
  }
  return out;
}

function keyDifferences(sourcePath, copyPath) {
  const a = flatten(parse(readFileSync(sourcePath, "utf-8")));
  const b = flatten(parse(readFileSync(copyPath, "utf-8")));
  const lines = [];
  for (const key of Object.keys(a)) {
    if (!(key in b)) lines.push(`    falta en la copia: ${key}`);
    else if (a[key] !== b[key])
      lines.push(
        `    distinto: ${key}\n      001:   ${a[key]}\n      copia: ${b[key]}`,
      );
  }
  for (const key of Object.keys(b)) {
    if (!(key in a)) lines.push(`    sobrante en la copia: ${key}`);
  }
  return lines;
}

const rows = [];
const details = [];

for (const file of FILES) {
  const sourcePath = join(SOURCE_DIR, file.source);
  const copyPath = join(ROOT, "src", "content", file.copy);
  const label = `src/content/${file.copy}`;

  if (!existsSync(sourcePath)) {
    rows.push({ label, a: "(falta)", b: "-", result: "ERROR" });
    details.push(
      `  ${label}: no existe el original en specs/001-contenido-reclutadores/${file.source}`,
    );
    continue;
  }
  const a = sha256(sourcePath);
  if (!existsSync(copyPath)) {
    rows.push({ label, a, b: "(falta)", result: "ERROR" });
    details.push(`  ${label}: falta la copia`);
    continue;
  }
  const b = sha256(copyPath);
  if (a === b) {
    rows.push({ label, a, b, result: "OK" });
    continue;
  }
  rows.push({ label, a, b, result: "ERROR" });
  if (file.copy.endsWith(".yaml")) {
    const differences = keyDifferences(sourcePath, copyPath);
    details.push(
      `  ${label}: la copia difiere de la 001` +
        (differences.length > 0
          ? `\n${differences.join("\n")}`
          : "\n    (mismas claves y valores; cambian solo comentarios, espacios o finales de línea)"),
    );
  } else {
    details.push(
      `  ${label}: huella 001 ${a}\n${" ".repeat(label.length + 4)}huella copia ${b}`,
    );
  }
}

const short = (hash) => (hash.length === 64 ? `${hash.slice(0, 12)}…` : hash);
const width = Math.max(...rows.map((row) => row.label.length));
console.log(
  `${"archivo".padEnd(width)}  ${"sha256 001".padEnd(13)}  ${"sha256 copia".padEnd(13)}  resultado`,
);
for (const row of rows) {
  console.log(
    `${row.label.padEnd(width)}  ${short(row.a).padEnd(13)}  ${short(row.b).padEnd(13)}  ${row.result}`,
  );
}

const failed = rows.filter((row) => row.result !== "OK").length;
console.log(`\n${rows.length - failed} OK de ${rows.length}`);
if (failed > 0) {
  console.error(
    `\ncheck:content: ${failed} archivo(s) con diferencias\n${details.join("\n")}`,
  );
  process.exit(1);
}
