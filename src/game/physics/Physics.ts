// src/game/physics/Physics.ts
import RAPIER from "@dimforge/rapier3d-compat";

export class Physics {
  world: RAPIER.World;

  // NEW:
  private eventQueue = new RAPIER.EventQueue(true);
  private collisionPairs: Array<[number, number]> = [];

  static async create() {
    // NOTE: rapier init warning in your console is fine; it still works.
    // If you have custom init, keep it.
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    const world = new RAPIER.World(gravity);
    const p = new Physics(world);
    return p;
  }

  private constructor(world: RAPIER.World) {
    this.world = world;
  }

  step(dt: number) {
    // Clear last step events
    this.collisionPairs.length = 0;

    // IMPORTANT: use eventQueue in step
    this.world.timestep = dt;
    this.world.step(this.eventQueue);

    // Collect "started" collisions
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (started) this.collisionPairs.push([h1, h2]);
    });
  }

  consumeCollisionPairs(): Array<[number, number]> {
    const out = this.collisionPairs.slice();
    this.collisionPairs.length = 0;
    return out;
  }
}