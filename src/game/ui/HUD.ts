// src/game/ui/HUD.ts
export type HUDData = {
  speed: number;
  altitude: number;
  pitch: number;
  yaw: number;
  roll: number;
  boostFactor: number;
  boosting: boolean;

  // NEW:
  score?: number;         // displayScore (smooth)
  combo?: number;         // 1.0..3.0
  gatesPassed?: number;
  gatesTotal?: number;
};

const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "0.0");
const fmtInt = (n: number) => (Number.isFinite(n) ? Math.floor(n).toLocaleString() : "0");

export class HUD {
  private root: HTMLDivElement;

  private scoreEl: HTMLDivElement;
  private comboEl: HTMLDivElement;
  private gatesEl: HTMLDivElement;

  private spdEl: HTMLDivElement;
  private altEl: HTMLDivElement;
  private pitEl: HTMLDivElement;
  private yawEl: HTMLDivElement;
  private rolEl: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.style.position = "fixed";
    this.root.style.right = "18px";
    this.root.style.top = "50%";
    this.root.style.transform = "translateY(-50%)";
    this.root.style.width = "260px";
    this.root.style.padding = "14px 14px 12px";
    this.root.style.borderRadius = "14px";
    this.root.style.background = "rgba(10, 14, 22, 0.35)";
    this.root.style.border = "1px solid rgba(255, 117, 31, 0.18)";
    this.root.style.backdropFilter = "blur(10px)";
    this.root.style.webkitBackdropFilter = "blur(10px)";
    this.root.style.boxShadow = "0 10px 40px rgba(0,0,0,0.35)";
    this.root.style.color = "rgba(255,255,255,0.88)";
    this.root.style.fontFamily = `"ui-monospace", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    this.root.style.userSelect = "none";
    this.root.style.pointerEvents = "none";

    // Title
    const title = document.createElement("div");
    title.textContent = "ALTNAIR AIRDRIFT";
    title.style.fontSize = "12px";
    title.style.letterSpacing = "0.12em";
    title.style.color = "rgba(255, 117, 31, 0.85)";
    title.style.marginBottom = "10px";
    this.root.appendChild(title);

    // SCORE block
    const scoreBlock = document.createElement("div");
    scoreBlock.style.display = "grid";
    scoreBlock.style.gridTemplateColumns = "1fr";
    scoreBlock.style.gap = "6px";
    scoreBlock.style.marginBottom = "12px";

    this.scoreEl = document.createElement("div");
    this.scoreEl.style.display = "flex";
    this.scoreEl.style.justifyContent = "space-between";
    this.scoreEl.style.alignItems = "baseline";

    const scoreLabel = document.createElement("div");
    scoreLabel.textContent = "SCR";
    scoreLabel.style.fontSize = "12px";
    scoreLabel.style.opacity = "0.75";

    const scoreValue = document.createElement("div");
    scoreValue.textContent = "0";
    scoreValue.style.fontSize = "26px"; // ✅ bigger than SPD
    scoreValue.style.fontWeight = "700";
    scoreValue.style.letterSpacing = "0.02em";
    scoreValue.dataset.key = "scoreValue";

    this.scoreEl.appendChild(scoreLabel);
    this.scoreEl.appendChild(scoreValue);

    this.comboEl = document.createElement("div");
    this.comboEl.style.display = "flex";
    this.comboEl.style.justifyContent = "space-between";
    this.comboEl.style.opacity = "0.88";
    this.comboEl.style.fontSize = "12px";

    const comboLabel = document.createElement("div");
    comboLabel.textContent = "COM";
    comboLabel.style.opacity = "0.75";

    const comboValue = document.createElement("div");
    comboValue.textContent = "x1.0";
    comboValue.dataset.key = "comboValue";
    comboValue.style.color = "rgba(255, 117, 31, 0.92)";

    this.comboEl.appendChild(comboLabel);
    this.comboEl.appendChild(comboValue);

    this.gatesEl = document.createElement("div");
    this.gatesEl.style.display = "flex";
    this.gatesEl.style.justifyContent = "space-between";
    this.gatesEl.style.opacity = "0.88";
    this.gatesEl.style.fontSize = "12px";

    const gatesLabel = document.createElement("div");
    gatesLabel.textContent = "GATES";
    gatesLabel.style.opacity = "0.75";

    const gatesValue = document.createElement("div");
    gatesValue.textContent = "0";
    gatesValue.dataset.key = "gatesValue";

    this.gatesEl.appendChild(gatesLabel);
    this.gatesEl.appendChild(gatesValue);

    scoreBlock.appendChild(this.scoreEl);
    scoreBlock.appendChild(this.comboEl);
    scoreBlock.appendChild(this.gatesEl);

    this.root.appendChild(scoreBlock);

    // Divider
    const divider = document.createElement("div");
    divider.style.height = "1px";
    divider.style.background = "rgba(255,255,255,0.08)";
    divider.style.margin = "10px 0 12px";
    this.root.appendChild(divider);

    // Flight stats (same vibe as before)
    const stats = document.createElement("div");
    stats.style.display = "grid";
    stats.style.gridTemplateColumns = "1fr";
    stats.style.gap = "9px";

    this.spdEl = this.row("SPD", "0.0 m/s");
    this.altEl = this.row("ALT", "0.0 m");
    this.pitEl = this.row("PIT", "0°");
    this.yawEl = this.row("YAW", "0°");
    this.rolEl = this.row("ROL", "0°");

    stats.appendChild(this.spdEl);
    stats.appendChild(this.altEl);
    stats.appendChild(this.pitEl);
    stats.appendChild(this.yawEl);
    stats.appendChild(this.rolEl);

    this.root.appendChild(stats);

    document.body.appendChild(this.root);
  }

  private row(label: string, value: string) {
    const r = document.createElement("div");
    r.style.display = "flex";
    r.style.justifyContent = "space-between";
    r.style.alignItems = "baseline";

    const l = document.createElement("div");
    l.textContent = label;
    l.style.fontSize = "12px";
    l.style.opacity = "0.75";

    const v = document.createElement("div");
    v.textContent = value;
    v.style.fontSize = "13px";
    v.style.fontWeight = "600";
    v.style.letterSpacing = "0.02em";
    v.dataset.key = `${label}_value`;

    r.appendChild(l);
    r.appendChild(v);
    return r;
  }

  update(d: HUDData) {
    // SCORE
    const scoreValue = this.root.querySelector('[data-key="scoreValue"]') as HTMLDivElement;
    scoreValue.textContent = fmtInt(d.score ?? 0);

    const comboValue = this.root.querySelector('[data-key="comboValue"]') as HTMLDivElement;
    const combo = d.combo ?? 1;
    comboValue.textContent = `x${combo.toFixed(1)}`;

    const gatesValue = this.root.querySelector('[data-key="gatesValue"]') as HTMLDivElement;
    if (Number.isFinite(d.gatesTotal ?? NaN) && (d.gatesTotal ?? 0) > 0) {
      gatesValue.textContent = `${d.gatesPassed ?? 0}/${d.gatesTotal}`;
    } else {
      gatesValue.textContent = `${d.gatesPassed ?? 0}`;
    }

    // FLIGHT STATS
    (this.spdEl.querySelector('[data-key="SPD_value"]') as HTMLDivElement).textContent = `${fmt(d.speed, 1)} m/s`;
    (this.altEl.querySelector('[data-key="ALT_value"]') as HTMLDivElement).textContent = `${fmt(d.altitude, 1)} m`;
    (this.pitEl.querySelector('[data-key="PIT_value"]') as HTMLDivElement).textContent = `${fmt(d.pitch, 0)}°`;
    (this.yawEl.querySelector('[data-key="YAW_value"]') as HTMLDivElement).textContent = `${fmt(d.yaw, 0)}°`;
    (this.rolEl.querySelector('[data-key="ROL_value"]') as HTMLDivElement).textContent = `${fmt(d.roll, 0)}°`;
  }
}