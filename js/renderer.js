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
import { createWeaponMesh } from "./weapons.js";
import { RagdollInstance } from "./ragdoll.js";

function angleDiff(from, to) {
  let d = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

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
    this.scene.fog = new THREE.FogExp2("#9eb3c7", 0.0048);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.08, 360);
    this.scene.add(this.camera);

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

    this.denimTex = createDenimTexture();
    this.faceTex = createFaceTexture();
    this.fabricCache = new Map();

    this.playerMeshes = new Map();
    this.rocketMeshes = new Map();
    this.ragdolls = [];
    this.particles = [];
    this.tracers = [];
    this.muzzleFlashes = [];
    this.explosions = [];
    this.shakeIntensity = 0;

    this.camDistCurrent = 4.6;
    this.camYawSway = 0;
    this.prevCamYaw = 0;

    this.buildCityWorld();
    this.buildFPSViewmodel();
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
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(280, 24, 16),
      new THREE.MeshBasicMaterial({ map: createDaySkyTexture(), side: THREE.BackSide, fog: false })
    );
    this.scene.add(sky);

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

    // Asphalt ground
    const asphaltTex = createAsphaltTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.WORLD_SIZE, CONFIG.WORLD_SIZE),
      new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, metalness: 0.04 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Road center markings
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

    // Sidewalks
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

    // Textured buildings
    const facadeMats = [0, 1, 2, 3].map((idx) => {
      const tex = createBuildingFacadeTexture(idx);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.08 });
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.92, metalness: 0.05 });
    const acMat = new THREE.MeshStandardMaterial({ color: 0x62666e, roughness: 0.65, metalness: 0.35 });

    for (const b of CITY_LAYOUT.buildings) {
      const baseMat = facadeMats[b.style % facadeMats.length];
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

      const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.3, 0.45, b.d + 0.3), roofMat);
      rim.position.set(b.x, b.h + 0.22, b.z);
      this.scene.add(rim);

      const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.8), acMat);
      ac.position.set(b.x + b.w * 0.2, b.h + 0.75, b.z - b.d * 0.15);
      ac.castShadow = true;
      this.scene.add(ac);
    }

    // Trees
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

    // Streetlights
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

    // Perimeter boundary walls
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

  // Dedicated First-Person Viewmodel attached to camera
  buildFPSViewmodel() {
    this.fpsRoot = new THREE.Group();
    this.fpsRoot.visible = false;
    this.camera.add(this.fpsRoot);

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe4b896, roughness: 0.65 });
    const sleeveMat = new THREE.MeshStandardMaterial({ map: this.getFabricTexture("#3a5f8a"), roughness: 0.78 });

    // Left & right FPS hands for melee / weapon support
    const makeFpsHand = (side) => {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.42, 10), sleeveMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.24;
      g.add(arm);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), skinMat);
      g.add(fist);
      g.position.set(side * 0.24, -0.24, -0.42);
      this.fpsRoot.add(g);
      return g;
    };

    this.fpsLeftHand = makeFpsHand(-1);
    this.fpsRightHand = makeFpsHand(1);

    // FPS Weapon holder (points along -Z which is camera forward!)
    this.fpsWeaponHolder = new THREE.Group();
    this.fpsWeaponHolder.rotation.y = Math.PI; // Our weapons point +Z, camera looks -Z
    this.fpsRoot.add(this.fpsWeaponHolder);

    this.fpsWeapons = {};
    for (const id of ["knuckles", "glock", "ak74", "awp", "minigun", "rpg"]) {
      const wm = createWeaponMesh(id);
      if (wm) {
        wm.group.visible = false;
        if (id === "knuckles") {
          wm.group.rotation.y = Math.PI;
          this.fpsRightHand.add(wm.group);
        } else {
          this.fpsWeaponHolder.add(wm.group);
        }
        this.fpsWeapons[id] = wm;
      }
    }
  }

  // Smooth textured humanoid rig with weapon mounts on RIGHT HAND & TORSO
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
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe4b896, roughness: 0.66, metalness: 0.02 });
    const faceMat = new THREE.MeshStandardMaterial({ map: this.faceTex, roughness: 0.66, metalness: 0.02 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x221b16, roughness: 0.85, metalness: 0.04 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.72, metalness: 0.14 });

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

    const headPivot = new THREE.Group();
    headPivot.position.y = 0.62;
    torso.add(headPivot);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.12, 10), skinMat);
    neck.position.y = 0.05;
    headPivot.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 16), faceMat);
    head.position.y = 0.22;
    head.scale.set(0.90, 1.06, 0.96);
    head.rotation.y = -Math.PI / 2;
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

    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.29, 0.52, 0);
      torso.add(shoulder);

      shoulder.add(new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 10), jacketMat));

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.070, 0.30, 10), jacketMat);
      upper.position.y = -0.15;
      upper.castShadow = true;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);

      elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 8), jacketMat));

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.054, 0.28, 10), skinMat);
      forearm.position.y = -0.14;
      forearm.castShadow = true;
      elbow.add(forearm);

      const hand = new THREE.Group();
      hand.position.y = -0.30;
      const handMesh = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), skinMat);
      handMesh.castShadow = true;
      hand.add(handMesh);
      elbow.add(hand);

      return { shoulder, elbow, hand };
    };

    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Weapon mount attached to torso (aligned precisely to hands in every pose)
    const weaponMount = new THREE.Group();
    torso.add(weaponMount);

    const weapons = {};
    for (const id of ["knuckles", "glock", "ak74", "awp", "minigun", "rpg"]) {
      const wm = createWeaponMesh(id);
      if (wm) {
        wm.group.visible = false;
        if (id === "knuckles") {
          rightArm.hand.add(wm.group);
        } else {
          weaponMount.add(wm.group);
        }
        weapons[id] = wm;
      }
    }

    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.135, -0.05, 0);
      pelvis.add(hip);

      hip.add(new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 10), pantsMat));

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.082, 0.42, 10), pantsMat);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);

      knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.080, 8, 8), pantsMat));

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
      weaponMount,
      weapons,
      jacketMat
    };
  }

  // Full procedural bone animation: head/torso look-at twist, turn-in-place stepping, turn lean, weapon poses
  animateRig(rig, player, dt) {
    const spd = player.moveSpeed || 0;
    const isMoving = spd > 0.35;
    const isSprinting = Boolean(player.sprinting && isMoving);
    const turningInPlace = !isMoving && (player.turnStepTimer || 0) > 0;
    const phase = player.walkPhase || 0;
    const inAir = (player.y || 0) > 0.08;
    const wid = player.weapon || "fists";
    const rec = player.recoil || 0;
    const breath = Math.sin(this.time * 2.2 + (player.x || 0));

    // Toggle visible weapon mesh
    for (const [id, wm] of Object.entries(rig.weapons)) {
      wm.group.visible = id === wid;
      if (id === "minigun" && wm.barrelsGroup && id === wid) {
        wm.barrelsGroup.rotation.z += (player.barrelSpin || 0) * dt;
      }
      if (id === "rpg" && wm.warhead && id === wid) {
        wm.warhead.visible = (player.reloadingTimer || 0) <= 0;
      }
    }

    // Compute upper-body twist toward aimYaw relative to pelvis angle
    const aimDelta = Math.max(-1.25, Math.min(1.25, angleDiff(player.angle || 0, player.aimYaw ?? player.angle ?? 0)));
    const aimPitch = Math.max(-0.55, Math.min(0.55, player.aimPitch || 0));
    const turnLean = Math.max(-0.22, Math.min(0.22, -(player.turnVel || 0) * 0.045));

    let pelvisY = 0.98;
    let pelvisRoll = turnLean * (isMoving ? 0.8 : 0.25);
    let torsoPitch = 0;
    let torsoYaw = aimDelta * 0.55;
    let headYaw = aimDelta * 0.45;
    let headPitch = aimPitch * 0.65;

    let lHipX = 0, rHipX = 0, lKneeX = 0, rKneeX = 0;
    let lShX = 0, lShZ = 0.08, lElbX = -0.18;
    let rShX = 0, rShZ = -0.08, rElbX = -0.18;

    // Lower body gait / turn-in-place stepping
    if (inAir) {
      lHipX = -0.45; rHipX = 0.22;
      lKneeX = 0.78; rKneeX = 0.38;
      torsoPitch = 0.08;
    } else if (isSprinting) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pelvisY = 0.96 + Math.abs(c) * 0.085;
      torsoPitch = 0.22;
      torsoYaw += -s * 0.14;
      lHipX = s * 0.88;
      rHipX = -s * 0.88;
      lKneeX = Math.max(0, -c) * 1.2 + 0.10;
      rKneeX = Math.max(0, c) * 1.2 + 0.10;
      lShX = -s * 0.9;
      rShX = s * 0.9;
      lElbX = -0.8 - Math.max(0, s) * 0.6;
      rElbX = -0.8 - Math.max(0, -s) * 0.6;
    } else if (isMoving) {
      const stride = Math.min(1, spd / CONFIG.WALK_SPEED);
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pelvisY = 0.98 + Math.abs(c) * 0.038 * stride;
      torsoPitch = 0.05 * stride;
      torsoYaw += -s * 0.06 * stride;
      lHipX = s * 0.52 * stride;
      rHipX = -s * 0.52 * stride;
      lKneeX = Math.max(0, -c) * 0.68 * stride + 0.04;
      rKneeX = Math.max(0, c) * 0.68 * stride + 0.04;
      lShX = -s * 0.42 * stride;
      rShX = s * 0.42 * stride;
      lElbX = -0.20 - Math.max(0, s) * 0.32 * stride;
      rElbX = -0.20 - Math.max(0, -s) * 0.32 * stride;
    } else if (turningInPlace) {
      // Procedural foot lifting while rotating on the spot!
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pelvisY = 0.97 + Math.abs(s) * 0.025;
      lHipX = Math.min(0, -s) * 0.32;
      rHipX = Math.min(0, s) * 0.32;
      lKneeX = Math.max(0, s) * 0.52;
      rKneeX = Math.max(0, -s) * 0.52;
    } else {
      pelvisY = 0.98 + breath * 0.012;
      torsoPitch = 0.02 + breath * 0.01;
      lShX = -0.05; rShX = -0.05;
      lElbX = -0.18; rElbX = -0.18;
    }

    // Weapon-specific bone poses & exact hand alignment
    if (wid === "glock") {
      rig.weaponMount.position.set(0.18, 0.46, 0.52 - rec * 0.04);
      rig.weaponMount.rotation.set(aimPitch - rec * 0.25, 0, 0);
      rShX = -1.42 + aimPitch - rec * 0.18; rShZ = -0.12; rElbX = -0.18;
      lShX = -1.38 + aimPitch - rec * 0.14; lShZ = 0.42;  lElbX = -0.24;
    } else if (wid === "ak74" || wid === "awp") {
      // Straight shouldered rifle alignment — right hand on pistol grip, left hand on wooden handguard
      rig.weaponMount.position.set(0.16, 0.42 + rec * 0.015, 0.36 - rec * 0.07);
      rig.weaponMount.rotation.set(aimPitch - rec * 0.12, 0, 0);
      torsoYaw = aimDelta * 0.7 - 0.16;
      rShX = -1.10 + aimPitch - rec * 0.12; rShZ = -0.18; rElbX = -0.95;
      lShX = -1.25 + aimPitch - rec * 0.10; lShZ = 0.48;  lElbX = -0.68;
    } else if (wid === "minigun") {
      // Heavy underslung hip-fire stance
      rig.weaponMount.position.set(0.14, 0.12, 0.38 - rec * 0.03);
      rig.weaponMount.rotation.set(aimPitch * 0.6, 0, 0);
      torsoPitch += 0.08;
      rShX = -0.58; rShZ = -0.15; rElbX = -0.82;
      lShX = -0.82; lShZ = 0.38;  lElbX = -0.65;
    } else if (wid === "rpg") {
      // Over-right-shoulder rocket launcher stance
      rig.weaponMount.position.set(0.24, 0.62, 0.18 - rec * 0.10);
      rig.weaponMount.rotation.set(aimPitch - rec * 0.15, 0, 0);
      rShX = -1.55 + aimPitch; rShZ = -0.05; rElbX = -1.15;
      lShX = -1.50 + aimPitch; lShZ = 0.46;  lElbX = -0.85;
    } else if ((player.attackTimer || 0) > 0) {
      // Clean melee punch (fists or brass knuckles)
      const dur = player.attackDuration || 0.34;
      const p = 1 - player.attackTimer / dur;
      const punch = Math.sin(Math.min(1, p * 1.45) * Math.PI);
      if ((player.attackCombo || 0) === 0 || wid === "knuckles") {
        torsoYaw -= 0.58 * punch;
        torsoPitch += 0.15 * punch;
        rShX = -1.55 * punch - 0.15; rElbX = -0.12;
        lShX = -0.45; lElbX = -1.1;
      } else {
        torsoYaw += 0.62 * punch;
        torsoPitch += 0.15 * punch;
        lShX = -1.50 * punch - 0.15; lElbX = -0.15;
        rShX = -0.45; rElbX = -1.1;
      }
    }

    // Reload dip
    if ((player.reloadingTimer || 0) > 0) {
      rig.weaponMount.rotation.x += 0.45;
      rig.weaponMount.position.y -= 0.08;
    }

    // Hit flash
    if ((player.hitFlash || 0) > 0) {
      torsoPitch -= 0.20 * (player.hitFlash / 0.2);
      rig.jacketMat.emissive.setHex(0x881118);
      rig.jacketMat.emissiveIntensity = (player.hitFlash / 0.2) * 0.65;
    } else {
      rig.jacketMat.emissive.setHex(0x000000);
      rig.jacketMat.emissiveIntensity = 0;
    }

    const k = Math.min(1, dt * 16);
    rig.pelvis.position.y += (pelvisY - rig.pelvis.position.y) * k;
    rig.pelvis.rotation.z += (pelvisRoll - rig.pelvis.rotation.z) * k;
    rig.torso.rotation.x += (torsoPitch - rig.torso.rotation.x) * k;
    rig.torso.rotation.y += (torsoYaw - rig.torso.rotation.y) * k;
    rig.headPivot.rotation.y += (headYaw - rig.headPivot.rotation.y) * k;
    rig.headPivot.rotation.x += (headPitch - rig.headPivot.rotation.x) * k;

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

  updateFPSViewmodel(game, dt) {
    const lp = game.localPlayer;
    const isFPS = game.viewMode === "fps" && lp.alive && !game.scoped;
    this.fpsRoot.visible = isFPS;
    if (!isFPS) return;

    const wid = lp.weapon;
    const isMelee = wid === "fists" || wid === "knuckles";
    const rec = lp.recoil || 0;
    const bob = lp.moveSpeed > 0.35 && lp.y <= 0.05 ? Math.sin(lp.walkPhase) * 0.016 : 0;
    const bobX = lp.moveSpeed > 0.35 && lp.y <= 0.05 ? Math.cos(lp.walkPhase * 0.5) * 0.012 : 0;

    // Smooth mouse sway
    const yawDelta = angleDiff(this.prevCamYaw, game.camYaw);
    this.prevCamYaw = game.camYaw;
    this.camYawSway += (Math.max(-0.08, Math.min(0.08, yawDelta * 1.4)) - this.camYawSway) * Math.min(1, dt * 12);

    this.fpsLeftHand.visible = isMelee;
    this.fpsRightHand.visible = isMelee;

    for (const [id, wm] of Object.entries(this.fpsWeapons)) {
      wm.group.visible = id === wid;
      if (id === "minigun" && wm.barrelsGroup && id === wid) {
        wm.barrelsGroup.rotation.z += (lp.barrelSpin || 0) * dt;
      }
      if (id === "rpg" && wm.warhead && id === wid) {
        wm.warhead.visible = (lp.reloadingTimer || 0) <= 0;
      }
    }

    if (isMelee) {
      let rPunch = 0, lPunch = 0;
      if ((lp.attackTimer || 0) > 0) {
        const p = 1 - lp.attackTimer / (lp.attackDuration || 0.34);
        const s = Math.sin(Math.min(1, p * 1.5) * Math.PI);
        if (lp.attackCombo === 0 || wid === "knuckles") rPunch = s;
        else lPunch = s;
      }
      this.fpsRightHand.position.set(0.24 - rPunch * 0.14 + this.camYawSway, -0.24 + bob + rPunch * 0.08, -0.40 - rPunch * 0.28);
      this.fpsLeftHand.position.set(-0.24 + lPunch * 0.14 + this.camYawSway, -0.24 - bob + lPunch * 0.08, -0.40 - lPunch * 0.28);
    } else {
      const reloadDip = (lp.reloadingTimer || 0) > 0 ? -0.18 : 0;
      const basePos = wid === "glock"
        ? [0.22, -0.20, -0.42]
        : wid === "minigun"
        ? [0.26, -0.32, -0.52]
        : wid === "rpg"
        ? [0.24, -0.16, -0.32]
        : [0.22, -0.21, -0.42]; // ak74, awp

      this.fpsWeaponHolder.position.set(
        basePos[0] + bobX + this.camYawSway,
        basePos[1] + bob + reloadDip - rec * 0.015,
        basePos[2] + rec * 0.09
      );
      this.fpsWeaponHolder.rotation.set(rec * 0.16 + reloadDip * 1.4, Math.PI, 0);
    }
  }

  spawnTracer(ox, oy, oz, ex, ey, ez) {
    const pts = [new THREE.Vector3(ox, oy, oz), new THREE.Vector3(ex, ey, ez)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe49e, transparent: true, opacity: 0.78 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, age: 0, maxAge: 0.065 });
  }

  spawnMuzzleFlash(x, y, z, scale = 1) {
    const geo = new THREE.SphereGeometry(0.12 * scale, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd269, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.muzzleFlashes.push({ mesh, mat, age: 0, maxAge: 0.05 });
  }

  spawnExplosion(x, y, z) {
    const fireball = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xff7b24, transparent: true, opacity: 0.92 })
    );
    fireball.position.set(x, Math.max(0.5, y), z);
    this.scene.add(fireball);
    this.explosions.push({ mesh: fireball, mat: fireball.material, age: 0, maxAge: 0.55 });
    this.spawnImpactParticles(x, Math.max(0.5, y), z, 0xffaa33, 24);
    this.spawnImpactParticles(x, Math.max(0.5, y), z, 0x333333, 18);
  }

  spawnImpactParticles(x, y, z, colorHex, count = 10) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const spd = 2.5 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh, mat,
        vx: Math.cos(a) * spd,
        vy: 2.0 + Math.random() * 6.5,
        vz: Math.sin(a) * spd,
        age: 0,
        maxAge: 0.30 + Math.random() * 0.30
      });
    }
  }

  handleEvents(events, game, sound) {
    for (const ev of events) {
      if (ev.type === "swing") {
        if (sound) sound.playSwing(ev.heavy);
      } else if (ev.type === "shot") {
        let mx = ev.ox, my = ev.oy, mz = ev.oz;
        if (ev.id === game.localId && game.viewMode === "fps" && !game.scoped) {
          const wm = this.fpsWeapons[ev.weaponId];
          if (wm && wm.muzzle) {
            const wp = new THREE.Vector3();
            wm.muzzle.getWorldPosition(wp);
            mx = wp.x; my = wp.y; mz = wp.z;
          }
        } else {
          const rig = this.playerMeshes.get(ev.id);
          const wm = rig && rig.weapons[ev.weaponId];
          if (wm && wm.muzzle) {
            const wp = new THREE.Vector3();
            wm.muzzle.getWorldPosition(wp);
            mx = wp.x; my = wp.y; mz = wp.z;
          }
        }
        this.spawnMuzzleFlash(mx, my, mz, ev.weaponId === "awp" ? 1.5 : 1.0);
        this.spawnTracer(mx, my, mz, ev.ex, ev.ey, ev.ez);
        if (ev.hitWall) this.spawnImpactParticles(ev.ex, ev.ey, ev.ez, 0xc9c6be, 8);
        this.shakeIntensity = Math.max(this.shakeIntensity, ev.weaponId === "awp" ? 0.18 : 0.06);
        if (sound) sound.playWeaponFire(ev.weaponId);
      } else if (ev.type === "rpg_fire") {
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.22);
        if (sound) sound.playWeaponFire("rpg");
      } else if (ev.type === "explosion") {
        this.spawnExplosion(ev.x, ev.y, ev.z);
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.55);
        if (sound) sound.playExplosion();
      } else if (ev.type === "reload") {
        if (sound) sound.playReload();
      } else if (ev.type === "hit") {
        this.spawnImpactParticles(ev.x, ev.y, ev.z, 0xb8222a, ev.heavy ? 14 : 8);
        if (sound) sound.playHit(ev.heavy);
      } else if (ev.type === "death") {
        const rag = new RagdollInstance(this.scene, { x: ev.x, y: ev.y, z: ev.z }, ev.angle || 0, ev.color, ev.impulse);
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
    this.zoom = Math.max(0.65, Math.min(1.5, this.zoom + delta));
  }

  render(game, dt = 0.016, sound = null) {
    this.time += dt;
    this.handleEvents(game.consumeEvents(), game, sound);

    // Sync players
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
      const hideLocalInFPS = id === game.localId && (game.viewMode === "fps" || game.scoped);
      rig.root.visible = player.alive !== false && !hideLocalInFPS;
      if (rig.root.visible) {
        rig.root.position.set(player.x, player.y || 0, player.z);
        rig.root.rotation.y = player.angle || 0;
        this.animateRig(rig, player, dt);
      }
    }

    // Sync flying RPG rockets
    const activeRocketIds = new Set();
    for (const r of game.rockets) {
      activeRocketIds.add(r.id);
      let mesh = this.rocketMeshes.get(r.id);
      if (!mesh) {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.48, 8),
          new THREE.MeshStandardMaterial({ color: 0x3d4d34, roughness: 0.5 })
        );
        body.rotation.x = Math.PI / 2;
        const flame = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffaa22 })
        );
        flame.position.z = -0.28;
        mesh.add(body, flame);
        this.scene.add(mesh);
        this.rocketMeshes.set(r.id, mesh);
      }
      mesh.position.set(r.x, r.y, r.z);
      mesh.lookAt(r.x + r.vx, r.y + r.vy, r.z + r.vz);
      if (Math.random() < 0.7) {
        this.spawnImpactParticles(r.x, r.y, r.z, 0xdddddd, 1);
      }
    }
    for (const [rid, mesh] of this.rocketMeshes.entries()) {
      if (!activeRocketIds.has(rid)) {
        this.scene.remove(mesh);
        this.rocketMeshes.delete(rid);
      }
    }

    // Update ragdolls, tracers, muzzle flashes, explosions, particles
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      if (!this.ragdolls[i].update(dt)) {
        this.ragdolls[i].dispose();
        this.ragdolls.splice(i, 1);
      }
    }
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
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;
      const t = ex.age / ex.maxAge;
      ex.mesh.scale.setScalar(1 + t * 8.5);
      ex.mat.opacity = Math.max(0, (1 - t) * 0.9);
      if (ex.age >= ex.maxAge) {
        this.scene.remove(ex.mesh);
        ex.mesh.geometry.dispose();
        ex.mat.dispose();
        this.explosions.splice(i, 1);
      }
    }
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

    // Center shadow frustum on player
    const lp = game.localPlayer;
    if (this.sunLight) {
      this.sunLight.position.set(lp.x + 45, 72, lp.z + 32);
      this.sunLight.target.position.set(lp.x, 0, lp.z);
    }

    // Dynamic FOV (AWP sniper scope zoom vs normal)
    const targetFov = game.scoped ? 18 : (game.viewMode === "fps" ? 74 : 58);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 16);
      this.camera.updateProjectionMatrix();
    }

    // Camera positioning: 1st-Person vs 3rd-Person with PADDED anti-clipping collision
    const yaw = game.camYaw;
    const pitch = game.camPitch;
    const cosP = Math.cos(pitch);
    const backX = Math.sin(yaw) * cosP;
    const backY = Math.sin(pitch);
    const backZ = Math.cos(yaw) * cosP;

    let sx = 0, sy = 0;
    if (this.shakeIntensity > 0.004) {
      sx = (Math.random() - 0.5) * this.shakeIntensity;
      sy = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.exp(-16 * dt);
    }

    if (game.viewMode === "fps" || game.scoped) {
      const eyeX = lp.x;
      const eyeY = (lp.y || 0) + 1.66;
      const eyeZ = lp.z;
      this.camera.position.set(eyeX + sx * 0.25, eyeY + sy * 0.25, eyeZ);
      this.camera.lookAt(eyeX - backX * 20, eyeY - backY * 20, eyeZ - backZ * 20);
    } else {
      const hasGun = lp.weapon !== "fists" && lp.weapon !== "knuckles";
      const desiredDist = (hasGun ? 3.8 : 4.7) * this.zoom;
      const shoulder = hasGun ? 0.48 : 0.28;

      // Cast first from character center to shoulder pivot so pivot itself never enters a wall!
      const centerX = lp.x;
      const centerY = (lp.y || 0) + 1.56;
      const centerZ = lp.z;
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const safeShoulder = Math.min(
        shoulder,
        raycastCity(centerX, centerY, centerZ, rightX, 0, rightZ, shoulder, 0.32)
      );

      const pivotX = centerX + rightX * safeShoulder;
      const pivotY = centerY;
      const pivotZ = centerZ + rightZ * safeShoulder;

      // Padded AABB raycast (0.48m padding keeps camera near-plane cleanly outside all walls & corners)
      const safeDist = Math.max(
        0.55,
        raycastCity(pivotX, pivotY, pivotZ, backX, backY, backZ, desiredDist, 0.48)
      );

      // Snap inward IMMEDIATELY when blocked so camera NEVER clips behind walls; ease smoothly back out
      if (safeDist < this.camDistCurrent) {
        this.camDistCurrent = safeDist;
      } else {
        this.camDistCurrent += (safeDist - this.camDistCurrent) * Math.min(1, dt * 10);
      }

      const camX = pivotX + backX * this.camDistCurrent;
      const camY = Math.max(0.55, pivotY + backY * this.camDistCurrent);
      const camZ = pivotZ + backZ * this.camDistCurrent;

      this.camera.position.set(camX + sx, camY + sy, camZ);
      this.camera.lookAt(pivotX - backX * 16, pivotY - backY * 16, pivotZ - backZ * 16);
    }

    this.updateFPSViewmodel(game, dt);
    this.renderer.render(this.scene, this.camera);
  }
}
