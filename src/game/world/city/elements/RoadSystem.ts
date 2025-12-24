import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { CityContext, CityKnobs } from "../types";
import { CityPalette as P } from "../palette";

export function buildRoadSystem(ctx: CityContext, k: CityKnobs): RAPIER.RigidBody[] {
  const bodies: RAPIER.RigidBody[] = [];
  const SIZE = ctx.size;

  const mkMat = (color: THREE.Color, f: number, rough = 0.85) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: f,
      polygonOffsetUnits: f,
    });

  const cityBaseMat   = mkMat(P.base, 2, 0.98);
  const roadMat       = mkMat(P.asphalt, 1, 0.95);
  const edgeMat       = mkMat(P.asphaltEdge, 0.9, 0.98);
  const sideMat       = mkMat(P.sidewalk, 0.7, 0.92);
  const curbMat       = mkMat(P.curb, 0.55, 0.95);
  const laneWhiteMat  = mkMat(P.laneWhite, 0.25, 0.75);
  const laneYellowMat = mkMat(P.laneYellow, 0.25, 0.75);

  const CITY_Y = k.CITY_Y;
  const ROAD_W = k.ROAD_W;
  const SIDEWALK_W = k.SIDEWALK_W;

  const baseY = CITY_Y;
  const roadY = CITY_Y + 0.0012;
  const edgeY = CITY_Y + 0.0016;
  const sideY = CITY_Y + 0.0020;
  const curbY = CITY_Y + 0.00235;
  const markY = CITY_Y + 0.0032;

  const addPlaneXZ = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    order = 0
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.y = rotY;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = false;
    m.frustumCulled = false;
    m.renderOrder = order;
    ctx.group.add(m);
    return m;
  };

  // =========================
  // Base + Roads (cross)
  // =========================
  addPlaneXZ(new THREE.PlaneGeometry(SIZE, SIZE), cityBaseMat, 0, baseY, 0, 0, 0);
  addPlaneXZ(new THREE.PlaneGeometry(SIZE, ROAD_W), roadMat, 0, roadY, 0, 0, 1);
  addPlaneXZ(new THREE.PlaneGeometry(ROAD_W, SIZE), roadMat, 0, roadY, 0, 0, 1);
  addPlaneXZ(new THREE.PlaneGeometry(ROAD_W, ROAD_W), roadMat, 0, roadY + 0.00005, 0, 0, 2);

  // =========================
  // Edges
  // =========================
  const edgeW = 1.2;
  addPlaneXZ(new THREE.PlaneGeometry(SIZE, edgeW), edgeMat, 0, edgeY,  ROAD_W * 0.5 - edgeW * 0.5, 0, 2);
  addPlaneXZ(new THREE.PlaneGeometry(SIZE, edgeW), edgeMat, 0, edgeY, -ROAD_W * 0.5 + edgeW * 0.5, 0, 2);
  addPlaneXZ(new THREE.PlaneGeometry(edgeW, SIZE), edgeMat,  ROAD_W * 0.5 - edgeW * 0.5, edgeY, 0, 0, 2);
  addPlaneXZ(new THREE.PlaneGeometry(edgeW, SIZE), edgeMat, -ROAD_W * 0.5 + edgeW * 0.5, edgeY, 0, 0, 2);

  // =========================
  // Sidewalks (CUT around junction so no sidewalk crosses the center)
  // =========================
  const junctionPad = 0.9;
  const interHalf = ROAD_W * 0.5 + junctionPad;
  const segLen = Math.max(2, SIZE * 0.5 - interHalf);

  const sideSegX = new THREE.PlaneGeometry(segLen, SIDEWALK_W);
  const zTop =  ROAD_W * 0.5 + SIDEWALK_W * 0.5;
  const zBot = -ROAD_W * 0.5 - SIDEWALK_W * 0.5;

  addPlaneXZ(sideSegX, sideMat, -(interHalf + segLen * 0.5), sideY, zTop, 0, 3);
  addPlaneXZ(sideSegX, sideMat,  (interHalf + segLen * 0.5), sideY, zTop, 0, 3);
  addPlaneXZ(sideSegX, sideMat, -(interHalf + segLen * 0.5), sideY, zBot, 0, 3);
  addPlaneXZ(sideSegX, sideMat,  (interHalf + segLen * 0.5), sideY, zBot, 0, 3);

  const sideSegZ = new THREE.PlaneGeometry(SIDEWALK_W, segLen);
  const xRight =  ROAD_W * 0.5 + SIDEWALK_W * 0.5;
  const xLeft  = -ROAD_W * 0.5 - SIDEWALK_W * 0.5;

  addPlaneXZ(sideSegZ, sideMat, xRight, sideY, -(interHalf + segLen * 0.5), 0, 3);
  addPlaneXZ(sideSegZ, sideMat, xRight, sideY,  (interHalf + segLen * 0.5), 0, 3);
  addPlaneXZ(sideSegZ, sideMat, xLeft,  sideY, -(interHalf + segLen * 0.5), 0, 3);
  addPlaneXZ(sideSegZ, sideMat, xLeft,  sideY,  (interHalf + segLen * 0.5), 0, 3);

  // =========================
  // Curbs (also cut to match sidewalks)
  // =========================
  const curbW = 0.28;
  const curbSegX = new THREE.PlaneGeometry(segLen, curbW);
  const curbSegZ = new THREE.PlaneGeometry(curbW, segLen);

  const zCurbTop =  ROAD_W * 0.5 + curbW * 0.5;
  const zCurbBot = -ROAD_W * 0.5 - curbW * 0.5;
  const xCurbRight = ROAD_W * 0.5 + curbW * 0.5;
  const xCurbLeft  = -ROAD_W * 0.5 - curbW * 0.5;

  addPlaneXZ(curbSegX, curbMat, -(interHalf + segLen * 0.5), curbY, zCurbTop, 0, 4);
  addPlaneXZ(curbSegX, curbMat,  (interHalf + segLen * 0.5), curbY, zCurbTop, 0, 4);
  addPlaneXZ(curbSegX, curbMat, -(interHalf + segLen * 0.5), curbY, zCurbBot, 0, 4);
  addPlaneXZ(curbSegX, curbMat,  (interHalf + segLen * 0.5), curbY, zCurbBot, 0, 4);

  addPlaneXZ(curbSegZ, curbMat, xCurbRight, curbY, -(interHalf + segLen * 0.5), 0, 4);
  addPlaneXZ(curbSegZ, curbMat, xCurbRight, curbY,  (interHalf + segLen * 0.5), 0, 4);
  addPlaneXZ(curbSegZ, curbMat, xCurbLeft,  curbY, -(interHalf + segLen * 0.5), 0, 4);
  addPlaneXZ(curbSegZ, curbMat, xCurbLeft,  curbY,  (interHalf + segLen * 0.5), 0, 4);

  // =========================
  // Markings (your existing logic)
  // =========================
  const laneThin = 0.22;
  const interNoMark = ROAD_W * 0.5 + 0.85;

  const addDashX = (z: number) => {
    const dashL = 2.2;
    const gap = 1.6;
    for (let x = -SIZE * 0.5 + 2; x <= SIZE * 0.5 - 2; x += dashL + gap) {
      if (Math.abs(x) < interNoMark) continue;
      addPlaneXZ(new THREE.PlaneGeometry(dashL, laneThin), laneYellowMat, x + dashL * 0.5, markY, z, 0, 6);
    }
  };

  const addDashZ = (x: number) => {
    const dashL = 2.2;
    const gap = 1.6;
    for (let z = -SIZE * 0.5 + 2; z <= SIZE * 0.5 - 2; z += dashL + gap) {
      if (Math.abs(z) < interNoMark) continue;
      addPlaneXZ(new THREE.PlaneGeometry(laneThin, dashL), laneYellowMat, x, markY, z + dashL * 0.5, 0, 6);
    }
  };

  addDashX(0);
  addDashZ(0);

  const laneInset = 1.2;
  const edgeZ1 = ROAD_W * 0.5 - laneInset;
  const edgeZ2 = -ROAD_W * 0.5 + laneInset;
  const edgeX1 = ROAD_W * 0.5 - laneInset;
  const edgeX2 = -ROAD_W * 0.5 + laneInset;

  const segLenMark = (SIZE * 0.5) - interNoMark;
  const segXMark = new THREE.PlaneGeometry(segLenMark, laneThin);
  const segZMark = new THREE.PlaneGeometry(laneThin, segLenMark);

  addPlaneXZ(segXMark, laneWhiteMat, -(interNoMark + segLenMark * 0.5), markY, edgeZ1, 0, 6);
  addPlaneXZ(segXMark, laneWhiteMat,  (interNoMark + segLenMark * 0.5), markY, edgeZ1, 0, 6);
  addPlaneXZ(segXMark, laneWhiteMat, -(interNoMark + segLenMark * 0.5), markY, edgeZ2, 0, 6);
  addPlaneXZ(segXMark, laneWhiteMat,  (interNoMark + segLenMark * 0.5), markY, edgeZ2, 0, 6);

  addPlaneXZ(segZMark, laneWhiteMat, edgeX1, markY, -(interNoMark + segLenMark * 0.5), 0, 6);
  addPlaneXZ(segZMark, laneWhiteMat, edgeX1, markY,  (interNoMark + segLenMark * 0.5), 0, 6);
  addPlaneXZ(segZMark, laneWhiteMat, edgeX2, markY, -(interNoMark + segLenMark * 0.5), 0, 6);
  addPlaneXZ(segZMark, laneWhiteMat, edgeX2, markY,  (interNoMark + segLenMark * 0.5), 0, 6);

  const stopToJunction = interNoMark + 0.65;
  const zebraOffset = stopToJunction;
  const stopOffset = zebraOffset + 0.9;

  const stopThickness = 0.28;
  const stopXGeo = new THREE.PlaneGeometry(stopThickness, ROAD_W - 1.0);
  const stopZGeo = new THREE.PlaneGeometry(ROAD_W - 1.0, stopThickness);

  addPlaneXZ(stopXGeo, laneWhiteMat, +stopOffset, markY, 0, 0, 7);
  addPlaneXZ(stopXGeo, laneWhiteMat, -stopOffset, markY, 0, 0, 7);
  addPlaneXZ(stopZGeo, laneWhiteMat, 0, markY, +stopOffset, 0, 7);
  addPlaneXZ(stopZGeo, laneWhiteMat, 0, markY, -stopOffset, 0, 7);

  const stripes = 7;
  const stripeLen = 0.55;
  const stripeGap = 0.35;
  const zebraSpan = stripes * stripeLen + (stripes - 1) * stripeGap;

  const zebraXStripeGeo = new THREE.PlaneGeometry(stripeLen, ROAD_W - 0.9);
  const zebraZStripeGeo = new THREE.PlaneGeometry(ROAD_W - 0.9, stripeLen);

  const addZebraOnXApproach = (xCenter: number) => {
    for (let i = 0; i < stripes; i++) {
      const dx = -zebraSpan * 0.5 + i * (stripeLen + stripeGap) + stripeLen * 0.5;
      addPlaneXZ(zebraXStripeGeo, laneWhiteMat, xCenter + dx, markY, 0, 0, 7);
    }
  };

  const addZebraOnZApproach = (zCenter: number) => {
    for (let i = 0; i < stripes; i++) {
      const dz = -zebraSpan * 0.5 + i * (stripeLen + stripeGap) + stripeLen * 0.5;
      addPlaneXZ(zebraZStripeGeo, laneWhiteMat, 0, markY, zCenter + dz, 0, 7);
    }
  };

  addZebraOnXApproach(+zebraOffset);
  addZebraOnXApproach(-zebraOffset);
  addZebraOnZApproach(+zebraOffset);
  addZebraOnZApproach(-zebraOffset);

  // =========================
  // Physics slab (whole chunk solid)
  // ✅ Enable collision events here too (useful for penalties)
  // =========================
  const slab = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(ctx.ox, -2.0, ctx.oz)
  );

  ctx.world.createCollider(
    RAPIER.ColliderDesc.cuboid(SIZE / 2, 2.0, SIZE / 2)
      .setFriction(1.1)
      .setRestitution(0.0)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    slab
  );

  bodies.push(slab);
  return bodies;
}