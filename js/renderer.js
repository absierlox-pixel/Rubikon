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
import { createVehicleMesh, updateVehicleMesh, VEHICLE_TYPES } from "./vehicles.js";

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
    this.vehicleMeshes = new Map();
    this.rocketMeshes = new Map();
    this.ragdolls = [];
    this.particles = [];
    this.smokeParticles = [];
    this.debris = [];
    this.shockwaves = [];
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

    // Zebra crosswalks at main intersections
    const crossGeoH = new THREE.PlaneGeometry(0.55, 2.8);
    const crossGeoV = new THREE.PlaneGeometry(2.8, 0.55);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xe6e2d8 });
    for (const rx of roadCoords) {
      for (const rz of roadCoords) {
        for (let s = -4.5; s <= 4.5; s += 1.5) {
          for (const side of [-8.2, 8.2]) {
            const ch = new THREE.Mesh(crossGeoH, crossMat);
            ch.rotation.x = -Math.PI / 2;
            ch.position.set(rx + s, 0.022, rz + side);
            this.scene.add(ch);

            const cv = new THREE.Mesh(crossGeoV, crossMat);
            cv.rotation.x = -Math.PI / 2;
            cv.position.set(rx + side, 0.022, rz + s);
            this.scene.add(cv);
          }
        }
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
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6, metalness: 0.25 });

    // Detailed Left & Right FPS hands (sleeved forearm + cuff + palm + fingers + thumb)
    const makeFpsHand = (side) => {
      const g = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.066, 0.42, 12), sleeveMat);
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.25;
      g.add(arm);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 12), cuffMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = 0.055;
      g.add(cuff);

      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.068, 0.092), skinMat);
      palm.position.set(0, -0.005, -0.01);
      g.add(palm);

      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.052, 0.065), skinMat);
      fingers.position.set(0, 0.005, -0.068);
      fingers.rotation.x = 0.38;
      g.add(fingers);

      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.032, 0.056), skinMat);
      thumb.position.set(-side * 0.048, 0.018, -0.032);
      thumb.rotation.y = side * 0.35;
      g.add(thumb);

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

  // Ultra-detailed layered humanoid rig with anatomical joints, sculpted face/hair, sneakers & weapon mounts
  createPlayerMesh(player) {
    const root = new THREE.Group();

    const jacketMat = new THREE.MeshStandardMaterial({
      map: this.getFabricTexture(player.color),
      roughness: 0.74,
      metalness: 0.06
    });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.85, metalness: 0.02 });
    const pantsMat = new THREE.MeshStandardMaterial({
      map: this.denimTex,
      roughness: 0.84,
      metalness: 0.04
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe4b896, roughness: 0.64, metalness: 0.02 });
    const faceMat = new THREE.MeshStandardMaterial({ map: this.faceTex, roughness: 0.64, metalness: 0.02 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x201914, roughness: 0.82, metalness: 0.06 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.65, metalness: 0.16 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.88, metalness: 0.02 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xc5ccd6, roughness: 0.25, metalness: 0.88 });

    const pelvis = new THREE.Group();
    pelvis.position.y = 0.98;
    root.add(pelvis);

    const hipMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.195, 0.22, 14), pantsMat);
    hipMesh.scale.set(1.18, 1, 0.78);
    hipMesh.castShadow = true;
    pelvis.add(hipMesh);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.055, 14), bootMat);
    belt.scale.set(1.18, 1, 0.81);
    belt.position.y = 0.095;
    pelvis.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.058, 0.025), metalMat);
    buckle.position.set(0, 0.095, 0.162);
    pelvis.add(buckle);

    const torso = new THREE.Group();
    torso.position.y = 0.11;
    pelvis.add(torso);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.185, 0.25, 14), jacketMat);
    waist.scale.set(1.15, 1, 0.76);
    waist.position.y = 0.125;
    waist.castShadow = true;
    torso.add(waist);

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.205, 0.37, 16), jacketMat);
    chest.scale.set(1.17, 1, 0.75);
    chest.position.y = 0.41;
    chest.castShadow = true;
    torso.add(chest);

    // Undershirt V-neck & metallic zipper
    const undershirt = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.04), shirtMat);
    undershirt.position.set(0, 0.48, 0.165);
    torso.add(undershirt);

    const zipper = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.38, 0.02), metalMat);
    zipper.position.set(0, 0.28, 0.175);
    torso.add(zipper);

    // Chest pocket flaps & collar lapels
    for (const s of [-1, 1]) {
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.07, 0.022), jacketMat);
      pocket.position.set(s * 0.125, 0.41, 0.175);
      torso.add(pocket);

      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.03), jacketMat);
      lapel.position.set(s * 0.075, 0.52, 0.168);
      lapel.rotation.z = -s * 0.22;
      torso.add(lapel);
    }

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.145, 0.085, 14), jacketMat);
    collar.position.y = 0.605;
    torso.add(collar);

    const headPivot = new THREE.Group();
    headPivot.position.y = 0.625;
    torso.add(headPivot);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.084, 0.13, 12), skinMat);
    neck.position.y = 0.05;
    headPivot.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 22, 18), faceMat);
    head.position.y = 0.225;
    head.scale.set(0.90, 1.07, 0.96);
    head.rotation.y = -Math.PI / 2;
    head.castShadow = true;
    headPivot.add(head);

    // Nose bridge & Ears
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.062, 0.045), skinMat);
    nose.position.set(0, 0.215, 0.172);
    nose.rotation.x = -0.18;
    headPivot.add(nose);

    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), skinMat);
      ear.scale.set(0.45, 1.0, 0.72);
      ear.position.set(s * 0.168, 0.22, -0.01);
      headPivot.add(ear);
    }

    // Layered Hair (main cap + top volume + back fade)
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.195, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hair.position.set(0, 0.245, -0.018);
    hair.rotation.x = -0.24;
    hair.scale.set(0.92, 1.04, 0.99);
    hair.castShadow = true;
    headPivot.add(hair);

    const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.065, 0.22), hairMat);
    hairTop.position.set(0, 0.40, 0.01);
    hairTop.rotation.x = 0.12;
    headPivot.add(hairTop);

    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.295, 0.525, 0);
      torso.add(shoulder);

      const shCap = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 12), jacketMat);
      shCap.castShadow = true;
      shoulder.add(shCap);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.072, 0.30, 12), jacketMat);
      upper.position.y = -0.15;
      upper.castShadow = true;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.31;
      shoulder.add(elbow);

      elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.070, 10, 10), jacketMat));

      const sleeveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.066, 0.10, 12), jacketMat);
      sleeveCuff.position.y = -0.04;
      elbow.add(sleeveCuff);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.052, 0.26, 12), skinMat);
      forearm.position.y = -0.15;
      forearm.castShadow = true;
      elbow.add(forearm);

      // Wristwatch on left arm
      if (side < 0) {
        const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.024, 12), metalMat);
        watch.position.y = -0.255;
        elbow.add(watch);
      }

      const hand = new THREE.Group();
      hand.position.y = -0.30;
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.075, 0.082), skinMat);
      palm.castShadow = true;
      hand.add(palm);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.052, 0.048), skinMat);
      fingers.position.set(0, -0.042, 0.022);
      fingers.rotation.x = 0.35;
      hand.add(fingers);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.044, 0.026), skinMat);
      thumb.position.set(-side * 0.036, -0.015, 0.034);
      hand.add(thumb);
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
      hip.position.set(side * 0.138, -0.05, 0);
      pelvis.add(hip);

      hip.add(new THREE.Mesh(new THREE.SphereGeometry(0.104, 12, 12), pantsMat));

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.084, 0.42, 12), pantsMat);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      hip.add(thigh);

      const cargoPocket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.15, 0.13), pantsMat);
      cargoPocket.position.set(side * 0.095, -0.22, 0.01);
      hip.add(cargoPocket);

      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);

      knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 10), pantsMat));

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.064, 0.40, 12), pantsMat);
      shin.position.y = -0.20;
      shin.castShadow = true;
      knee.add(shin);

      const foot = new THREE.Group();
      foot.position.set(0, -0.40, 0);
      knee.add(foot);

      const bootUpper = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.085, 0.25), bootMat);
      bootUpper.position.set(0, -0.02, 0.045);
      bootUpper.castShadow = true;
      foot.add(bootUpper);

      const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.138, 0.035, 0.265), soleMat);
      bootSole.position.set(0, -0.072, 0.048);
      bootSole.castShadow = true;
      foot.add(bootSole);

      return { hip, knee, foot };
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

  // Full procedural bone animation: driving, directional stride, ankle pitch, reload phases, weapon poses
  animateRig(rig, player, dt, game = null) {
    const spd = player.moveSpeed || 0;
    const isMoving = spd > 0.35;
    const isSprinting = Boolean(player.sprinting && isMoving);
    const turningInPlace = !isMoving && (player.turnStepTimer || 0) > 0;
    const phase = player.walkPhase || 0;
    const inAir = (player.y || 0) > 0.08;
    const drivingCar = player.drivingVehicleId && game
      ? game.vehicles.find((c) => c.id === player.drivingVehicleId)
      : null;
    const wid = drivingCar ? "fists" : (player.weapon || "fists");
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
    let pelvisYaw = 0;
    let torsoPitch = 0;
    let torsoYaw = aimDelta * 0.55;
    let headYaw = aimDelta * 0.45;
    let headPitch = aimPitch * 0.65;

    let lHipX = 0, rHipX = 0, lKneeX = 0, rKneeX = 0, lFootX = 0, rFootX = 0;
    let lShX = 0, lShZ = 0.08, lElbX = -0.18;
    let rShX = 0, rShZ = -0.08, rElbX = -0.18;

    if (drivingCar) {
      const steer = drivingCar.steerAngle || 0;
      pelvisY = 0.52;
      pelvisRoll = -(drivingCar.roll || 0) * 0.6;
      torsoPitch = -0.14;
      torsoYaw = 0;
      headYaw = steer * 0.55;
      headPitch = 0.04;
      lHipX = -1.32; rHipX = -1.32;
      lKneeX = 1.38; rKneeX = 1.38;
      lFootX = 0.25; rFootX = 0.25;
      lShX = -1.05 - steer * 0.35; lShZ = 0.14; lElbX = -0.58;
      rShX = -1.05 + steer * 0.35; rShZ = -0.14; rElbX = -0.58;
    } else if (inAir) {
      lHipX = -0.48; rHipX = 0.24;
      lKneeX = 0.85; rKneeX = 0.42;
      lFootX = 0.25; rFootX = 0.15;
      torsoPitch = 0.08;
    } else if (isSprinting) {
      const s = Math.sin(phase);
      const c = Math.cos(phase);
      pelvisY = 0.95 + Math.abs(c) * 0.09;
      pelvisYaw = s * 0.09;
      torsoPitch = 0.24;
      torsoYaw += -s * 0.16;
      lHipX = s * 0.92;
      rHipX = -s * 0.92;
      lKneeX = Math.max(0, -c) * 1.25 + 0.12;
      rKneeX = Math.max(0, c) * 1.25 + 0.12;
      lFootX = -s * 0.32;
      rFootX = s * 0.32;
      lShX = -s * 0.95;
      rShX = s * 0.95;
      lElbX = -0.85 - Math.max(0, s) * 0.65;
      rElbX = -0.85 - Math.max(0, -s) * 0.65;
    } else if (isMoving) {
      const stride = Math.min(1, spd / CONFIG.WALK_SPEED);
      const dirSign = (player.forwardLocal || 1) < -0.2 ? -1 : 1;
      const s = Math.sin(phase) * dirSign;
      const c = Math.cos(phase);
      pelvisY = 0.98 + Math.abs(c) * 0.04 * stride;
      pelvisYaw = s * 0.05 * stride;
      torsoPitch = 0.05 * stride * dirSign;
      torsoYaw += -s * 0.07 * stride;
      lHipX = s * 0.54 * stride;
      rHipX = -s * 0.54 * stride;
      lKneeX = Math.max(0, -c) * 0.72 * stride + 0.05;
      rKneeX = Math.max(0, c) * 0.72 * stride + 0.05;
      lFootX = -s * 0.22 * stride;
      rFootX = s * 0.22 * stride;
      lShX = -s * 0.45 * stride;
      rShX = s * 0.45 * stride;
      lElbX = -0.22 - Math.max(0, s) * 0.34 * stride;
      rElbX = -0.22 - Math.max(0, -s) * 0.34 * stride;
    } else if (turningInPlace) {
      const s = Math.sin(phase);
      pelvisY = 0.97 + Math.abs(s) * 0.025;
      lHipX = Math.min(0, -s) * 0.32;
      rHipX = Math.min(0, s) * 0.32;
      lKneeX = Math.max(0, s) * 0.52;
      rKneeX = Math.max(0, -s) * 0.52;
    } else {
      // Subtle idle breathing & weight shift
      pelvisY = 0.98 + breath * 0.012;
      torsoPitch = 0.02 + breath * 0.012;
      headYaw += Math.sin(this.time * 0.7 + (player.z || 0)) * 0.05;
      lShX = -0.05 + breath * 0.02;
      rShX = -0.05 - breath * 0.02;
      lElbX = -0.18; rElbX = -0.18;
    }

    // Weapon-specific bone poses & exact hand alignment
    if (!drivingCar) {
      if (wid === "glock") {
        rig.weaponMount.position.set(0.18, 0.46, 0.52 - rec * 0.04);
        rig.weaponMount.rotation.set(aimPitch - rec * 0.25, 0, 0);
        rShX = -1.42 + aimPitch - rec * 0.18; rShZ = -0.12; rElbX = -0.18;
        lShX = -1.38 + aimPitch - rec * 0.14; lShZ = 0.42;  lElbX = -0.24;
      } else if (wid === "ak74" || wid === "awp") {
        rig.weaponMount.position.set(0.16, 0.42 + rec * 0.015, 0.36 - rec * 0.07);
        rig.weaponMount.rotation.set(aimPitch - rec * 0.12, 0, 0);
        torsoYaw = aimDelta * 0.7 - 0.16;
        rShX = -1.10 + aimPitch - rec * 0.12; rShZ = -0.18; rElbX = -0.95;
        lShX = -1.25 + aimPitch - rec * 0.10; lShZ = 0.48;  lElbX = -0.68;
      } else if (wid === "minigun") {
        rig.weaponMount.position.set(0.14, 0.12, 0.38 - rec * 0.03);
        rig.weaponMount.rotation.set(aimPitch * 0.6, 0, 0);
        torsoPitch += 0.08;
        rShX = -0.58; rShZ = -0.15; rElbX = -0.82;
        lShX = -0.82; lShZ = 0.38;  lElbX = -0.65;
      } else if (wid === "rpg") {
        rig.weaponMount.position.set(0.24, 0.62, 0.18 - rec * 0.10);
        rig.weaponMount.rotation.set(aimPitch - rec * 0.15, 0, 0);
        rShX = -1.55 + aimPitch; rShZ = -0.05; rElbX = -1.15;
        lShX = -1.50 + aimPitch; lShZ = 0.46;  lElbX = -0.85;
      } else if ((player.attackTimer || 0) > 0) {
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

      // Multi-phase reload animation (tilt rifle + left hand reaches down to mag well)
      if ((player.reloadingTimer || 0) > 0) {
        const relWave = Math.sin(this.time * 9.0) * 0.15;
        rig.weaponMount.rotation.x += 0.42;
        rig.weaponMount.rotation.z = 0.25;
        rig.weaponMount.position.y -= 0.08;
        lShX = -0.75 + relWave;
        lShZ = 0.25;
        lElbX = -1.15;
      } else {
        rig.weaponMount.rotation.z = 0;
      }
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
    rig.pelvis.rotation.y += (pelvisYaw - rig.pelvis.rotation.y) * k;
    rig.torso.rotation.x += (torsoPitch - rig.torso.rotation.x) * k;
    rig.torso.rotation.y += (torsoYaw - rig.torso.rotation.y) * k;
    rig.headPivot.rotation.y += (headYaw - rig.headPivot.rotation.y) * k;
    rig.headPivot.rotation.x += (headPitch - rig.headPivot.rotation.x) * k;

    rig.leftLeg.hip.rotation.x += (lHipX - rig.leftLeg.hip.rotation.x) * k;
    rig.rightLeg.hip.rotation.x += (rHipX - rig.rightLeg.hip.rotation.x) * k;
    rig.leftLeg.knee.rotation.x += (lKneeX - rig.leftLeg.knee.rotation.x) * k;
    rig.rightLeg.knee.rotation.x += (rKneeX - rig.rightLeg.knee.rotation.x) * k;
    rig.leftLeg.foot.rotation.x += (lFootX - rig.leftLeg.foot.rotation.x) * k;
    rig.rightLeg.foot.rotation.x += (rFootX - rig.rightLeg.foot.rotation.x) * k;

    rig.leftArm.shoulder.rotation.x += (lShX - rig.leftArm.shoulder.rotation.x) * k;
    rig.leftArm.shoulder.rotation.z += (lShZ - rig.leftArm.shoulder.rotation.z) * k;
    rig.leftArm.elbow.rotation.x += (lElbX - rig.leftArm.elbow.rotation.x) * k;

    rig.rightArm.shoulder.rotation.x += (rShX - rig.rightArm.shoulder.rotation.x) * k;
    rig.rightArm.shoulder.rotation.z += (rShZ - rig.rightArm.shoulder.rotation.z) * k;
    rig.rightArm.elbow.rotation.x += (rElbX - rig.rightArm.elbow.rotation.x) * k;
  }

  updateFPSViewmodel(game, dt) {
    const lp = game.localPlayer;
    const isFPS = game.viewMode === "fps" && lp.alive && !game.scoped && !lp.drivingVehicleId;
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

    // Expanding shockwave ring
    const ringGeo = new THREE.RingGeometry(0.6, 1.15, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb35c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.14, z);
    this.scene.add(ring);
    this.shockwaves.push({ mesh: ring, mat: ringMat, age: 0, maxAge: 0.45 });

    this.spawnImpactParticles(x, Math.max(0.5, y), z, 0xffaa33, 24);
    this.spawnImpactParticles(x, Math.max(0.5, y), z, 0x333333, 18);
  }

  spawnSmokePuff(x, y, z, colorHex = 0x555555, scale = 0.28) {
    const geo = new THREE.DodecahedronGeometry(scale, 0);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.55 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25);
    this.scene.add(mesh);
    this.smokeParticles.push({
      mesh, mat,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.4 + Math.random() * 1.3,
      vz: (Math.random() - 0.5) * 0.8,
      age: 0,
      maxAge: 0.75 + Math.random() * 0.45
    });
  }

  spawnCarPartDebris(x, y, z, colorHex = "#444") {
    const geo = new THREE.BoxGeometry(0.65, 0.08, 0.55);
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, metalness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const spd = 4 + Math.random() * 7;
    this.debris.push({
      mesh, mat,
      vx: Math.cos(a) * spd,
      vy: 5.5 + Math.random() * 5.0,
      vz: Math.sin(a) * spd,
      rx: (Math.random() - 0.5) * 14,
      ry: (Math.random() - 0.5) * 14,
      age: 0,
      maxAge: 3.5
    });
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
      } else if (ev.type === "car_crash") {
        this.spawnImpactParticles(ev.x, ev.y, ev.z, 0xffcc55, Math.round(6 + (ev.intensity || 0.5) * 10));
        this.shakeIntensity = Math.max(this.shakeIntensity, (ev.intensity || 0.5) * 0.28);
        if (sound && sound.playCarCrash) sound.playCarCrash(ev.intensity || 0.5);
      } else if (ev.type === "car_smoke") {
        this.spawnSmokePuff(ev.x, ev.y, ev.z, ev.dark ? 0x242424 : 0xcccccc, ev.dark ? 0.34 : 0.25);
      } else if (ev.type === "tire_smoke") {
        this.spawnSmokePuff(ev.x, ev.y, ev.z, 0xd8dce0, 0.26);
      } else if (ev.type === "glass_shatter") {
        this.spawnImpactParticles(ev.x, ev.y, ev.z, 0xcceeff, 14);
        if (sound && sound.playGlassShatter) sound.playGlassShatter();
      } else if (ev.type === "car_part") {
        this.spawnCarPartDebris(ev.x, ev.y, ev.z, ev.color);
      } else if (ev.type === "car_horn") {
        if (sound && sound.playHorn) sound.playHorn();
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
        this.animateRig(rig, player, dt, game);
      }
    }

    // Sync vehicles
    if (game.vehicles) {
      for (const v of game.vehicles) {
        let vm = this.vehicleMeshes.get(v.id);
        if (!vm) {
          vm = createVehicleMesh(v);
          this.scene.add(vm.root);
          this.vehicleMeshes.set(v.id, vm);
        }
        updateVehicleMesh(vm, v);
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
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const t = sw.age / sw.maxAge;
      sw.mesh.scale.setScalar(1 + t * 11.5);
      sw.mat.opacity = Math.max(0, (1 - t) * 0.72);
      if (sw.age >= sw.maxAge) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        this.shockwaves.splice(i, 1);
      }
    }
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const sp = this.smokeParticles[i];
      sp.age += dt;
      const t = sp.age / sp.maxAge;
      sp.mesh.position.x += sp.vx * dt;
      sp.mesh.position.y += sp.vy * dt;
      sp.mesh.position.z += sp.vz * dt;
      sp.mesh.scale.setScalar(1 + t * 2.4);
      sp.mat.opacity = Math.max(0, (1 - t) * 0.52);
      if (sp.age >= sp.maxAge) {
        this.scene.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        sp.mat.dispose();
        this.smokeParticles.splice(i, 1);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const db = this.debris[i];
      db.age += dt;
      db.vy -= 18 * dt;
      db.mesh.position.x += db.vx * dt;
      db.mesh.position.y += db.vy * dt;
      db.mesh.position.z += db.vz * dt;
      if (db.mesh.position.y < 0.06) {
        db.mesh.position.y = 0.06;
        db.vy *= -0.35;
        db.vx *= 0.65;
        db.vz *= 0.65;
      }
      db.mesh.rotation.x += db.rx * dt;
      db.mesh.rotation.y += db.ry * dt;
      if (db.age >= db.maxAge) {
        this.scene.remove(db.mesh);
        db.mesh.geometry.dispose();
        db.mat.dispose();
        this.debris.splice(i, 1);
      }
    }

    // Center shadow frustum on player
    const lp = game.localPlayer;
    if (this.sunLight) {
      this.sunLight.position.set(lp.x + 45, 72, lp.z + 32);
      this.sunLight.target.position.set(lp.x, 0, lp.z);
    }

    const drivingCar = lp.drivingVehicleId && game.vehicles
      ? game.vehicles.find((c) => c.id === lp.drivingVehicleId)
      : null;

    // Dynamic FOV (AWP sniper scope zoom vs driving speed vs normal)
    const speedFovBoost = drivingCar ? Math.min(14, (drivingCar.speed || 0) * 0.38) : 0;
    const targetFov = game.scoped ? 18 : (game.viewMode === "fps" ? 74 : 58 + speedFovBoost);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }

    // Camera positioning: Driving vs 1st-Person vs 3rd-Person with PADDED anti-clipping collision
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

    if (drivingCar) {
      if (game.viewMode === "fps") {
        const sinA = Math.sin(drivingCar.angle);
        const cosA = Math.cos(drivingCar.angle);
        const eyeX = drivingCar.x - 0.40 * cosA + 0.15 * sinA;
        const eyeY = drivingCar.y + 1.24;
        const eyeZ = drivingCar.z + 0.40 * sinA + 0.15 * cosA;
        this.camera.position.set(eyeX + sx * 0.25, eyeY + sy * 0.25, eyeZ);
        this.camera.lookAt(eyeX - backX * 20, eyeY - backY * 20, eyeZ - backZ * 20);
      } else {
        const desiredDist = 7.4 * this.zoom;
        const pivotX = drivingCar.x;
        const pivotY = drivingCar.y + 1.55;
        const pivotZ = drivingCar.z;
        const safeDist = Math.max(
          1.5,
          raycastCity(pivotX, pivotY, pivotZ, backX, backY, backZ, desiredDist, 0.55)
        );
        if (safeDist < this.camDistCurrent) {
          this.camDistCurrent = safeDist;
        } else {
          this.camDistCurrent += (safeDist - this.camDistCurrent) * Math.min(1, dt * 10);
        }
        const camX = pivotX + backX * this.camDistCurrent;
        const camY = Math.max(0.75, pivotY + backY * this.camDistCurrent);
        const camZ = pivotZ + backZ * this.camDistCurrent;
        this.camera.position.set(camX + sx, camY + sy, camZ);
        this.camera.lookAt(pivotX - backX * 14, pivotY - backY * 14, pivotZ - backZ * 14);
      }
    } else if (game.viewMode === "fps" || game.scoped) {
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
