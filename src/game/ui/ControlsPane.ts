import "./hud.css";

export class ControlsPane {
  constructor() {
    const root = document.createElement("div");
    root.className = "controls-min";

    // Title only (always present, minimal)
    const title = document.createElement("div");
    title.className = "controls-min-title";
    title.textContent = "CONTROLS";

    // Inline legend (reveals on hover)
    const legend = document.createElement("div");
    legend.className = "controls-min-legend";

    const item = (k: string, d: string) => {
      const span = document.createElement("span");
      span.className = "controls-min-item";

      const key = document.createElement("span");
      key.className = "controls-min-key";
      key.textContent = k;

      const desc = document.createElement("span");
      desc.className = "controls-min-desc";
      desc.textContent = d;

      span.appendChild(key);
      span.appendChild(desc);
      return span;
    };

    const sep = () => {
      const s = document.createElement("span");
      s.className = "controls-min-sep";
      s.textContent = "•";
      return s;
    };

    // Your mapping (bottom inline)
    legend.appendChild(item("W/S", "Pitch"));
    legend.appendChild(sep());
    legend.appendChild(item("A/D", "Roll"));
    legend.appendChild(sep());
    legend.appendChild(item("←/→", "Yaw"));
    legend.appendChild(sep());
    legend.appendChild(item("↑/↓", "Thrust"));
    legend.appendChild(sep());
    legend.appendChild(item("B", "Boost"));
    legend.appendChild(sep());
    legend.appendChild(item("Space", "Brake"));
    legend.appendChild(sep());
    legend.appendChild(item("K", "Kill"));

    root.appendChild(title);
    root.appendChild(legend);

    document.body.appendChild(root);
  }
}