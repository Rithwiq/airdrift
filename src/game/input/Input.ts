export type Controls = {
  pitch: number;   // W/S
  roll: number;    // A/D
  yaw: number;     // ← / →
  boost: boolean;  // Shift OR B
  brake: boolean;  // Space
};

type SharedState = {
  keys: Set<string>;
  killToggle: boolean;
  installed: boolean;
};

const g = globalThis as any;

const shared: SharedState =
  g.__altnairInputShared ??
  (g.__altnairInputShared = {
    keys: new Set<string>(),
    killToggle: false,
    installed: false,
  });

export class Input {
  constructor() {
    if (shared.installed) return;
    shared.installed = true;

    // Drone control keys only.
    // IMPORTANT: do NOT include KeyN / BracketLeft / BracketRight here,
    // so Renderer can receive them for day/night.
    const isControlKey = (code: string) =>
      code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" ||
      code === "KeyB" || code === "ShiftLeft" || code === "ShiftRight" ||
      code === "KeyK" || code === "Space" ||
      code === "ArrowLeft" || code === "ArrowRight";

    const onKeyDown = (e: KeyboardEvent) => {
      if (isControlKey(e.code)) {
        e.preventDefault(); // prevent page scroll / focus issues
      }

      // Kill toggle only on initial press
      if (e.code === "KeyK" && !e.repeat) shared.killToggle = true;

      shared.keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isControlKey(e.code)) {
        e.preventDefault();
      }
      shared.keys.delete(e.code);
    };

    // Capture + non-passive helps avoid “stuck key” issues in browser games.
    window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
    window.addEventListener("keyup", onKeyUp, { passive: false, capture: true });

    window.addEventListener("blur", () => shared.keys.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) shared.keys.clear();
    });
  }

  consumeKillToggle(): boolean {
    const v = shared.killToggle;
    shared.killToggle = false;
    return v;
  }

  get(): Controls {
    const is = (c: string) => shared.keys.has(c);

    return {
      pitch: (is("KeyW") ? -1 : 0) + (is("KeyS") ? 1 : 0),
      roll:  (is("KeyD") ? 1 : 0) + (is("KeyA") ? -1 : 0),
      yaw:   (is("ArrowRight") ? 1 : 0) + (is("ArrowLeft") ? -1 : 0),
      boost: is("KeyB") || is("ShiftLeft") || is("ShiftRight"),
      brake: is("Space"),
    };
  }
}