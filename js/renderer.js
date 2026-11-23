import { CONFIG } from "./config.js";
import { CITY_LAYOUT, raycastCity } from "./city.js";
import {
  createAsphaltTexture,
  createSidewalkTexture,
  createBuildingFacadeTexture,
  createFabricTexture,
  createDenimTexture,
  createFaceTexture
} from "./textures.js";
import { createDetailedAK74 } from "./weapons.js";
import { RagdollInstance } from "./ragdoll.js";

function createDaySkyTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#2c548a");
  grad.addColorStop(0.42, "#5b89bf");
  grad.addColorStop(0.70, "#9fbcd6");
  grad.addColorStop(0.86, "#e6c7a8");
  grad.addColorStop(1.0, "#757d87");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Soft clouds
  ctx.fillStyle = "rgba(255, 250, 244, 0.22)";
  for (let i = 0; i < 28; i++) {
    const cx = Math.random() * 512;
    const cy = 40 + Math.random() * 85;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28 + Math.random() * 44, 6 + Math.random() * 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(c);
}

export class PlaneRenderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.zoom = 1;
    this.time = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#9ab3cb");
    this.scene.fog = new THREE.FogExp2("#9eb3c7", 0.0052);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.15, 360);
    this.camera.position.set(0, 4, 10);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    if (THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    // Shared character textures
    this.denimTex = createDenimTexture();
    this.faceTex = createFaceTexture();
    this.fabricCache = new Map();

    this.playerMeshes = new Map();
    this.ragdolls = [];
    this.particles = [];
    this.tracers = [];
    this.muzzleFlashes = [];
    this.shakeIntensity = 0;

    this.camPos = new THREE.Vector3(0, 3.5, 10);
    this.camLook = new THREE.Vector3(0, 1.6, 0);

    this.buildCityWorld();
    this.resize();
  }

  getFabricTexture(colorHex) {
    const key = colorHex || "#3a5f8a";
    if (!this.fabricCache.has(key)) {
      this.fabricCache.set(key, createFabricTexture(key));
    }
    return this.fabricCache.get(key);
  }

  buildCityWorld() {
    // Sky dome
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(280, 24, 16),
      new THREE.MeshBasicMaterial({ map: createDaySkyTexture(), side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);

    // Natural daylight lighting
    const hemi = new THREE.HemisphereLight(0xcbe0ff, 0x4f5056, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
    sun.position.set(45, 72, 32);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 180;
    const d = 52;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sunLight = sun;

    // 1. Asphalt city ground
    const asphaltTex = createAsphaltTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.WORLD_SIZE, CONFIG.WORLD_SIZE),
      new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.04 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Road dashed center markings
    const markingMat = new THREE.MeshBasicMaterial({ color: 0xd9d4c4 });
    const roadCoords = [-84, -42, 0, 42, 84];
    const dashGeoH = new THREE.PlaneGeometry(3.2, 0.22);
    const dashGeoV = new THREE.PlaneGeometry(0.22, 3.2);
    for (const rc of roadCoords) {
      for (let pos = -118; pos <= 118; pos += 8) {
        if (roadCoords.some((o) => Math.abs(pos - o) < 7)) continue;
        const dh = new THREE.Mesh(dashGeoH, markingMat);
        dh.rotation.x = -Math.PI / 2;
        dh.position.set(pos, 0.02, rc);
        this.scene.add(dh);

        const dv = new THREE.Mesh(dashGeoV, markingMat);
        dv.rotation.x = -Math.PI / 2;
        dv.position.set(rc, 0.02, pos);
        this.scene.add(dv);
      }
    }

    // 2. Raised concrete sidewalks
    const sidewalkTex = createSidewalkTexture();
    const sidewalkMat = new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.88,
      metalness: 0.04
    });
    for (const sw of CITY_LAYOUT.sidewalks) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(sw.w, 0.16, sw.d), sidewalkMat);
      slab.position.set(sw.x, 0.08, sw.z);
      slab.receiveShadow = true;
      this.scene.add(slab);
    }

    // 3. Textured multi-story buildings
    const facadeMats = [0, 1, 2, 3].map((idx) => {
      const tex = createBuildingFacadeTexture(idx);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.08 });
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.92, metalness: 0.05 });
    const acMat = new THREE.MeshStandardMaterial({ color: 0x62666e, roughness: 0.65, metalness: 0.35 });

    for (const b of CITY_LAYOUT.buildings) {
      const baseMat = facadeMats[b.style % facadeMats.length];
      // Clone texture repeat per building proportions so windows stay realistic size
      const sideMat = baseMat.clone();
      sideMat.map = baseMat.map.clone();
      sideMat.map.needsUpdate = true;
      sideMat.map.repeat.set(Math.max(1, Math.round(b.w / 10)), Math.max(1, Math.round(b.h / 14)));

      const mats = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mats);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // Rooftop parapet trim + AC unit
      const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.45, b.d + 0.3), roofMat);
      rim.position.set(b.x, b.h + 0.22, b.z);
      this.scene.add(rim);

      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.8), acMat);
      ac.position.set(b.x + b.w * 0.2, b.h + 0.75, b.z - b.d * 0.15);
      ac.castShadow = true;
      this.scene.add(ac);
    }

    // 4. Parked cars
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.85 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2735, roughness: 0.15, metalness: 0.8 });
    for (const car of CITY_LAYOUT.cars) {
      const cg = new THREE.Group();
      cg.position.set(car.x, 0, car.z);
      cg.rotation.y = car.rot;

      const paintMat = new THREE.MeshStandardMaterial({ color: car.color, roughness: 0.32, metalness: 0.55 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.68, 4.3), paintMat);
      body.position.y = 0.62;
      body.castShadow = true;
      body.receiveShadow = true;
      cg.add(body);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.56, 2.2), paintMat);
      cabin.position.set(0, 1.18, -0.15);
      cabin.castShadow = true;
      cg.add(cabin);

      const wind = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.44, 2.02), glassMat);
      wind.position.set(0, 1.18, -0.15);
      cg.add(wind);

      const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
      for (const [wx, wz] of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(wx, 0.34, wz);
        cg.add(w);
      }

      this.scene.add(cg);
    }

    // 5. Urban trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d3a2c, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x355c37, roughness: 0.85 });
    for (const t of CITY_LAYOUT.trees) {
      const tg = new THREE.Group();
      tg.position.set(t.x, 0.16, t.z);
      tg.scale.setScalar(t.s);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.1, 8), trunkMat);
      trunk.position.y = 1.55;
      trunk.castShadow = true;
      tg.add(trunk);

      const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.75, 1), leafMat);
      crown1.position.set(0, 3.9, 0);
      crown1.castShadow = true;
      tg.add(crown1);

      const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 1), leafMat);
      crown2.position.set(0.65, 3.3, 0.45);
      crown2.castShadow = true;
      tg.add(crown2);

      this.scene.add(tg);
    }

    // 6. Streetlights
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x383c44, roughness: 0.5, metalness: 0.7 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3d1 });
    for (const sl of CITY_LAYOUT.streetlights) {
      const sg = new THREE.Group();
      sg.position.set(sl.x, 0.16, sl.z);
      sg.rotation.y = sl.rot;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6.2, 8), poleMat);
      pole.position.y = 3.1;
      pole.castShadow = true;
      sg.add(pole);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.3), poleMat);
      arm.position.set(0, 6.1, 0.6);
      sg.add(arm);

      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.42), lampMat);
      bulb.position.set(0, 6.02, 1.12);
      sg.add(bulb);

      this.scene.add(sg);
    }

    // 7. Perimeter city boundary walls
    const half = CONFIG.WORLD_SIZE / 2;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4b4e54, roughness: 0.9 });
    for (const w of [
      { x: 0, z: -half, sx: CONFIG.WORLD_SIZE, sz: 1.4 },
      { x: 0, z: half, sx: CONFIG.WORLD_SIZE, sz: 1.4 },
      { x: -half, z: 0, sx: 1.4, sz: CONFIG.WORLD_SIZE },
      { x: half, z: 0, sx: 1.4, sz: CONFIG.WORLD_SIZE }
    ]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w.sx, 3.2, w.sz), wallMat);
      m.position.set(w.x, 1.6, w.z);
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  // Smooth textured humanoid rig with rounded joints & attachable detailed AK-74
  createPlayerMesh(player) {
    const root = new THREE.Group();

    const jacketMat = new THREE.MeshStandardMaterial({
      map: this.getFabricTexture(player.color),
      roughness: 0.78,
      metalness: 0.05
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      map: this.denimTex,
      roughness: 0.86,
      metalness: 0.04
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe4b896,
      roughness: 0.66,
      metalness: 0.02
    });
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.faceTex,
      roughness: 0.66,
      metalness: 0.02
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x221b16,
      roughness: 0.85,
      metalness: 0.04
    });
    const bootMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.72,
      metalness: 0.14
    });

    // Pelvis
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.98;
    root.add(pelvis);

    const hipMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.19, 0.22, 12), pantsMat);
    hipMesh.scale.set(1.18, 1, 0.78);
    hipMesh.castShadow = true;
    pelvis.add(hipMesh);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.06, 12), bootMat);
    belt.scale.set(1.18, 1, 0.8);
    belt.position.y = 0.09;
    pelvis.add(belt);

    // Torso
    const torso = new THREE.Group();
    torso.position.y = 0.11;
    pelvis.add(torso);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.18, 0.24, 12), jacketMat);
    waist.scale.set(1.15, 1, 0.76);
    waist.position.y = 0.12;
    waist.castShadow = true;
    torso.add(waist);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.36, 14), jacketMat);
    chest.scale.set(1.16, 1, 0.74);
    chest.position.y = 0.40;
    chest.castShadow = true;
    torso.add(chest);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.08, 12), jacketMat);
    collar.position.y = 0.60;
    torso.add(collar);

    // Head
    const headPivot = new THREE.Group();
    headPivot.position.y = 0.62;
    torso.add(headPivot);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.12, 10), skinMat);
    neck.position.y = 0.05;
    headPivot.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 16), faceMat);
    head.position.y = 0.22;
    head.scale.set(0.90, 1.06, 0.96);
    head.rotation.y = -Math.PI / 2; // Align painted face texture forward (+Z)
    head.castShadow = true;
    headPivot.add(head);

    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.196, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hair.position.set(0, 0.24, -0.015);
    hair.rotation.x = -0.22;
    hair.scale.set(0.92, 1.04, 0.98);
    hair.castShadow = true;
    headPivot.add(hair);

    // Smooth articulated arms (with shoulder & elbow spheres)
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 0.52, 0);
      torso.add(shoulder);

      const shJoint = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), jacketMat);
      shJoint.castShadow = true;
      shoulder.add(shJoint);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.070, 0.30, 10), jacketMat);
      upper.position.y = -0.15;
      upper.castShadow = true;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);

      const elbJoint = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), jacketMat);
      elbow.add(elbJoint);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.054, 0.28, 10), skinMat);
      forearm.position.y = -0.14;
      forearm.castShadow = true;
      elbow.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), skinMat);
      hand.position.y = -0.30;
      hand.castShadow = true;
      elbow.add(hand);

      return { shoulder, elbow, hand };
    };

    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Attach detailed AK-74 to torso weapon mount (aligned cleanly with two-handed grip)
    const ak = createDetailedAK74();
    const gunMount = new THREE.Group();
    gunMount.position.set(0.18, 0.36, 0.32);
    gunMount.add(ak.group);
    gunMount.visible = false;
    torso.add(gunMount);

    // Smooth articulated legs
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.135, -0.05, 0);
      pelvis.add(hip);

      const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), pantsMat);
      hip.add(hipJoint);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.082, 0.42, 10), pantsMat);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);

      const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.080, 8, 8), pantsMat);
      knee.add(kneeJoint);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.062, 0.40, 10), pantsMat);
      shin.position.y = -0.20;
      shin.castShadow = true;
      knee.add(shin);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.26), bootMat);
      boot.position.set(0, -0.43, 0.05);
      boot.castShadow = true;
      knee.add(boot);

      return { hip, knee };
    };

    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);

    this.scene.add(root);
    return {
      root,
      pelvis,
      torso,
      headPivot,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      gunMount,
      akMuzzle: ak.muzzle,
      jacketMat
    };
  }

  animateRig(rig, player, dt) {
    const spd = player.moveSpeed || 0;
    const isMoving = spd > 0.35;
    const isSprinting = Boolean(player.sprinting && isMoving);
    const phase = player.walkPhase || 0;
    const inAir = (player.y || 0) > 0.08;
    const hasGun = player.weapon === "ak74";
    const breath = Math.sin(this.time * 2.2 + (player.x || 0));

    rig.gunMount.visible = hasGun;

    let pelvisY = 0.98;
    let torsoPitch = 0;
    let torsoYaw = 0;
    let lHipX = 0, rHipX = 0, lKneeX = 0, rKneeX = 0;
    let lShX = 0, lShZ = 0.08, lElbX = -0.18;
    let rShX = 0, rShZ = -0.08, rElbX = -0.18;

    // Lower body + torso locomotion
    if (inAir) {
      lHipX = -0.48; rHipX = 0.22;
      lKneeX = 0.78; rKneeX = 0.40;
      torsoPitch = 0.10;
    } else if (isSprinting) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pelvisY = 0.96 + Math.abs(c) * 0.085;
      torsoPitch = 0.24;
      torsoYaw = -s * 0.16;
      lHipX = s * 0.92;
      rHipX = -s * 0.92;
      lKneeX = Math.max(0, -c) * 1.25 + 0.12;
      rKneeX = Math.max(0, c) * 1.25 + 0.12;
      lShX = -s * 0.95;
      rShX = s * 0.95;
      lElbX = -0.85 - Math.max(0, s) * 0.65;
      rElbX = -0.85 - Math.max(0, -s) * 0.65;
    } else if (isMoving) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pelvisY = 0.98 + Math.abs(c) * 0.04;
      torsoPitch = 0.06;
      torsoYaw = -s * 0.07;
      lHipX = s * 0.52;
      rHipX = -s * 0.52;
      lKneeX = Math.max(0, -c) * 0.68 + 0.05;
      rKneeX = Math.max(0, c) * 0.68 + 0.05;
      lShX = -s * 0.42;
      rShX = s * 0.42;
      lElbX = -0.22 - Math.max(0, s) * 0.35;
      rElbX = -0.22 - Math.max(0, -s) * 0.35;
    } else {
      pelvisY = 0.98 + breath * 0.012;
      torsoPitch = 0.02 + breath * 0.01;
      lShX = -0.06; rShX = -0.06;
      lElbX = -0.18; rElbX = -0.18;
    }

    // Upper body weapon or melee override
    if (hasGun) {
      const rec = player.recoil || 0;
      if (isSprinting) {
        // Tactical low-ready sprint hold
        rig.gunMount.position.set(0.14, 0.28, 0.28);
        rig.gunMount.rotation.set(0.28, -0.45, 0.12);
        rShX = -0.75; rShZ = -0.12; rElbX = -1.1;
        lShX = -0.82; lShZ = 0.35; lElbX = -1.25;
      } else {
        // Two-handed aimed rifle stance + recoil kickback
        rig.gunMount.position.set(0.16, 0.40 + rec * 0.02, 0.33 - rec * 0.08);
        rig.gunMount.rotation.set(-rec * 0.14, 0, 0);
        torsoYaw = -0.18;
        rShX = -1.22 - rec * 0.18;
        rShZ = -0.14;
        rElbX = -0.72;
        lShX = -1.18 - rec * 0.14;
        lShZ = 0.48;
        lElbX = -0.68;
      }
    } else if ((player.attackTimer || 0) > 0) {
      // Natural unarmed punch (no white slash ring!)
      const dur = player.attackDuration || 0.34;
      const p = 1 - player.attackTimer / dur;
      const punch = Math.sin(Math.min(1, p * 1.45) * Math.PI);
      if ((player.attackCombo || 0) === 0) {
        torsoYaw = -0.62 * punch;
        torsoPitch += 0.16 * punch;
        rShX = -1.55 * punch - 0.15;
        rElbX = -0.12;
        lShX = -0.45;
        lElbX = -1.1;
      } else {
        torsoYaw = 0.65 * punch;
        torsoPitch += 0.16 * punch;
        lShX = -1.50 * punch - 0.15;
        lElbX = -0.15;
        rShX = -0.45;
        rElbX = -1.1;
      }
    }

    // Subtle red hit flash
    if ((player.hitFlash || 0) > 0) {
      torsoPitch -= 0.22 * (player.hitFlash / 0.2);
      rig.jacketMat.emissive.setHex(0x881118);
      rig.jacketMat.emissiveIntensity = (player.hitFlash / 0.2) * 0.7;
    } else {
      rig.jacketMat.emissive.setHex(0x000000);
      rig.jacketMat.emissiveIntensity = 0;
    }

    const k = Math.min(1, dt * 18);
    rig.pelvis.position.y += (pelvisY - rig.pelvis.position.y) * k;
    rig.torso.rotation.x += (torsoPitch - rig.torso.rotation.x) * k;
    rig.torso.rotation.y += (torsoYaw - rig.torso.rotation.y) * k;
    rig.headPivot.rotation.y += (-torsoYaw * 0.55 - rig.headPivot.rotation.y) * k;

    rig.leftLeg.hip.rotation.x += (lHipX - rig.leftLeg.hip.rotation.x) * k;
    rig.rightLeg.hip.rotation.x += (rHipX - rig.rightLeg.hip.rotation.x) * k;
    rig.leftLeg.knee.rotation.x += (lKneeX - rig.leftLeg.knee.rotation.x) * k;
    rig.rightLeg.knee.rotation.x += (rKneeX - rig.rightLeg.knee.rotation.x) * k;

    rig.leftArm.shoulder.rotation.x += (lShX - rig.leftArm.shoulder.rotation.x) * k;
    rig.leftArm.shoulder.rotation.z += (lShZ - rig.leftArm.shoulder.rotation.z) * k;
    rig.leftArm.elbow.rotation.x += (lElbX - rig.leftArm.elbow.rotation.x) * k;

    rig.rightArm.shoulder.rotation.x += (rShX - rig.rightArm.shoulder.rotation.x) * k;
    rig.rightArm.shoulder.rotation.z += (rShZ - rig.rightArm.shoulder.rotation.z) * k;
    rig.rightArm.elbow.rotation.x += (rElbX - rig.rightArm.elbow.rotation.x) * k;
  }

  spawnTracer(ox, oy, oz, ex, ey, ez) {
    const pts = [new THREE.Vector3(ox, oy, oz), new THREE.Vector3(ex, ey, ez)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe49e, transparent: true, opacity: 0.75 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, age: 0, maxAge: 0.065 });
  }

  spawnMuzzleFlash(x, y, z) {
    const geo = new THREE.SphereGeometry(0.14, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd269, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.muzzleFlashes.push({ mesh, mat, age: 0, maxAge: 0.05 });
  }

  spawnImpactParticles(x, y, z, colorHex, count = 10) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.065, 0.065, 0.065);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const spd = 2.5 + Math.random() * 5.5;
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh, mat,
        vx: Math.cos(a) * spd,
        vy: 1.5 + Math.random() * 4.2,
        vz: Math.sin(a) * spd,
        age: 0,
        maxAge: 0.25 + Math.random() * 0.22
      });
    }
  }

  handleEvents(events, sound) {
    for (const ev of events) {
      if (ev.type === "swing") {
        if (sound) sound.playSwing();
      } else if (ev.type === "shot") {
        // Use actual 3D muzzle world position if rig exists
        let mx = ev.ox, my = ev.oy, mz = ev.oz;
        const rig = this.playerMeshes.get(ev.id);
        if (rig && rig.akMuzzle) {
          const wp = new THREE.Vector3();
          rig.akMuzzle.getWorldPosition(wp);
          mx = wp.x; my = wp.y; mz = wp.z;
        }
        this.spawnMuzzleFlash(mx, my, mz);
        this.spawnTracer(mx, my, mz, ev.ex, ev.ey, ev.ez);
        if (ev.hitWall) {
          this.spawnImpactParticles(ev.ex, ev.ey, ev.ez, 0xc9c6be, 8);
        }
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.09);
        if (sound) sound.playGunshot();
      } else if (ev.type === "reload") {
        if (sound) sound.playReload();
      } else if (ev.type === "hit") {
        this.spawnImpactParticles(ev.x, ev.y, ev.z, 0xb8222a, ev.heavy ? 14 : 8);
        this.shakeIntensity = Math.max(this.shakeIntensity, ev.heavy ? 0.22 : 0.10);
        if (sound) sound.playHit(ev.heavy);
      } else if (ev.type === "death") {
        const rag = new RagdollInstance(
          this.scene,
          { x: ev.x, y: ev.y, z: ev.z },
          ev.angle || 0,
          ev.color,
          ev.impulse
        );
        this.ragdolls.push(rag);
        if (sound) sound.playDeath();
      } else if (ev.type === "jump") {
        if (sound) sound.playJump();
      }
    }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);
  }

  adjustZoom(delta) {
    this.zoom = Math.max(0.65, Math.min(1.6, this.zoom + delta));
  }

  render(game, dt = 0.016, sound = null) {
    this.time += dt;
    this.handleEvents(game.consumeEvents(), sound);

    for (const [id, rig] of this.playerMeshes.entries()) {
      if (!game.players.has(id)) {
        this.scene.remove(rig.root);
        this.playerMeshes.delete(id);
      }
    }

    for (const [id, player] of game.players.entries()) {
      let rig = this.playerMeshes.get(id);
      if (!rig) {
        rig = this.createPlayerMesh(player);
        this.playerMeshes.set(id, rig);
      }
      rig.root.visible = player.alive !== false;
      if (rig.root.visible) {
        rig.root.position.set(player.x, player.y || 0, player.z);
        rig.root.rotation.y = player.angle || 0;
        this.animateRig(rig, player, dt);
      }
    }

    // Update physics ragdolls
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      if (!this.ragdolls[i].update(dt)) {
        this.ragdolls[i].dispose();
        this.ragdolls.splice(i, 1);
      }
    }

    // Update tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.age += dt;
      tr.mat.opacity = Math.max(0, 1 - tr.age / tr.maxAge);
      if (tr.age >= tr.maxAge) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        tr.mat.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Update muzzle flashes
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
      const mf = this.muzzleFlashes[i];
      mf.age += dt;
      mf.mesh.scale.setScalar(1 + mf.age * 14);
      mf.mat.opacity = Math.max(0, 1 - mf.age / mf.maxAge);
      if (mf.age >= mf.maxAge) {
        this.scene.remove(mf.mesh);
        mf.mesh.geometry.dispose();
        mf.mat.dispose();
        this.muzzleFlashes.splice(i, 1);
      }
    }

    // Update impact particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.vy -= 20 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mat.opacity = Math.max(0, 1 - p.age / p.maxAge);
      if (p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Keep sunlight shadow frustum centered on player
    const lp = game.localPlayer;
    if (this.sunLight) {
      this.sunLight.position.set(lp.x + 45, 72, lp.z + 32);
      this.sunLight.target.position.set(lp.x, 0, lp.z);
    }

    // Clean GTA 5-style third-person over-the-shoulder camera with wall collision
    const yaw = game.camYaw;
    const pitch = game.camPitch;
    const hasGun = lp.weapon === "ak74";
    const baseDist = (hasGun ? 3.8 : 4.8) * this.zoom;
    const shoulder = hasGun ? 0.52 : 0.32;

    const pivotX = lp.x + Math.cos(yaw) * shoulder;
    const pivotY = (lp.y || 0) + 1.58;
    const pivotZ = lp.z - Math.sin(yaw) * shoulder;

    // Direction from pivot backward to camera
    const cosP = Math.cos(pitch);
    const backX = Math.sin(yaw) * cosP;
    const backY = Math.sin(pitch);
    const backZ = Math.cos(yaw) * cosP;

    // Raycast against city buildings so camera never clips inside walls
    const safeDist = Math.max(
      1.1,
      raycastCity(pivotX, pivotY, pivotZ, backX, backY, backZ, baseDist) - 0.35
    );

    const desiredCamX = pivotX + backX * safeDist;
    const desiredCamY = Math.max(0.65, pivotY + backY * safeDist);
    const desiredCamZ = pivotZ + backZ * safeDist;

    // Look straight forward along the camera ray from pivot (aligns perfectly with crosshair)
    const lookX = pivotX - backX * 14;
    const lookY = pivotY - backY * 14;
    const lookZ = pivotZ - backZ * 14;

    const smooth = Math.min(1, dt * 22);
    this.camPos.x += (desiredCamX - this.camPos.x) * smooth;
    this.camPos.y += (desiredCamY - this.camPos.y) * smooth;
    this.camPos.z += (desiredCamZ - this.camPos.z) * smooth;

    this.camLook.x += (lookX - this.camLook.x) * smooth;
    this.camLook.y += (lookY - this.camLook.y) * smooth;
    this.camLook.z += (lookZ - this.camLook.z) * smooth;

    let sx = 0, sy = 0;
    if (this.shakeIntensity > 0.004) {
      sx = (Math.random() - 0.5) * this.shakeIntensity;
      sy = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.exp(-16 * dt);
    }

    this.camera.position.set(this.camPos.x + sx, this.camPos.y + sy, this.camPos.z);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
  }
}
