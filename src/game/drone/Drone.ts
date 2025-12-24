import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

export class Drone {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;

  // NEW: collider handle for collision detection (penalties etc.)
  colliderHandle: number = -1;

  // Useful constants (also used by controller if needed)
  static readonly SIZE_X = 1.0;
  static readonly SIZE_Y = 0.28;
  static readonly SIZE_Z = 1.0;

  static readonly HALF_X = Drone.SIZE_X / 2; // 0.5
  static readonly HALF_Y = Drone.SIZE_Y / 2; // 0.14
  static readonly HALF_Z = Drone.SIZE_Z / 2; // 0.5

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    // ---------- Visual ----------
    const geom = new THREE.BoxGeometry(Drone.SIZE_X, Drone.SIZE_Y, Drone.SIZE_Z);
    const mat = new THREE.MeshStandardMaterial({
      color: "#ff7a1a",
      roughness: 0.7,
      metalness: 0.1,
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;

    // IMPORTANT: spawn well above ground to avoid initial penetration/solver jitter
    const start = { x: 0, y: 3.0, z: 0 };
    this.mesh.position.set(start.x, start.y, start.z);
    scene.add(this.mesh);

    // ---------- Physics ----------
    const rbDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .setLinearDamping(2.2)   // arcade: less drift
      .setAngularDamping(6.0); // arcade: less wobble

    this.body = world.createRigidBody(rbDesc);

    // ✅ CCD ON (compat-safe)
    try {
      // @ts-ignore
      if (typeof (this.body as any).enableCcd === "function") (this.body as any).enableCcd(true);
      // @ts-ignore
      if (typeof (this.body as any).setCcdEnabled === "function") (this.body as any).setCcdEnabled(true);
    } catch {}

    // ✅ Gravity OFF because altitude is controlled by DroneController (altitude lock)
    try {
      // @ts-ignore
      if (typeof (this.body as any).setGravityScale === "function") {
        (this.body as any).setGravityScale(0.0, true);
      }
    } catch {}

    // ✅ Lock rotations except yaw (only yaw)
    try {
      // @ts-ignore
      if (typeof (this.body as any).setEnabledRotations === "function") {
        (this.body as any).setEnabledRotations(false, true, false, true);
      }
    } catch {}

    // ---------- Collider ----------
    const colDesc = RAPIER.ColliderDesc.cuboid(Drone.HALF_X, Drone.HALF_Y, Drone.HALF_Z)
      .setFriction(1.2)
      .setRestitution(0.0)
      // ✅ IMPORTANT: allow collision events so Physics.EventQueue can see them
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    // (Optional) later you can filter collisions using groups:
    // .setCollisionGroups(0x0001_0001)

    const collider = world.createCollider(colDesc, this.body);
    this.colliderHandle = collider.handle;
  }

  syncFromPhysics() {
    const p = this.body.translation();
    const q = this.body.rotation();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
}