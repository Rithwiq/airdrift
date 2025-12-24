import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { hash } from "../../Noise";
import type { CityContext, CityKnobs } from "../types";
import { CityPalette as P } from "../palette";

// Safe hash wrapper: always returns 0..1 and never NaN
const h = (a: number, b: number) => {
  const v = hash(a, b);
  if (!Number.isFinite(v)) return 0;
  const f = v - Math.floor(v);
  return f < 0 ? f + 1 : f;
};

export function buildCars(ctx: CityContext, k: CityKnobs): void {
  const maxCars = k.maxCars ?? 18;

  // --- Car body + roof + glass (3 instanced meshes; still cheap) ---
  const bodyGeo = new THREE.BoxGeometry(2.05, 0.65, 1.15);
  const roofGeo = new THREE.BoxGeometry(1.05, 0.38, 0.95);
  const glassGeo = new THREE.BoxGeometry(0.9, 0.28, 0.85);

  // enable vertexColors so setColorAt works
  const bodyMat = new THREE.MeshStandardMaterial({
    color: P.carPalette[0],
    roughness: 0.78,
    metalness: 0.12,
    vertexColors: true,
  });

  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#10141b"),
    roughness: 0.55,
    metalness: 0.08,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#0b1220"),
    roughness: 0.12,
    metalness: 0.0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,              // ✅ important for transparent instancing
    polygonOffset: true,            // ✅ avoid z-fighting with roof
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, maxCars);
  const roofs  = new THREE.InstancedMesh(roofGeo, roofMat, maxCars);
  const glass  = new THREE.InstancedMesh(glassGeo, glassMat, maxCars);

  bodies.castShadow = true;
  bodies.receiveShadow = true;
  roofs.castShadow = true;
  roofs.receiveShadow = false;
  glass.castShadow = false;
  glass.receiveShadow = false;

  // Instancing visibility safety
  bodies.frustumCulled = false;
  roofs.frustumCulled = false;
  glass.frustumCulled = false;

  // instance colors for body
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCars * 3), 3);

  ctx.group.add(bodies);
  ctx.group.add(roofs);
  ctx.group.add(glass);

  const obj = new THREE.Object3D();
  let ci = 0;

  const CITY_Y = k.CITY_Y;
  const ROAD_W = k.ROAD_W;

  // Park just off the road edge
  const carOffset = ROAD_W * 0.5 + 1.25;

  const place = (lx: number, lz: number, rotY: number, seed: number) => {
    if (ci >= maxCars) return;

    // Tiny jitter so it's not perfect
    const jx = (h(seed + 11, seed + 12) - 0.5) * 0.35;
    const jz = (h(seed + 13, seed + 14) - 0.5) * 0.35;

    // Keep cars slightly above the road so z-fighting never happens
    const yBody = CITY_Y + 0.36;

    // Forward vector from yaw (for tiny glass shift)
    const fx = Math.sin(rotY);
    const fz = Math.cos(rotY);

    // BODY
    obj.position.set(lx + jx, yBody, lz + jz);
    obj.rotation.set(0, rotY, 0);
    obj.scale.set(1, 1, 1);
    obj.updateMatrix();
    bodies.setMatrixAt(ci, obj.matrix);

    // ROOF
    obj.position.set(lx + jx, yBody + 0.40, lz + jz);
    obj.updateMatrix();
    roofs.setMatrixAt(ci, obj.matrix);

    // GLASS (slightly forward)
    obj.position.set(lx + jx + fx * 0.08, yBody + 0.41, lz + jz + fz * 0.08);
    obj.updateMatrix();
    glass.setMatrixAt(ci, obj.matrix);

    // Color variation (body)
    const pal = P.carPalette[Math.floor(h(seed + 101, seed + 103) * P.carPalette.length)];
    const tint = pal.clone().multiplyScalar(0.9 + h(seed + 107, seed + 109) * 0.28);
    bodies.setColorAt?.(ci, tint);

    ci++;
  };

  // Along the X-road edges
  for (let t = -k.size * 0.5 + 7; t <= k.size * 0.5 - 7; t += 8.5) {
    const seed = (ctx.cx * 333 + ctx.cz * 222 + Math.floor(t * 10)) | 0;
    if (h(seed + 1, seed + 2) > 0.55) place(t,  carOffset, 0,      seed + 10);
    if (h(seed + 3, seed + 4) > 0.55) place(t, -carOffset, Math.PI, seed + 20);
  }

  // Along the Z-road edges (adds density)
  for (let t = -k.size * 0.5 + 7; t <= k.size * 0.5 - 7; t += 8.5) {
    const seed = (ctx.cx * 777 + ctx.cz * 555 + Math.floor(t * 10)) | 0;
    if (h(seed + 5, seed + 6) > 0.62) place( carOffset, t,  Math.PI / 2,  seed + 30);
    if (h(seed + 7, seed + 8) > 0.62) place(-carOffset, t, -Math.PI / 2,  seed + 40);
  }

  bodies.count = ci;
  roofs.count = ci;
  glass.count = ci;

  bodies.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  glass.instanceMatrix.needsUpdate = true;

  (bodies as any).instanceColor && ((bodies as any).instanceColor.needsUpdate = true);
};