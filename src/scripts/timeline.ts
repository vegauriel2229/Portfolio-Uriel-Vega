// Orchestra timeline (design sections 5.6 and 6.8). Progressive enhancement:
// without this module the 4 steps read as a complete list and nothing pins (R24.10).
// The sentinels set `data-step` on the stage and the CSS derives every visual state.
// Forward arrivals replay their entrance (`data-play`); going back is instant (6.8.5).
// No `scroll` listener: one IntersectionObserver plus a debounced ResizeObserver.

const TOTAL_STEPS = 4;
/** Wait between overflow re-checks (design section 5.6). */
const RESIZE_WAIT_MS = 150;
/** The live region announces the resting step only, not every step of a fast scroll (6.8.2). */
const ANNOUNCE_WAIT_MS = 300;
/** Slack so rounding cannot flip the pin on and off (hysteresis). */
const FIT_SLACK_PX = 8;
/** Central reading strip that the sentinels must cross (design section 6.8.7). */
const STRIP_MARGIN = "-35% 0px -55% 0px";

function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{(\w+)\}/g,
    (marker, key: string) => values[key] ?? marker,
  );
}

export function initTimeline(): void {
  if (!("IntersectionObserver" in window)) return;
  const track = document.querySelector<HTMLElement>("[data-timeline]");
  const stage = track?.querySelector<HTMLElement>("[data-timeline-stage]");
  if (!track || !stage) return;
  const sentinels = Array.from(
    track.querySelectorAll<HTMLElement>("[data-timeline-sentinel]"),
  );
  const steps = Array.from(
    stage.querySelectorAll<HTMLElement>("[data-timeline-step]"),
  );
  const status = stage.querySelector("[data-timeline-status]");
  const counter = stage.querySelector("[data-timeline-counter]");
  if (sentinels.length !== TOTAL_STEPS || steps.length !== TOTAL_STEPS) return;

  const stepStatus = stage.dataset.stepStatus ?? "";
  const litStatus = stage.dataset.litStatus ?? "";
  const counterTemplate = stage.dataset.counter ?? "";
  const titles = steps.map((step) => step.dataset.title ?? "");

  let current = 0;
  let primed = false;
  let announceTimer = 0;

  const render = (step: number): void => {
    stage.dataset.step = String(step);
    if (counter && counterTemplate) {
      counter.textContent = fill(counterTemplate, {
        n: String(step),
        total: String(TOTAL_STEPS),
      });
    }
  };

  const announce = (step: number): void => {
    if (!status || !stepStatus) return;
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      const text = fill(stepStatus, {
        n: String(step),
        total: String(TOTAL_STEPS),
        title: titles[step - 1] ?? "",
      });
      status.textContent =
        step === 3 && litStatus ? `${text} ${litStatus}` : text;
    }, ANNOUNCE_WAIT_MS);
  };

  const setStep = (step: number, silent: boolean): void => {
    if (stage.dataset.step === String(step)) return;
    if (!silent) {
      if (step > current) stage.dataset.play = String(step);
      else delete stage.dataset.play;
    }
    current = step;
    render(step);
    if (!silent) announce(step);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = sentinels.indexOf(entry.target as HTMLElement);
        if (index === -1) continue;
        const first = !primed;
        primed = true;
        setStep(index + 1, first);
      }
    },
    { rootMargin: STRIP_MARGIN },
  );
  sentinels.forEach((sentinel) => observer.observe(sentinel));

  const motionQuery = window.matchMedia(
    "(prefers-reduced-motion: no-preference)",
  );
  const widthQuery = window.matchMedia("(min-width: 20rem)");
  const heightQuery = window.matchMedia("(min-height: 40rem)");

  const scenarioOn = (): boolean =>
    motionQuery.matches && widthQuery.matches && heightQuery.matches;

  const setPin = (value: "on" | "off" | null): void => {
    if (value === null) delete track.dataset.pin;
    else if (track.dataset.pin !== value) track.dataset.pin = value;
  };

  /** Height the pinned stage would have, from the geometry of 6.8.4 (header 4rem + 1.5rem of air). */
  const pinnedHeight = (): number => {
    const root =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16;
    return window.innerHeight - 4 * root - 1.5 * root;
  };

  /*
   * Full check (init, resize, media change): the pin needs the scenario and room for
   * the stage (R24.9). Downgrades only (overflow while pinned): ResizeObserver on the stage.
   * Upgrades never come from the stage observer, so rounding cannot flip the pin in a loop.
   */
  const updatePin = (mode: "full" | "downgrade"): void => {
    if (!scenarioOn()) {
      setPin(null);
      return;
    }
    if (mode === "downgrade") {
      if (track.dataset.pin === "on" && stage.scrollHeight > stage.clientHeight)
        setPin("off");
      return;
    }
    const fits =
      track.dataset.pin === "on"
        ? stage.scrollHeight <= stage.clientHeight
        : stage.scrollHeight <= pinnedHeight() - FIT_SLACK_PX;
    setPin(fits ? "on" : "off");
  };

  let resizeTimer = 0;
  const scheduleFull = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => updatePin("full"), RESIZE_WAIT_MS);
  };

  updatePin("full");
  setStep(1, true);

  window.addEventListener("resize", scheduleFull);
  motionQuery.addEventListener("change", scheduleFull);
  widthQuery.addEventListener("change", scheduleFull);
  heightQuery.addEventListener("change", scheduleFull);

  if ("ResizeObserver" in window) {
    let stageTimer = 0;
    const stageObserver = new ResizeObserver(() => {
      window.clearTimeout(stageTimer);
      stageTimer = window.setTimeout(
        () => updatePin("downgrade"),
        RESIZE_WAIT_MS,
      );
    });
    stageObserver.observe(stage);
  }
}
