import { CONFIG } from "./config.js";
import { CITY_LAYOUT } from "./city.js";
import { createFabricTexture, createDenimTexture, createFaceTexture } from "./textures.js";

// Verlet-integrated textured humanoid ragdoll with city building & ground collisions
export class RagdollInstance {
  constructor(scene, originPos, angle, colorHex, impulse) {
    this.scene = scene;
    this.age = 0;
    this.maxAge = 8.0;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const toWorld = (lx, ly, lz) => new THREE.Vector3(
      originPos.x + lx * cosA + lz * sinA,
      originPos.y + ly,
      originPos.z - lx * sinA + lz * cosA
    );

    const def = [
      { p: toWorld(0, 0.98, 0),        r: 0.18 }, // 0 pelvis
      { p: toWorld(0, 1.54, 0),        r: 0.20 }, // 1 chest
      { p: toWorld(0, 1.94, 0.02),     r: 0.18 }, // 2 head
      { p: toWorld(-0.29, 1.52, 0),    r: 0.11 }, // 3 lShoulder
      { p: toWorld(-0.36, 1.20, 0.05), r: 0.09 }, // 4 lElbow
      { p: toWorld(-0.38, 0.88, 0.10), r: 0.08 }, // 5 lHand
      { p: toWorld(0.29, 1.52, 0),     r: 0.11 }, // 6 rShoulder
      { p: toWorld(0.36, 1.20, 0.05),  r: 0.09 }, // 7 rElbow
      { p: toWorld(0.38, 0.88, 0.10),  r: 0.08 }, // 8 rHand
      { p: toWorld(-0.14, 0.54, 0.03), r: 0.11 }, // 9 lKnee
      { p: toWorld(-0.14, 0.10, 0.02), r: 0.10 }, // 10 lFoot
      { p: toWorld(0.14, 0.54, 0.03),  r: 0.11 }, // 11 rKnee
      { p: toWorld(0.14, 0.10, 0.02),  r: 0.10 }  // 12 rFoot
    ];

    const impX = impulse ? impulse.x : (Math.random() - 0.5) * 4;
    const impY = impulse ? impulse.y : 2.8;
    const impZ = impulse ? impulse.z : (Math.random() - 0.5) * 4;

    this.nodes = def.map((d, idx) => {
      const upperWeight = idx <= 8 ? 1.15 : 0.4;
      const jitter = 0.85 + Math.random() * 0.35;
      const vx = impX * upperWeight * jitter + (Math.random() - 0.5) * 2.0;
      const vy = impY * upperWeight + (idx === 2 ? 1.4 : 0.3);
      const vz = impZ * upperWeight * jitter + (Math.random() - 0.5) * 2.0;
      const dtInit = 1 / 60;
      return {
        pos: d.p.clone(),
        prev: d.p.clone().addScaledVector(new THREE.Vector3(vx, vy, vz), -dtInit),
        r: d.r
      };
    });

    const pairs = [
      [0, 1], [1, 2], [0, 2, 0.45],
      [1, 3], [1, 6], [3, 6], [0, 3], [0, 6],
      [3, 4], [4, 5],
      [6, 7], [7, 8],
      [0, 9], [9, 10],
      [0, 11], [11, 12],
      [9, 11, 0.22]
    ];

    this.constraints = pairs.map(([a, b, stiffness = 1.0]) => ({
      a,
      b,
      len: this.nodes[a].pos.distanceTo(this.nodes[b].pos),
      stiffness
    }));

    this.materials = [];
    this.textures = [];
    const makeMat = (opts) => {
      const m = new THREE.MeshStandardMaterial({
        ...opts,
        transparent: true,
        opacity: 1
      });
      this.materials.push(m);
      return m;
    };

    const fabricTex = createFabricTexture(colorHex || "#3a5f8a");
    const denimTex = createDenimTexture();
    const faceTex = createFaceTexture();
    this.textures.push(fabricTex, denimTex, faceTex);

    const jacketMat = makeMat({ map: fabricTex, roughness: 0.78, metalness: 0.05 });
    const pantsMat = makeMat({ map: denimTex, roughness: 0.85, metalness: 0.04 });
    const skinMat = makeMat({ color: 0xe4b896, roughness: 0.65, metalness: 0.03 });
    const faceMat = makeMat({ map: faceTex, roughness: 0.65, metalness: 0.03 });
    const bootMat = makeMat({ color: 0x1b1c20, roughness: 0.72, metalness: 0.15 });

    this.limbs = [];
    const addLimb = (a, b, rTop, rBot, mat) => {
      const len = this.nodes[a].pos.distanceTo(this.nodes[b].pos);
      const geo = new THREE.CylinderGeometry(rTop, rBot, len, 10);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.limbs.push({ a, b, mesh });
    };

    addLimb(0, 1, 0.21, 0.17, jacketMat);
    addLimb(3, 4, 0.085, 0.072, jacketMat);
    addLimb(4, 5, 0.068, 0.056, skinMat);
    addLimb(6, 7, 0.085, 0.072, jacketMat);
    addLimb(7, 8, 0.068, 0.056, skinMat);
    addLimb(0, 9, 0.11, 0.088, pantsMat);
    addLimb(9, 10, 0.084, 0.068, pantsMat);
    addLimb(0, 11, 0.11, 0.088, pantsMat);
    addLimb(11, 12, 0.084, 0.068, pantsMat);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.185, 14, 12), faceMat);
    headMesh.castShadow = true;
    this.group.add(headMesh);
    this.headMesh = headMesh;

    this.nodeSpheres = [];
    for (const idx of [3, 4, 6, 7, 9, 11, 5, 8, 10, 12]) {
      const isFoot = idx === 10 || idx === 12;
      const isHand = idx === 5 || idx === 8;
      const mat = isFoot ? bootMat : isHand ? skinMat : (idx <= 7 ? jacketMat : pantsMat);
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(isFoot ? 0.095 : isHand ? 0.065 : 0.08, 8, 8),
        mat
      );
      s.castShadow = true;
      this.group.add(s);
      this.nodeSpheres.push({ idx, mesh: s });
    }

    this._tmpDiff = new THREE.Vector3();
    this._tmpMid = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._quat = new THREE.Quaternion();
    this.syncMeshes();
  }

  update(dt) {
    this.age += dt;
    const step = Math.min(dt, 0.033);
    const half = CONFIG.WORLD_SIZE / 2 - 1;
    const g = -CONFIG.GRAVITY * step * step;

    for (const n of this.nodes) {
      const vx = (n.pos.x - n.prev.x) * 0.985;
      const vy = (n.pos.y - n.prev.y) * 0.985;
      const vz = (n.pos.z - n.prev.z) * 0.985;

      n.prev.copy(n.pos);
      n.pos.x += vx;
      n.pos.y += vy + g;
      n.pos.z += vz;

      if (n.pos.y < n.r) {
        n.pos.y = n.r;
        const groundVx = (n.pos.x - n.prev.x) * 0.70;
        const groundVz = (n.pos.z - n.prev.z) * 0.70;
        n.prev.x = n.pos.x - groundVx;
        n.prev.z = n.pos.z - groundVz;
        if (vy < -0.05) {
          n.prev.y = n.pos.y + vy * 0.20;
        }
      }

      if (n.pos.x < -half) n.pos.x = -half;
      if (n.pos.x > half) n.pos.x = half;
      if (n.pos.z < -half) n.pos.z = -half;
      if (n.pos.z > half) n.pos.z = half;

      for (const box of CITY_LAYOUT.colliders) {
        if (n.pos.y > box.maxY) continue;
        const cx = Math.max(box.minX, Math.min(n.pos.x, box.maxX));
        const cz = Math.max(box.minZ, Math.min(n.pos.z, box.maxZ));
        const dx = n.pos.x - cx;
        const dz = n.pos.z - cz;
        const distSq = dx * dx + dz * dz;
        if (distSq < n.r * n.r && distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = (n.r - dist) / dist;
          n.pos.x += dx * push;
          n.pos.z += dz * push;
        }
      }
    }

    for (let iter = 0; iter < 6; iter++) {
      for (const c of this.constraints) {
        const na = this.nodes[c.a];
        const nb = this.nodes[c.b];
        this._tmpDiff.subVectors(nb.pos, na.pos);
        const dist = this._tmpDiff.length();
        if (dist < 0.0001) continue;
        const diff = ((dist - c.len) / dist) * 0.5 * c.stiffness;
        na.pos.addScaledVector(this._tmpDiff, diff);
        nb.pos.addScaledVector(this._tmpDiff, -diff);
        if (na.pos.y < na.r) na.pos.y = na.r;
        if (nb.pos.y < nb.r) nb.pos.y = nb.r;
      }
    }

    if (this.age > this.maxAge - 1.5) {
      const opacity = Math.max(0, (this.maxAge - this.age) / 1.5);
      for (const m of this.materials) {
        m.opacity = opacity;
      }
    }

    this.syncMeshes();
    return this.age < this.maxAge;
  }

  syncMeshes() {
    for (const limb of this.limbs) {
      const pa = this.nodes[limb.a].pos;
      const pb = this.nodes[limb.b].pos;
      this._tmpMid.addVectors(pa, pb).multiplyScalar(0.5);
      limb.mesh.position.copy(this._tmpMid);

      this._tmpDiff.subVectors(pb, pa);
      const len = this._tmpDiff.length();
      if (len > 0.0001) {
        this._tmpDiff.divideScalar(len);
        this._quat.setFromUnitVectors(this._up, this._tmpDiff);
        limb.mesh.quaternion.copy(this._quat);
      }
    }

    this.headMesh.position.copy(this.nodes[2].pos);
    this._tmpDiff.subVectors(this.nodes[2].pos, this.nodes[1].pos).normalize();
    if (this._tmpDiff.lengthSq() > 0.01) {
      this._quat.setFromUnitVectors(this._up, this._tmpDiff);
      this.headMesh.quaternion.copy(this._quat);
    }

    for (const ns of this.nodeSpheres) {
      ns.mesh.position.copy(this.nodes[ns.idx].pos);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
