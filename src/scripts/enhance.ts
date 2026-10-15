// Progressive enhancement (design sections 5.4 and 6.13). The site is complete without this file.
// No cookies, no storage, no network (R17.7).

import { initMotion } from "@/scripts/motion";
import { initTimeline } from "@/scripts/timeline";

const SECTION_IDS = [
  "home",
  "projects",
  "current-work",
  "about",
  "skills",
  "contact",
];

/** Mobile menu: close it when a section is chosen and with Escape (focus returns to its button). */
function enhanceMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>("[data-menu]");
  if (!menu) return;

  menu.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
  });
}

/** Id of the last section whose top edge is at or above the anchor line (the scroll-padding under the header). */
function visibleSectionId(): string | null {
  const anchorLine =
    parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
    0;
  let current: string | null = null;
  for (const id of SECTION_IDS) {
    const section = document.getElementById(id);
    if (section && section.getBoundingClientRect().top <= anchorLine + 1)
      current = id;
  }
  return current;
}

/** Language selector: keep the visitor in the section they are reading (R10.5). */
function enhanceLanguageSwitch(): void {
  document
    .querySelectorAll<HTMLAnchorElement>("[data-lang-link]")
    .forEach((link) => {
      const base = link.getAttribute("href") ?? "";
      link.addEventListener("click", () => {
        const id = visibleSectionId();
        link.setAttribute("href", id && id !== "home" ? `${base}#${id}` : base);
      });
    });
}

/** Mascot (design 5.4, 5.7, 6.10): deferred chunk, loaded once, after first paint. */
function loadMascot(): void {
  // No platforms (404): the engine chunk is never even fetched (R25.13).
  if (!document.querySelector("[data-platform]")) return;
  const schedule =
    typeof window.requestIdleCallback === "function"
      ? (run: () => void): void => {
          window.requestIdleCallback(run);
        }
      : (run: () => void): void => {
          window.setTimeout(run, 1500);
        };
  const run = (): void => {
    void import("./mascot/engine").then((engine) => engine.start());
  };
  if (document.readyState === "complete") schedule(run);
  else window.addEventListener("load", () => schedule(run), { once: true });
}

enhanceMenu();
initMotion();
initTimeline();
enhanceLanguageSwitch();
loadMascot();
