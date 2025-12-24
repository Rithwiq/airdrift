// src/game/gameplay/ScoreSystem.ts
import * as THREE from "three";

export type ScoreAddReason = "GATE" | "CENTER_BONUS" | "SPEED_BONUS" | "PENALTY" | "CRASH";

export type ScoreSnapshot = {
  score: number;
  displayScore: number;
  combo: number;        // 1.0 .. COMBO_MAX
  comboTier: number;    // 0..N (for UI)
  streak: number;       // consecutive gates
  gatesPassed: number;
  gatesTotal: number;
  lastAdd: number;      // last points added (for UI pop if you want)
  penaltyFlash: number; // 0..1 (optional UI red flash)
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

export class ScoreSystem {
  private score = 0;
  private displayScore = 0;

  private combo = 1.0;
  private streak = 0;

  private gatesPassed = 0;
  private gatesTotal = 0;

  private lastAdd = 0;

  // for UI effects
  private penaltyFlash = 0;

  // tuneables
  private readonly COMBO_MAX = 3.0;
  private readonly COMBO_GROW_PER_GATE = 0.12;  // how quickly combo climbs
  private readonly COMBO_DECAY_PER_SEC = 0.18;  // if you stop scoring, combo decays
  private readonly SCORE_SMOOTH = 10.0;         // higher = snappier

  // penalty feel
  private readonly CRASH_BASE = 120;            // minimum crash penalty
  private readonly CRASH_PER_SPEED = 22;        // extra penalty per m/s
  private readonly COMBO_LOCK_SEC = 0.55;       // after crash, combo can’t grow briefly

  // timers
  private timeSinceScore = 999;
  private comboLock = 0; // seconds remaining where combo can't increase

  setGateTotal(total: number) {
    this.gatesTotal = Math.max(0, total | 0);
  }

  /** Call once per frame */
  update(dt: number) {
    this.timeSinceScore += dt;
    this.comboLock = Math.max(0, this.comboLock - dt);
    this.penaltyFlash = Math.max(0, this.penaltyFlash - dt * 2.2);

    // combo decays if you haven't scored recently
    if (this.timeSinceScore > 1.25) {
      const decay = this.COMBO_DECAY_PER_SEC * dt;
      this.combo = Math.max(1.0, this.combo - decay);
      if (this.combo === 1.0) this.streak = 0;
    }

    // smooth display score (HUD tick-up feel)
    const alpha = 1 - Math.exp(-this.SCORE_SMOOTH * dt);
    this.displayScore = lerp(this.displayScore, this.score, alpha);
  }

  /** Adds points (combo multiplier applied when applyCombo=true) */
  add(points: number, reason: ScoreAddReason, applyCombo = true) {
    if (!Number.isFinite(points)) return;

    const raw = Math.trunc(points);
    const applied = applyCombo ? Math.trunc(raw * this.combo) : raw;

    this.score = Math.max(0, this.score + applied);
    this.lastAdd = applied;

    if (applied !== 0) this.timeSinceScore = 0;

    // optional debug:
    // console.log(`[Score] ${applied>=0?"+":""}${applied} (${reason}) combo=${this.combo.toFixed(2)}`);
  }

  /** Called when a gate is successfully cleared */
  onGateCleared(base: number, centerBonus: number, speedBonus: number) {
    this.gatesPassed++;

    // base gate score (combo applies)
    this.add(base, "GATE", true);
    if (centerBonus > 0) this.add(centerBonus, "CENTER_BONUS", true);
    if (speedBonus > 0) this.add(speedBonus, "SPEED_BONUS", true);

    // combo growth + streak (unless locked from crash)
    this.streak++;

    if (this.comboLock <= 0) {
      this.combo = clamp(this.combo + this.COMBO_GROW_PER_GATE, 1.0, this.COMBO_MAX);
    }
  }

  /** Soft penalty (e.g., clip a pole). Breaks combo but doesn't have to be huge. */
  onPenalty(points: number) {
    this.add(-Math.abs(points), "PENALTY", false);
    this.breakCombo(true);
  }

  /** Hard crash handler (speed-scaled). Game.ts calls this. */
  onCrash(speed: number) {
    const s = Number.isFinite(speed) ? speed : 0;
    const penalty = Math.max(this.CRASH_BASE, Math.floor(this.CRASH_BASE + s * this.CRASH_PER_SPEED));

    this.add(-penalty, "CRASH", false);
    this.breakCombo(true);
    this.comboLock = this.COMBO_LOCK_SEC;
    this.penaltyFlash = 1.0;
  }

  /** If you want to force reset combo without touching score */
  breakCombo(flash = false) {
    this.combo = 1.0;
    this.streak = 0;
    this.timeSinceScore = 999;
    if (flash) this.penaltyFlash = 1.0;
  }

  getSnapshot(): ScoreSnapshot {
    // combo tier for UI: 0 at x1.0, 1 ~ x1.4, 2 ~ x1.8, ...
    const tier = Math.floor((this.combo - 1.0) / 0.4);

    return {
      score: this.score,
      displayScore: this.displayScore,
      combo: this.combo,
      comboTier: Math.max(0, tier),
      streak: this.streak,
      gatesPassed: this.gatesPassed,
      gatesTotal: this.gatesTotal,
      lastAdd: this.lastAdd,
      penaltyFlash: this.penaltyFlash,
    };
  }
}