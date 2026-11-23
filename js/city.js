// Deterministic large 260x260m city layout shared by physics collisions and 3D renderer

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateCityLayout() {
  const rand = seededRandom(20261123);
  const buildings = [];
  const trees = [];
  const cars = [];
  const streetlights = [];
  const sidewalks = [];

  // Grid of city blocks around a central open plaza (0,0)
  // Roads run along x = -84, -42, 0, 42, 84 and z = -84, -42, 0, 42, 84 (road width ~14m)
  const blockCenters = [-105, -63, -21, 21, 63, 105];
  const blockSize = 26;

  for (let bxIdx = 0; bxIdx < blockCenters.length; bxIdx++) {
    for (let bzIdx = 0; bzIdx < blockCenters.length; bzIdx++) {
      const cx = blockCenters[bxIdx];
      const cz = blockCenters[bzIdx];

      // Keep the 4 inner blocks around (0,0) partly open as a central city square / park
      const isCentral = Math.abs(cx) === 21 && Math.abs(cz) === 21;

      sidewalks.push({ x: cx, z: cz, w: blockSize, d: blockSize });

      // Streetlights at block corners
      streetlights.push(
        { x: cx - blockSize / 2 + 0.8, z: cz - blockSize / 2 + 0.8, rot: Math.PI * 0.25 },
        { x: cx + blockSize / 2 - 0.8, z: cz + blockSize / 2 - 0.8, rot: -Math.PI * 0.75 }
      );

      if (isCentral) {
        // Park corners with trees + one medium corner building on the outer edge
        const signX = cx > 0 ? 1 : -1;
        const signZ = cz > 0 ? 1 : -1;
        const bw = 11 + rand() * 3;
        const bd = 11 + rand() * 3;
        const bh = 12 + rand() * 10;
        const bpx = cx + signX * 4.5;
        const bpz = cz + signZ * 4.5;
        buildings.push({
          x: bpx,
          z: bpz,
          w: bw,
          d: bd,
          h: bh,
          style: Math.floor(rand() * 4)
        });
        trees.push(
          { x: cx - signX * 7.5, z: cz - signZ * 7.5, s: 0.9 + rand() * 0.35 },
          { x: cx - signX * 7.5, z: cz + signZ * 5.5, s: 0.85 + rand() * 0.3 }
        );
        continue;
      }

      // Outer blocks: 1 large building or 2 medium buildings + courtyard trees
      const split = rand() > 0.45;
      if (split) {
        const horiz = rand() > 0.5;
        if (horiz) {
          for (const off of [-6.2, 6.2]) {
            const w = 18 + rand() * 3.5;
            const d = 9.2 + rand() * 1.6;
            const h = 10 + Math.floor(rand() * 5) * 4.2;
            buildings.push({ x: cx, z: cz + off, w, d, h, style: Math.floor(rand() * 4) });
          }
        } else {
          for (const off of [-6.2, 6.2]) {
            const w = 9.2 + rand() * 1.6;
            const d = 18 + rand() * 3.5;
            const h = 10 + Math.floor(rand() * 5) * 4.2;
            buildings.push({ x: cx + off, z: cz, w, d, h, style: Math.floor(rand() * 4) });
          }
        }
      } else {
        const w = 17 + rand() * 4.5;
        const d = 17 + rand() * 4.5;
        const h = 14 + Math.floor(rand() * 7) * 4.5;
        buildings.push({ x: cx, z: cz, w, d, h, style: Math.floor(rand() * 4) });
      }

      if (rand() > 0.35) {
        trees.push({
          x: cx + (rand() > 0.5 ? 11.2 : -11.2),
          z: cz + (rand() > 0.5 ? 11.2 : -11.2),
          s: 0.85 + rand() * 0.4
        });
      }
    }
  }

  // Parked cars along main avenues (with AABB collision)
  const carColors = [0x9e2a2b, 0x2f4858, 0xc9cbd0, 0x24262b, 0x3b6e52, 0xb58938];
  const carSpots = [
    { x: -6.2, z: -24, rot: 0 },
    { x: 6.2, z: -15, rot: Math.PI },
    { x: -6.2, z: 18, rot: 0 },
    { x: 6.2, z: 27, rot: Math.PI },
    { x: -25, z: -6.2, rot: Math.PI / 2 },
    { x: 22, z: 6.2, rot: -Math.PI / 2 },
    { x: -48.2, z: -18, rot: 0 },
    { x: 48.2, z: 14, rot: Math.PI },
    { x: -36, z: 48.2, rot: Math.PI / 2 },
    { x: 34, z: -48.2, rot: -Math.PI / 2 }
  ];
  for (let i = 0; i < carSpots.length; i++) {
    const cs = carSpots[i];
    const isEW = Math.abs(Math.sin(cs.rot)) > 0.5;
    cars.push({
      x: cs.x,
      z: cs.z,
      rot: cs.rot,
      w: isEW ? 4.4 : 2.0,
      d: isEW ? 2.0 : 4.4,
      h: 1.55,
      color: carColors[i % carColors.length]
    });
  }

  // Unified colliders (buildings + cars)
  const colliders = [
    ...buildings.map((b) => ({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.d / 2,
      maxZ: b.z + b.d / 2,
      maxY: b.h
    })),
    ...cars.map((c) => ({
      minX: c.x - c.w / 2,
      maxX: c.x + c.w / 2,
      minZ: c.z - c.d / 2,
      maxZ: c.z + c.d / 2,
      maxY: c.h
    }))
  ];

  return { buildings, trees, cars, streetlights, sidewalks, colliders };
}

export const CITY_LAYOUT = generateCityLayout();

export function resolveCityCollision(x, z, radius) {
  let rx = x;
  let rz = z;
  for (const box of CITY_LAYOUT.colliders) {
    const closestX = Math.max(box.minX, Math.min(rx, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(rz, box.maxZ));
    const dx = rx - closestX;
    const dz = rz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const push = (radius - dist) / dist;
        rx += dx * push;
        rz += dz * push;
      } else {
        // Inside AABB: push out to nearest edge
        const dLeft = Math.abs(rx - box.minX);
        const dRight = Math.abs(box.maxX - rx);
        const dTop = Math.abs(rz - box.minZ);
        const dBot = Math.abs(box.maxZ - rz);
        const m = Math.min(dLeft, dRight, dTop, dBot);
        if (m === dLeft) rx = box.minX - radius;
        else if (m === dRight) rx = box.maxX + radius;
        else if (m === dTop) rz = box.minZ - radius;
        else rz = box.maxZ + radius;
      }
    }
  }
  return { x: rx, z: rz };
}

// Ray vs AABB intersection for bullets & camera wall-avoidance
export function raycastCity(ox, oy, oz, dx, dy, dz, maxDist) {
  let closestT = maxDist;
  for (const box of CITY_LAYOUT.colliders) {
    let tmin = 0;
    let tmax = closestT;

    // X slab
    if (Math.abs(dx) < 1e-6) {
      if (ox < box.minX || ox > box.maxX) continue;
    } else {
      let t1 = (box.minX - ox) / dx;
      let t2 = (box.maxX - ox) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    // Y slab (0 .. maxY)
    if (Math.abs(dy) < 1e-6) {
      if (oy < 0 || oy > box.maxY) continue;
    } else {
      let t1 = (0 - oy) / dy;
      let t2 = (box.maxY - oy) / dy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    // Z slab
    if (Math.abs(dz) < 1e-6) {
      if (oz < box.minZ || oz > box.maxZ) continue;
    } else {
      let t1 = (box.minZ - oz) / dz;
      let t2 = (box.maxZ - oz) / dz;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }

    if (tmin > 0.05 && tmin < closestT) {
      closestT = tmin;
    }
  }
  return closestT;
}
