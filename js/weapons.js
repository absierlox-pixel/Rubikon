import { createWoodTexture, createGunmetalTexture } from "./textures.js";

let mats = null;
function getMats() {
  if (!mats) {
    const woodTex = createWoodTexture();
    const metalTex = createGunmetalTexture();
    mats = {
      wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.62, metalness: 0.05 }),
      steel: new THREE.MeshStandardMaterial({ map: metalTex, color: 0x3b3f47, roughness: 0.36, metalness: 0.78 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.42, metalness: 0.82 }),
      polymer: new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.65, metalness: 0.15 }),
      bakelite: new THREE.MeshStandardMaterial({ color: 0x9b441f, roughness: 0.46, metalness: 0.08 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xd4a948, roughness: 0.28, metalness: 0.88 }),
      awpGreen: new THREE.MeshStandardMaterial({ color: 0x4b5d3f, roughness: 0.58, metalness: 0.12 }),
      warheadGreen: new THREE.MeshStandardMaterial({ color: 0x3d4d34, roughness: 0.52, metalness: 0.28 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x1a3352, roughness: 0.1, metalness: 0.9 })
    };
  }
  return mats;
}

function addPart(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// 1. Brass Knuckles (origin at fist center)
export function createBrassKnuckles() {
  const m = getMats();
  const root = new THREE.Group();
  // Palm bar
  addPart(root, new THREE.BoxGeometry(0.11, 0.022, 0.024), m.brass, 0, -0.028, 0.02);
  // 4 finger rings
  const ringGeo = new THREE.TorusGeometry(0.016, 0.0055, 8, 12);
  for (let i = 0; i < 4; i++) {
    addPart(root, ringGeo, m.brass, -0.042 + i * 0.028, 0.005, 0.055);
  }
  // Top strike ridge
  addPart(root, new THREE.BoxGeometry(0.115, 0.014, 0.022), m.brass, 0, 0.024, 0.062);
  return { group: root, muzzle: null };
}

// 2. Glock-17 (origin at pistol grip)
export function createGlock() {
  const m = getMats();
  const root = new THREE.Group();
  // Grip + magazine baseplate
  addPart(root, new THREE.BoxGeometry(0.032, 0.115, 0.048), m.polymer, 0, -0.045, 0, -0.22, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.034, 0.012, 0.052), m.dark, 0, -0.105, -0.012, -0.22, 0, 0);
  // Lower frame & rail
  addPart(root, new THREE.BoxGeometry(0.032, 0.026, 0.195), m.polymer, 0, 0.012, 0.075);
  // Trigger guard & trigger
  addPart(root, new THREE.BoxGeometry(0.018, 0.007, 0.055), m.polymer, 0, -0.028, 0.052);
  addPart(root, new THREE.BoxGeometry(0.018, 0.036, 0.008), m.polymer, 0, -0.010, 0.078);
  addPart(root, new THREE.BoxGeometry(0.008, 0.022, 0.008), m.dark, 0, -0.010, 0.046, 0.25, 0, 0);
  // Squared metal slide
  addPart(root, new THREE.BoxGeometry(0.034, 0.036, 0.205), m.dark, 0, 0.042, 0.078);
  // Barrel tip
  addPart(root, new THREE.CylinderGeometry(0.009, 0.009, 0.022, 10), m.steel, 0, 0.042, 0.184, Math.PI / 2, 0, 0);
  // Iron sights
  addPart(root, new THREE.BoxGeometry(0.022, 0.009, 0.008), m.steel, 0, 0.063, -0.014);
  addPart(root, new THREE.BoxGeometry(0.007, 0.009, 0.008), m.steel, 0, 0.063, 0.170);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.042, 0.20);
  root.add(muzzle);
  root.scale.setScalar(1.15);
  return { group: root, muzzle };
}

// 3. Detailed AK-74 (origin cleanly at right-hand pistol grip, flush curved magazine!)
export function createDetailedAK74() {
  const m = getMats();
  const root = new THREE.Group();

  // Origin (0,0,0) is right at the pistol grip so holding is straight & exact
  // Pistol grip
  addPart(root, new THREE.BoxGeometry(0.032, 0.105, 0.046), m.bakelite, 0, -0.045, 0, -0.28, 0, 0);
  // Trigger guard & trigger
  addPart(root, new THREE.BoxGeometry(0.018, 0.007, 0.065), m.dark, 0, -0.022, 0.052);
  addPart(root, new THREE.BoxGeometry(0.008, 0.024, 0.008), m.dark, 0, -0.006, 0.040, 0.25, 0, 0);

  // Stamped steel receiver + dust cover
  addPart(root, new THREE.BoxGeometry(0.046, 0.072, 0.265), m.steel, 0, 0.038, 0.075);
  addPart(root, new THREE.BoxGeometry(0.042, 0.026, 0.235), m.dark, 0, 0.082, 0.065);
  // Charging handle & safety selector
  addPart(root, new THREE.BoxGeometry(0.030, 0.012, 0.018), m.dark, 0.034, 0.062, 0.125);
  addPart(root, new THREE.BoxGeometry(0.007, 0.012, 0.095), m.dark, 0.026, 0.040, 0.045, 0.06, 0, 0);

  // Wooden buttstock extending back (-Z)
  addPart(root, new THREE.BoxGeometry(0.040, 0.062, 0.13), m.wood, 0, 0.022, -0.11, -0.10, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.042, 0.102, 0.15), m.wood, 0, -0.004, -0.23, -0.06, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.044, 0.106, 0.012), m.dark, 0, -0.008, -0.305);

  // Cleanly seated curved 5.45 magazine (continuous ExtrudeGeometry, zero protruding artifacts!)
  const magShape = new THREE.Shape();
  magShape.moveTo(-0.026, 0.01);
  magShape.lineTo(0.028, 0.01);
  magShape.quadraticCurveTo(0.042, -0.11, 0.072, -0.205);
  magShape.lineTo(0.020, -0.222);
  magShape.quadraticCurveTo(-0.008, -0.12, -0.026, 0.01);

  const magGeo = new THREE.ExtrudeGeometry(magShape, {
    depth: 0.028,
    bevelEnabled: false
  });
  magGeo.translate(0, 0, -0.014);
  magGeo.rotateY(-Math.PI / 2); // Align curve forward (+Z)
  const magMesh = new THREE.Mesh(magGeo, m.bakelite);
  magMesh.position.set(0, 0.008, 0.138);
  magMesh.castShadow = true;
  root.add(magMesh);

  // Rear sight block
  addPart(root, new THREE.BoxGeometry(0.036, 0.028, 0.055), m.dark, 0, 0.086, 0.195);

  // Wooden lower & upper handguard
  addPart(root, new THREE.BoxGeometry(0.048, 0.044, 0.175), m.wood, 0, 0.034, 0.295);
  addPart(root, new THREE.BoxGeometry(0.040, 0.026, 0.155), m.wood, 0, 0.074, 0.295);
  addPart(root, new THREE.BoxGeometry(0.050, 0.056, 0.016), m.dark, 0, 0.048, 0.386);

  // Gas tube + gas block
  addPart(root, new THREE.CylinderGeometry(0.011, 0.011, 0.13, 8), m.steel, 0, 0.075, 0.43, Math.PI / 2, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.026, 0.046, 0.032), m.dark, 0, 0.058, 0.49, -0.2, 0, 0);

  // Barrel & cleaning rod
  addPart(root, new THREE.CylinderGeometry(0.010, 0.013, 0.40, 10), m.dark, 0, 0.044, 0.46, Math.PI / 2, 0, 0);
  addPart(root, new THREE.CylinderGeometry(0.0035, 0.0035, 0.32, 6), m.steel, 0, 0.024, 0.45, Math.PI / 2, 0, 0);

  // Front sight + AK-74 two-chamber muzzle brake
  addPart(root, new THREE.BoxGeometry(0.020, 0.054, 0.026), m.dark, 0, 0.070, 0.605);
  addPart(root, new THREE.CylinderGeometry(0.016, 0.015, 0.078, 10), m.dark, 0, 0.044, 0.68, Math.PI / 2, 0, 0);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.044, 0.73);
  root.add(muzzle);

  return { group: root, muzzle };
}

// 4. Detailed AWP Sniper Rifle (olive chassis, scope, long barrel, bipod)
export function createAWP() {
  const m = getMats();
  const root = new THREE.Group();

  // Thumbhole olive-green stock + cheek rest
  addPart(root, new THREE.BoxGeometry(0.046, 0.072, 0.54), m.awpGreen, 0, 0.022, 0.04);
  addPart(root, new THREE.BoxGeometry(0.044, 0.105, 0.24), m.awpGreen, 0, -0.010, -0.26);
  addPart(root, new THREE.BoxGeometry(0.046, 0.026, 0.13), m.dark, 0, 0.056, -0.22); // cheek pad
  addPart(root, new THREE.BoxGeometry(0.048, 0.11, 0.016), m.dark, 0, -0.010, -0.385); // buttpad
  // Grip
  addPart(root, new THREE.BoxGeometry(0.036, 0.095, 0.048), m.awpGreen, 0, -0.048, -0.01, -0.22, 0, 0);
  // Box magazine
  addPart(root, new THREE.BoxGeometry(0.034, 0.095, 0.082), m.dark, 0, -0.048, 0.11);

  // Steel receiver + bolt handle
  addPart(root, new THREE.BoxGeometry(0.044, 0.042, 0.26), m.dark, 0, 0.068, 0.11);
  addPart(root, new THREE.CylinderGeometry(0.008, 0.008, 0.055, 8), m.steel, 0.038, 0.062, 0.04, 0, 0, Math.PI / 2);
  addPart(root, new THREE.SphereGeometry(0.014, 8, 8), m.dark, 0.065, 0.052, 0.04);

  // Telescopic scope + dual scope rings
  addPart(root, new THREE.BoxGeometry(0.024, 0.035, 0.022), m.dark, 0, 0.102, 0.05);
  addPart(root, new THREE.BoxGeometry(0.024, 0.035, 0.022), m.dark, 0, 0.102, 0.18);
  addPart(root, new THREE.CylinderGeometry(0.022, 0.022, 0.28, 12), m.dark, 0, 0.132, 0.115, Math.PI / 2, 0, 0);
  addPart(root, new THREE.CylinderGeometry(0.030, 0.024, 0.08, 12), m.dark, 0, 0.132, 0.275, Math.PI / 2, 0, 0);
  addPart(root, new THREE.CylinderGeometry(0.026, 0.026, 0.008, 12), m.lens, 0, 0.132, 0.315, Math.PI / 2, 0, 0);
  addPart(root, new THREE.CylinderGeometry(0.025, 0.022, 0.06, 12), m.dark, 0, 0.132, -0.03, Math.PI / 2, 0, 0);

  // Long heavy barrel + muzzle brake + folded bipod
  addPart(root, new THREE.CylinderGeometry(0.015, 0.018, 0.62, 12), m.dark, 0, 0.056, 0.56, Math.PI / 2, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.036, 0.026, 0.075), m.steel, 0, 0.056, 0.89);
  addPart(root, new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), m.dark, -0.028, 0.002, 0.42, Math.PI / 2, 0, 0);
  addPart(root, new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6), m.dark, 0.028, 0.002, 0.42, Math.PI / 2, 0, 0);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.056, 0.94);
  root.add(muzzle);

  return { group: root, muzzle };
}

// 5. Detailed M134 Minigun (6 rotating barrels, motor drum, chainsaw handle)
export function createMinigun() {
  const m = getMats();
  const root = new THREE.Group();

  // Rear electric drive motor & housing
  addPart(root, new THREE.CylinderGeometry(0.095, 0.095, 0.30, 14), m.dark, 0, 0.04, 0.02, Math.PI / 2, 0, 0);
  addPart(root, new THREE.CylinderGeometry(0.055, 0.055, 0.18, 10), m.steel, 0, 0.14, 0.0, Math.PI / 2, 0, 0);

  // Rear grip & top chainsaw carry bar
  addPart(root, new THREE.BoxGeometry(0.04, 0.12, 0.045), m.polymer, 0, 0.06, -0.15, -0.2, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.18, 0.022, 0.025), m.steel, 0, 0.19, 0.26);
  addPart(root, new THREE.BoxGeometry(0.022, 0.12, 0.025), m.steel, -0.085, 0.13, 0.26);
  addPart(root, new THREE.BoxGeometry(0.022, 0.12, 0.025), m.steel, 0.085, 0.13, 0.26);

  // Side ammo drum
  addPart(root, new THREE.CylinderGeometry(0.11, 0.11, 0.14, 14), m.warheadGreen, -0.13, -0.04, 0.06, 0, 0, Math.PI / 2);

  // 6-barrel rotary cluster (rotates around Z when firing!)
  const barrelsGroup = new THREE.Group();
  barrelsGroup.position.set(0, 0.04, 0.46);
  const barrelGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8);
  const ringR = 0.048;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    addPart(barrelsGroup, barrelGeo, m.steel, Math.cos(a) * ringR, Math.sin(a) * ringR, 0, Math.PI / 2, 0, 0);
  }
  // Barrel clamp discs
  const clampGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.022, 14);
  addPart(barrelsGroup, clampGeo, m.dark, 0, 0, -0.16, Math.PI / 2, 0, 0);
  addPart(barrelsGroup, clampGeo, m.dark, 0, 0, 0.08, Math.PI / 2, 0, 0);
  addPart(barrelsGroup, clampGeo, m.dark, 0, 0, 0.27, Math.PI / 2, 0, 0);
  root.add(barrelsGroup);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.04, 0.80);
  root.add(muzzle);

  return { group: root, muzzle, barrelsGroup };
}

// 6. Detailed RPG-7 Launcher + PG-7V Warhead
export function createRPG() {
  const m = getMats();
  const root = new THREE.Group();

  // Main steel launch tube
  addPart(root, new THREE.CylinderGeometry(0.032, 0.032, 0.96, 14), m.dark, 0, 0.06, 0.05, Math.PI / 2, 0, 0);
  // Wooden heat shield wrap
  addPart(root, new THREE.CylinderGeometry(0.040, 0.040, 0.34, 12), m.wood, 0, 0.06, -0.02, Math.PI / 2, 0, 0);
  // Flared rear exhaust venturi cone
  addPart(root, new THREE.CylinderGeometry(0.034, 0.056, 0.18, 14), m.steel, 0, 0.06, -0.49, Math.PI / 2, 0, 0);
  // Front & rear pistol grips
  addPart(root, new THREE.BoxGeometry(0.032, 0.11, 0.044), m.wood, 0, -0.03, 0.22, -0.22, 0, 0);
  addPart(root, new THREE.BoxGeometry(0.030, 0.10, 0.040), m.wood, 0, -0.025, 0.02, -0.15, 0, 0);
  // Iron sights
  addPart(root, new THREE.BoxGeometry(0.014, 0.055, 0.014), m.dark, 0, 0.115, 0.44);
  addPart(root, new THREE.BoxGeometry(0.014, 0.045, 0.014), m.dark, 0, 0.110, 0.20);

  // PG-7V Rocket Warhead protruding from muzzle (hidden while reloading!)
  const warhead = new THREE.Group();
  warhead.position.set(0, 0.06, 0.62);
  addPart(warhead, new THREE.CylinderGeometry(0.052, 0.030, 0.15, 12), m.warheadGreen, 0, 0, 0, Math.PI / 2, 0, 0);
  addPart(warhead, new THREE.ConeGeometry(0.052, 0.16, 12), m.warheadGreen, 0, 0, 0.155, Math.PI / 2, 0, 0);
  addPart(warhead, new THREE.CylinderGeometry(0.010, 0.012, 0.045, 8), m.steel, 0, 0, 0.24, Math.PI / 2, 0, 0);
  root.add(warhead);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.06, 0.84);
  root.add(muzzle);

  return { group: root, muzzle, warhead };
}

export function createWeaponMesh(id) {
  if (id === "knuckles") return createBrassKnuckles();
  if (id === "glock") return createGlock();
  if (id === "ak74") return createDetailedAK74();
  if (id === "awp") return createAWP();
  if (id === "minigun") return createMinigun();
  if (id === "rpg") return createRPG();
  return null;
}
