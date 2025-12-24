import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { hash } from "../../Noise";
import type { CityContext, CityKnobs } from "../types";
import { CityPalette as P } from "../palette";

const h = (a: number, b: number) => {
  const v = hash(a, b);
  if (!Number.isFinite(v)) return 0;
  return v - Math.floor(v);
};

export function buildStreetLights(ctx: CityContext, k: CityKnobs): void {
  const SIZE = ctx.size;
  const step = Math.max(7, k.streetLightStep ?? 9);

  // estimate capacity
  const placementsPerEdge = Math.floor((SIZE - 8) / step) + 1;
  const maxPlacements = Math.max(8, placementsPerEdge * 4);

  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: P.pole, roughness: 1.0, metalness: 0.0 });

  const lampGeo = new THREE.SphereGeometry(0.22, 10, 10);
  const lampMat = new THREE.MeshStandardMaterial({
    color: P.lamp,
    emissive: P.lampEmit,
    emissiveIntensity: 0.95,
    roughness: 0.7,
    metalness: 0.0,
  });

  const poles = new THREE.InstancedMesh(poleGeo, poleMat, maxPlacements);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, maxPlacements);

  poles.castShadow = true;
  lamps.castShadow = false;

  poles.frustumCulled = false;
  lamps.frustumCulled = false;

  ctx.group.add(poles);
  ctx.group.add(lamps);

  const obj = new THREE.Object3D();
  let i = 0;

  // Put poles on the OUTER sidewalk (not near curb).
  // Road edge is at ROAD_W/2, sidewalk spans SIDEWALK_W outward.
  // We place near the outer half of sidewalk:
  const sidewalkOuter = k.ROAD_W * 0.5 + k.SIDEWALK_W * 0.85;

  // Skip anything near the junction area
  // (must be >= sidewalk/curb clearing)
  const junctionClear = k.ROAD_W * 0.5 + k.SIDEWALK_W + 1.2;

  const place = (lx: number, lz: number, seed: number) => {
    if (i >= maxPlacements) return;

    // never place in junction clearance (prevents "in the road" poles)
    if (Math.abs(lx) < junctionClear && Math.abs(lz) < junctionClear) return;

    const jx = (h(seed + 1, seed + 2) - 0.5) * 0.25;
    const jz = (h(seed + 3, seed + 4) - 0.5) * 0.25;

    const x = lx + jx;
    const z = lz + jz;

    obj.position.set(x, k.CITY_Y + 2.1, z);
    obj.rotation.set(0, 0, 0);
    obj.scale.set(1, 1, 1);
    obj.updateMatrix();
    poles.setMatrixAt(i, obj.matrix);

    obj.position.set(x, k.CITY_Y + 4.25, z);
    obj.updateMatrix();
    lamps.setMatrixAt(i, obj.matrix);

    i++;
  };

  for (let t = -SIZE * 0.5 + 4; t <= SIZE * 0.5 - 4; t += step) {
    const s = (ctx.cx * 999 + ctx.cz * 777 + Math.floor(t * 10)) | 0;

    // Along the *outer* sidewalks
    place(t,  sidewalkOuter, s + 10);
    place(t, -sidewalkOuter, s + 20);
    place( sidewalkOuter, t, s + 30);
    place(-sidewalkOuter, t, s + 40);
  }

  poles.count = i;
  lamps.count = i;
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
}