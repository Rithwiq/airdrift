import * as THREE from "three";
import { smoothNoise } from "./Noise";

// deterministic rand
function seededRand(seed: number) {
  const s = Math.sin(seed) * 43758.5453123;
  return s - Math.floor(s);
}

function heightAt(x: number, z: number) {
  const h =
    smoothNoise(x * 0.05, z * 0.05) * 2.0 +
    smoothNoise(x * 0.15, z * 0.15) * 0.5;
  return h;
}

export class TerrainChunk {
  // ✅ Compatibility: ChunkManager expects `.mesh`
  mesh: THREE.Group;

  group: THREE.Group;
  terrain: THREE.Mesh;
  trees: THREE.InstancedMesh;

  private _chunkSize: number;

  constructor(cx: number, cz: number, size = 40, resolution = 18) {
    this._chunkSize = size;

    this.group = new THREE.Group();
    this.mesh = this.group; // ✅ alias

    // ===== TERRAIN =====
    const geo = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx * size;
      const z = pos.getZ(i) + cz * size;
      pos.setY(i, heightAt(x, z));
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: "#2b3a2b",
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.position.set(cx * size, 0, cz * size);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);

    // ===== TREES (simple instanced cones) =====
    const treeGeo = new THREE.ConeGeometry(0.45, 1.1, 7, 1);
    treeGeo.translate(0, 0.55, 0);

    const treeMat = new THREE.MeshStandardMaterial({
      color: "#1f4a2f",
      flatShading: true,
      roughness: 1.0,
      metalness: 0.0,
    });

    const treeCount = 120;
    this.trees = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
    this.trees.castShadow = true;

    const dummy = new THREE.Object3D();
    let ti = 0;

    for (let i = 0; i < treeCount; i++) {
      const seed = (cx * 928371 + cz * 12377 + i * 97) >>> 0;
      const rx = seededRand(seed + 1);
      const rz = seededRand(seed + 2);
      const rS = seededRand(seed + 3);

      const localX = (rx - 0.5) * size;
      const localZ = (rz - 0.5) * size;

      const worldX = cx * size + localX;
      const worldZ = cz * size + localZ;
      const y = heightAt(worldX, worldZ);

      const scale = 0.7 + rS * 0.9;

      dummy.position.set(cx * size + localX, y, cz * size + localZ);
      dummy.rotation.y = seededRand(seed + 4) * Math.PI * 2;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();

      this.trees.setMatrixAt(ti++, dummy.matrix);
    }

    this.trees.count = ti;
    this.trees.instanceMatrix.needsUpdate = true;
    this.group.add(this.trees);
  }

  dispose() {
    this.terrain.geometry.dispose();
    (this.terrain.material as THREE.Material).dispose();

    this.trees.geometry.dispose();
    (this.trees.material as THREE.Material).dispose();
  }
}