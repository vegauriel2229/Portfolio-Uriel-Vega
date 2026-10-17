// Orchestra timeline as an interactive player (design sections 5.6 and 6.8).
// Progressive enhancement: without this module the 4 steps read as a complete list.
// With it, the step buttons pick what is on stage, the active button's bar fills
// while the step plays and its `animationend` advances to the next one; the run
// starts the first time the player is in view, pauses while it is out of view or
// a keyboard user is inside it, and stops after the last step (nothing infinite).
// The stage gets `data-step` and `data-play`; the CSS derives every visual state.

const TOTAL_STEPS = 4;
/** The live region announces the resting step only, not every quick click (6.8.2). */
const ANNOUNCE_WAIT_MS = 300;
/** Share of the player that must be on screen for it to play. */
const VISIBLE_RATIO = 0.45;

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
  const nav = track?.querySelector<HTMLElement>("[data-timeline-nav]");
  const controls = track?.querySelector<HTMLElement>(
    "[data-timeline-controls]",
  );
  const toggle = track?.querySelector<HTMLButtonElement>(
    "[data-timeline-toggle]",
  );
  if (!track || !stage || !nav || !controls || !toggle) return;
  const tabs = Array.from(
    nav.querySelectorAll<HTMLButtonElement>("[data-timeline-go]"),
  );
  const steps = Array.from(
    stage.querySelectorAll<HTMLElement>("[data-timeline-step]"),
  );
  if (tabs.length !== TOTAL_STEPS || steps.length !== TOTAL_STEPS) return;

  const status = stage.querySelector("[data-timeline-status]");
  const counter = stage.querySelector("[data-timeline-counter]");
  const stepStatus = stage.dataset.stepStatus ?? "";
  const litStatus = stage.dataset.litStatus ?? "";
  const counterTemplate = stage.dataset.counter ?? "";
  const titles = steps.map((step) => step.dataset.title ?? "");

  let current = 0;
  let playing = false;
  let started = false;
  let inView = false;
  let focused = false;
  let announceTimer = 0;

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

  /** Pause while out of view or under keyboard focus; the bar keeps its place. */
  const syncPause = (): void => {
    const paused = playing && (!inView || focused);
    if (paused) track.dataset.paused = "";
    else delete track.dataset.paused;
  };

  const setPlaying = (value: boolean): void => {
    playing = value;
    if (value) track.dataset.playing = "";
    else delete track.dataset.playing;
    syncPause();
  };

  /** Restart the CSS entrances of a step (chips, baton, meter) on every arrival. */
  const replay = (step: number): void => {
    delete stage.dataset.play;
    void stage.offsetWidth;
    stage.dataset.play = String(step);
  };

  const show = (step: number, silent = false): void => {
    if (step === current) return;
    current = step;
    stage.dataset.step = String(step);
    tabs.forEach((tab, index) => {
      if (index + 1 === step) tab.setAttribute("aria-current", "step");
      else tab.removeAttribute("aria-current");
      if (index + 1 < step) tab.dataset.done = "";
      else delete tab.dataset.done;
    });
    if (counter && counterTemplate) {
      counter.textContent = fill(counterTemplate, {
        n: String(step),
        total: String(TOTAL_STEPS),
      });
    }
    replay(step);
    if (!silent) announce(step);
  };

  // The active bar finished filling: next step, or stop after the last one.
  nav.addEventListener("animationend", (event) => {
    if (!playing || event.animationName !== "tl-progress") return;
    if (current < TOTAL_STEPS) {
      show(current + 1);
    } else {
      setPlaying(false);
      tabs.forEach((tab) => (tab.dataset.done = ""));
    }
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      show(index + 1);
    });
    // Arrow keys move along the steps.
    tab.addEventListener("keydown", (event) => {
      const delta =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (delta === 0) return;
      event.preventDefault();
      const next = Math.min(TOTAL_STEPS, Math.max(1, index + 1 + delta));
      tabs[next - 1]?.focus();
      show(next);
    });
  });

  toggle.addEventListener("click", () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Play again from the start once the run is over.
    if (current === TOTAL_STEPS) show(1);
    started = true;
    setPlaying(true);
  });

  // Only keyboard focus pauses: a mouse click on a step keeps the run going.
  stage.addEventListener("focusin", (event) => {
    focused = (event.target as Element).matches(":focus-visible");
    syncPause();
  });
  stage.addEventListener("focusout", (event) => {
    if (stage.contains(event.relatedTarget as Node | null)) return;
    focused = false;
    syncPause();
  });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        inView =
          entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO;
        // First time in view: the orchestra starts on its own.
        if (inView && !started) {
          started = true;
          replay(current);
          setPlaying(true);
        }
        syncPause();
      }
    },
    { threshold: [0, VISIBLE_RATIO] },
  );

  nav.hidden = false;
  controls.hidden = false;
  track.dataset.mode = "player";
  show(1, true);
  delete stage.dataset.play;
  observer.observe(stage);
}
