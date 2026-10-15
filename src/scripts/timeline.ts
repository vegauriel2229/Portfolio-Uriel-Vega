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
/** Rounding tolerance so sub-pixel heights cannot flip the pin on and off. */
const FIT_SLACK_PX = 2;
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

  // D-170: the pin scenario no longer checks the motion preference;
  // animations always run. Only the viewport size can keep the static list.
  const widthQuery = window.matchMedia("(min-width: 20rem)");
  const heightQuery = window.matchMedia("(min-height: 40rem)");

  const scenarioOn = (): boolean => widthQuery.matches && heightQuery.matches;

  const setPin = (value: "on" | "off"): void => {
    if (track.dataset.pin !== value) track.dataset.pin = value;
  };

  /*
   * Whether the pinned stage would fit, measured on a hidden clone so the
   * visible list is never touched (hidden-clone method, measurement only).
   * The list-mode stage stacks all 4 steps, while the pinned stage stacks
   * every step in a single grid cell (6.8.4): measuring the visible stage
   * would always report overflow and the pin would never engage at
   * 1024/1440. The clone sits in an offscreen [data-pin="on"] track of the
   * same width, so it gets the exact pinned geometry; step 3 stands in as
   * the tallest representative (counter, hint and team all shown).
   * The clone measures with `overflow: visible`: the pinned stage uses
   * `overflow: clip`, which stops `scrollHeight` from reporting clipped
   * content, so without this override the guard would always read "fits"
   * and the pin would stay on even at 360 where the stage overflows.
   */
  const pinnedFits = (): boolean => {
    if (track.dataset.pin === "on")
      return stage.scrollHeight <= stage.clientHeight + FIT_SLACK_PX;
    const width = track.clientWidth;
    if (width === 0) return false;
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-timeline", "");
    wrapper.setAttribute("data-pin", "on");
    wrapper.setAttribute("aria-hidden", "true");
    // Offscreen through CSSOM (allowed by the CSP, 5.5); the dist HTML
    // keeps zero style attributes.
    wrapper.style.position = "fixed";
    wrapper.style.top = "0";
    wrapper.style.left = "-99999px";
    wrapper.style.width = `${width}px`;
    wrapper.style.visibility = "hidden";
    wrapper.style.pointerEvents = "none";
    const clone = stage.cloneNode(true) as HTMLElement;
    clone.setAttribute("data-step", "3");
    clone.removeAttribute("data-play");
    // See the block comment above: measure the full content height.
    clone.style.overflow = "visible";
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);
    try {
      return clone.scrollHeight <= clone.clientHeight + FIT_SLACK_PX;
    } finally {
      wrapper.remove();
    }
  };

  /*
   * Single check (init, resize, media change, stage resize): the pin needs
   * the scenario (viewport at least 20rem x 40rem, so below that it stays
   * a static list, R24.9; D-170: motion preference is ignored) and room
   * engaged and the unpinned states measure through the hidden clone, whose
   * answer does not depend on the current pin state, so a re-fire re-affirms
   * instead of flipping (no loop).
   */
  const updatePin = (): void => {
    if (!scenarioOn()) {
      setPin("off");
      return;
    }
    setPin(pinnedFits() ? "on" : "off");
  };

  let resizeTimer = 0;
  const scheduleFull = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => updatePin(), RESIZE_WAIT_MS);
  };

  updatePin();
  setStep(1, true);

  window.addEventListener("resize", scheduleFull);
  widthQuery.addEventListener("change", scheduleFull);
  heightQuery.addEventListener("change", scheduleFull);

  if ("ResizeObserver" in window) {
    let stageTimer = 0;
    const stageObserver = new ResizeObserver(() => {
      window.clearTimeout(stageTimer);
      stageTimer = window.setTimeout(() => updatePin(), RESIZE_WAIT_MS);
    });
    stageObserver.observe(stage);
  }
}
