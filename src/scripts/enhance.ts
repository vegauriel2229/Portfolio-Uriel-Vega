// Progressive enhancement (design sections 5.4 and 6.13). The site is complete without this file.
// No cookies, no storage, no network (R17.7).

const SECTION_IDS = [
  "home",
  "projects",
  "current-work",
  "about",
  "skills",
  "contact",
];
const TIMELINE_STRIP = "-35% 0px -55% 0px";

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

/** AI timeline: mark the step that crosses the reading strip. Purely visual (D-103). */
function enhanceTimeline(): void {
  const list = document.querySelector<HTMLElement>("[data-timeline]");
  if (!list) return;

  const steps = Array.from(list.children) as HTMLElement[];
  const setActive = (index: number): void => {
    steps.forEach((step, position) => {
      step.toggleAttribute("data-active", position === index);
      step.toggleAttribute("data-done", position < index);
    });
  };

  list.classList.add("js");
  setActive(0);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting)
          setActive(steps.indexOf(entry.target as HTMLElement));
      }
    },
    { rootMargin: TIMELINE_STRIP },
  );
  steps.forEach((step) => observer.observe(step));
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

enhanceMenu();
enhanceTimeline();
enhanceLanguageSwitch();
