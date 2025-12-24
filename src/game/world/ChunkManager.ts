import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

import { TerrainChunk } from "./TerrainChunk";
import { CityChunk } from "./city/CityChunk";

export class ChunkManager {
  private terrainChunks = new Map<string, TerrainChunk>();
  private cityChunks = new Map<string, CityChunk>();

  // Limit how many chunks we create per frame (prevents stutter)
  private maxCreatesPerUpdate = 3;

  constructor(
    private scene: THREE.Scene,
    private world: RAPIER.World,
    private chunkSize = 80,   // ✅ make 80 the default for city readability
    private viewRadius = 2
  ) {}

  // =========================
  // CITY / TERRAIN DECIDER
  // =========================
  private isCityChunk(kx: number, kz: number): boolean {
    const downtownR = 4;
    if (kx * kx + kz * kz <= downtownR * downtownR) return true;

    const n = this.hash2(kx, kz); // 0..1
    const dist = Math.hypot(kx, kz);
    const falloff = THREE.MathUtils.clamp(1.0 - dist / 14.0, 0.0, 1.0);

    const threshold = 0.78;
    return n * falloff > threshold;
  }

  private hash2(x: number, z: number): number {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  }

  // =========================
  // HELPERS
  // =========================
  private removeTerrain(key: string) {
    const t = this.terrainChunks.get(key);
    if (!t) return;

    // visual
    this.scene.remove(t.mesh);

    // free GPU memory if supported
    if (typeof (t as any).dispose === "function") {
      (t as any).dispose();
    }

    this.terrainChunks.delete(key);
  }

  private removeCity(key: string) {
    const c = this.cityChunks.get(key);
    if (!c) return;

    // visual
    this.scene.remove(c.group);

    // physics cleanup
    if (typeof (c as any).dispose === "function") {
      (c as any).dispose(this.world);
    }

    this.cityChunks.delete(key);
  }

  // =========================
  // UPDATE STREAMING
  // =========================
  update(x: number, z: number) {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);

    let created = 0;

    // Ensure chunks around player
    outer: for (let dx = -this.viewRadius; dx <= this.viewRadius; dx++) {
      for (let dz = -this.viewRadius; dz <= this.viewRadius; dz++) {
        if (created >= this.maxCreatesPerUpdate) break outer;

        const kx = cx + dx;
        const kz = cz + dz;
        const key = `${kx},${kz}`;

        const wantCity = this.isCityChunk(kx, kz);

        if (wantCity) {
          // ensure terrain removed
          this.removeTerrain(key);

          if (!this.cityChunks.has(key)) {
            const c = new CityChunk(kx, kz, this.world, this.chunkSize);
            this.scene.add(c.group);
            this.cityChunks.set(key, c);
            created++;
          }
        } else {
          // ensure city removed
          this.removeCity(key);

          if (!this.terrainChunks.has(key)) {
            const t = new TerrainChunk(kx, kz, this.chunkSize, 24); // ✅ slightly higher res for bigger chunks
            this.scene.add(t.mesh);
            this.terrainChunks.set(key, t);
            created++;
          }
        }
      }
    }

    // Cleanup out-of-range chunks (use helpers so we don't duplicate logic)
    for (const key of Array.from(this.terrainChunks.keys())) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.abs(kx - cx) > this.viewRadius || Math.abs(kz - cz) > this.viewRadius) {
        this.removeTerrain(key);
      }
    }

    for (const key of Array.from(this.cityChunks.keys())) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.abs(kx - cx) > this.viewRadius || Math.abs(kz - cz) > this.viewRadius) {
        this.removeCity(key);
      }
    }
  }
}