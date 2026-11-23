import { CONFIG } from "./config.js";

// Verlet-integrated multi-part humanoid ragdoll with bone constraints & ground/pillar collisions
export class RagdollInstance {
  constructor(scene, originPos, angle, colorHex, impulse) {
    this.scene = scene;
    this.age = 0;
    this.maxAge = 7.5;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const toWorld = (lx, ly, lz) => new THREE.Vector3(
      originPos.x + lx * cosA + lz * sinA,
      originPos.y + ly,
      originPos.z - lx * sinA + lz * cosA
    );

    // 13 anatomical joint nodes
    const def = [
      { name: "pelvis",    p: toWorld(0, 1.02, 0),       r: 0.22 },
      { name: "chest",     p: toWorld(0, 1.62, 0),       r: 0.24 },
      { name: "head",      p: toWorld(0, 2.08, 0.02),    r: 0.22 },
      { name: "lShoulder", p: toWorld(-0.34, 1.60, 0),   r: 0.14 },
      { name: "lElbow",    p: toWorld(-0.44, 1.24, 0.06),r: 0.11 },
      { name: "lHand",     p: toWorld(-0.48, 0.90, 0.14),r: 0.10 },
      { name: "rShoulder", p: toWorld(0.34, 1.60, 0),    r: 0.14 },
      { name: "rElbow",    p: toWorld(0.44, 1.24, 0.06), r: 0.11 },
      { name: "rHand",     p: toWorld(0.48, 0.90, 0.14), r: 0.10 },
      { name: "lKnee",     p: toWorld(-0.18, 0.56, 0.04),r: 0.13 },
      { name: "lFoot",     p: toWorld(-0.18, 0.10, 0.02),r: 0.12 },
      { name: "rKnee",     p: toWorld(0.18, 0.56, 0.04), r: 0.13 },
      { name: "rFoot",     p: toWorld(0.18, 0.10, 0.02), r: 0.12 }
    ];

    const impX = impulse ? impulse.x : (Math.random() - 0.5) * 5;
    const impY = impulse ? impulse.y : 3.5;
    const impZ = impulse ? impulse.z : (Math.random() - 0.5) * 5;

    this.nodes = def.map((d, idx) => {
      // Upper body receives stronger knockback so corpse whips backward naturally
      const upperWeight = idx <= 8 ? 1.15 : 0.45;
      const jitter = 0.85 + Math.random() * 0.35;
      const vx = impX * upperWeight * jitter + (Math.random() - 0.5) * 2.4;
      const vy = impY * upperWeight + (idx === 2 ? 1.6 : 0.4);
      const vz = impZ * upperWeight * jitter + (Math.random() - 0.5) * 2.4;
      const dtInit = 1 / 60;
      return {
        pos: d.p.clone(),
        prev: d.p.clone().addScaledVector(new THREE.Vector3(vx, vy, vz), -dtInit),
        r: d.r
      };
    });

    // Rigid bone constraints + structural torso bracing
    const pairs = [
      // Spine & head
      [0, 1], [1, 2], [0, 2, 0.4],
      // Shoulders brace
      [1, 3], [1, 6], [3, 6], [0, 3], [0, 6],
      // Left arm
      [3, 4], [4, 5],
      // Right arm
      [6, 7], [7, 8],
      // Left leg
      [0, 9], [9, 10],
      // Right leg
      [0, 11], [11, 12],
      // Hip spread brace (soft)
      [9, 11, 0.25]
    ];

    this.constraints = pairs.map(([a, b, stiffness = 1.0]) => ({
      a,
      b,
      len: this.nodes[a].pos.distanceTo(this.nodes[b].pos),
      stiffness
    }));

    // Materials matching character rig
    this.materials = [];
    const makeMat = (col, rough = 0.65, metal = 0.1) => {
      const m = new THREE.MeshStandardMaterial({
        color: col,
        roughness: rough,
        metalness: metal,
        transparent: true,
        opacity: 1
      });
      this.materials.push(m);
      return m;
    };

    const jacketMat = makeMat(colorHex || "#5865f2", 0.52, 0.15);
    const pantsMat = makeMat(0x232732, 0.78, 0.05);
    const skinMat = makeMat(0xe8be9e, 0.62, 0.04);
    const darkMat = makeMat(0x16181f, 0.65, 0.25);

    // Visual limb segments bound to pairs of nodes
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

    // Torso
    addLimb(0, 1, 0.24, 0.20, jacketMat);
    // Arms
    addLimb(3, 4, 0.10, 0.085, jacketMat);
    addLimb(4, 5, 0.082, 0.068, skinMat);
    addLimb(6, 7, 0.10, 0.085, jacketMat);
    addLimb(7, 8, 0.082, 0.068, skinMat);
    // Legs
    addLimb(0, 9, 0.125, 0.10, pantsMat);
    addLimb(9, 10, 0.095, 0.08, darkMat);
    addLimb(0, 11, 0.125, 0.10, pantsMat);
    addLimb(11, 12, 0.095, 0.08, darkMat);

    // Head mesh
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), skinMat);
    headMesh.castShadow = true;
    const capMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      darkMat
    );
    capMesh.position.y = 0.02;
    headMesh.add(capMesh);
    this.group.add(headMesh);
    this.headMesh = headMesh;

    // Hands & boots spheres
    this.nodeSpheres = [];
    for (const idx of [5, 8, 10, 12]) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(idx >= 10 ? 0.11 : 0.08, 8, 8),
        darkMat
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

    // Verlet integration
    for (const n of this.nodes) {
      const vx = (n.pos.x - n.prev.x) * 0.985;
      const vy = (n.pos.y - n.prev.y) * 0.985;
      const vz = (n.pos.z - n.prev.z) * 0.985;

      n.prev.copy(n.pos);
      n.pos.x += vx;
      n.pos.y += vy + g;
      n.pos.z += vz;

      // Ground bounce + friction
      if (n.pos.y < n.r) {
        n.pos.y = n.r;
        const groundVx = (n.pos.x - n.prev.x) * 0.72;
        const groundVz = (n.pos.z - n.prev.z) * 0.72;
        n.prev.x = n.pos.x - groundVx;
        n.prev.z = n.pos.z - groundVz;
        if (vy < -0.05) {
          n.prev.y = n.pos.y + vy * 0.22;
        }
      }

      // Arena bounds
      if (n.pos.x < -half) n.pos.x = -half;
      if (n.pos.x > half) n.pos.x = half;
      if (n.pos.z < -half) n.pos.z = -half;
      if (n.pos.z > half) n.pos.z = half;

      // Pillar collisions
      for (const pil of CONFIG.PILLARS) {
        const dx = n.pos.x - pil.x;
        const dz = n.pos.z - pil.z;
        const dist = Math.hypot(dx, dz);
        const minD = pil.r + n.r;
        if (dist < minD && dist > 0.0001) {
          const push = (minD - dist) / dist;
          n.pos.x += dx * push;
          n.pos.z += dz * push;
        }
      }
    }

    // Iterative constraint solver
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

    // Fade out at end of lifetime
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
    for (const m of this.materials) {
      m.dispose();
    }
  }
}
