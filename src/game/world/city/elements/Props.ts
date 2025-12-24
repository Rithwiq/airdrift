import * as THREE from "three";
import { hash } from "../../Noise";
import type { CityContext, CityKnobs } from "../types";

const h = (a: number, b: number) => {
  const v = hash(a, b);
  if (!Number.isFinite(v)) return 0;
  const f = v - Math.floor(v);
  return f < 0 ? f + 1 : f;
};

export function buildProps(ctx: CityContext, k: CityKnobs) {
  const group = new THREE.Group();
  ctx.group.add(group);

  // ---- Materials ----
  const propMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#2a2f3a"),
    roughness: 0.92,
    metalness: 0.05,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#1a1f2a"),
    roughness: 0.95,
    metalness: 0.02,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ff751f"),
    emissive: new THREE.Color("#ff751f"),
    emissiveIntensity: 0.35,
    roughness: 0.65,
    metalness: 0.05,
  });

  const redMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#c43a3a"),
    roughness: 0.7,
    metalness: 0.05,
  });

  const whiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#d6dde6"),
    roughness: 0.65,
    metalness: 0.02,
  });

  // ---- Placement helpers ----
  const CITY_Y = k.CITY_Y;
  const SIZE = k.size;

  // Curb outer line (outside sidewalk)
  const curbOuter = k.ROAD_W * 0.5 + k.SIDEWALK_W + 0.35;
  // Sidewalk mid line (for some props)
  const sidewalkMid = k.ROAD_W * 0.5 + k.SIDEWALK_W * 0.5;

  const avoidCenter = k.ROAD_W * 0.5 + 0.8; // keep props out of road lanes

  const onSidewalk = (x: number, z: number) =>
    (Math.abs(x) > avoidCenter && Math.abs(x) < curbOuter + 0.6) ||
    (Math.abs(z) > avoidCenter && Math.abs(z) < curbOuter + 0.6);

  // =========================================================
  // 1) BOLLARDS (instanced)
  // =========================================================
  const bollardGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.85, 8);
  const bollards = new THREE.InstancedMesh(bollardGeo, propMat, 64);
  bollards.castShadow = true;
  bollards.receiveShadow = true;
  bollards.frustumCulled = false;

  const dummy = new THREE.Object3D();
  let bi = 0;

  const step = 6.5;
  for (let t = -SIZE * 0.5 + 4; t <= SIZE * 0.5 - 4; t += step) {
    const seed = (ctx.cx * 999 + ctx.cz * 777 + Math.floor(t * 10)) | 0;

    // Skip some for natural gaps
    if (h(seed + 1, seed + 2) > 0.92) continue;

    // Along +Z / -Z outer curb
    dummy.position.set(t + (h(seed + 3, seed + 4) - 0.5) * 0.4, CITY_Y + 0.425, curbOuter);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bollards.setMatrixAt(bi++, dummy.matrix);

    if (bi >= 64) break;

    dummy.position.set(t + (h(seed + 5, seed + 6) - 0.5) * 0.4, CITY_Y + 0.425, -curbOuter);
    dummy.updateMatrix();
    bollards.setMatrixAt(bi++, dummy.matrix);

    if (bi >= 64) break;
  }

  bollards.count = bi;
  bollards.instanceMatrix.needsUpdate = true;
  group.add(bollards);

  // =========================================================
  // 2) HYDRANTS (instanced)
  // =========================================================
  const hydrantGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.6, 10);
  const hydrants = new THREE.InstancedMesh(hydrantGeo, redMat, 16);
  hydrants.castShadow = true;
  hydrants.frustumCulled = false;

  let hi = 0;
  for (let i = 0; i < 16; i++) {
    const seed = (ctx.cx * 1234 + ctx.cz * 5678 + i * 91) | 0;
    const side = h(seed + 1, seed + 2) > 0.5 ? 1 : -1;

    const x = (h(seed + 3, seed + 4) - 0.5) * (SIZE - 10);
    const z = side * (sidewalkMid + 0.9 + (h(seed + 5, seed + 6) - 0.5) * 0.3);

    if (!onSidewalk(x, z)) continue;

    dummy.position.set(x, CITY_Y + 0.3, z);
    dummy.rotation.set(0, h(seed + 7, seed + 8) * Math.PI * 2, 0);
    dummy.updateMatrix();
    hydrants.setMatrixAt(hi++, dummy.matrix);
    if (hi >= 16) break;
  }

  hydrants.count = hi;
  hydrants.instanceMatrix.needsUpdate = true;
  group.add(hydrants);

  // =========================================================
  // 3) BINS / UTILITY BOXES (regular meshes, few)
  // =========================================================
  const boxGeo = new THREE.BoxGeometry(0.6, 0.85, 0.6);
  const binGeo = new THREE.BoxGeometry(0.55, 0.75, 0.55);

  for (let i = 0; i < 10; i++) {
    const seed = (ctx.cx * 199 + i * 11) ^ (ctx.cz * 83 + i * 7);

    // Bias them to curb zones instead of fully random
    const alongX = h(seed + 1, seed + 2) > 0.5;
    const t = (h(seed + 3, seed + 4) - 0.5) * (SIZE - 10);

    const side = h(seed + 5, seed + 6) > 0.5 ? 1 : -1;
    const off = curbOuter - 0.35;

    const x = alongX ? t : side * off;
    const z = alongX ? side * off : t;

    if (!onSidewalk(x, z)) continue;

    const isAccent = h(seed + 7, seed + 8) > 0.86;
    const isBin = h(seed + 9, seed + 10) > 0.55;

    const mesh = new THREE.Mesh(isBin ? binGeo : boxGeo, isAccent ? accentMat : propMat);
    mesh.position.set(x, CITY_Y + (isBin ? 0.38 : 0.425), z);
    mesh.rotation.y = Math.round(h(seed + 11, seed + 12) * 4) * (Math.PI / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  // =========================================================
  // 4) TRAFFIC CONES (instanced)
  // =========================================================
  const coneGeo = new THREE.ConeGeometry(0.22, 0.55, 10);
  const cones = new THREE.InstancedMesh(coneGeo, accentMat, 14);
  cones.castShadow = true;
  cones.frustumCulled = false;

  let ci = 0;
  for (let i = 0; i < 14; i++) {
    const seed = (ctx.cx * 7777 + ctx.cz * 3333 + i * 37) | 0;

    // Put cones near intersections / crosswalk-ish zones
    const nearCenter = h(seed + 1, seed + 2) > 0.4;
    const t = (h(seed + 3, seed + 4) - 0.5) * (nearCenter ? 10 : (SIZE - 16));

    const side = h(seed + 5, seed + 6) > 0.5 ? 1 : -1;
    const x = t;
    const z = side * (k.ROAD_W * 0.5 + 0.8 + h(seed + 7, seed + 8) * 0.8);

    // This is near road edge (still fine visually)
    dummy.position.set(x, CITY_Y + 0.275, z);
    dummy.rotation.set(0, h(seed + 9, seed + 10) * Math.PI * 2, 0);
    dummy.updateMatrix();
    cones.setMatrixAt(ci++, dummy.matrix);

    if (ci >= 14) break;
  }

  cones.count = ci;
  cones.instanceMatrix.needsUpdate = true;
  group.add(cones);

  // =========================================================
  // 5) STREET SIGNS (instanced)
  // =========================================================
  const signPoleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.3, 8);
  const signPlateGeo = new THREE.BoxGeometry(0.7, 0.45, 0.05);

  const signPoles = new THREE.InstancedMesh(signPoleGeo, darkMat, 12);
  const signPlates = new THREE.InstancedMesh(signPlateGeo, whiteMat, 12);
  signPoles.castShadow = true;
  signPlates.castShadow = true;
  signPoles.frustumCulled = false;
  signPlates.frustumCulled = false;

  let si = 0;
  for (let i = 0; i < 12; i++) {
    const seed = (ctx.cx * 9001 + ctx.cz * 6007 + i * 101) | 0;

    const alongX = h(seed + 1, seed + 2) > 0.5;
    const t = (h(seed + 3, seed + 4) - 0.5) * (SIZE - 12);
    const side = h(seed + 5, seed + 6) > 0.5 ? 1 : -1;

    const x = alongX ? t : side * (curbOuter - 0.25);
    const z = alongX ? side * (curbOuter - 0.25) : t;

    if (!onSidewalk(x, z)) continue;

    const rotY = alongX ? 0 : Math.PI / 2;

    dummy.position.set(x, CITY_Y + 1.15, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    signPoles.setMatrixAt(si, dummy.matrix);

    dummy.position.set(x, CITY_Y + 2.0, z);
    dummy.updateMatrix();
    signPlates.setMatrixAt(si, dummy.matrix);

    si++;
    if (si >= 12) break;
  }

  signPoles.count = si;
  signPlates.count = si;
  signPoles.instanceMatrix.needsUpdate = true;
  signPlates.instanceMatrix.needsUpdate = true;

  group.add(signPoles);
  group.add(signPlates);

  // Safety: keep props visible
  group.traverse((o) => {
    const anyO = o as any;
    if (anyO && (anyO.isMesh || anyO.isInstancedMesh)) anyO.frustumCulled = false;
  });
}