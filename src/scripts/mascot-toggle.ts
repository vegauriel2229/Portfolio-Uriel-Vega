// Mascot show/hide button and preference (design sections 5.7, 6.5.1 and 6.10.6).
// The button is rendered `hidden`; this module shows it, so without JavaScript
// there is no button that does nothing (R25.6). Hiding imports the engine only
// to play the farewell burst; showing imports it to start the dog again.
// Preference key `uv-mascot` = `hidden`, always inside try/catch: with blocked
// storage the choice lasts for this visit only (R25.11) and nothing throws.

const KEY = "uv-mascot";
const HIDDEN = "hidden";

let memoryHidden = false;

/** True when the visitor hid the mascot. Never throws. */
export function isMascotHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === HIDDEN;
  } catch {
    return memoryHidden;
  }
}

function remember(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(KEY, HIDDEN);
    else window.localStorage.removeItem(KEY);
  } catch {
    memoryHidden = hidden;
  }
}

/** Swap the accessible name and the paw icon to the new state (R25.10). */
function paint(button: HTMLButtonElement, hidden: boolean): void {
  const label = hidden
    ? (button.dataset.labelShow ?? "")
    : (button.dataset.labelHide ?? "");
  button.setAttribute("aria-label", label);
  button
    .querySelector('[data-mascot-icon="hide"]')
    ?.toggleAttribute("hidden", hidden);
  button
    .querySelector('[data-mascot-icon="show"]')
    ?.toggleAttribute("hidden", !hidden);
}

export function initMascotToggle(): void {
  const button = document.querySelector<HTMLButtonElement>(
    "[data-mascot-toggle]",
  );
  if (!button) return;
  paint(button, isMascotHidden());
  button.hidden = false;
  button.addEventListener("click", () => {
    const hidden = !isMascotHidden();
    remember(hidden);
    paint(button, hidden);
    // Synchronous work here is trivial (storage + attributes), so INP stays
    // far under budget; the engine chunk loads asynchronously.
    if (hidden) {
      void import("./mascot/engine")
        .then((engine) => engine.hide())
        .catch(() => undefined);
    } else {
      void import("./mascot/engine")
        .then((engine) => engine.start())
        .catch(() => undefined);
    }
  });
}
