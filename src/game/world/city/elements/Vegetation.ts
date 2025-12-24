import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { hash } from "../../Noise";
import type { CityContext, CityKnobs } from "../types";
import { CityPalette as P } from "../palette";

// Safe hash → always 0..1
const h = (a: number, b: number) => {
  const v = hash(a, b);
  if (!Number.isFinite(v)) return 0;
  const f = v - Math.floor(v);
  return f < 0 ? f + 1 : f;
};

export function buildVegetation(ctx: CityContext, k: CityKnobs): void {
  // Keep vegetation slightly above city base so it never z-fights
  const EPS = 0.03;

  // === Materials ===
  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#4a3b2a"),
    roughness: 1.0,
    metalness: 0.0,
  });

  // Enable vertexColors so we can tint crowns per instance
  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1f5c3a"),
    roughness: 1.0,
    metalness: 0.0,
    emissive: new THREE.Color("#07110b"),
    emissiveIntensity: 0.10,
    vertexColors: true,
  });

  // === Geometry ===
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.9, 6);
  const crownGeo = new THREE.ConeGeometry(0.52, 1.35, 7);

  // === Instancing ===
  const treeCount = Math.max(10, Math.floor((k.maxBuildings ?? 120) * 0.35));

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crowns = new THREE.InstancedMesh(crownGeo, leafMat, treeCount);

  trunks.castShadow = true;
  crowns.castShadow = true;
  trunks.receiveShadow = true;
  crowns.receiveShadow = true;

  // Instanced bounds can be wrong when streamed — keep them visible
  trunks.frustumCulled = false;
  crowns.frustumCulled = false;

  // Per-instance crown colors
  crowns.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(treeCount * 3), 3);

  ctx.group.add(trunks);
  ctx.group.add(crowns);

  const obj = new THREE.Object3D();
  let ti = 0;

  // Keep away from the cross-roads + sidewalks
  const CLEAR = k.ROAD_W * 0.5 + k.SIDEWALK_W + 1.3;
  const half = k.size * 0.5 - 1.8;

  // Try more attempts than count (rejections happen)
  const attempts = treeCount * 8;

  for (let i = 0; i < attempts; i++) {
    if (ti >= treeCount) break;

    const seed = (ctx.cx * 928371 + ctx.cz * 12377 + i * 97) | 0;

    const r1 = h(seed + 1, seed + 2);
    const r2 = h(seed + 3, seed + 4);
    const rS = h(seed + 5, seed + 6);
    const rC = h(seed + 9, seed + 10);

    const x = THREE.MathUtils.lerp(-half, half, r1);
    const z = THREE.MathUtils.lerp(-half, half, r2);

    // ✅ FIX: only reject if INSIDE the cross area (both near center),
    // not if it's near either axis.
    if (Math.abs(x) < CLEAR && Math.abs(z) < CLEAR) continue;

    // Slightly bias trees toward sidewalks (city feel) but not on the road:
    // Pull toward the curb band sometimes.
    const curbBand = k.ROAD_W * 0.5 + k.SIDEWALK_W * 0.65;
    if (rC > 0.55) {
      const sx = Math.sign(x) || 1;
      const sz = Math.sign(z) || 1;
      const pull = 0.25 + (rC - 0.55) * 0.9;
      const tx = sx * THREE.MathUtils.lerp(Math.abs(x), curbBand + 1.2, pull);
      const tz = sz * THREE.MathUtils.lerp(Math.abs(z), curbBand + 1.2, pull);
      // Keep within chunk
      if (Math.abs(tx) <= half) (x as any) = tx;
      if (Math.abs(tz) <= half) (z as any) = tz;
    }

    const scale = 0.80 + rS * 0.95;
    const yaw = h(seed + 7, seed + 8) * Math.PI * 2;

    // TRUNK
    obj.position.set(x, k.CITY_Y + EPS + 0.45 * scale, z);
    obj.rotation.set(0, yaw, 0);
    obj.scale.set(scale, scale, scale);
    obj.updateMatrix();
    trunks.setMatrixAt(ti, obj.matrix);

    // CROWN
    obj.position.set(x, k.CITY_Y + EPS + 1.25 * scale, z);
    obj.rotation.set(0, yaw, 0);
    obj.scale.set(scale, scale, scale);
    obj.updateMatrix();
    crowns.setMatrixAt(ti, obj.matrix);

    // Crown tint variation (subtle)
    const tint = new THREE.Color("#1f5c3a").multiplyScalar(0.85 + rC * 0.35);
    crowns.setColorAt?.(ti, tint);

    ti++;
  }

  trunks.count = ti;
  crowns.count = ti;

  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  (crowns as any).instanceColor && ((crowns as any).instanceColor.needsUpdate = true);
}