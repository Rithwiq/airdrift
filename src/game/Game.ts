// src/game/Game.ts
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

import { Renderer } from "./render/Renderer";
import { Physics } from "./physics/Physics";
import { Drone } from "./drone/Drone";
import { DroneController } from "./drone/DroneController";
import { ChunkManager } from "./world/ChunkManager";
import { HUD } from "./ui/HUD";

import { ScoreSystem } from "./gameplay/ScoreSystem";
import { GateCourse } from "./gameplay/GateCourse";

const fin = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

export class Game {
  private renderer: Renderer;
  private physics?: Physics;
  private drone?: Drone;
  private controller?: DroneController;
  private terrain?: ChunkManager;
  private hud: HUD;

  private score = new ScoreSystem();
  private gates?: GateCourse;

  // ✅ Create AFTER Rapier init
  private eventQueue?: RAPIER.EventQueue;

  // crash penalty cooldown
  private crashCooldown = 0;
  private readonly CRASH_COOLDOWN_SEC = 0.35;

  private lastTime = performance.now();

  private readonly FIXED_DT = 1 / 60;
  private accumulator = 0;

  // Camera
  private readonly camDistance = 12;
  private readonly camHeight = 4;
  private readonly camLerp = 0.12;

  // Speed → FOV
  private readonly BASE_FOV = 70;
  private readonly MAX_FOV = 85;
  private readonly SPEED_FOR_MAX_FOV = 18;
  private readonly FOV_LERP = 0.08;

  // Helpers
  private camPosWanted = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private tmpEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private tmpQuat = new THREE.Quaternion();
  private forward = new THREE.Vector3();

  constructor() {
    this.renderer = new Renderer();
    this.hud = new HUD();

    this.makeCanvasFocusable();
    this.installGameKeyGuards();
    this.init();
  }

  private async init() {
    this.physics = await Physics.create();

    // ✅ EventQueue must be created AFTER rapier init
    this.eventQueue = new RAPIER.EventQueue(true);

    // World
    this.addGround();

    // Streaming city + terrain
    this.terrain = new ChunkManager(this.renderer.scene, this.physics.world, 80, 2);

    // Drone
    this.drone = new Drone(this.renderer.scene, this.physics.world);

    // IMPORTANT: enable collision events on the DRONE collider too
    // (ground has it, but both sides should have ActiveEvents set)
    this.enableDroneCollisionEvents();

    this.controller = new DroneController();
    this.controller.setDrone(this.drone);

    // Gates + score
    this.gates = new GateCourse(this.renderer.scene, this.score);

    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  // =========================
  // Input hygiene
  // =========================
  private makeCanvasFocusable() {
    const canvas = this.renderer.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.addEventListener("pointerdown", () => canvas.focus());
    setTimeout(() => canvas.focus(), 0);
  }

  private installGameKeyGuards() {
    const gameKeys = new Set([
      "KeyW", "KeyA", "KeyS", "KeyD",
      "ArrowLeft", "ArrowRight",
      "Space", "KeyB", "KeyK", "ShiftLeft", "ShiftRight",
    ]);

    const guard = (e: KeyboardEvent) => {
      if (gameKeys.has(e.code)) e.preventDefault();
    };

    window.addEventListener("keydown", guard, { passive: false });
    window.addEventListener("keyup", guard, { passive: false });
  }

  // =========================
  // World: Ground (visual + physics)
  // =========================
  private addGround() {
    if (!this.physics) return;

    // visual
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: "#151c2a" })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.renderer.scene.add(ground);

    // physics
    const groundBody = this.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -2.0, 0)
    );

    this.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1000, 2.0, 1000)
        .setFriction(1.2)
        .setRestitution(0.0)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      groundBody
    );
  }

  /** Ensure the drone collider emits collision events */
  private enableDroneCollisionEvents() {
    if (!this.physics || !this.drone) return;

    // Drone creates ONE collider in your Drone.ts.
    // We grab it via world.getCollider(handle) by scanning colliders attached to the RB.
    const rb = this.drone.body;
    const world = this.physics.world;

    // Rapier JS compat: rigidBody.numColliders() + collider(i)
    try {
      // @ts-ignore
      const n = rb.numColliders?.() ?? 0;
      for (let i = 0; i < n; i++) {
        // @ts-ignore
        const ch = rb.collider?.(i);
        if (ch == null) continue;
        const col = world.getCollider(ch);
        if (!col) continue;
        col.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      }
    } catch {
      // If this fails, your drone might still collide physically,
      // just without event callbacks. (But most builds support the above.)
    }
  }

  // =========================
  // Camera
  // =========================
  private updateCamera() {
    if (!this.drone) return;

    const pos = this.drone.mesh.position;
    const quat = this.drone.mesh.quaternion;

    // yaw-only follow
    this.tmpEuler.setFromQuaternion(quat);
    this.tmpQuat.setFromEuler(new THREE.Euler(0, this.tmpEuler.y, 0));
    this.forward.set(0, 0, -1).applyQuaternion(this.tmpQuat);

    this.camPosWanted
      .copy(pos)
      .addScaledVector(this.forward, -this.camDistance)
      .add(new THREE.Vector3(0, this.camHeight, 0));

    this.renderer.camera.position.lerp(this.camPosWanted, this.camLerp);
    this.lookTarget.copy(pos);
    this.renderer.camera.lookAt(this.lookTarget);
  }

  private updateCameraFOV(speed: number) {
    const t = THREE.MathUtils.clamp(speed / this.SPEED_FOR_MAX_FOV, 0, 1);
    const targetFOV = THREE.MathUtils.lerp(this.BASE_FOV, this.MAX_FOV, t);

    this.renderer.camera.fov = THREE.MathUtils.lerp(
      this.renderer.camera.fov,
      targetFOV,
      this.FOV_LERP
    );
    this.renderer.camera.updateProjectionMatrix();
  }

  // =========================
  // Collisions → penalties
  // =========================
  private drainCollisionPenalties(speed: number) {
    if (!this.physics || !this.drone || !this.eventQueue) return;

    if (this.crashCooldown > 0) return;

    const world = this.physics.world;
    const droneHandle = this.drone.body.handle;

    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      if (this.crashCooldown > 0) return;

      const c1 = world.getCollider(h1);
      const c2 = world.getCollider(h2);
      if (!c1 || !c2) return;

      const p1 = c1.parent();
      const p2 = c2.parent();
      if (p1 == null || p2 == null) return;

      const droneHit = (p1 === droneHandle) || (p2 === droneHandle);
      if (!droneHit) return;

      // penalty magnitude scales with speed
      const penalty = Math.max(60, Math.floor(speed * 35));

      // Your ScoreSystem has onPenalty(points)
      this.score.onPenalty(penalty);

      this.crashCooldown = this.CRASH_COOLDOWN_SEC;
    });
  }

  // =========================
  // Main loop
  // =========================
  private loop = () => {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    dt = Math.min(dt, 1 / 20);

    // atmosphere
    this.renderer.update(dt);

    if (!this.physics || !this.drone || !this.controller || !this.terrain) {
      this.renderer.render();
      requestAnimationFrame(this.loop);
      return;
    }

    this.crashCooldown = Math.max(0, this.crashCooldown - dt);

    // Fixed timestep stepping
    this.accumulator += dt;
    const maxSteps = 5;
    let steps = 0;

    while (this.accumulator >= this.FIXED_DT && steps < maxSteps) {
      this.controller.update(this.FIXED_DT);

      // ✅ single source of truth for stepping:
      // use eventQueue always (so collision events get produced)
      if (this.eventQueue) {
        this.physics.world.step(this.eventQueue);
      } else {
        this.physics.world.step();
      }

      this.accumulator -= this.FIXED_DT;
      steps++;
    }

    // sync visuals from physics
    this.drone.syncFromPhysics();

    // stream chunks
    const p = this.drone.mesh.position;
    this.terrain.update(p.x, p.z);

    // speed
    const v = this.drone.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);

    // collisions -> penalty
    this.drainCollisionPenalties(speed);

    // gates + scoring (IMPORTANT: pass QUAT + velXZ)
    if (this.gates) {
      this.gates.update(
        dt,
        this.drone.mesh.position,
        speed,
        this.drone.mesh.quaternion,
        { x: v.x, z: v.z }
      );
      this.gates.animate(dt);
    }

    this.score.update(dt);

    // camera
    this.updateCamera();
    this.updateCameraFOV(speed);

    // HUD
    const pos = this.drone.body.translation();
    const e = new THREE.Euler(0, 0, 0, "YXZ").setFromQuaternion(this.drone.mesh.quaternion);
    const rad2deg = 180 / Math.PI;

    const s = this.score.getSnapshot();

    this.hud.update({
      speed: fin(speed),
      altitude: fin(pos.y),
      pitch: fin(e.x * rad2deg),
      yaw: fin(e.y * rad2deg),
      roll: fin(e.z * rad2deg),
      boostFactor: fin(this.controller.getBoostFactor()),
      boosting: this.controller.isBoosting(),

      score: fin(s.displayScore),
      combo: fin(s.combo),
      gatesPassed: s.gatesPassed,
      gatesTotal: s.gatesTotal,
    });

    this.renderer.render();
    requestAnimationFrame(this.loop);
  };
}