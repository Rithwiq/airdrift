// src/game/gameplay/GateCourse.ts
import * as THREE from "three";
import { ScoreSystem } from "./ScoreSystem";

type Gate = {
  group: THREE.Group;
  passed: boolean;

  // NEW: track whether this gate was “active” and got missed
  wasAhead: boolean;

  // NEW: for anti-straight-line spam
  lane: number; // -1, 0, +1
};

const clamp = THREE.MathUtils.clamp;

export class GateCourse {
  private gates: Gate[] = [];
  private root = new THREE.Group();

  // ---- Gate geometry ----
  private readonly gateW = 10.5;
  private readonly gateH = 6.0;
  private readonly triggerDepth = 3.2;

  // ---- Spawn behavior ----
  private readonly gateCount = 22;
  private readonly spawnMin = 70;
  private readonly spawnMax = 220;

  // Instead of “pure random lateral”, we use LANE spawning.
  // This avoids gates lining up forever down one path.
  private readonly lateralLane = 11; // meters per lane step (≈ one road width vibe)
  private readonly laneMax = 1;      // lanes: -1, 0, +1

  private readonly verticalCenter = 2.6;
  private readonly verticalJitter = 1.0;

  // recycle if behind or too far
  private readonly behindRecycle = 18;
  private readonly farRecycle = 320;

  // ---- Scoring ----
  private readonly basePoints = 100;
  private readonly centerBonusMax = 80;
  private readonly speedBonusMax = 50;
  private readonly speedForMax = 18;

  // NEW: miss penalty
  private readonly missPenalty = 140;          // flat penalty on missing a gate
  private readonly missComboBreak = true;      // break combo on miss
  private readonly missFlashSeconds = 0.35;    // gate flashes on miss before respawn

  // NEW: anti-repeat lane logic
  private lastLane = 0;
  private sameLaneStreak = 0;

  // temp vectors
  private tmpForward = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpLocal = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private tmpLook = new THREE.Vector3();

  // If user calls update(dt,pos,speed) only, we keep a forward
  private fallbackForward = new THREE.Vector3(0, 0, -1);

  constructor(private scene: THREE.Scene, private score: ScoreSystem) {
    this.scene.add(this.root);
    this.buildGates();
    this.score.setGateTotal(0); // endless
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      const anyO = o as any;
      anyO.geometry?.dispose?.();
      if (anyO.material) {
        if (Array.isArray(anyO.material)) anyO.material.forEach((m: any) => m.dispose?.());
        else anyO.material.dispose?.();
      }
    });
  }

  /**
   * Call each frame.
   * Recommended call:
   *   update(dt, dronePos, speed, droneQuat, {x: vel.x, z: vel.z})
   *
   * Backwards compatible:
   *   update(dt, dronePos, speed)
   */
  update(
    dt: number,
    pos: THREE.Vector3,
    speed: number,
    quat?: THREE.Quaternion,
    velXZ?: { x: number; z: number }
  ) {
    const fwd = this.getForward(quat, velXZ);
    this.fallbackForward.copy(fwd);

    // 1) MISS + RECYCLE LOGIC
    for (const g of this.gates) {
      const gatePos = g.group.position;
      const toGate = gatePos.clone().sub(pos);

      const ahead = toGate.dot(fwd);
      const dist = toGate.length();

      // Track if it ever became “ahead” (so we only penalize real misses)
      if (ahead > 0) g.wasAhead = true;

      const shouldRecycle = ahead < -this.behindRecycle || dist > this.farRecycle;

      if (shouldRecycle) {
        // Miss condition: it was ahead at some point, and never passed
        if (!g.passed && g.wasAhead) {
          this.onGateMissed(g);
        }

        this.respawnGate(g, pos, fwd);
      }
    }

    // 2) PASS CHECKS
    for (const g of this.gates) {
      if (g.passed) continue;

      // drone position into gate local
      this.tmpLocal.copy(pos);
      g.group.worldToLocal(this.tmpLocal);

      const lx = this.tmpLocal.x;
      const ly = this.tmpLocal.y;
      const lz = this.tmpLocal.z;

      if (Math.abs(lz) > this.triggerDepth * 0.5) continue;
      if (Math.abs(lx) > this.gateW * 0.5) continue;
      if (Math.abs(ly) > this.gateH * 0.5) continue;

      // PASSED
      g.passed = true;
      g.wasAhead = false;
      this.flashGate(g.group);

      // centering bonus
      const nx = Math.abs(lx) / (this.gateW * 0.5);
      const ny = Math.abs(ly) / (this.gateH * 0.5);
      const centerDist = Math.sqrt(nx * nx + ny * ny);
      const centerScore = Math.floor(this.centerBonusMax * clamp(1 - centerDist, 0, 1));

      // speed bonus
      const t = clamp(speed / this.speedForMax, 0, 1);
      const speedScore = Math.floor(this.speedBonusMax * t);

      this.score.onGateCleared(this.basePoints, centerScore, speedScore);
    }
  }

  /** Visual-only: call from Game loop if you want */
  animate(dt: number) {
    // animate glow flash
    for (const g of this.gates) {
      const f = g.group.userData.flash ?? 0;
      if (f <= 0) continue;

      const nf = Math.max(0, f - dt * 2.8);
      g.group.userData.flash = nf;

      const op = 0.85 + nf * 0.35;
      this.setGateGlow(g.group, op);
    }
  }

  // -----------------------
  // Internals
  // -----------------------
  private getForward(quat?: THREE.Quaternion, velXZ?: { x: number; z: number }) {
    // Prefer velocity direction if meaningful
    if (velXZ && (velXZ.x * velXZ.x + velXZ.z * velXZ.z) > 0.6) {
      this.tmpForward.set(velXZ.x, 0, velXZ.z).normalize();
      return this.tmpForward;
    }

    // Otherwise use yaw from quaternion if provided
    if (quat) {
      this.tmpEuler.setFromQuaternion(quat);
      this.tmpQuat.setFromEuler(new THREE.Euler(0, this.tmpEuler.y, 0));
      this.tmpForward.set(0, 0, -1).applyQuaternion(this.tmpQuat).normalize();
      return this.tmpForward;
    }

    // Last resort fallback
    return this.fallbackForward;
  }

  private buildGates() {
    const frameMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1c2431"),
      roughness: 0.85,
      metalness: 0.05,
      emissive: new THREE.Color("#06090f"),
      emissiveIntensity: 0.15,
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ff751f"),
      roughness: 0.4,
      metalness: 0.0,
      emissive: new THREE.Color("#ff751f"),
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.85,
    });

    const t = 0.25;
    const depth = 0.45;

    const sideGeo = new THREE.BoxGeometry(t, this.gateH, depth);
    const barGeo = new THREE.BoxGeometry(this.gateW + t, t, depth);

    const glowT = 0.12;
    const glowSideGeo = new THREE.BoxGeometry(glowT, this.gateH - 0.45, depth + 0.02);
    const glowBarGeo = new THREE.BoxGeometry(this.gateW + glowT, glowT, depth + 0.02);

    for (let i = 0; i < this.gateCount; i++) {
      const group = new THREE.Group();

      const left = new THREE.Mesh(sideGeo, frameMat);
      left.position.set(-this.gateW * 0.5, 0, 0);

      const right = new THREE.Mesh(sideGeo, frameMat);
      right.position.set(+this.gateW * 0.5, 0, 0);

      const top = new THREE.Mesh(barGeo, frameMat);
      top.position.set(0, +this.gateH * 0.5, 0);

      const bottom = new THREE.Mesh(barGeo, frameMat);
      bottom.position.set(0, -this.gateH * 0.5, 0);

      const glowL = new THREE.Mesh(glowSideGeo, glowMat);
      glowL.position.set(-this.gateW * 0.5, 0, 0);

      const glowR = new THREE.Mesh(glowSideGeo, glowMat);
      glowR.position.set(+this.gateW * 0.5, 0, 0);

      const glowTTop = new THREE.Mesh(glowBarGeo, glowMat);
      glowTTop.position.set(0, +this.gateH * 0.5, 0);

      const glowB = new THREE.Mesh(glowBarGeo, glowMat);
      glowB.position.set(0, -this.gateH * 0.5, 0);

      for (const m of [left, right, top, bottom, glowL, glowR, glowTTop, glowB]) {
        m.castShadow = true;
        (m as any).frustumCulled = false;
        group.add(m);
      }

      group.userData.flash = 0;

      this.root.add(group);

      const gate: Gate = {
        group,
        passed: false,
        wasAhead: false,
        lane: 0,
      };

      // initial spawn in front of origin, staggered
      group.position.set(0, this.verticalCenter, -80 - i * 18);

      this.gates.push(gate);
    }
  }

  private onGateMissed(g: Gate) {
    // quick visual feedback before respawn (optional)
    this.flashGate(g.group);

    // penalty + combo break (your ScoreSystem now supports this cleanly)
    this.score.onPenalty(this.missPenalty);
    if (this.missComboBreak) this.score.breakCombo?.(true);

    // prevent double-penalty if it keeps recycling this frame
    g.wasAhead = false;
    g.passed = true;

    // tiny delay feel (handled implicitly by flash fading)
    g.group.userData.flash = Math.max(g.group.userData.flash ?? 0, this.missFlashSeconds);
  }

  private chooseLane(): number {
    // lanes are -1, 0, +1
    const lanes = [-1, 0, +1];

    // Bias toward changing lanes if we’ve stayed in same lane too long
    const forceChange = this.sameLaneStreak >= 2;

    let lane = lanes[Math.floor(Math.random() * lanes.length)];

    if (forceChange) {
      // pick anything except lastLane
      const choices = lanes.filter((x) => x !== this.lastLane);
      lane = choices[Math.floor(Math.random() * choices.length)];
    } else {
      // small bias to not repeat forever
      if (Math.random() < 0.35) {
        const choices = lanes.filter((x) => x !== this.lastLane);
        lane = choices[Math.floor(Math.random() * choices.length)];
      }
    }

    if (lane === this.lastLane) this.sameLaneStreak++;
    else this.sameLaneStreak = 0;

    this.lastLane = lane;
    return lane;
  }

  private respawnGate(g: Gate, pos: THREE.Vector3, fwd: THREE.Vector3) {
    // distance ahead
    const d = this.spawnMin + Math.random() * (this.spawnMax - this.spawnMin);

    // compute right vector on XZ plane
    this.tmpRight.set(fwd.z, 0, -fwd.x).normalize();

    // lane-based lateral offset (anti “down one road”)
    const lane = this.chooseLane();
    g.lane = lane;

    const lateral =
      lane * this.lateralLane +
      (Math.random() * 2 - 1) * (this.lateralLane * 0.18); // small jitter within lane

    const y = this.verticalCenter + (Math.random() * 2 - 1) * this.verticalJitter;

    const spawn = new THREE.Vector3()
      .copy(pos)
      .addScaledVector(fwd, d)
      .addScaledVector(this.tmpRight, lateral);

    g.group.position.set(spawn.x, y, spawn.z);

    // orient gate to face the player’s forward direction (gate normal aligns with fwd)
    // group.lookAt faces -Z toward target, which is what we want here.
    this.tmpLook.copy(spawn).addScaledVector(fwd, 10);
    g.group.up.set(0, 1, 0);
    g.group.lookAt(this.tmpLook);

    // reset flags
    g.passed = false;
    g.wasAhead = false;

    // restore glow
    this.setGateGlow(g.group, 0.85);
  }

  private flashGate(group: THREE.Group) {
    group.userData.flash = 1.0;
  }

  private setGateGlow(group: THREE.Group, opacity: number) {
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as any;
      if (!mat) return;

      // only adjust the glowing material (high emissive intensity)
      if (mat.emissive && mat.emissiveIntensity >= 0.9) {
        mat.opacity = opacity;
        mat.needsUpdate = true;
      }
    });
  }
}