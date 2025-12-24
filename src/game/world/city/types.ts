import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

export type CityContext = {
  cx: number;
  cz: number;
  ox: number;
  oz: number;
  size: number;
  world: RAPIER.World;
  group: THREE.Group;
};

export type CityKnobs = {
  CITY_Y: number;
  ROAD_W: number;
  SIDEWALK_W: number;

  LOT: number;
  MARGIN: number;
  BUILD_PROB: number;

  streetLightStep: number;
  maxBuildings: number;
  maxCars: number;
};

export type CityBuildResult = {
  bodies: RAPIER.RigidBody[];
};