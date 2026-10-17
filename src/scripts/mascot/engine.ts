// Mascot engine: a pixel-art labrador hopping between platforms (design 5.7, 6.10).
// Progressive enhancement: it starts only on pages with platforms, shows nothing
// when there is no room or no free spot (R25.17), and never throws.
// The dog lives in document coordinates: standing still costs no JavaScript.
// One requestAnimationFrame loop, only while moving; only `transform` is written,
// and `will-change` exists solely during a hop.

import spriteUrl from "@/assets/mascot/labrador.png?no-inline";

// Sprite cells (design 6.10.1): sit, sit wagging its tail, 4 walk frames, leap, drop, crouch,
// then 2 sniff frames (head down), lying awake and 2 sleeping frames (eyes shut, floating "z").
const FRAME_SIT = 0;
const FRAME_WAG = 1;
const FRAME_LEAP = 6;
const FRAME_DROP = 7;
const FRAME_CROUCH = 8;
const WALK_FRAMES = [2, 3, 4, 5];
const SNIFF_FRAMES = [9, 10];
const FRAME_LIE = 11;
const SLEEP_FRAMES = [12, 13];
const FRAME_COUNT = 14;

const CELL = 32;
const DESKTOP_QUERY = "(min-width: 48rem)";
// D-170: animations always run, the visitor's motion preference is ignored.
// The reading line a platform must cross to become active (design 5.7).
const ACTIVE_MARGIN = "0px 0px -45% 0px";
const MEASURE_WAIT_MS = 150;
const WAG_MS = 500;
const WALK_MAX_DESKTOP = 48;
const WALK_MAX_MOBILE = 24;
const WALK_SPEED_DESKTOP = 56;
const WALK_SPEED_MOBILE = 28;
const MIN_VIEWPORT_HEIGHT = 120;
// A text line box starts well above the letters (ascent and leading): on a
// "letters" platform the paws sink this share of the font size to touch the tops.
const LETTER_SINK_EM = 0.3;
/** First arrival waits for the hero name to finish rising (300 ms delay + 800 ms rise). */
const HERO_SETTLE_MS = 1250;
// Idle life on the platform: short sniffing strolls, then a nap after 10 s without scrolling.
const IDLE_WANDER_DESKTOP = 96;
const IDLE_WANDER_MOBILE = 40;
const IDLE_SPEED_DESKTOP = 34;
const IDLE_SPEED_MOBILE = 18;
const IDLE_WALK_FRAME_MS = 150;
const SNIFF_FRAME_MS = 170;
const NAP_AFTER_MS = 10000;
const LIE_TO_SLEEP_MS = 1600;
const BREATH_MS = 900;
const BREATHS_MAX = 120;
const LAND_SQUASH_MS = 180;

interface Spot {
  top: number;
  center: number;
  /** Free stretch (dog's left x) where it can stroll without covering text or leaving the platform. */
  minX: number;
  maxX: number;
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
let squashX = 1;
let squashY = 1;
let idling = false;
let lying = false;
let napTimer = 0;
let startTimer = 0;
let lastNapReset = 0;
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

const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

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
  const sx = (mirror ? -1 : 1) * squashX;
  const scale =
    sx !== 1 || squashY !== 1
      ? ` scale(${sx.toFixed(3)}, ${squashY.toFixed(3)})`
      : "";
  box.style.transform = `translate3d(${rx}px, ${ry}px, 0)${scale}`;
}

function place(x: number, y: number): void {
  posX = x;
  posY = y;
  // The box starts at the document origin: keep it hidden until this first
  // real position so it never flashes over the header logo at (0, 0).
  if (box && box.style.opacity !== "1") box.style.opacity = "1";
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
    // Viewport-rooted controls (e.g. the floating WhatsApp link) have no
    // document position: mapping their viewport rect with scrollX/scrollY in
    // measure() would void valid spots depending on the scroll. R25.3 only
    // covers in-flow text and controls, so fixed elements are not blockers.
    if (getComputedStyle(el).position === "fixed") continue;
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
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const blocked: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = [];
  for (const other of blockers()) {
    const box = other.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    blocked.push({
      left: box.left + scrollX,
      top: box.top + scrollY,
      right: box.right + scrollX,
      bottom: box.bottom + scrollY,
    });
  }
  // The strip the dog takes with its left edge at x on a platform whose top is y.
  const clear = (x: number, y: number): boolean => {
    const left = x;
    const right = x + dogSize;
    const top = y - dogSize;
    for (const b of blocked) {
      if (left < b.right && right > b.left && top < b.bottom && y > b.top)
        return false;
    }
    return true;
  };
  const wander = desktop ? IDLE_WANDER_DESKTOP : IDLE_WANDER_MOBILE;
  const next: Spot[] = [];
  for (const el of platforms) {
    if (el.closest("header, footer, [data-timeline]")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const top = rect.top + scrollY;
    // Free air is checked from the line box (above it nothing may be covered);
    // the dog itself stands lower, on the tops of the letters.
    const sink =
      el.getAttribute("data-platform") === "letters"
        ? Number.parseFloat(getComputedStyle(el).fontSize) * LETTER_SINK_EM
        : 0;
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
    // The resting box only has to clear the sticky header.
    if (rest.left < 0 || rest.top < headerPx + 8) continue;
    // No exemption for the platform itself or its containers: the strip the
    // dog takes standing on the spot must be free air above it, even when
    // the text belongs to the same card or heading (RNF18, design 6.10.4).
    // The platform's own rect starts at the spot top, so a valid spot never
    // touches it (edge contact is not an overlap).
    if (!clear(rest.left, top)) continue;
    // Stroll range: free air on both sides, never past the platform's ends
    // (the paws stay on it) nor the page edges.
    const edgeLeft = Math.max(
      rest.left - wander,
      rect.left + scrollX - dogSize / 3,
      scrollX + 4,
    );
    const edgeRight = Math.min(
      rest.left + wander,
      rect.right + scrollX - (dogSize * 2) / 3,
      window.innerWidth + scrollX - dogSize - 4,
    );
    let minX = rest.left;
    let maxX = rest.left;
    while (minX - 4 >= edgeLeft && clear(minX - 4, top)) minX -= 4;
    while (maxX + 4 <= edgeRight && clear(maxX + 4, top)) maxX += 4;
    next.push({ top: top + sink, center, minX, maxX });
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

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function fly(
  from: { x: number; y: number },
  to: { x: number; y: number },
  wide: boolean,
  done: () => void,
): void {
  const duration = hopDuration(from, to);
  // A real jump: x glides, y follows a parabola whose apex grows with the distance.
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const arc = desktop
    ? Math.min(96, dist / 5 + 28)
    : Math.min(48, dist / 8 + 14);
  // With free margins the arc leans out to the side instead of crossing the text (D-141).
  const lean =
    wide && Math.abs(to.x - from.x) > 1
      ? ((from.x + to.x) / 2 >= window.innerWidth / 2 ? 1 : -1) * 80
      : 0;
  const mirror = to.x < from.x;
  const start = performance.now();
  let prevX = from.x;
  let prevY = from.y;
  if (box) box.style.willChange = "transform";
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    const glide = easeInOutSine(t);
    const x = from.x + (to.x - from.x) * glide + lean * 4 * t * (1 - t);
    // Linear drift plus the arc term is a constant-gravity trajectory.
    const y = from.y + (to.y - from.y) * t - arc * 4 * t * (1 - t);
    place(x, y);
    // Sprite follows the instantaneous direction (design 6.10.5): LEAP while
    // rising, DROP while falling, WALK frames on a mostly horizontal stretch.
    const dx = x - prevX;
    const dy = y - prevY;
    prevX = x;
    prevY = y;
    if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 0.5) {
      showFrame(
        WALK_FRAMES[
          Math.floor((now - start) / tokens.walkFrame) % WALK_FRAMES.length
        ]!,
        mirror,
      );
    } else {
      showFrame(dy < 0 ? FRAME_LEAP : FRAME_DROP, mirror);
    }
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
        startIdle();
      });
    });
  });
}

/** Soft landing: the dog squashes on its paws and springs back (transform only). */
function squash(done: () => void): void {
  const start = performance.now();
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / LAND_SQUASH_MS);
    const k = Math.sin(Math.PI * t) * (1 - 0.4 * t);
    squashX = 1 + 0.14 * k;
    squashY = 1 - 0.14 * k;
    render();
    if (t < 1) {
      raf = window.requestAnimationFrame(tick);
    } else {
      squashX = 1;
      squashY = 1;
      render();
      done();
    }
  };
  raf = window.requestAnimationFrame(tick);
}

/*
 * Idle life on the platform (after landing): short strolls inside the spot's
 * free stretch with the nose down, sniffing pauses and the odd tail wag.
 * Every step is a timer or a short rAF walk, interruptible by the next hop.
 */
function stopIdle(): void {
  if (!idling && !lying) return;
  idling = false;
  lying = false;
  window.cancelAnimationFrame(raf);
  clearTimers();
}

function startIdle(): void {
  if (!running || busy) return;
  idling = true;
  lying = false;
  later(rand(700, 1400), idleStep);
}

function idleStep(): void {
  if (!running || busy || !idling) return;
  const spot = spots[current];
  if (!spot) return;
  // Nobody sees an off-screen stroll: just look again later.
  if (!inViewport(posY + dogSize)) {
    later(1500, idleStep);
    return;
  }
  const next = (): void => {
    showFrame(Math.random() < 0.3 ? FRAME_WAG : FRAME_SIT, mirror);
    later(rand(900, 2000), () => {
      if (!idling) return;
      showFrame(FRAME_SIT, mirror);
      later(rand(200, 600), idleStep);
    });
  };
  const sniffs = Math.round(rand(3, 6));
  if (spot.maxX - spot.minX >= 8 && Math.random() < 0.65) {
    let goal = rand(spot.minX, spot.maxX);
    if (Math.abs(goal - posX) < 8)
      goal = posX < (spot.minX + spot.maxX) / 2 ? spot.maxX : spot.minX;
    walkTo(goal, () => sniff(sniffs, next));
  } else {
    sniff(sniffs, next);
  }
}

/** Slow walk along the platform, nose down every few steps like on a scent trail. */
function walkTo(goal: number, done: () => void): void {
  const fromX = posX;
  const y = posY;
  const dist = goal - fromX;
  if (Math.abs(dist) < 2) {
    done();
    return;
  }
  const flip = dist < 0;
  const speed = desktop ? IDLE_SPEED_DESKTOP : IDLE_SPEED_MOBILE;
  const duration = (Math.abs(dist) / speed) * 1000;
  const start = performance.now();
  const tick = (now: number): void => {
    if (!idling) return;
    const t = Math.min(1, (now - start) / duration);
    place(fromX + dist * easeInOutSine(t), y);
    const beat = Math.floor((now - start) / IDLE_WALK_FRAME_MS);
    showFrame(
      beat % 6 >= 4
        ? SNIFF_FRAMES[beat % 2]!
        : WALK_FRAMES[beat % WALK_FRAMES.length]!,
      flip,
    );
    if (t < 1) raf = window.requestAnimationFrame(tick);
    else done();
  };
  raf = window.requestAnimationFrame(tick);
}

/** Nose to the ground, bobbing between the two sniff frames. */
function sniff(times: number, done: () => void): void {
  let left = times * 2;
  const step = (): void => {
    if (!idling) return;
    if (left <= 0) {
      done();
      return;
    }
    showFrame(SNIFF_FRAMES[left % 2]!, mirror);
    left -= 1;
    later(SNIFF_FRAME_MS + (left % 2) * 60, step);
  };
  step();
}

/** Any scroll postpones the nap; NAP_AFTER_MS of stillness lays the dog down. */
function armNap(): void {
  window.clearTimeout(napTimer);
  napTimer = window.setTimeout(lieDown, NAP_AFTER_MS);
}

function lieDown(): void {
  if (!running || lying || current < 0) return;
  if (busy) {
    armNap();
    return;
  }
  stopIdle();
  lying = true;
  showFrame(FRAME_CROUCH, mirror);
  later(160, () => {
    if (!lying) return;
    showFrame(FRAME_LIE, mirror);
    later(LIE_TO_SLEEP_MS, () => breathe(0));
  });
}

/** Asleep: slow breathing between the two sleep frames (bounded, then still). */
function breathe(count: number): void {
  if (!lying) return;
  showFrame(SLEEP_FRAMES[count % 2]!, mirror);
  if (count < BREATHS_MAX) later(BREATH_MS, () => breathe(count + 1));
}

/** Woken by a scroll that keeps it on the same platform: get up, then idle again. */
function wake(): void {
  if (!lying) return;
  lying = false;
  clearTimers();
  showFrame(FRAME_LIE, mirror);
  later(130, () => {
    showFrame(FRAME_CROUCH, mirror);
    later(130, () => {
      showFrame(FRAME_SIT, mirror);
      startIdle();
    });
  });
}

function onScroll(): void {
  if (!running) return;
  if (lying && !busy) wake();
  const now = performance.now();
  if (now - lastNapReset > 250) {
    lastNapReset = now;
    armNap();
  }
}

/**
 * Fall in from the top edge of the screen instead of teleporting (design 6.10.5):
 * always from above, so it reads as the dog dropping down the page with the reader.
 */
function enter(target: number): void {
  const to = spotXY(target);
  const from = {
    x: to.x,
    y: Math.min(window.scrollY - dogSize, to.y - dogSize * 2),
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
      squash(() => rest(target));
    }
  };
  raf = window.requestAnimationFrame(tick);
}

/** True while a document height is at least partly inside the viewport. */
function inViewport(y: number): boolean {
  return (
    y >= window.scrollY - dogSize && y <= window.scrollY + window.innerHeight
  );
}

function hopTo(target: number): void {
  if (!running || target < 0 || target >= spots.length) return;
  const to = spotXY(target);
  const from = { x: posX, y: posY };
  // dogVisible lags a frame behind (IntersectionObserver) and is false during
  // every scroll, so geometry decides: a visible displacement always animates.
  const destVisible = inViewport(to.y);
  const fromVisible = current !== -1 && (dogVisible || inViewport(from.y));
  // Instant place only for the hidden initial position or a far off-screen
  // destination. When the dog later enters the view it falls in (380 ms).
  if (!destVisible && (current === -1 || !fromVisible)) {
    if (busy) window.cancelAnimationFrame(raf);
    clearTimers();
    place(to.x, to.y);
    showFrame(FRAME_SIT, mirror);
    current = target;
    busy = false;
    startIdle();
    return;
  }
  // Far or off-screen origin, never a teleport: fall in from the screen edge.
  const far =
    current === -1 ||
    !fromVisible ||
    Math.abs(to.y - from.y) > window.innerHeight * 1.5;
  if (far) {
    if (busy) window.cancelAnimationFrame(raf);
    clearTimers();
    enter(target);
    return;
  }
  if (Math.abs(to.x - from.x) < 2 && Math.abs(to.y - from.y) < 2) {
    current = target;
    busy = false;
    showFrame(FRAME_SIT, mirror);
    startIdle();
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
      squash(() => rest(target));
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
  stopIdle();
  hopTo(target);
}

function buildLayer(): void {
  layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-mascot", "");
  layer.className = "mascot";
  box = document.createElement("div");
  box.className = "mascot-box";
  // Squash and flip pivot on the paws.
  box.style.transformOrigin = "50% 100%";
  // Hidden until the first place(): the layer is absolute at the document
  // origin and would otherwise cover the header logo at (0, 0).
  box.style.opacity = "0";
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
  strip.style.width = `${CELL * FRAME_COUNT * (desktop ? 2 : 1)}px`;
  strip.style.height = `${cell}px`;
  strip.style.backgroundSize = `${CELL * FRAME_COUNT * (desktop ? 2 : 1)}px ${cell}px`;
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
  // Watch the sized box, never the layer: the layer is a 0x0 absolute
  // origin, so it never intersects and the dog would always take the
  // instant branch of hopTo (sitting still). The box keeps its cell size.
  if (box) dogObserver.observe(box);

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
      idling = false;
      lying = false;
      squashX = 1;
      squashY = 1;
      const to = spotXY(current);
      place(to.x, to.y);
      showFrame(FRAME_SIT, mirror);
      startIdle();
      armNap();
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  armNap();

  if ("ResizeObserver" in window && document.documentElement) {
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.documentElement);
  }

  // The first measure can run with fallback fonts or half-loaded images and
  // keep spots that cover text (RNF18): re-measure once the layout settles.
  window.requestAnimationFrame(schedule);
  window.setTimeout(schedule, MEASURE_WAIT_MS * 2);

  request(activeSpot());
}

/** Disconnect observers and loops and forget the state; the caller owns the layer. */
function teardown(): {
  target: HTMLDivElement | null;
  targetBox: HTMLDivElement | null;
} {
  running = false;
  busy = false;
  idling = false;
  lying = false;
  squashX = 1;
  squashY = 1;
  pending = -1;
  current = -1;
  window.cancelAnimationFrame(raf);
  clearTimers();
  window.clearTimeout(napTimer);
  window.clearTimeout(startTimer);
  window.removeEventListener("scroll", onScroll);
  platformObserver?.disconnect();
  dogObserver?.disconnect();
  resizeObserver?.disconnect();
  platformObserver = null;
  dogObserver = null;
  resizeObserver = null;
  const target = layer;
  const targetBox = box;
  layer = null;
  box = null;
  strip = null;
  spots = [];
  return { target, targetBox };
}

const BURST_PARTICLES = 10;
const BURST_MS = 420;
const VANISH_MS = 140;
// Violet burst pieces (design 6.10.7): 5 action, 3 accent, 2 line.
const BURST_COLORS = [
  "var(--color-action)",
  "var(--color-action)",
  "var(--color-action)",
  "var(--color-action)",
  "var(--color-action)",
  "var(--color-accent)",
  "var(--color-accent)",
  "var(--color-accent)",
  "var(--color-line)",
  "var(--color-line)",
];

function burstRadius(index: number): number {
  const far = index % 2 === 1;
  if (desktop) return far ? 36 : 24;
  return far ? 22 : 14;
}

/**
 * Farewell burst at the dog's center: pieces leave at 36° from each other with
 * alternating radii, stay opaque for the first 30 %, then shrink and fade.
 * Every piece is removed when its flight ends; the layer goes with the last one.
 */
function burst(target: HTMLDivElement, targetBox: HTMLDivElement): void {
  const size = dogSize;
  const centerX = Math.round(posX + size / 2);
  const centerY = Math.round(posY + size / 2);
  const resting = getComputedStyle(targetBox).transform;
  let left = BURST_PARTICLES + 1;
  const done = (): void => {
    left -= 1;
    if (left <= 0) target.remove();
  };
  const vanish = targetBox.animate(
    [
      { transform: `${resting} scale(1)`, opacity: "1" },
      { transform: `${resting} scale(1.12)`, opacity: "0" },
    ],
    { duration: VANISH_MS, easing: "ease-out", fill: "forwards" },
  );
  vanish.onfinish = done;
  for (let i = 0; i < BURST_PARTICLES; i += 1) {
    const piece = document.createElement("span");
    piece.setAttribute("aria-hidden", "true");
    piece.style.position = "absolute";
    piece.style.left = `${centerX - 2}px`;
    piece.style.top = `${centerY - 2}px`;
    piece.style.width = "4px";
    piece.style.height = "4px";
    piece.style.backgroundColor = BURST_COLORS[i] ?? "var(--color-action)";
    piece.style.pointerEvents = "none";
    target.appendChild(piece);
    const angle = (i / BURST_PARTICLES) * Math.PI * 2;
    const radius = burstRadius(i);
    const dx = Math.round(Math.cos(angle) * radius * 10) / 10;
    const dy = Math.round(Math.sin(angle) * radius * 10) / 10;
    const flight = piece.animate(
      [
        { transform: "translate(0px, 0px) scale(1)", opacity: "1" },
        {
          transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(1)`,
          opacity: "1",
          offset: 0.3,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(0.3)`,
          opacity: "0",
        },
      ],
      {
        duration: BURST_MS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      },
    );
    flight.onfinish = () => {
      piece.remove();
      done();
    };
  }
}

export function start(): void {
  if (running || typeof window === "undefined") return;
  if (window.innerHeight < MIN_VIEWPORT_HEIGHT) return;
  const platforms = Array.from(document.querySelectorAll("[data-platform]"));
  if (platforms.length === 0) return;
  if (!("IntersectionObserver" in window && "requestAnimationFrame" in window))
    return;
  // Measured mid-rise, the name would sit lower than where it ends up.
  const wait = Math.max(0, HERO_SETTLE_MS - performance.now());
  if (wait > 0) {
    window.clearTimeout(startTimer);
    startTimer = window.setTimeout(() => {
      if (!running) startHopping(platforms);
    }, wait);
    return;
  }
  startHopping(platforms);
}

export function stop(): void {
  const { target } = teardown();
  target?.remove();
}

/**
 * Violet burst on hide (design 6.10.7, R25.21): the dog scales 1 → 1.12 while
 * fading out (140 ms) and 10 squares of 4 px fly outwards (420 ms, total under
 * 450 ms), then the layer is removed. Only `transform` and `opacity` move
 * (Web Animations API, allowed by the CSP like any script-driven transform).
 * Instant removal when the dog is off-screen (D-170: the motion
 * preference is ignored, the burst always plays on screen).
 */
export function hide(): void {
  const { target, targetBox } = teardown();
  if (!target || !targetBox) return;
  const rect = targetBox.getBoundingClientRect();
  const onScreen =
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth;
  if (!onScreen || typeof targetBox.animate !== "function") {
    target.remove();
    return;
  }
  burst(target, targetBox);
}
