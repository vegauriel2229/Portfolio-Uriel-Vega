// Skills terminal (D-167): each level group reads as a violet terminal window
// whose lines are typed one by one. Progressive enhancement: without this
// module (no JS), or without IntersectionObserver, every line is already
// visible and nothing hides. D-170: the typing entrance always runs,
// the visitor's motion preference is ignored.

/** Pause between typed lines: the whole group completes in about 2 s. */
const LINE_DELAY_MS = 200;

export function initSkillsTerminal(): void {
  if (!("IntersectionObserver" in window)) return;
  const terminals = Array.from(
    document.querySelectorAll<HTMLElement>("[data-terminal]"),
  );
  if (terminals.length === 0) return;

  // Only from here do the hidden start states of the CSS exist.
  document.documentElement.setAttribute("data-terminals-live", "");

  const typeLines = (terminal: HTMLElement): void => {
    const lines = Array.from(
      terminal.querySelectorAll<HTMLElement>("[data-term-line]"),
    );
    let next = 0;
    const step = (): void => {
      const line = lines[next];
      if (!line) {
        terminal.setAttribute("data-done", "");
        return;
      }
      if (next > 0) lines[next - 1]?.removeAttribute("data-active");
      line.setAttribute("data-typed", "");
      line.setAttribute("data-active", "");
      next += 1;
      window.setTimeout(step, LINE_DELAY_MS);
    };
    step();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const terminal = entry.target as HTMLElement;
        // Once per terminal: the lines stay typed.
        observer.unobserve(terminal);
        typeLines(terminal);
      }
    },
    { threshold: 0.35 },
  );
  terminals.forEach((terminal) => observer.observe(terminal));
}
