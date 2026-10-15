// Regression check for the mascot engine fix (spec 002, T8-T9 bugfix B).
// Static assertions over src/scripts/mascot/engine.ts — no dependencies.
// Run: node scripts/check-mascot.mjs (exit 0 = pass, 1 = fail).
//
// What it guards:
// 1. dogObserver watches the sized box, never the 0x0 layer, so dogVisible
//    is live while the dog is on screen.
// 2. hopTo never teleports a visible move: the instant place() runs ONLY for
//    the hidden initial position or a far off-screen destination (viewport
//    geometry via scrollY/innerHeight); otherwise it animates via fly() with
//    an arc, or falls in from the screen edge via enter() (380 ms).
// 3. fly() cycles the sprite by instantaneous direction: LEAP rising, DROP
//    falling, WALK frames on horizontal stretches; landing rests SIT + one
//    tail wag (rest/stroll).
// 4. measure() grants no self/container exemption (no other.contains(el)):
//    the resting strip above every spot must be free air (RNF18), and the
//    layout is re-measured after it settles (fonts/load/images + delayed
//    passes); blockers() still skips viewport-fixed controls (no document
//    position) without dropping the in-flow text/control coverage (R25.3).
// 5. D-170: no reduced-motion gate remains — the mascot always hops,
//    startStill is gone and hide() always plays the burst on screen.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/scripts/mascot/engine.ts"), "utf8");

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  if (!ok) failures += 1;
}

const block = (name) => {
  const m = src.match(new RegExp(`function ${name}[\\s\\S]*?\\n}\\n`));
  return m ? m[0] : "";
};

// 1. Observer target: box with a real size, never the layer.
check("observer watches box", src.includes("dogObserver.observe(box)"));
check(
  "observer never watches layer",
  !src.includes("dogObserver.observe(layer)"),
);
check(
  "box keeps a sized cell (>0)",
  src.includes("box.style.width") && src.includes("box.style.height"),
);

// 2. hopTo: visible moves always animate; instant place only when hidden/far.
const hopTo = block("hopTo");
check(
  "hopTo never teleports on !dogVisible alone",
  !/if\s*\(!dogVisible\)/.test(hopTo),
);
check(
  "hopTo decides by viewport geometry",
  hopTo.includes("inViewport") &&
    src.includes("window.scrollY") &&
    src.includes("window.innerHeight"),
);
check(
  "hopTo instant place only when hidden initial or off-screen",
  hopTo.includes("place(to.x, to.y)") &&
    hopTo.includes("current === -1") &&
    hopTo.includes("!destVisible"),
);
check("hopTo animates via fly()", hopTo.includes("fly(from, to"));
check("hopTo falls in via enter()", hopTo.includes("enter(target)"));
check("hopTo chains rest()/stroll()", hopTo.includes("rest(target)"));

// 3. fly(): sprite follows the instantaneous direction.
const fly = block("fly");
check("fly shows LEAP rising", fly.includes("FRAME_LEAP"));
check("fly shows DROP falling", fly.includes("FRAME_DROP"));
check("fly cycles WALK frames", fly.includes("WALK_FRAMES"));

// 4. measure(): no self/container exemption; re-measure after settle.
check(
  "measure grants no container exemption",
  !src.includes("other.contains(el)"),
);
check(
  "layout re-measured after it settles",
  src.includes("requestAnimationFrame(schedule)") &&
    src.includes("setTimeout(schedule"),
);
const blockers = block("blockers");
check("blockers skips position:fixed", blockers.includes('"fixed"'));
check(
  "blockers still covers text and controls",
  ["h1", "h2", "p", "li", "a", "button", "img", "picture"].every((t) =>
    blockers.includes(t),
  ),
);

// 5. D-170: motion preference ignored — always hopping, burst on hide.
const hide = block("hide");
check("no reduced-motion gate", !src.includes("prefers-reduced-motion"));
check("startStill removed", !src.includes("startStill"));
check("hide() always bursts on screen", hide.includes("burst(target"));

if (failures > 0) {
  console.error(`\ncheck-mascot: ${failures} failing assertion(s)`);
  process.exit(1);
}
console.log("\ncheck-mascot: all assertions pass");
