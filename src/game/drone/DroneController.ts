import * as THREE from "three";
import { Drone } from "./Drone";
import { Input } from "../input/Input";

function moveToward(v: number, t: number, d: number) {
  const diff = t - v;
  if (Math.abs(diff) <= d) return t;
  return v + Math.sign(diff) * d;
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function wrapPI(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class DroneController {
  private input = new Input();
  private drone?: Drone;

  private avionicsOn = true;

  // =========================
  // ALTITUDE LOCK (no bobbing)
  // =========================
  private hoverAltitude = 3.0; // fixed height
  private minY = 0.35;         // must be above ground (half-height + margin)

  // =========================
  // ATTITUDE (visual + feel)
  // =========================
  private maxPitch = THREE.MathUtils.degToRad(12);
  private maxRoll = THREE.MathUtils.degToRad(14);

  private kp = 5.6;
  private kd = 5.0;

  private yawKp = 4.0;
  private yawKd = 3.4;

  // =========================
  // GAME-LIKE LATERAL CONTROL
  // =========================
  private maxForwardSpeed = 18;
  private maxStrafeSpeed = 16;

  private velResponse = 0.18; // a bit snappier
  private maxHorizAccel = 26;

  // Boost
  private boost = 0;
  private boostMult = 1.4;

  // Brake
  private brakeLin = 0.08;
  private brakeAng = 0.55;

  // Caps
  private maxSpeed = 32;
  private maxAngVel = 3.0;

  // Smoothed inputs
  private pitchCmd = 0;
  private rollCmd = 0;
  private yawCmd = 0;

  private riseRate = 9.0;
  private fallRate = 13.0;

  // Helpers (no per-frame allocations)
  private q = new THREE.Quaternion();
  private euler = new THREE.Euler(0, 0, 0, "YXZ");

  private yawOnlyQuat = new THREE.Quaternion();
  private fwd = new THREE.Vector3();
  private right = new THREE.Vector3();
  private desiredVel = new THREE.Vector3();

  private targetVx = 0;
  private targetVz = 0;

  setDrone(drone: Drone) {
    this.drone = drone;

    const p = drone.body.translation();
    // lock to spawn height (nice default), but never too close to ground
    this.hoverAltitude = Math.max(this.minY, p.y);
  }

  setHoverAltitude(meters: number) {
    this.hoverAltitude = Math.max(this.minY, meters);
  }

  update(dt: number) {
    if (!this.drone) return;
    dt = Math.min(dt, 1 / 30);

    const body = this.drone.body;
    const m = Math.max(body.mass(), 0.0001);

    // Kill toggle
    if (this.input.consumeKillToggle()) {
      this.avionicsOn = !this.avionicsOn;
      if (!this.avionicsOn) {
        this.pitchCmd = this.rollCmd = this.yawCmd = 0;
        this.boost = 0;
        this.targetVx = this.targetVz = 0;

        // stop motion immediately when killed
        const v = body.linvel();
        body.setLinvel({ x: v.x * 0.2, y: 0, z: v.z * 0.2 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    if (!this.avionicsOn) return;

    const c = this.input.get();
    const p = body.translation();
    const v = body.linvel();
    const ang = body.angvel();

    // =========================
    // HARD ALTITUDE LOCK (NO OSCILLATION)
    // =========================
    const targetY = Math.max(this.hoverAltitude, this.minY);

    // Force Y position and kill vertical velocity (keeps hover perfect)
    // This prevents bobbing and prevents falling through due to vertical solver weirdness.
    body.setTranslation({ x: p.x, y: targetY, z: p.z }, true);
    body.setLinvel({ x: v.x, y: 0, z: v.z }, true);

    // =========================
    // Smooth pitch/roll/yaw inputs
    // =========================
    const rise = this.riseRate * dt;
    const fall = this.fallRate * dt;

    this.pitchCmd = moveToward(this.pitchCmd, c.pitch, c.pitch ? rise : fall);
    this.rollCmd = moveToward(this.rollCmd, c.roll, c.roll ? rise : fall);
    this.yawCmd = moveToward(this.yawCmd, c.yaw, c.yaw ? rise : fall);

    // Boost smoothing
    this.boost = moveToward(this.boost, c.boost ? 1 : 0, (c.boost ? 6.0 : 9.0) * dt);

    // Orientation → yaw-only basis for movement
    const rq = body.rotation();
    this.q.set(rq.x, rq.y, rq.z, rq.w);
    this.euler.setFromQuaternion(this.q);

    this.yawOnlyQuat.setFromEuler(new THREE.Euler(0, this.euler.y, 0));
    this.fwd.set(0, 0, -1).applyQuaternion(this.yawOnlyQuat).normalize();
    this.right.set(1, 0, 0).applyQuaternion(this.yawOnlyQuat).normalize();

    // =========================
    // SMOOTH LATERAL MOVEMENT (target velocity)
    // =========================
    const pitchNorm = clamp(this.pitchCmd, -1, 1);
    const rollNorm = clamp(this.rollCmd, -1, 1);

    const boostScale = 1 + this.boost * (this.boostMult - 1);

    const desiredForward = (-pitchNorm) * this.maxForwardSpeed * boostScale;
    const desiredStrafe = (rollNorm) * this.maxStrafeSpeed * boostScale;

    this.desiredVel.set(0, 0, 0)
      .addScaledVector(this.fwd, desiredForward)
      .addScaledVector(this.right, desiredStrafe);

    // Smooth the target velocity
    const velLerp = 1 - Math.exp(-dt / 0.10);
    this.targetVx = THREE.MathUtils.lerp(this.targetVx, this.desiredVel.x, velLerp);
    this.targetVz = THREE.MathUtils.lerp(this.targetVz, this.desiredVel.z, velLerp);

    // Approach target vel with bounded accel
    const tau = Math.max(this.velResponse, 0.06);
    let ax = (this.targetVx - v.x) / tau;
    let az = (this.targetVz - v.z) / tau;

    ax = clamp(ax, -this.maxHorizAccel, this.maxHorizAccel);
    az = clamp(az, -this.maxHorizAccel, this.maxHorizAccel);

    body.addForce({ x: m * ax, y: 0, z: m * az }, true);

    // =========================
    // ATTITUDE CONTROL (PD) for visuals
    // =========================
    const targetPitch = pitchNorm * this.maxPitch;
    const targetRoll = rollNorm * this.maxRoll;

    const pitchErr = wrapPI(targetPitch - this.euler.x);
    const rollErr = wrapPI(targetRoll - this.euler.z);

    const maxT = 5.0 * m;

    let tx = (pitchErr * this.kp - ang.x * this.kd) * m;
    let tz = (-rollErr * this.kp - ang.z * this.kd) * m;

    const yawCmd = clamp(this.yawCmd, -1, 1);
    let ty = (yawCmd * this.yawKp - ang.y * this.yawKd) * m;

    tx = clamp(tx, -maxT, maxT);
    ty = clamp(ty, -maxT, maxT);
    tz = clamp(tz, -maxT, maxT);

    body.addTorque({ x: tx, y: ty, z: tz }, true);

    // =========================
    // BRAKE
    // =========================
    if (c.brake) {
      const v2 = body.linvel();
      const a2 = body.angvel();

      body.setLinvel({ x: v2.x * this.brakeLin, y: 0, z: v2.z * this.brakeLin }, true);
      body.setAngvel({ x: a2.x * this.brakeAng, y: a2.y * this.brakeAng, z: a2.z * this.brakeAng }, true);

      this.targetVx = moveToward(this.targetVx, 0, 50 * dt);
      this.targetVz = moveToward(this.targetVz, 0, 50 * dt);
    }

    // =========================
    // CAPS
    // =========================
    const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > this.maxSpeed) {
      const s = this.maxSpeed / sp;
      body.setLinvel({ x: v.x * s, y: 0, z: v.z * s }, true);
    }

    const wMag = Math.hypot(ang.x, ang.y, ang.z);
    if (wMag > this.maxAngVel) {
      const s = this.maxAngVel / wMag;
      body.setAngvel({ x: ang.x * s, y: ang.y * s, z: ang.z * s }, true);
    }
  }

  // HUD hooks
  getBoostFactor() { return this.boost; }
  isBoosting() { return this.boost > 0.1; }
  getMaxSpeed() { return this.maxSpeed; }
  isAvionicsOn() { return this.avionicsOn; }
}