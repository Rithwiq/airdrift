import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

import type { CityContext, CityKnobs } from "./types";

import { buildRoadSystem } from "./elements/RoadSystem";
import { buildBuildings } from "./elements/Buildings";
import { buildStreetLights } from "./elements/StreetLights";
import { buildCars } from "./elements/Cars";
import { buildVegetation } from "./elements/Vegetation";
import { buildProps } from "./elements/Props";

export class CityChunk {
  group: THREE.Group;
  private bodies: RAPIER.RigidBody[] = [];

  constructor(cx: number, cz: number, world: RAPIER.World, size = 40) {
    this.group = new THREE.Group();

    // Put the whole chunk at its origin (x/z),
    // AND lift it slightly so it doesn't get hidden by terrain height variation.
    this.group.position.set(cx * size, 0.06, cz * size);

    const ctx: CityContext = {
      cx,
      cz,
      ox: cx * size, // WORLD origin for physics placement
      oz: cz * size,
      size,
      world,
      group: this.group,
    };

    // Density knobs (size=40)
    const k: CityKnobs = {
      CITY_Y: 0.02,
      ROAD_W: 11.0,
      SIDEWALK_W: 2.2,

      LOT: 6.2,
      MARGIN: 0.9,
      BUILD_PROB: 0.92,

      streetLightStep: 7,
      maxBuildings: 180,
      maxCars: 34,
    };

    // -------- Debug marker (ALWAYS ON for now) --------
    // If you don't see this magenta cube, the CityChunk isn't being added to the scene.
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshStandardMaterial({ color: "#ff00ff", emissive: "#220022", emissiveIntensity: 0.6 })
    );
    marker.position.set(0, k.CITY_Y + 1.2, 0);
    marker.castShadow = true;
    marker.receiveShadow = true;
    marker.frustumCulled = false;
    marker.renderOrder = 999;
    this.group.add(marker);

    // -------- Build systems (guarded) --------
    try {
      const b = buildRoadSystem(ctx, k);
      if (Array.isArray(b)) this.bodies.push(...b);
    } catch (e) {
      console.error("[CityChunk] buildRoadSystem failed", { cx, cz, e });
    }

    try {
      const b = buildBuildings(ctx, k);
      if (Array.isArray(b)) this.bodies.push(...b);
    } catch (e) {
      console.error("[CityChunk] buildBuildings failed", { cx, cz, e });
    }

    try {
      buildStreetLights(ctx, k);
    } catch (e) {
      console.error("[CityChunk] buildStreetLights failed", { cx, cz, e });
    }

    try {
      buildCars(ctx, k);
    } catch (e) {
      console.error("[CityChunk] buildCars failed", { cx, cz, e });
    }

    try {
      buildVegetation(ctx, k);
    } catch (e) {
      console.error("[CityChunk] buildVegetation failed", { cx, cz, e });
    }

    try {
      buildProps(ctx, k);
    } catch (e) {
      console.error("[CityChunk] buildProps failed", { cx, cz, e });
    }

    // -------- Visibility safety --------
    // Instanced meshes can vanish if bounds/culling go wrong.
    // Also push renderOrder a bit so roads don't z-fight with base.
    this.group.traverse((o) => {
      const anyO = o as any;
      if (!anyO) return;

      if (anyO.isMesh || anyO.isInstancedMesh) {
        anyO.frustumCulled = false;

        // Helps with "roads not visible" when coplanar / near-coplanar
        if (typeof anyO.renderOrder === "number") {
          anyO.renderOrder = Math.max(anyO.renderOrder ?? 0, 5);
        }
      }
    });

    // Useful to confirm creation in console
    console.log("[CityChunk] created", { cx, cz, at: this.group.position.toArray() });
  }

  dispose(world: RAPIER.World) {
    for (const b of this.bodies) world.removeRigidBody(b);
    this.bodies.length = 0;
  }
}