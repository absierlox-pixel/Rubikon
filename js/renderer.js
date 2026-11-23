import { CONFIG } from "./config.js";
import { RagdollInstance } from "./ragdoll.js";

function createFloorTexture() {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#1b1f29";
  ctx.fillRect(0, 0, size, size);

  // Stone/concrete tiles with subtle tonal variation
  const tiles = 4;
  const step = size / tiles;
  for (let gx = 0; gx < tiles; gx++) {
    for (let gy = 0; gy < tiles; gy++) {
      const shade = 25 + ((gx * 7 + gy * 13) % 9);
      ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 12})`;
      ctx.fillRect(gx * step + 3, gy * step + 3, step - 6, step - 6);
    }
  }

  // Subtle surface grit
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const a = Math.random() * 0.06;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.4})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle metallic seams
  ctx.strokeStyle = "rgba(88, 101, 242, 0.14)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = 8;
  return tex;
}

function createSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#090c18");
  grad.addColorStop(0.45, "#151b33");
  grad.addColorStop(0.72, "#2b2847");
  grad.addColorStop(0.88, "#473152");
  grad.addColorStop(1.0, "#141620");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Subtle stars in upper dome
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 130;
    const r = Math.random() * 1.1;
    ctx.fillStyle = `rgba(220, 232, 255, ${0.25 + Math.random() * 0.65})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(c);
}

export class PlaneRenderer3D {
  constructor(canvas, overlayCanvas) {
    this.canvas = canvas;
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext("2d");
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.zoom = 1;
    this.time = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#101422");
    this.scene.fog = new THREE.FogExp2("#131829", 0.0115);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.15, 320);
    this.camera.position.set(0, 5, 10);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    if (THREE.sRGBEncoding) {
      this.renderer.outputEncoding = THREE.sRGBEncoding;
    }

    this.playerMeshes = new Map();
    this.ragdolls = [];
    this.particles = [];
    this.slashArcs = [];
    this.floatingTexts = [];
    this.shakeIntensity = 0;
    this.camPos = new THREE.Vector3(0, 5, 10);
    this.camLook = new THREE.Vector3(0, 2, 0);

    this.buildWorld();
    this.resize();
  }

  buildWorld() {
    // Sky dome
    const skyGeo = new THREE.SphereGeometry(220, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createSkyTexture(),
      side: THREE.BackSide,
      fog: false
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Three-point + hemisphere lighting
    const hemi = new THREE.HemisphereLight(0x88a8ff, 0x262030, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffead2, 1.35);
    sun.position.set(28, 48, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 140;
    const d = 42;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sunLight = sun;

    // Rim fill light for dramatic silhouettes
    const rimLight = new THREE.DirectionalLight(0x5865f2, 0.55);
    rimLight.position.set(-30, 18, -28);
    this.scene.add(rimLight);

    // Textured stone/concrete arena floor
    const floorTex = createFloorTexture();
    const floorGeo = new THREE.PlaneGeometry(CONFIG.WORLD_SIZE, CONFIG.WORLD_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.78,
      metalness: 0.16
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Central battle ring with glowing accent
    const ringGeo = new THREE.RingGeometry(9.2, 9.75, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x5865f2,
      emissive: 0x4654e8,
      emissiveIntensity: 1.1,
      side: THREE.DoubleSide,
      roughness: 0.3
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.scene.add(ring);

    const centerGlow = new THREE.PointLight(0x5865f2, 1.4, 24);
    centerGlow.position.set(0, 3.2, 0);
    this.scene.add(centerGlow);

    // Tactical arena pillars with glowing trim rings
    const pillarBodyMat = new THREE.MeshStandardMaterial({
      color: 0x262b38,
      roughness: 0.58,
      metalness: 0.35
    });
    const pillarCapMat = new THREE.MeshStandardMaterial({
      color: 0x191d26,
      roughness: 0.45,
      metalness: 0.55
    });
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0x6c7bff,
      emissive: 0x5865f2,
      emissiveIntensity: 1.25,
      roughness: 0.2
    });

    for (const p of CONFIG.PILLARS) {
      const pGroup = new THREE.Group();
      pGroup.position.set(p.x, 0, p.z);

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 0.88, p.r, p.h, 8),
        pillarBodyMat
      );
      shaft.position.y = p.h / 2;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pGroup.add(shaft);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 1.06, p.r * 1.12, 0.65, 8),
        pillarCapMat
      );
      base.position.y = 0.325;
      base.castShadow = true;
      base.receiveShadow = true;
      pGroup.add(base);

      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(p.r * 0.93, p.r * 0.93, 0.22, 8),
        neonMat
      );
      band.position.y = p.h * 0.72;
      pGroup.add(band);

      this.scene.add(pGroup);
    }

    // Perimeter energy barrier walls
    const half = CONFIG.WORLD_SIZE / 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1d212d,
      roughness: 0.65,
      metalness: 0.35
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xf23f43,
      emissive: 0xd92b30,
      emissiveIntensity: 1.0
    });

    const wallSpecs = [
      { x: 0, z: -half, sx: CONFIG.WORLD_SIZE, sz: 1.2 },
      { x: 0, z: half, sx: CONFIG.WORLD_SIZE, sz: 1.2 },
      { x: -half, z: 0, sx: 1.2, sz: CONFIG.WORLD_SIZE },
      { x: half, z: 0, sx: 1.2, sz: CONFIG.WORLD_SIZE }
    ];
    for (const w of wallSpecs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w.sx, 2.4, w.sz), wallMat);
      wall.position.set(w.x, 1.2, w.z);
      wall.receiveShadow = true;
      wall.castShadow = true;
      this.scene.add(wall);

      const rail = new THREE.Mesh(new THREE.BoxGeometry(w.sx, 0.16, w.sz), railMat);
      rail.position.set(w.x, 2.45, w.z);
      this.scene.add(rail);
    }

    // Floating ambient arena embers
    const emberCount = 140;
    const emberPos = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3] = (Math.random() - 0.5) * CONFIG.WORLD_SIZE * 0.85;
      emberPos[i * 3 + 1] = 0.6 + Math.random() * 14;
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * CONFIG.WORLD_SIZE * 0.85;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
    const emberMat = new THREE.PointsMaterial({
      color: 0x9aa8ff,
      size: 0.18,
      transparent: true,
      opacity: 0.55
    });
    this.embers = new THREE.Points(emberGeo, emberMat);
    this.scene.add(this.embers);
  }

  // Articulated 15-part humanoid rig
  createPlayerMesh(player) {
    const root = new THREE.Group();

    const jacketMat = new THREE.MeshStandardMaterial({
      color: player.color || "#5865f2",
      roughness: 0.48,
      metalness: 0.16
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d26,
      roughness: 0.52,
      metalness: 0.38
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x222633,
      roughness: 0.78,
      metalness: 0.08
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe8be9e,
      roughness: 0.62,
      metalness: 0.04
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x191a21,
      roughness: 0.72,
      metalness: 0.1
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x99bbff,
      emissiveIntensity: 0.55,
      roughness: 0.2
    });

    // Pelvis / Hips pivot
    const pelvis = new THREE.Group();
    pelvis.position.y = 1.02;
    root.add(pelvis);

    const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.27), pantsMat);
    hipMesh.castShadow = true;
    pelvis.add(hipMesh);

    const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.08, 0.29), trimMat);
    beltMesh.position.y = 0.09;
    pelvis.add(beltMesh);

    // Torso pivot
    const torso = new THREE.Group();
    torso.position.y = 0.12;
    pelvis.add(torso);

    const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.62, 0.30), jacketMat);
    chestMesh.position.y = 0.32;
    chestMesh.castShadow = true;
    chestMesh.receiveShadow = true;
    torso.add(chestMesh);

    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.38, 0.33), trimMat);
    vestMesh.position.y = 0.36;
    vestMesh.castShadow = true;
    torso.add(vestMesh);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.10, 12), trimMat);
    collar.position.y = 0.64;
    torso.add(collar);

    // Head pivot
    const headPivot = new THREE.Group();
    headPivot.position.y = 0.68;
    torso.add(headPivot);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.10, 0.12, 10), skinMat);
    neck.position.y = 0.05;
    headPivot.add(neck);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), skinMat);
    headMesh.position.y = 0.24;
    headMesh.scale.set(0.94, 1.06, 0.98);
    headMesh.castShadow = true;
    headPivot.add(headMesh);

    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.232, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
      hairMat
    );
    hairCap.position.set(0, 0.26, -0.01);
    hairCap.rotation.x = -0.18;
    hairCap.castShadow = true;
    headPivot.add(hairCap);

    // Stylized tactical visor / eyes
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.08), eyeMat);
    visor.position.set(0, 0.26, 0.185);
    headPivot.add(visor);

    // Helper for articulated arm
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.35, 0.54, 0);
      torso.add(shoulder);

      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10), trimMat);
      pad.castShadow = true;
      shoulder.add(pad);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.34, 10), jacketMat);
      upper.position.y = -0.18;
      upper.castShadow = true;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.35;
      shoulder.add(elbow);

      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.064, 0.32, 10), skinMat);
      forearm.position.y = -0.16;
      forearm.castShadow = true;
      elbow.add(forearm);

      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.13), trimMat);
      fist.position.y = -0.34;
      fist.castShadow = true;
      elbow.add(fist);

      return { shoulder, elbow, fist };
    };

    const leftArm = makeArm(-1);
    const rightArm = makeArm(1);

    // Helper for articulated leg
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.15, -0.06, 0);
      pelvis.add(hip);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.092, 0.44, 10), pantsMat);
      thigh.position.y = -0.22;
      thigh.castShadow = true;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.074, 0.42, 10), pantsMat);
      shin.position.y = -0.21;
      shin.castShadow = true;
      knee.add(shin);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.28), trimMat);
      boot.position.set(0, -0.45, 0.05);
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
      jacketMat,
      trimMat
    };
  }

  animateRig(rig, player, dt) {
    const spd = player.speedRatio || 0;
    const phase = player.walkPhase || 0;
    const inAir = (player.y || 0) > 0.08;
    const idleBreath = Math.sin(this.time * 2.6 + (player.x || 0));

    // Reset baseline
    let pelvisY = 1.02;
    let torsoPitch = 0;
    let torsoYaw = 0;
    let lHipX = 0, rHipX = 0, lKneeX = 0, rKneeX = 0;
    let lShX = 0, lShZ = 0.14, lElbX = -0.22;
    let rShX = 0, rShZ = -0.14, rElbX = -0.22;

    if (inAir) {
      // Airborne jump pose
      lHipX = -0.55;
      rHipX = 0.25;
      lKneeX = 0.85;
      rKneeX = 0.45;
      lShX = -0.9;
      rShX = -0.7;
      lElbX = -0.6;
      rElbX = -0.6;
      torsoPitch = 0.12;
    } else if (spd > 0.05) {
      // Walk / run cycle
      const amp = Math.min(1.15, 0.42 + spd * 0.65);
      const s = Math.sin(phase);
      const c = Math.cos(phase);

      pelvisY = 1.02 + Math.abs(c) * 0.08 * amp;
      torsoPitch = 0.08 + spd * 0.18;
      torsoYaw = -s * 0.14 * amp;

      lHipX = s * 0.85 * amp;
      rHipX = -s * 0.85 * amp;
      // Knees bend backward only (positive X rotation in Three.js)
      lKneeX = Math.max(0, -c) * 1.15 * amp + 0.08;
      rKneeX = Math.max(0, c) * 1.15 * amp + 0.08;

      lShX = -s * 0.78 * amp;
      rShX = s * 0.78 * amp;
      lElbX = -0.35 - Math.max(0, s) * 0.75 * amp;
      rElbX = -0.35 - Math.max(0, -s) * 0.75 * amp;
    } else {
      // Idle breathing & subtle combat stance
      pelvisY = 1.02 + idleBreath * 0.015;
      torsoPitch = 0.03 + idleBreath * 0.015;
      lShX = -0.18;
      rShX = -0.24;
      lElbX = -0.45;
      rElbX = -0.55;
    }

    // LMB Melee Attack Combo Override (blended cleanly onto upper body!)
    if ((player.attackTimer || 0) > 0) {
      const dur = player.attackDuration || 0.32;
      const p = 1 - player.attackTimer / dur; // 0 -> 1
      const strike = Math.sin(Math.min(1, p * 1.55) * Math.PI); // crisp punch peak
      const combo = player.attackCombo || 0;

      if (combo === 0) {
        // Combo 1: Right Straight Cross
        torsoYaw = -0.75 * strike;
        torsoPitch += 0.24 * strike;
        rShX = -1.65 * strike - 0.2;
        rShZ = -0.15;
        rElbX = -0.15 * (1 - strike) - 0.1;
        lShX = -0.55;
        lElbX = -1.25;
      } else if (combo === 1) {
        // Combo 2: Left Hook
        torsoYaw = 0.85 * strike;
        torsoPitch += 0.22 * strike;
        lShX = -1.45 * strike - 0.2;
        lShZ = 0.85 * strike + 0.2;
        lElbX = -0.95 * strike - 0.2;
        rShX = -0.45;
        rElbX = -1.15;
      } else {
        // Combo 3: Heavy Right Uppercut / Haymaker
        const windup = p < 0.28 ? -(p / 0.28) : Math.sin(((p - 0.28) / 0.72) * Math.PI);
        torsoYaw = -0.95 * windup;
        torsoPitch += -0.15 * windup + 0.2;
        rShX = windup < 0 ? 0.65 * -windup : -2.25 * windup;
        rShZ = -0.35 * Math.max(0, windup);
        rElbX = -0.65;
        lShX = -0.6;
        lElbX = -1.3;
      }
    }

    // Hit recoil
    if ((player.hitFlash || 0) > 0) {
      torsoPitch -= 0.32 * (player.hitFlash / 0.22);
      rig.jacketMat.emissive.setHex(0xff3344);
      rig.jacketMat.emissiveIntensity = (player.hitFlash / 0.22) * 1.1;
    } else {
      rig.jacketMat.emissive.setHex(0x000000);
      rig.jacketMat.emissiveIntensity = 0;
    }

    const lerpRate = Math.min(1, dt * 22);
    rig.pelvis.position.y += (pelvisY - rig.pelvis.position.y) * lerpRate;
    rig.torso.rotation.x += (torsoPitch - rig.torso.rotation.x) * lerpRate;
    rig.torso.rotation.y += (torsoYaw - rig.torso.rotation.y) * lerpRate;
    rig.headPivot.rotation.y += (-torsoYaw * 0.45 - rig.headPivot.rotation.y) * lerpRate;

    rig.leftLeg.hip.rotation.x += (lHipX - rig.leftLeg.hip.rotation.x) * lerpRate;
    rig.rightLeg.hip.rotation.x += (rHipX - rig.rightLeg.hip.rotation.x) * lerpRate;
    rig.leftLeg.knee.rotation.x += (lKneeX - rig.leftLeg.knee.rotation.x) * lerpRate;
    rig.rightLeg.knee.rotation.x += (rKneeX - rig.rightLeg.knee.rotation.x) * lerpRate;

    rig.leftArm.shoulder.rotation.x += (lShX - rig.leftArm.shoulder.rotation.x) * lerpRate;
    rig.leftArm.shoulder.rotation.z += (lShZ - rig.leftArm.shoulder.rotation.z) * lerpRate;
    rig.leftArm.elbow.rotation.x += (lElbX - rig.leftArm.elbow.rotation.x) * lerpRate;

    rig.rightArm.shoulder.rotation.x += (rShX - rig.rightArm.shoulder.rotation.x) * lerpRate;
    rig.rightArm.shoulder.rotation.z += (rShZ - rig.rightArm.shoulder.rotation.z) * lerpRate;
    rig.rightArm.elbow.rotation.x += (rElbX - rig.rightArm.elbow.rotation.x) * lerpRate;
  }

  spawnSlashArc(x, y, z, angle, combo) {
    const isHeavy = combo === 2;
    const geo = new THREE.RingGeometry(0.95, isHeavy ? 2.25 : 1.85, 22, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const mat = new THREE.MeshBasicMaterial({
      color: isHeavy ? 0xffb347 : 0x8ea2ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + Math.sin(angle) * 0.55, y, z + Math.cos(angle) * 0.55);
    mesh.rotation.order = "YXZ";
    mesh.rotation.y = angle - Math.PI / 2;
    mesh.rotation.x = Math.PI / 2 + (combo === 2 ? -0.55 : combo === 1 ? 0.22 : -0.18);
    this.scene.add(mesh);
    this.slashArcs.push({ mesh, mat, age: 0, maxAge: isHeavy ? 0.24 : 0.18 });
  }

  spawnHitSparks(x, y, z, heavy) {
    const count = heavy ? 20 : 12;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
      const mat = new THREE.MeshBasicMaterial({
        color: heavy ? (i % 2 === 0 ? 0xffaa33 : 0xff4455) : 0xffe08a,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      const speed = (heavy ? 7 : 4.5) + Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        mesh,
        mat,
        vx: Math.cos(a) * speed,
        vy: 2.5 + Math.random() * 5.5,
        vz: Math.sin(a) * speed,
        age: 0,
        maxAge: 0.35 + Math.random() * 0.28
      });
    }
  }

  handleEvents(events, sound) {
    for (const ev of events) {
      if (ev.type === "swing") {
        this.spawnSlashArc(ev.x, ev.y, ev.z, ev.angle, ev.combo);
        if (sound) sound.playSwing(ev.combo);
      } else if (ev.type === "hit") {
        this.spawnHitSparks(ev.x, ev.y, ev.z, ev.heavy);
        this.floatingTexts.push({
          x: ev.x + (Math.random() - 0.5) * 0.5,
          y: ev.y + 0.9,
          z: ev.z + (Math.random() - 0.5) * 0.5,
          text: ev.heavy ? `-${ev.damage}!` : `-${ev.damage}`,
          color: ev.heavy ? "#ffb347" : "#ff6b6b",
          age: 0,
          maxAge: 0.85
        });
        this.shakeIntensity = Math.max(this.shakeIntensity, ev.heavy ? 0.35 : 0.16);
        if (sound) sound.playHit(ev.heavy);
      } else if (ev.type === "death") {
        this.spawnHitSparks(ev.x, ev.y + 1.3, ev.z, true);
        const rag = new RagdollInstance(
          this.scene,
          { x: ev.x, y: ev.y, z: ev.z },
          ev.angle || 0,
          ev.color,
          ev.impulse
        );
        this.ragdolls.push(rag);
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.42);
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

    this.overlay.width = Math.floor(this.width * this.dpr);
    this.overlay.height = Math.floor(this.height * this.dpr);
    this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  adjustZoom(delta) {
    this.zoom = Math.max(0.65, Math.min(1.8, this.zoom + delta));
  }

  render(game, dt = 0.016, sound = null) {
    this.time += dt;
    this.handleEvents(game.consumeEvents(), sound);

    // Sync player rigs
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
        rig.jacketMat.color.set(player.color || "#5865f2");
        rig.root.position.set(player.x, player.y || 0, player.z);
        rig.root.rotation.y = player.angle || 0;
        this.animateRig(rig, player, dt);
      }
    }

    // Update physics ragdolls
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      const alive = this.ragdolls[i].update(dt);
      if (!alive) {
        this.ragdolls[i].dispose();
        this.ragdolls.splice(i, 1);
      }
    }

    // Update slash arcs
    for (let i = this.slashArcs.length - 1; i >= 0; i--) {
      const s = this.slashArcs[i];
      s.age += dt;
      const t = s.age / s.maxAge;
      s.mesh.scale.setScalar(1 + t * 0.45);
      s.mat.opacity = Math.max(0, (1 - t) * 0.85);
      if (s.age >= s.maxAge) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mat.dispose();
        this.slashArcs.splice(i, 1);
      }
    }

    // Update hit spark particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.vy -= 22 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.06, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += 8 * dt;
      p.mesh.rotation.y += 8 * dt;
      p.mat.opacity = Math.max(0, 1 - p.age / p.maxAge);
      if (p.age >= p.maxAge) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Gentle drift of ambient embers
    if (this.embers) {
      this.embers.rotation.y += dt * 0.015;
    }

    // Update floating damage texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.age += dt;
      ft.y += dt * 1.4;
      if (ft.age >= ft.maxAge) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // Keep shadow frustum centered on player for crisp shadows everywhere
    const lp = game.localPlayer;
    if (this.sunLight) {
      this.sunLight.position.set(lp.x + 28, 48, lp.z + 22);
      this.sunLight.target.position.set(lp.x, 0, lp.z);
    }

    // True Third-Person Over-the-Shoulder Chase Camera
    const dist = 7.4 * this.zoom;
    const pitch = game.camPitch;
    const yaw = game.camYaw;
    const horizDist = Math.cos(pitch) * dist;
    const vertOffset = Math.sin(pitch) * dist;

    // Slight right-shoulder offset
    const shoulderRight = 0.65;
    const shoulderX = Math.cos(yaw) * shoulderRight;
    const shoulderZ = -Math.sin(yaw) * shoulderRight;

    const desiredCamX = lp.x + Math.sin(yaw) * horizDist + shoulderX;
    const desiredCamY = Math.max(1.1, (lp.y || 0) + 2.15 + vertOffset);
    const desiredCamZ = lp.z + Math.cos(yaw) * horizDist + shoulderZ;

    const desiredLookX = lp.x - Math.sin(yaw) * 2.2 + shoulderX * 0.4;
    const desiredLookY = (lp.y || 0) + 1.85;
    const desiredLookZ = lp.z - Math.cos(yaw) * 2.2 + shoulderZ * 0.4;

    const camLerp = Math.min(1, dt * 16);
    this.camPos.x += (desiredCamX - this.camPos.x) * camLerp;
    this.camPos.y += (desiredCamY - this.camPos.y) * camLerp;
    this.camPos.z += (desiredCamZ - this.camPos.z) * camLerp;

    this.camLook.x += (desiredLookX - this.camLook.x) * camLerp;
    this.camLook.y += (desiredLookY - this.camLook.y) * camLerp;
    this.camLook.z += (desiredLookZ - this.camLook.z) * camLerp;

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.005) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.exp(-14 * dt);
    }

    this.camera.position.set(this.camPos.x + shakeX, this.camPos.y + shakeY, this.camPos.z);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
    this.renderOverlay(game);
  }

  renderOverlay(game) {
    const ctx = this.octx;
    ctx.clearRect(0, 0, this.width, this.height);

    const now = Date.now();
    const vec = new THREE.Vector3();

    for (const player of game.players.values()) {
      if (player.alive === false) continue;
      const isLocal = player.id === game.localId;
      vec.set(player.x, (player.y || 0) + 2.65, player.z);
      vec.project(this.camera);
      if (vec.z > 1) continue;

      const sx = (vec.x * 0.5 + 0.5) * this.width;
      const sy = (-vec.y * 0.5 + 0.5) * this.height;

      if (!isLocal) {
        // Name pill
        const label = player.isHost ? `👑 ${player.name}` : player.name;
        ctx.font = "600 12px Inter, sans-serif";
        ctx.textAlign = "center";
        const tw = ctx.measureText(label).width;
        const boxW = Math.max(54, tw + 14);
        const boxH = 20;

        ctx.fillStyle = "rgba(17, 18, 22, 0.78)";
        ctx.beginPath();
        ctx.roundRect(sx - boxW / 2, sy - boxH - 10, boxW, boxH, 6);
        ctx.fill();

        ctx.fillStyle = "#f2f3f5";
        ctx.fillText(label, sx, sy - 16);

        // HP bar
        const hpRatio = Math.max(0, Math.min(1, (player.hp ?? 100) / (player.maxHp || 100)));
        const barW = 54;
        const barH = 5;
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fillRect(sx - barW / 2, sy - 7, barW, barH);
        ctx.fillStyle = hpRatio > 0.5 ? "#23a55a" : hpRatio > 0.25 ? "#f0b232" : "#f23f43";
        ctx.fillRect(sx - barW / 2, sy - 7, barW * hpRatio, barH);
      }

      if (player.emote && now < (player.emoteUntil || 0)) {
        ctx.font = "24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.emote, sx, sy - 36);
      }
    }

    // Floating damage numbers
    for (const ft of this.floatingTexts) {
      vec.set(ft.x, ft.y, ft.z);
      vec.project(this.camera);
      if (vec.z > 1) continue;
      const sx = (vec.x * 0.5 + 0.5) * this.width;
      const sy = (-vec.y * 0.5 + 0.5) * this.height;
      const alpha = Math.max(0, 1 - ft.age / ft.maxAge);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "800 16px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.fillText(ft.text, sx + 1, sy + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, sx, sy);
      ctx.restore();
    }

    this.drawMinimap(ctx, game);
  }

  drawMinimap(ctx, game) {
    const size = 104;
    const margin = 12;
    const mx = this.width - size - margin;
    const my = this.height - size - margin;
    const half = CONFIG.WORLD_SIZE / 2;

    ctx.save();
    ctx.fillStyle = "rgba(22, 24, 31, 0.82)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx, my, size, size, 10);
    ctx.fill();
    ctx.stroke();

    for (const p of game.players.values()) {
      if (p.alive === false) continue;
      const px = mx + ((p.x + half) / CONFIG.WORLD_SIZE) * size;
      const py = my + ((p.z + half) / CONFIG.WORLD_SIZE) * size;
      ctx.beginPath();
      ctx.arc(px, py, p.id === game.localId ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.id === game.localId ? "#ffffff" : p.color;
      ctx.fill();
    }
    ctx.restore();
  }
}
