// Reveals below the first screen (design section 5.5, technique 2). Progressive enhancement:
// `data-motion` goes on <html> only when this script runs and the visitor accepts motion, and only then
// do the hidden start states of the CSS exist. Without it (no JS, reduced motion, error) all is visible.

const THRESHOLD = 0.35;
// Reveal a little before the element reaches the bottom edge of the screen.
const ROOT_MARGIN = "0px 0px -8% 0px";

export function initMotion(): void {
  if (
    !("IntersectionObserver" in window) ||
    !window.matchMedia("(prefers-reduced-motion: no-preference)").matches
  )
    return;

  const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (targets.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // An element taller than the screen can never show 35 % of itself: count the visible share instead.
        const visible = entry.rootBounds
          ? entry.intersectionRect.height / entry.rootBounds.height
          : 0;
        if (
          !entry.isIntersecting ||
          (entry.intersectionRatio < THRESHOLD && visible < THRESHOLD)
        )
          continue;
        entry.target.setAttribute("data-revealed", "");
        // Once per element (R23.7): it is never observed again.
        observer.unobserve(entry.target);
      }
    },
    { threshold: [0, THRESHOLD], rootMargin: ROOT_MARGIN },
  );

  document.documentElement.setAttribute("data-motion", "");
  targets.forEach((target) => observer.observe(target));
}
