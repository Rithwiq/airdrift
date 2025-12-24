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

export function buildBuildings(ctx: CityContext, k: CityKnobs): RAPIER.RigidBody[] {
  const bodies: RAPIER.RigidBody[] = [];

  const buildingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#2b3342"),
    roughness: 0.9,
    metalness: 0.0,
    emissive: new THREE.Color("#0b0f16"),
    emissiveIntensity: 0.15,
    vertexColors: true, // ✅ required for setColorAt to show
  });

  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(bGeo, buildingMat, k.maxBuildings);

  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;

  // per-instance colors
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(k.maxBuildings * 3), 3);

  ctx.group.add(inst);

  const m4 = new THREE.Matrix4();
  const pV = new THREE.Vector3();
  const qV = new THREE.Quaternion();
  const sV = new THREE.Vector3();

  const SIZE = ctx.size;
  const CLEAR = k.ROAD_W * 0.5 + k.SIDEWALK_W + 1.0;
  const half = SIZE * 0.5 - 1.5;

  const addCollider = (wx: number, wy: number, wz: number, sx: number, sy: number, sz: number) => {
    const body = ctx.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(wx, wy, wz));

    // ✅ IMPORTANT: collision events enabled (penalties, combos, etc.)
    const col = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setFriction(1.0)
      .setRestitution(0.0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    ctx.world.createCollider(col, body);
    bodies.push(body);
  };

  let bi = 0;

  const placeQuad = (sxSign: number, szSign: number) => {
    const xMin = sxSign < 0 ? -half : CLEAR;
    const xMax = sxSign < 0 ? -CLEAR : half;
    const zMin = szSign < 0 ? -half : CLEAR;
    const zMax = szSign < 0 ? -CLEAR : half;

    const nx = Math.floor((xMax - xMin) / k.LOT);
    const nz = Math.floor((zMax - zMin) / k.LOT);

    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        if (bi >= k.maxBuildings) return;

        const seed = (ctx.cx * 10007 + ctx.cz * 20011 + ix * 97 + iz * 131) | 0;
        if (h(seed, seed + 17) > k.BUILD_PROB) continue;

        const rx = h(seed + 3, seed + 5) - 0.5;
        const rz = h(seed + 7, seed + 11) - 0.5;
        const rh = h(seed + 13, seed + 19);

        const lx = xMin + ix * k.LOT + k.LOT * 0.5 + rx * 0.8;
        const lz = zMin + iz * k.LOT + k.LOT * 0.5 + rz * 0.8;

        const bw = THREE.MathUtils.clamp(
          k.LOT - k.MARGIN - h(seed + 23, seed + 29) * 2.2,
          3.2,
          k.LOT - 1.2
        );
        const bd = THREE.MathUtils.clamp(
          k.LOT - k.MARGIN - h(seed + 31, seed + 37) * 2.2,
          3.2,
          k.LOT - 1.2
        );

        const dist = Math.hypot(ctx.ox + lx, ctx.oz + lz);
        const downtown = THREE.MathUtils.clamp(1.0 - dist / 220.0, 0.0, 1.0);

        const baseH = THREE.MathUtils.lerp(6, 16, downtown);
        const towerH = THREE.MathUtils.lerp(18, 55, downtown);
        const bh = THREE.MathUtils.lerp(baseH, towerH, rh);

        const y = k.CITY_Y + bh * 0.5;

        const rot = Math.round(h(seed + 41, seed + 43) * 4) * (Math.PI / 2);
        qV.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);

        pV.set(lx, y, lz);
        sV.set(bw, bh, bd);

        m4.compose(pV, qV, sV);
        inst.setMatrixAt(bi, m4);

        const pal = P.buildingPalette[Math.floor(h(seed + 101, seed + 103) * P.buildingPalette.length)];
        const tint = pal.clone().multiplyScalar(0.85 + h(seed + 107, seed + 109) * 0.35);
        inst.setColorAt?.(bi, tint);

        // Physics collider in WORLD coords
        addCollider(ctx.ox + lx, y, ctx.oz + lz, bw, bh, bd);

        bi++;
      }
    }
  };

  placeQuad(-1, -1);
  placeQuad(-1, +1);
  placeQuad(+1, -1);
  placeQuad(+1, +1);

  inst.count = bi;
  inst.instanceMatrix.needsUpdate = true;
  (inst as any).instanceColor && ((inst as any).instanceColor.needsUpdate = true);

  return bodies;
}