// Regression check for the mascot engine fix (spec 002, T8-T9 bugfix B).
// Static assertions over src/scripts/mascot/engine.ts — no dependencies.
// Run: node scripts/check-mascot.mjs (exit 0 = pass, 1 = fail).
//
// What it guards:
// 1. dogObserver watches the sized box, never the 0x0 layer, so dogVisible
//    is true on screen and hopTo takes the animated path (fly/stroll).
// 2. hopTo keeps the instant branch ONLY for the off-screen case (!dogVisible).
// 3. blockers() still skips viewport-fixed controls (no document position)
//    without dropping the in-flow text/control coverage (R25.3).
// 4. Reduced motion stays still: startStill sits (FRAME_SIT) and never flies.

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

// 2. hopTo: instant apply only when off-screen; animated path otherwise.
const hopTo = block("hopTo");
check(
  "hopTo instant branch gated by !dogVisible",
  /if\s*\(!dogVisible\)/.test(hopTo),
);
check("hopTo animates via fly()", hopTo.includes("fly(from, to"));
check("hopTo chains rest()/stroll()", hopTo.includes("rest(target)"));

// 3. blockers(): fixed controls excluded, in-flow coverage kept.
const blockers = block("blockers");
check("blockers skips position:fixed", blockers.includes('"fixed"'));
check(
  "blockers still covers text and controls",
  ["h1", "h2", "p", "li", "a", "button", "img", "picture"].every((t) =>
    blockers.includes(t),
  ),
);

// 4. Reduced motion: still sitting, no flight.
const still = block("startStill");
check("startStill sits (FRAME_SIT)", still.includes("FRAME_SIT"));
check("startStill never flies", !still.includes("fly("));

if (failures > 0) {
  console.error(`\ncheck-mascot: ${failures} failing assertion(s)`);
  process.exit(1);
}
console.log("\ncheck-mascot: all assertions pass");
