// Mascot engine: a pixel-art labrador hopping between platforms (design 5.7, 6.10).
// Progressive enhancement: it starts only on pages with platforms, shows nothing
// when there is no room or no free spot (R25.17), and never throws.
// The dog lives in document coordinates: standing still costs no JavaScript.
// One requestAnimationFrame loop, only while moving; only `transform` is written,
// and `will-change` exists solely during a hop.

import spriteUrl from "@/assets/mascot/labrador.png?no-inline";

// Sprite cells (design 6.10.1): sit, sit wagging its tail, 4 walk frames, leap, drop, crouch.
const FRAME_SIT = 0;
const FRAME_WAG = 1;
const FRAME_LEAP = 6;
const FRAME_DROP = 7;
const FRAME_CROUCH = 8;
const WALK_FRAMES = [2, 3, 4, 5];

const CELL = 32;
const DESKTOP_QUERY = "(min-width: 48rem)";
const MOTION_QUERY = "(prefers-reduced-motion: no-preference)";
// The reading line a platform must cross to become active (design 5.7).
const ACTIVE_MARGIN = "0px 0px -45% 0px";
const MEASURE_WAIT_MS = 150;
const WAG_MS = 500;
const WALK_MAX_DESKTOP = 48;
const WALK_MAX_MOBILE = 24;
const WALK_SPEED_DESKTOP = 56;
const WALK_SPEED_MOBILE = 28;
const MIN_VIEWPORT_HEIGHT = 120;

interface Spot {
  top: number;
  center: number;
}

interface Tokens {
  anticipate: number;
  land: number;
  hopMin: number;
  hopMax: number;
  hopPerPx: number;
  enter: number;
  walkFrame: number;
}

let layer: HTMLDivElement | null = null;
let box: HTMLDivElement | null = null;
let strip: HTMLDivElement | null = null;
let running = false;
let raf = 0;
let timers: number[] = [];
let platformObserver: IntersectionObserver | null = null;
let dogObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let spots: Spot[] = [];
let current = -1;
let pending = -1;
let busy = false;
let dogVisible = true;
let dogSize = 32;
let desktop = false;
let mirror = false;
let posX = 0;
let posY = 0;
let tokens: Tokens = {
  anticipate: 70,
  land: 110,
  hopMin: 280,
  hopMax: 450,
  hopPerPx: 0.35,
  enter: 380,
  walkFrame: 100,
};

function later(ms: number, step: () => void): void {
  timers.push(window.setTimeout(step, ms));
}

function clearTimers(): void {
  for (const timer of timers) window.clearTimeout(timer);
  timers = [];
}

function readTokens(): void {
  const css = getComputedStyle(document.documentElement);
  const ms = (name: string, fallback: number): number => {
    const raw = css.getPropertyValue(name).trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  tokens = {
    anticipate: ms("--mascot-anticipate", 70),
    land: ms("--mascot-land", 110),
    hopMin: ms("--mascot-hop-min", 280),
    hopMax: ms("--mascot-hop-max", 450),
    hopPerPx: ms("--mascot-hop-per-px", 0.35),
    enter: ms("--mascot-enter", 380),
    walkFrame: ms("--mascot-walk-frame", 100),
  };
}

function showFrame(frame: number, flip: boolean): void {
  if (!box || !strip) return;
  mirror = flip;
  const cell = CELL * (desktop ? 2 : 1);
  strip.style.transform = `translateX(${-frame * cell}px)`;
  render();
}

function render(): void {
  if (!box) return;
  const rx = Math.round(posX);
  const ry = Math.round(posY);
  box.style.transform = `translate3d(${rx}px, ${ry}px, 0)${mirror ? " scaleX(-1)" : ""}`;
}

function place(x: number, y: number): void {
  posX = x;
  posY = y;
  render();
}

/** Every text block or control the resting dog must not cover (design 6.10.4). */
function blockers(): Element[] {
  const found: Element[] = [];
  const all = document.querySelectorAll(
    "h1, h2, h3, h4, p, li, dt, dd, a, button, img, picture",
  );
  for (const el of all) {
    if (el.closest("header, footer, [data-timeline], [data-mascot]")) continue;
    found.push(el);
  }
  return found;
}

/** Read every platform once (a single read phase inside one frame) and keep the free ones. */
function measure(platforms: Element[]): void {
  desktop = window.matchMedia(DESKTOP_QUERY).matches;
  dogSize = CELL * (desktop ? 2 : 1);
  const headerPx =
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--size-header",
      ),
    ) || 64;
  const minTop = headerPx + dogSize + 8;
  const blocked = blockers();
  const next: Spot[] = [];
  for (const el of platforms) {
    if (el.closest("header, footer, [data-timeline]")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const top = rect.top + scrollY;
    if (top < minTop) continue;
    const center = Math.min(
      Math.max(rect.left + scrollX + rect.width / 2, dogSize / 2 + 4),
      window.innerWidth + scrollX - dogSize / 2 - 4,
    );
    // The box the dog would take standing on this platform.
    const rest = {
      left: center - dogSize / 2,
      top: top - dogSize,
      right: center + dogSize / 2,
      bottom: top,
    };
    if (rest.left < 0 || rest.top < minTop) continue;
    let free = true;
    for (const other of blocked) {
      // Its own heading or card never blocks its dog.
      if (other === el || other.contains(el)) continue;
      const box = other.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      const ox = box.left + scrollX;
      const oy = box.top + scrollY;
      if (
        rest.left < ox + box.width &&
        rest.right > ox &&
        rest.top < oy + box.height &&
        rest.bottom > oy
      ) {
        free = false;
        break;
      }
    }
    if (free) next.push({ top, center });
  }
  next.sort((a, b) => a.top - b.top);
  spots = next;
}

/** The last free platform at or above the reading line (binary search over the sorted list). */
function activeSpot(): number {
  const line = window.scrollY + window.innerHeight * 0.55;
  let low = 0;
  let high = spots.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (spots[mid]!.top <= line) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

function spotXY(index: number): { x: number; y: number } {
  const spot = spots[index]!;
  return { x: spot.center - dogSize / 2, y: spot.top - dogSize };
}

function hopDuration(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.min(
    tokens.hopMax,
    Math.max(tokens.hopMin, 200 + tokens.hopPerPx * dist),
  );
}

const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function fly(
  from: { x: number; y: number },
  to: { x: number; y: number },
  wide: boolean,
  done: () => void,
): void {
  const duration = hopDuration(from, to);
  const arc = desktop
    ? Math.min(48, Math.abs(to.y - from.y) / 4 + 16)
    : Math.min(24, Math.abs(to.y - from.y) / 8 + 8);
  // With free margins the arc leans out to the side instead of crossing the text (D-141).
  const lean =
    wide && Math.abs(to.x - from.x) > 1
      ? ((from.x + to.x) / 2 >= window.innerWidth / 2 ? 1 : -1) * 80
      : 0;
  const mirror = to.x < from.x;
  const start = performance.now();
  if (box) box.style.willChange = "transform";
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    const x = from.x + (to.x - from.x) * easeOut(t) + lean * 4 * t * (1 - t);
    const y = from.y + (to.y - from.y) * easeInOut(t) - arc * 4 * t * (1 - t);
    place(x, y);
    showFrame(t < 0.45 ? FRAME_LEAP : FRAME_DROP, mirror);
    if (t < 1) {
      raf = window.requestAnimationFrame(tick);
    } else {
      if (box) box.style.willChange = "";
      done();
    }
  };
  raf = window.requestAnimationFrame(tick);
}

/** Walk toward the middle of the platform, at most the free stretch (design 6.10.5). */
function stroll(target: number, done: () => void): void {
  const spot = spots[target];
  if (!spot) {
    done();
    return;
  }
  const x = posX;
  const y = posY;
  const goal = spot.center - dogSize / 2;
  const maxWalk = desktop ? WALK_MAX_DESKTOP : WALK_MAX_MOBILE;
  const speed = desktop ? WALK_SPEED_DESKTOP : WALK_SPEED_MOBILE;
  const step = Math.max(-maxWalk, Math.min(maxWalk, goal - x));
  if (Math.abs(step) < 2) {
    done();
    return;
  }
  const mirror = step < 0;
  const start = performance.now();
  const duration = (Math.abs(step) / speed) * 1000;
  if (box) box.style.willChange = "transform";
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    place(x + step * t, y);
    showFrame(
      WALK_FRAMES[
        Math.floor((now - start) / tokens.walkFrame) % WALK_FRAMES.length
      ]!,
      mirror,
    );
    if (t < 1) {
      raf = window.requestAnimationFrame(tick);
    } else {
      if (box) box.style.willChange = "";
      done();
    }
  };
  raf = window.requestAnimationFrame(tick);
}

function rest(target: number): void {
  const landMs = pending === -1 ? tokens.land : 60;
  later(landMs, () => {
    if (!running) return;
    if (pending !== -1 && pending !== target) {
      const next = pending;
      pending = -1;
      hopTo(next);
      return;
    }
    pending = -1;
    stroll(target, () => {
      if (!running) return;
      showFrame(FRAME_WAG, mirror);
      later(WAG_MS, () => {
        if (!running) return;
        if (pending !== -1) {
          const next = pending;
          pending = -1;
          hopTo(next);
          return;
        }
        busy = false;
        showFrame(FRAME_SIT, mirror);
      });
    });
  });
}

/** Fall in from the edge of the screen instead of teleporting (design 6.10.5). */
function enter(target: number): void {
  const to = spotXY(target);
  const belowMiddle = to.y > window.scrollY + window.innerHeight / 2;
  const from = {
    x: to.x,
    y: belowMiddle
      ? window.scrollY - dogSize
      : window.scrollY + window.innerHeight,
  };
  place(from.x, from.y);
  showFrame(FRAME_DROP, false);
  current = target;
  busy = true;
  const start = performance.now();
  if (box) box.style.willChange = "transform";
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / tokens.enter);
    place(from.x, from.y + (to.y - from.y) * easeInOut(t));
    if (t < 1) {
      raf = window.requestAnimationFrame(tick);
    } else {
      if (box) box.style.willChange = "";
      showFrame(FRAME_CROUCH, false);
      rest(target);
    }
  };
  raf = window.requestAnimationFrame(tick);
}

function hopTo(target: number): void {
  if (!running || target < 0 || target >= spots.length) return;
  if (!dogVisible) {
    const to = spotXY(target);
    place(to.x, to.y);
    showFrame(FRAME_SIT, mirror);
    current = target;
    busy = false;
    return;
  }
  const to = spotXY(target);
  const from = { x: posX, y: posY };
  const far =
    Math.abs(to.y - from.y) > window.innerHeight * 1.5 ||
    from.y < window.scrollY - dogSize ||
    from.y > window.scrollY + window.innerHeight;
  if (current === -1 || far) {
    if (busy) window.cancelAnimationFrame(raf);
    clearTimers();
    enter(target);
    return;
  }
  if (Math.abs(to.x - from.x) < 2 && Math.abs(to.y - from.y) < 2) {
    current = target;
    return;
  }
  current = target;
  busy = true;
  showFrame(FRAME_CROUCH, to.x < from.x);
  later(tokens.anticipate, () => {
    if (!running) return;
    fly(from, to, window.innerWidth >= 1424, () => {
      if (!running) return;
      showFrame(FRAME_CROUCH, mirror);
      rest(target);
    });
  });
}

function request(target: number): void {
  if (!running || target < 0 || target >= spots.length || target === current) {
    if (target === current) pending = -1;
    return;
  }
  if (busy) {
    pending = target;
    return;
  }
  hopTo(target);
}

function buildLayer(): void {
  layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-mascot", "");
  layer.className = "mascot";
  box = document.createElement("div");
  box.className = "mascot-box";
  strip = document.createElement("div");
  strip.className = "mascot-strip";
  strip.style.backgroundImage = `url("${spriteUrl}")`;
  box.appendChild(strip);
  layer.appendChild(box);
  document.body.appendChild(layer);
  sizeSprite();
}

function sizeSprite(): void {
  if (!box || !strip) return;
  const cell = CELL * (desktop ? 2 : 1);
  box.style.width = `${cell}px`;
  box.style.height = `${cell}px`;
  strip.style.width = `${CELL * 9 * (desktop ? 2 : 1)}px`;
  strip.style.height = `${cell}px`;
  strip.style.backgroundSize = `${CELL * 9 * (desktop ? 2 : 1)}px ${cell}px`;
}

/** Reduced motion (D-145): sitting still on a staff note of the home, never hopping. */
function startStill(platforms: Element[]): void {
  desktop = window.matchMedia(DESKTOP_QUERY).matches;
  dogSize = CELL * (desktop ? 2 : 1);
  measure(platforms);
  const note = spots.find((spot) =>
    platforms.some(
      (el) =>
        el.getAttribute("data-platform") === "note" &&
        Math.abs(el.getBoundingClientRect().top + window.scrollY - spot.top) <
          2,
    ),
  );
  const home = note ?? spots[0];
  if (!home) return;
  readTokens();
  buildLayer();
  running = true;
  place(home.center - dogSize / 2, home.top - dogSize);
  showFrame(FRAME_SIT, false);
  let timer = 0;
  const remeasure = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!running) return;
      measure(platforms);
      sizeSprite();
      const again = spots[0];
      if (again && box) place(again.center - dogSize / 2, again.top - dogSize);
    }, MEASURE_WAIT_MS);
  };
  window.addEventListener("resize", remeasure);
  if (document.fonts) {
    document.fonts.ready.then(() => remeasure()).catch(() => undefined);
  }
}

/** Chain of continuous hops following the reader down (design 6.10.5). */
function startHopping(platforms: Element[]): void {
  readTokens();
  buildLayer();
  running = true;

  const remeasure = (): void => {
    if (!running) return;
    measure(platforms);
    sizeSprite();
    if (current >= spots.length) current = -1;
  };
  let resizeTimer = 0;
  const schedule = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(remeasure, MEASURE_WAIT_MS);
  };

  measure(platforms);
  if (spots.length === 0) {
    stop();
    return;
  }
  current = -1;
  pending = -1;

  platformObserver = new IntersectionObserver(
    () => {
      if (running) request(activeSpot());
    },
    { rootMargin: ACTIVE_MARGIN },
  );
  for (const el of platforms) platformObserver.observe(el);

  dogObserver = new IntersectionObserver(
    (entries) => {
      dogVisible = entries.some((entry) => entry.isIntersecting);
    },
    { threshold: 0 },
  );
  if (layer) dogObserver.observe(layer);

  window.addEventListener("resize", schedule);
  if (document.fonts) {
    document.fonts.ready.then(schedule).catch(() => undefined);
  }
  window.addEventListener("load", schedule);
  for (const img of document.images) {
    if (!img.complete) img.addEventListener("load", schedule, { once: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && running && current >= 0 && current < spots.length) {
      window.cancelAnimationFrame(raf);
      clearTimers();
      busy = false;
      pending = -1;
      const to = spotXY(current);
      place(to.x, to.y);
      showFrame(FRAME_SIT, mirror);
    }
  });

  if ("ResizeObserver" in window && document.documentElement) {
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.documentElement);
  }

  request(activeSpot());
}

export function start(): void {
  if (running || typeof window === "undefined") return;
  if (window.innerHeight < MIN_VIEWPORT_HEIGHT) return;
  const platforms = Array.from(document.querySelectorAll("[data-platform]"));
  if (platforms.length === 0) return;
  if (!window.matchMedia(MOTION_QUERY).matches) {
    startStill(platforms);
    return;
  }
  if (!("IntersectionObserver" in window && "requestAnimationFrame" in window))
    return;
  startHopping(platforms);
}

export function stop(): void {
  running = false;
  busy = false;
  pending = -1;
  current = -1;
  window.cancelAnimationFrame(raf);
  clearTimers();
  platformObserver?.disconnect();
  dogObserver?.disconnect();
  resizeObserver?.disconnect();
  platformObserver = null;
  dogObserver = null;
  resizeObserver = null;
  layer?.remove();
  layer = null;
  box = null;
  strip = null;
  spots = [];
}
