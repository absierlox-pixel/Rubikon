import { createWoodTexture, createGunmetalTexture } from "./textures.js";

export const WEAPONS = [
  {
    id: "fists",
    name: "Кулаки",
    slot: 0,
    damage: 25,
    fireRate: 45,
    range: 10
  },
  {
    id: "ak74",
    name: "АК-74",
    slot: 1,
    damage: 78,
    fireRate: 82,
    range: 85
  }
];

let sharedWoodMat = null;
let sharedSteelMat = null;
let sharedDarkSteelMat = null;
let sharedBakeliteMat = null;

function getAkMaterials() {
  if (!sharedSteelMat) {
    const woodTex = createWoodTexture();
    const metalTex = createGunmetalTexture();
    sharedWoodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.62,
      metalness: 0.05
    });
    sharedSteelMat = new THREE.MeshStandardMaterial({
      map: metalTex,
      color: 0x3b3f47,
      roughness: 0.36,
      metalness: 0.78
    });
    sharedDarkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.42,
      metalness: 0.82
    });
    sharedBakeliteMat = new THREE.MeshStandardMaterial({
      color: 0xa44a22,
      roughness: 0.45,
      metalness: 0.08
    });
  }
  return {
    wood: sharedWoodMat,
    steel: sharedSteelMat,
    dark: sharedDarkSteelMat,
    bakelite: sharedBakeliteMat
  };
}

// Detailed 3D AK-74 model pointing along +Z (barrel forward, stock back along -Z)
export function createDetailedAK74() {
  const m = getAkMaterials();
  const root = new THREE.Group();

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  // 1. Stamped steel receiver + ribbed dust cover
  add(new THREE.BoxGeometry(0.052, 0.082, 0.28), m.steel, 0, 0.01, 0.02);
  add(new THREE.BoxGeometry(0.048, 0.032, 0.25), m.dark, 0, 0.062, 0.01);
  // Dust cover ribs
  for (let i = 0; i < 3; i++) {
    add(new THREE.BoxGeometry(0.050, 0.008, 0.012), m.steel, 0, 0.079, -0.05 + i * 0.045);
  }
  // Charging handle (right side) & fire selector lever
  add(new THREE.BoxGeometry(0.035, 0.014, 0.022), m.dark, 0.038, 0.038, 0.08);
  add(new THREE.BoxGeometry(0.008, 0.014, 0.11), m.dark, 0.030, 0.012, -0.01, 0.08, 0, 0);

  // 2. Wooden buttstock (tapered profile with steel buttplate)
  add(new THREE.BoxGeometry(0.044, 0.068, 0.14), m.wood, 0, -0.005, -0.18, -0.12, 0, 0);
  add(new THREE.BoxGeometry(0.046, 0.112, 0.16), m.wood, 0, -0.034, -0.31, -0.08, 0, 0);
  add(new THREE.BoxGeometry(0.048, 0.116, 0.014), m.dark, 0, -0.040, -0.39);

  // 3. Bakelite pistol grip + trigger guard + trigger
  add(new THREE.BoxGeometry(0.036, 0.115, 0.052), m.bakelite, 0, -0.078, -0.065, -0.32, 0, 0);
  add(new THREE.BoxGeometry(0.022, 0.008, 0.075), m.dark, 0, -0.056, 0.005);
  add(new THREE.BoxGeometry(0.010, 0.028, 0.010), m.dark, 0, -0.038, -0.01, 0.25, 0, 0);

  // 4. Curved 5.45x39 Bakelite magazine (3 angled segments for true curve)
  add(new THREE.BoxGeometry(0.036, 0.10, 0.068), m.bakelite, 0, -0.075, 0.098, 0.14, 0, 0);
  add(new THREE.BoxGeometry(0.035, 0.10, 0.066), m.bakelite, 0, -0.165, 0.122, 0.30, 0, 0);
  add(new THREE.BoxGeometry(0.034, 0.07, 0.064), m.bakelite, 0, -0.235, 0.155, 0.44, 0, 0);
  add(new THREE.BoxGeometry(0.038, 0.012, 0.068), m.dark, 0, -0.268, 0.172, 0.44, 0, 0);

  // 5. Rear tangent sight block
  add(new THREE.BoxGeometry(0.042, 0.032, 0.065), m.dark, 0, 0.068, 0.155);

  // 6. Laminated wood lower & upper handguard
  add(new THREE.BoxGeometry(0.054, 0.050, 0.185), m.wood, 0, 0.006, 0.255);
  add(new THREE.BoxGeometry(0.046, 0.032, 0.165), m.wood, 0, 0.052, 0.255);
  // Handguard retainer ferrule
  add(new THREE.BoxGeometry(0.056, 0.064, 0.018), m.dark, 0, 0.024, 0.352);

  // 7. Gas tube + angled gas block
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.14, 8), m.steel, 0, 0.054, 0.40, Math.PI / 2, 0, 0);
  add(new THREE.BoxGeometry(0.030, 0.052, 0.036), m.dark, 0, 0.036, 0.465, -0.22, 0, 0);

  // 8. Steel barrel + under-barrel cleaning rod
  add(new THREE.CylinderGeometry(0.012, 0.015, 0.42, 10), m.dark, 0, 0.018, 0.44, Math.PI / 2, 0, 0);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 6), m.steel, 0, -0.004, 0.42, Math.PI / 2, 0, 0);

  // 9. Front sight base + protective ears
  add(new THREE.BoxGeometry(0.024, 0.062, 0.032), m.dark, 0, 0.048, 0.59);
  add(new THREE.BoxGeometry(0.006, 0.030, 0.016), m.dark, -0.010, 0.082, 0.59);
  add(new THREE.BoxGeometry(0.006, 0.030, 0.016), m.dark, 0.010, 0.082, 0.59);

  // 10. Iconic AK-74 two-chamber muzzle brake
  add(new THREE.CylinderGeometry(0.019, 0.017, 0.088, 12), m.dark, 0, 0.018, 0.675, Math.PI / 2, 0, 0);
  add(new THREE.BoxGeometry(0.034, 0.012, 0.022), m.steel, 0, 0.018, 0.695);

  // Muzzle tip anchor for muzzle flash & tracer origin
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.018, 0.74);
  root.add(muzzle);

  // Scale slightly up so it reads crisply in third-person
  root.scale.setScalar(1.18);

  return { group: root, muzzle };
}
